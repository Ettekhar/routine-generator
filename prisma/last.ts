// prisma/test_routine.ts
import { PrismaClient, RoomType, CourseType } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// GA parameters (tweakable)
const POPULATION_SIZE = 100;
const MAX_GENERATIONS = 800;
const MUTATION_RATE = 0.04;
const TOURNAMENT_SIZE = 5;
const ELITE_COUNT = 6;
const REPAIR_ATTEMPTS = 30;

// Penalty weights (large numbers = treated like hard constraints)
const HARD_PENALTY = -100000;
const TEACHER_CONFLICT_PENALTY = -80000;
const ROOM_CONFLICT_PENALTY = -70000;
const WRONG_ROOMTYPE_PENALTY = -60000;
const CAPACITY_PENALTY = -60000;
const LOAD_PENALTY = -50000;
const MISSING_HOURS_PENALTY = -40000;
const SOFT_GAP_PENALTY = -10; // per gap slot
const CONTIGUOUS_BONUS = 100; // for 2-hour contiguous

type Day = "SUN" | "MON" | "TUE" | "WED" | "THU";
const DAYS: Day[] = ["SUN", "MON", "TUE", "WED", "THU"];

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "02:00", "03:00", "04:00"];

// --- Types ---
interface PlacedAssignment {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId: number | null;
  courseType: CourseType;
  hours: number;

  day: Day;
  startTime: string;
  roomId: number;

  courseTitle: string;
  teacherName: string;
  batchName: string;
  groupName: string | null;
  roomNumber: string;

  // repair flag
  repaired?: boolean;
  invalid?: boolean;
}

interface AssignInput {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId: number | null;
  hoursRequired: number;
  courseType: CourseType;
  courseTitle: string;
  batchSize: number;
  teacherName: string;
  batchName: string;
  groupName: string | null;
}

type Chromosome = PlacedAssignment[];
type Population = { chromosome: Chromosome; fitness: number }[];

function getAssignmentKey(courseId: number, teacherId: number, batchId: number, groupId: number | null): string {
  return `${courseId}-${teacherId}-${batchId}-${groupId ?? 'null'}`;
}

interface GALookupData {
  teacherMap: Map<number, any>;
  roomMap: Map<number, any>;
  assignmentMap: Map<string, AssignInput>;
  requiredHoursMap: Map<string, number>; // total required hours per assignment key
}

// ----------------- Utilities -----------------

function nextHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1).toString().padStart(2, "0");
  if (next === "13") return "14:00";
  return `${next}:${m.toString().padStart(2, "0")}`;
}

function getAvailableSlots() {
  return DAYS.flatMap(day => TIME_SLOTS.map(t => ({ day, startTime: t as string })));
}

// calculate gaps
function getBatchGaps(chromosome: Chromosome, batchId: number, day: Day): number {
  const indices = chromosome
    .filter(s => s.batchId === batchId && s.day === day)
    .map(s => TIME_SLOTS.indexOf(s.startTime))
    .filter(idx => idx >= 0)
    .sort((a, b) => a - b);

  if (indices.length <= 1) return 0;
  let gaps = 0;
  for (let i = 1; i < indices.length; i++) {
    const diff = indices[i] - indices[i - 1];
    if (diff > 1) gaps += diff - 1;
  }
  return gaps;
}

// ----------------- Repair Helpers -----------------

/**
 * Check whether placing `gene` into `chromosome` (considering other placed genes)
 * causes a hard conflict (teacher/room/batch collision, out-of-bounds).
 */
function geneHasConflict(gene: PlacedAssignment, chromosome: Chromosome, lookups: GALookupData): { conflict: boolean; reason?: string } {
  const { roomMap } = lookups;
  const room = roomMap.get(gene.roomId);
  if (!room) return { conflict: true, reason: "missing room" };
  // duration indices
  const startIndex = TIME_SLOTS.indexOf(gene.startTime);
  if (startIndex < 0) return { conflict: true, reason: "invalid start time" };
  if (startIndex + gene.hours > TIME_SLOTS.length) return { conflict: true, reason: "oob duration" };

  for (let h = 0; h < gene.hours; h++) {
    const time = TIME_SLOTS[startIndex + h];
    // check against every other gene
    for (const other of chromosome) {
      if (other === gene) continue;
      const otherStart = TIME_SLOTS.indexOf(other.startTime);
      if (otherStart < 0) continue;
      const otherEndIndex = otherStart + other.hours - 1;
      const geneIndex = startIndex + h;
      if (gene.day !== other.day) continue;
      // if same time slot overlaps
      if (geneIndex >= otherStart && geneIndex <= otherEndIndex) {
        // teacher collision
        if (other.teacherId === gene.teacherId) return { conflict: true, reason: "teacher-collision" };
        // batch collision (batch or identical group)
        if (other.batchId === gene.batchId) return { conflict: true, reason: "batch-collision" };
        if (other.groupId && gene.groupId && other.groupId === gene.groupId) return { conflict: true, reason: "group-collision" };
        // room collision
        if (other.roomId === gene.roomId) return { conflict: true, reason: "room-collision" };
      }
    }
  }
  return { conflict: false };
}

/**
 * Attempt to repair a chromosome in-place by relocating conflicting genes.
 * Strategy:
 *  - iterate genes; if conflict or wrong room/capacity/load, try alternative slot+room combos up to attempts.
 *  - if we succeed, mark repaired=true; otherwise mark invalid.
 */
function repairChromosome(chromosome: Chromosome, lookups: GALookupData, allRooms: any[]): Chromosome {
  const slots = getAvailableSlots();
  const roomCandidates = allRooms.slice(); // shallow copy

  // We'll attempt multiple passes to fix things gradually
  for (const gene of chromosome) {
    let reasonConflict = geneHasConflict(gene, chromosome, lookups);
    // Also check room type & capacity quickly
    const room = lookups.roomMap.get(gene.roomId);
    const requiredType = gene.courseType === CourseType.LAB ? RoomType.LAB : RoomType.CLASSROOM;
    const assignmentKey = getAssignmentKey(gene.courseId, gene.teacherId, gene.batchId, gene.groupId);
    const requiredAssignment = lookups.assignmentMap.get(assignmentKey);

    if (!requiredAssignment) {
      gene.invalid = true;
      continue;
    }
    let needRepair = reasonConflict.conflict || room.type !== requiredType || room.capacity < requiredAssignment.batchSize;

    if (!needRepair) continue;

    // Try REPAIR_ATTEMPTS configurations
    let fixed = false;
    for (let attempt = 0; attempt < REPAIR_ATTEMPTS && !fixed; attempt++) {
      // pick a slot (prefer morning slots first by bias)
      const pickSlot = (attempt < 6)
        ? slots[Math.floor(Math.random() * Math.min(6, slots.length))]
        : slots[Math.floor(Math.random() * slots.length)];
      // pick a candidate room that fits type and capacity
      const candidates = roomCandidates.filter(r => {
        const okType = (requiredType === RoomType.LAB) ? r.type === "LAB" : r.type === "CLASSROOM";
        const okCap = r.capacity >= requiredAssignment.batchSize;
        return okType && okCap;
      });

      if (candidates.length === 0) break;

      const pickRoom = candidates[Math.floor(Math.random() * candidates.length)];

      // Temporarily set and check
      const original = { day: gene.day, startTime: gene.startTime, roomId: gene.roomId, roomNumber: gene.roomNumber };
      gene.day = pickSlot.day as Day;
      gene.startTime = pickSlot.startTime;
      gene.roomId = pickRoom.id;
      gene.roomNumber = pickRoom.roomNumber;

      const conflictNow = geneHasConflict(gene, chromosome, lookups);

      if (!conflictNow.conflict) {
        gene.repaired = true;
        fixed = true;
        break;
      } else {
        // revert and continue
        gene.day = original.day;
        gene.startTime = original.startTime;
        gene.roomId = original.roomId;
        gene.roomNumber = original.roomNumber;
      }
    } // attempts

    if (!fixed) {
      gene.invalid = true;
    }
  } // for genes

  return chromosome;
}

// ----------------- Fitness -----------------

function calculateFitness(chromosome: Chromosome, lookups: GALookupData): number {
  // If many invalid genes, heavy penalty
  let fitness = 0;
  const { teacherMap, roomMap, assignmentMap, requiredHoursMap } = lookups;

  // quick conflict trackers
  const teacherDailyLoad = new Map<number, Map<Day, number>>();
  const teacherWeeklyLoad = new Map<number, number>();
  const usedSlots = new Set<string>();

  // Count assigned hours per required assignment
  const assignedCounts = new Map<string, number>();

  // First pass: hard checks and soft scoring
  for (const gene of chromosome) {
    if (gene.invalid) { fitness += HARD_PENALTY; continue; }
    const room = roomMap.get(gene.roomId);
    const teacher = teacherMap.get(gene.teacherId);
    const assignKey = getAssignmentKey(gene.courseId, gene.teacherId, gene.batchId, gene.groupId);
    const req = assignmentMap.get(assignKey);
    if (!room || !teacher || !req) { fitness += HARD_PENALTY; continue; }

    // Check room type
    const requiredType = gene.courseType === CourseType.LAB ? RoomType.LAB : RoomType.CLASSROOM;
    if (room.type !== requiredType) { fitness += WRONG_ROOMTYPE_PENALTY; continue; }

    // Capacity
    if (room.capacity < req.batchSize) { fitness += CAPACITY_PENALTY; continue; }

    // Duration/time bounds and slot occupancy
    const startIndex = TIME_SLOTS.indexOf(gene.startTime);
    if (startIndex < 0 || startIndex + gene.hours > TIME_SLOTS.length) { fitness += HARD_PENALTY; continue; }

    let localConflict = false;
    for (let h = 0; h < gene.hours; h++) {
      const time = TIME_SLOTS[startIndex + h];
      const teacherKey = `T-${gene.teacherId}-${gene.day}-${time}`;
      const roomKey = `R-${gene.roomId}-${gene.day}-${time}`;
      const batchKey = `B-${gene.batchId}-${gene.day}-${time}`;
      const groupKey = gene.groupId ? `G-${gene.groupId}-${gene.day}-${time}` : null;

      if (usedSlots.has(teacherKey)) { fitness += TEACHER_CONFLICT_PENALTY; localConflict = true; break; }
      if (usedSlots.has(roomKey)) { fitness += ROOM_CONFLICT_PENALTY; localConflict = true; break; }
      if (usedSlots.has(batchKey)) { fitness += TEACHER_CONFLICT_PENALTY; localConflict = true; break; }
      if (groupKey && usedSlots.has(groupKey)) { fitness += ROOM_CONFLICT_PENALTY; localConflict = true; break; }

      usedSlots.add(teacherKey);
      usedSlots.add(roomKey);
      usedSlots.add(batchKey);
      if (groupKey) usedSlots.add(groupKey);
    }
    if (localConflict) continue;

    // Update teacher loads
    const dailyMap = teacherDailyLoad.get(gene.teacherId) || new Map<Day, number>();
    const newDaily = (dailyMap.get(gene.day) || 0) + gene.hours;
    dailyMap.set(gene.day, newDaily);
    teacherDailyLoad.set(gene.teacherId, dailyMap);

    const newWeekly = (teacherWeeklyLoad.get(gene.teacherId) || 0) + gene.hours;
    teacherWeeklyLoad.set(gene.teacherId, newWeekly);

    if (teacher.dailyLoad != null && newDaily > teacher.dailyLoad) { fitness += LOAD_PENALTY; continue; }
    if (teacher.weeklyLoad != null && newWeekly > teacher.weeklyLoad) { fitness += LOAD_PENALTY; continue; }

    // Soft bonuses
    if (gene.hours === 2) fitness += CONTIGUOUS_BONUS;
    // prefer morning
    if (TIME_SLOTS.indexOf(gene.startTime) < TIME_SLOTS.indexOf("02:00")) fitness += 5 * gene.hours;

    // accumulate assigned hours
    assignedCounts.set(assignKey, (assignedCounts.get(assignKey) || 0) + gene.hours);
  } // for genes

  // Penalize gaps per batch/day
  const batches = Array.from(new Set(chromosome.map(c => c.batchId)));
  for (const batchId of batches) {
    for (const day of DAYS) {
      const gaps = getBatchGaps(chromosome, batchId, day);
      fitness += SOFT_GAP_PENALTY * gaps; // negative usually
    }
  }

  // Check each required assignment was scheduled correctly
  for (const [key, reqHours] of requiredHoursMap.entries()) {
    const assigned = assignedCounts.get(key) || 0;
    if (assigned < reqHours) fitness += MISSING_HOURS_PENALTY * (reqHours - assigned);
    if (assigned > reqHours) fitness += MISSING_HOURS_PENALTY * (assigned - reqHours); // overassignment also bad
  }

  return fitness;
}

// ----------------- Chromosome generation / mutate / crossover -----------------

function generateRandomChromosome(allAssignments: AssignInput[], allRooms: any[]): Chromosome {
  const chromosome: Chromosome = [];
  const lessonHours: (AssignInput & { assignedHours: number })[] = [];

  for (const assign of allAssignments) {
    let remaining = assign.hoursRequired;
    while (remaining > 0) {
      const duration = (remaining >= 2 && assign.courseType === CourseType.LAB) ? 2 : 1;
      lessonHours.push({ ...assign, assignedHours: duration });
      remaining -= duration;
    }
  }

  // shuffle
  const shuffled = lessonHours.sort(() => Math.random() - 0.5);
  const slots = getAvailableSlots();

  for (const a of shuffled) {
    // choose slot biased to morning for initial population
    const slot = (Math.random() < 0.6)
      ? slots[Math.floor(Math.random() * Math.min(6, slots.length))]
      : slots[Math.floor(Math.random() * slots.length)];
    // choose room that fits type & capacity preference
    const candidateRooms = allRooms.filter(r => {
      const roomTypeOK = a.courseType === CourseType.LAB ? r.type === "LAB" : r.type === "CLASSROOM";
      return roomTypeOK && r.capacity >= a.batchSize;
    });
    const room = candidateRooms.length ? candidateRooms[Math.floor(Math.random() * candidateRooms.length)] : allRooms[Math.floor(Math.random() * allRooms.length)];

    const gene: PlacedAssignment = {
      courseId: a.courseId,
      teacherId: a.teacherId,
      batchId: a.batchId,
      groupId: a.groupId,
      courseType: a.courseType,
      hours: a.assignedHours,
      day: slot.day as Day,
      startTime: slot.startTime,
      roomId: room.id,
      courseTitle: a.courseTitle,
      teacherName: a.teacherName,
      batchName: a.batchName,
      groupName: a.groupName,
      roomNumber: room.roomNumber,
    };
    chromosome.push(gene);
  }
  return chromosome;
}

function initializePopulation(allAssignments: AssignInput[], allRooms: any[], lookups: GALookupData): Population {
  const pop: Population = [];
  for (let i = 0; i < POPULATION_SIZE; i++) {
    const chrom = generateRandomChromosome(allAssignments, allRooms);
    // repair initial chromosome immediately
    repairChromosome(chrom, lookups, allRooms);
    const fitness = calculateFitness(chrom, lookups);
    pop.push({ chromosome: chrom, fitness });
  }
  return pop;
}

function tournamentSelection(pop: Population): Chromosome {
  let best = pop[Math.floor(Math.random() * pop.length)];
  for (let i = 1; i < TOURNAMENT_SIZE; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (c.fitness > best.fitness) best = c;
  }
  // clone to avoid accidental mutation of parent in subsequent steps
  return JSON.parse(JSON.stringify(best.chromosome));
}

function crossover(parent1: Chromosome, parent2: Chromosome): [Chromosome, Chromosome] {
  // Uniform crossover by gene index (safer for variable-length)
  const len = Math.max(parent1.length, parent2.length);
  const off1: Chromosome = [];
  const off2: Chromosome = [];

  for (let i = 0; i < len; i++) {
    const g1 = parent1[i];
    const g2 = parent2[i];
    if (!g1 && g2) { off1.push(JSON.parse(JSON.stringify(g2))); off2.push(JSON.parse(JSON.stringify(g2))); continue; }
    if (!g2 && g1) { off1.push(JSON.parse(JSON.stringify(g1))); off2.push(JSON.parse(JSON.stringify(g1))); continue; }
    if (!g1 && !g2) continue;
    if (Math.random() < 0.5) {
      off1.push(JSON.parse(JSON.stringify(g1))); off2.push(JSON.parse(JSON.stringify(g2)));
    } else {
      off1.push(JSON.parse(JSON.stringify(g2))); off2.push(JSON.parse(JSON.stringify(g1)));
    }
  }
  return [off1, off2];
}

function mutate(chromosome: Chromosome, allRooms: any[]) {
  // less destructive: small probability to change either time OR room OR swap two genes
  for (let i = 0; i < chromosome.length; i++) {
    if (Math.random() >= MUTATION_RATE) continue;
    const gene = chromosome[i];
    const r = Math.random();
    const slots = getAvailableSlots();

    if (r < 0.4) {
      // change time only
      const slot = slots[Math.floor(Math.random() * slots.length)];
      gene.day = slot.day as Day;
      gene.startTime = slot.startTime;
    } else if (r < 0.8) {
      // change room only (keep type if possible)
      const candidates = allRooms.filter(rm => (gene.courseType === CourseType.LAB ? rm.type === "LAB" : rm.type === "CLASSROOM") && rm.capacity >= gene.batchName ? true : true);
      const pick = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : allRooms[Math.floor(Math.random() * allRooms.length)];
      gene.roomId = pick.id;
      gene.roomNumber = pick.roomNumber;
    } else {
      // swap with random other gene
      const j = Math.floor(Math.random() * chromosome.length);
      const tmp = JSON.parse(JSON.stringify(chromosome[j]));
      chromosome[j] = JSON.parse(JSON.stringify(gene));
      chromosome[i] = tmp;
    }
    // clear repair flags
    gene.repaired = false;
    gene.invalid = false;
  }
  return chromosome;
}

// ----------------- GA main loop -----------------

async function runGeneticAlgorithm(allAssignments: AssignInput[], allRooms: any[], allTeachers: any[]): Promise<Chromosome> {
  const teacherMap = new Map(allTeachers.map(t => [t.id, t]));
  const roomMap = new Map(allRooms.map(r => [r.id, r]));

  const assignmentMap = new Map<string, AssignInput>();
  const requiredHoursMap = new Map<string, number>();
  for (const a of allAssignments) {
    const key = getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId);
    assignmentMap.set(key, a);
    requiredHoursMap.set(key, (requiredHoursMap.get(key) || 0) + a.hoursRequired);
  }

  const lookups: GALookupData = { teacherMap, roomMap, assignmentMap, requiredHoursMap };

  let population = initializePopulation(allAssignments, allRooms, lookups);
  let best = population.reduce((p, c) => (c.fitness > p.fitness ? c : p));

  console.log(`Initial Population created. Best starting Fitness: ${best.fitness.toFixed(2)}`);

  for (let gen = 0; gen < MAX_GENERATIONS; gen++) {
    // sort descending
    population.sort((a, b) => b.fitness - a.fitness);
    const next: Population = [];
    // elitism
    for (let i = 0; i < ELITE_COUNT; i++) next.push(population[i]);

    // fill rest
    while (next.length < POPULATION_SIZE) {
      const p1 = tournamentSelection(population);
      const p2 = tournamentSelection(population);
      let [o1, o2] = crossover(p1, p2);
      o1 = mutate(o1, allRooms);
      o2 = mutate(o2, allRooms);
      // repair offspring before scoring
      repairChromosome(o1, lookups, allRooms);
      repairChromosome(o2, lookups, allRooms);
      next.push({ chromosome: o1, fitness: calculateFitness(o1, lookups) });
      if (next.length < POPULATION_SIZE) next.push({ chromosome: o2, fitness: calculateFitness(o2, lookups) });
    }
    population = next;
    if (population[0].fitness > best.fitness) best = population[0];

    if ((gen + 1) % 100 === 0 || gen === MAX_GENERATIONS - 1) {
      console.log(`Generation ${gen + 1}: Current Best Fitness = ${best.fitness.toFixed(2)}`);
    }
  }

  console.log(`\nGA Complete. Final Best Fitness: ${best.fitness.toFixed(2)}`);
  return best.chromosome;
}

// ----------------- Main Execution -----------------

export async function generateFullSchedule() {
  console.log("Fetching DB data...");
  const courses = await prisma.course.findMany({
    include: { batches: { include: { batch: true } }, teachers: true },
  });
  const allRooms = await prisma.room.findMany();
  const allTeachers = await prisma.teacher.findMany();

  const assignments: AssignInput[] = [];

  for (const course of courses) {
    const hours = Math.round(course.credit);
    for (const bc of course.batches) {
      const bct = course.teachers[0];
      if (!bct) continue;
      const teacherData = allTeachers.find(t => t.id === bct.teacherId);
      if (!teacherData) continue;
      const batchData = await prisma.batch.findUnique({ where: { id: bc.batchId }, select: { name: true, size: true } });
      const batchSize = batchData?.size ?? 30;
      const batchName = batchData?.name ?? "Batch";
      if (course.type === CourseType.LAB) {
        const labGroups = await prisma.labGroup.findMany({ where: { batchCourseId: bc.id } });
        const groups = labGroups.length ? labGroups : [{ id: null, name: `${batchName}-LAB`, size: batchSize }];
        for (const g of groups) {
          assignments.push({
            courseId: course.id,
            teacherId: teacherData.id,
            batchId: bc.batchId,
            groupId: g.id,
            hoursRequired: hours,
            courseType: course.type,
            courseTitle: course.title,
            batchSize: (g as any).size ?? batchSize,
            teacherName: teacherData.name,
            batchName,
            groupName: (g as any).name ?? null,
          });
        }
      } else {
        const batchGroups = await prisma.batchGroup.findMany({ where: { batchId: bc.batchId } });
        const groups = batchGroups.length ? batchGroups : [{ id: null, name: batchName, size: batchSize }];
        for (const g of groups) {
          assignments.push({
            courseId: course.id,
            teacherId: teacherData.id,
            batchId: bc.batchId,
            groupId: g.id,
            hoursRequired: hours,
            courseType: course.type,
            courseTitle: course.title,
            batchSize: (g as any).size ?? batchSize,
            teacherName: teacherData.name,
            batchName,
            groupName: (g as any).name ?? null,
          });
        }
      }
    }
  }

  console.log(`Total assignments to schedule (entries): ${assignments.length}`);
  console.log("Running Genetic Algorithm...");
  const bestChrom = await runGeneticAlgorithm(assignments, allRooms, allTeachers);

  // final repair & sorting
  const lookups: GALookupData = {
    teacherMap: new Map(allTeachers.map(t => [t.id, t])),
    roomMap: new Map(allRooms.map(r => [r.id, r])),
    assignmentMap: new Map(assignments.map(a => [getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), a])),
    requiredHoursMap: new Map(assignments.map(a => [getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), a.hoursRequired]))
  };
  repairChromosome(bestChrom, lookups, allRooms);

  bestChrom.sort((a, b) => {
    const da = DAYS.indexOf(a.day); const db = DAYS.indexOf(b.day);
    if (da !== db) return da - db;
    return TIME_SLOTS.indexOf(a.startTime) - TIME_SLOTS.indexOf(b.startTime);
  });

  const rows = bestChrom.map(a => ({
    Day: a.day,
    Start: a.startTime,
    End: nextHour(a.startTime),
    Course: a.courseTitle,
    Teacher: a.teacherName,
    Batch: a.batchName,
    Group: a.groupName ?? a.batchName,
    Room: a.roomNumber,
    Hours: a.hours,
    Invalid: !!a.invalid,
    Repaired: !!a.repaired,
  }));

  console.log("\nGenerated routine:");
  console.table(rows);
}

generateFullSchedule()
  .then(() => { console.log("Done."); process.exit(0); })
  .catch((err) => { console.error("Error:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });



















88888888888888888888888888888888888888888888888


import { PrismaClient, RoomType, CourseType } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Initialize Prisma
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// --- GA CONFIGURATION ---
const POPULATION_SIZE = 150; // Increased for better diversity
const MAX_GENERATIONS = 1000;
const MUTATION_RATE = 0.05;
const TOURNAMENT_SIZE = 5;
const ELITE_COUNT = 5;
const REPAIR_ATTEMPTS = 20;

// --- PENALTY WEIGHTS (Heavily Tuned) ---
const HARD_PENALTY = -100000;
const TEACHER_CONFLICT_PENALTY = -50000;
const ROOM_CONFLICT_PENALTY = -50000;
const WRONG_ROOMTYPE_PENALTY = -20000;
const CAPACITY_PENALTY = -20000;
const LOAD_PENALTY = -10000;
const MISSING_HOURS_PENALTY = -100000;
const SOFT_GAP_PENALTY = -20; 
const CONTIGUOUS_BONUS = 50; 
const MORNING_BONUS = 10;

type Day = "SUN" | "MON" | "TUE" | "WED" | "THU";
const DAYS: Day[] = ["SUN", "MON", "TUE", "WED", "THU"];

// 1-hour slots. Note: 13:00 (1pm) is skipped for lunch break.
const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "02:00", "03:00", "04:00"];

// --- TYPES ---

interface PlacedAssignment {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId: number | null;
  courseType: CourseType;
  hours: number;

  // Placement
  day: Day;
  startTime: string;
  roomId: number;

  // Metadata
  courseTitle: string;
  teacherName: string;
  batchName: string;
  batchSize: number; // Critical for capacity checks
  groupName: string | null;
  roomNumber: string;

  // Flags
  repaired?: boolean;
  invalid?: boolean;
}

interface AssignInput {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId: number | null;
  hoursRequired: number;
  courseType: CourseType;
  courseTitle: string;
  batchSize: number;
  teacherName: string;
  batchName: string;
  groupName: string | null;
}

type Chromosome = PlacedAssignment[];
type Population = { chromosome: Chromosome; fitness: number }[];

interface GALookupData {
  teacherMap: Map<number, any>;
  roomMap: Map<number, any>;
  assignmentMap: Map<string, AssignInput>;
  requiredHoursMap: Map<string, number>;
}

// --- UTILITIES ---

function getAssignmentKey(courseId: number, teacherId: number, batchId: number, groupId: number | null): string {
  return `${courseId}-${teacherId}-${batchId}-${groupId ?? 'null'}`;
}

function nextHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1).toString().padStart(2, "0");
  if (next === "13") return "14:00"; // 1pm becomes 2pm (Lunch Break)
  return `${next}:${m.toString().padStart(2, "0")}`;
}

function getAvailableSlots() {
  return DAYS.flatMap(day => TIME_SLOTS.map(t => ({ day, startTime: t as string })));
}

// Helper to see if two genes overlap in time on the same day
function isTimeOverlap(gene1: PlacedAssignment, gene2: PlacedAssignment): boolean {
    if (gene1.day !== gene2.day) return false;
    const start1 = TIME_SLOTS.indexOf(gene1.startTime);
    const start2 = TIME_SLOTS.indexOf(gene2.startTime);
    if (start1 === -1 || start2 === -1) return false; // Should not happen
    
    const end1 = start1 + gene1.hours;
    const end2 = start2 + gene2.hours;

    // Overlap if one starts before the other ends
    return start1 < end2 && start2 < end1;
}

// ----------------- REPAIR LOGIC -----------------

function geneHasConflict(gene: PlacedAssignment, chromosome: Chromosome, lookups: GALookupData): { conflict: boolean; reason?: string } {
  const { roomMap } = lookups;
  const room = roomMap.get(gene.roomId);
  if (!room) return { conflict: true, reason: "missing room" };
  
  const startIndex = TIME_SLOTS.indexOf(gene.startTime);
  if (startIndex < 0) return { conflict: true, reason: "invalid start time" };
  if (startIndex + gene.hours > TIME_SLOTS.length) return { conflict: true, reason: "out of bounds" };

  // Check against every other gene
  for (const other of chromosome) {
    if (other === gene) continue; 
    
    if (isTimeOverlap(gene, other)) {
        // 1. Teacher Collision
        if (other.teacherId === gene.teacherId) return { conflict: true, reason: "teacher-collision" };
        
        // 2. Room Collision
        if (other.roomId === gene.roomId) return { conflict: true, reason: "room-collision" };

        // 3. Batch/Group Collision
        if (other.batchId === gene.batchId) {
             // If either is a whole-batch class (groupId: null), it blocks everything for that batch
             // Or if they match specific group IDs
             if (other.groupId === null || gene.groupId === null || other.groupId === gene.groupId) {
                 return { conflict: true, reason: "batch/group-collision" };
             }
        }
    }
  }
  return { conflict: false };
}

function repairChromosome(chromosome: Chromosome, lookups: GALookupData, allRooms: any[]): Chromosome {
  const slots = getAvailableSlots();
  const roomCandidates = allRooms.slice(); 

  for (const gene of chromosome) {
    // 1. Basic Assignment Checks
    const assignmentKey = getAssignmentKey(gene.courseId, gene.teacherId, gene.batchId, gene.groupId);
    const requiredAssignment = lookups.assignmentMap.get(assignmentKey);
    if (!requiredAssignment) { gene.invalid = true; continue; }

    const requiredType = gene.courseType === CourseType.LAB ? RoomType.LAB : RoomType.CLASSROOM;
    const currentRoom = lookups.roomMap.get(gene.roomId);

    // 2. Check for conflicts or invalid room assignments
    const conflictCheck = geneHasConflict(gene, chromosome, lookups);
    const isRoomInvalid = currentRoom.type !== requiredType || currentRoom.capacity < gene.batchSize;
    
    if (!conflictCheck.conflict && !isRoomInvalid) continue; // All good

    // 3. Attempt Repair
    let fixed = false;
    for (let attempt = 0; attempt < REPAIR_ATTEMPTS && !fixed; attempt++) {
      // Pick Random Slot
      const pickSlot = slots[Math.floor(Math.random() * slots.length)];
      
      // Pick Valid Room
      const validRooms = roomCandidates.filter(r => {
        const typeOk = r.type === (requiredType === RoomType.LAB ? "LAB" : "CLASSROOM");
        const capOk = r.capacity >= gene.batchSize;
        return typeOk && capOk;
      });

      if (validRooms.length === 0) break; 
      const pickRoom = validRooms[Math.floor(Math.random() * validRooms.length)];

      // Apply Test Fix
      const original = { day: gene.day, startTime: gene.startTime, roomId: gene.roomId, roomNumber: gene.roomNumber };
      gene.day = pickSlot.day as Day;
      gene.startTime = pickSlot.startTime;
      gene.roomId = pickRoom.id;
      gene.roomNumber = pickRoom.roomNumber;

      const conflictNow = geneHasConflict(gene, chromosome, lookups);

      if (!conflictNow.conflict) {
        gene.repaired = true;
        fixed = true;
      } else {
        // Revert if fix failed
        gene.day = original.day;
        gene.startTime = original.startTime;
        gene.roomId = original.roomId;
        gene.roomNumber = original.roomNumber;
      }
    }

    if (!fixed) gene.invalid = true;
  }
  return chromosome;
}

// ----------------- FITNESS FUNCTION -----------------

function calculateFitness(chromosome: Chromosome, lookups: GALookupData): number {
  let fitness = 0;
  const { teacherMap, roomMap, requiredHoursMap } = lookups;

  const teacherDailyLoad = new Map<number, Map<Day, number>>();
  const usedSlots = new Set<string>();
  const assignedCounts = new Map<string, number>();

  for (const gene of chromosome) {
    if (gene.invalid) { fitness += HARD_PENALTY; continue; }
    
    const assignKey = getAssignmentKey(gene.courseId, gene.teacherId, gene.batchId, gene.groupId);
    const room = roomMap.get(gene.roomId);
    
    // 1. Validate Room
    const reqType = gene.courseType === CourseType.LAB ? "LAB" : "CLASSROOM";
    if (room.type !== reqType) { fitness += WRONG_ROOMTYPE_PENALTY; }
    if (room.capacity < gene.batchSize) { fitness += CAPACITY_PENALTY; }

    // 2. Validate Bounds
    const startIndex = TIME_SLOTS.indexOf(gene.startTime);
    if (startIndex < 0 || startIndex + gene.hours > TIME_SLOTS.length) { fitness += HARD_PENALTY; continue; }

    // 3. Conflict Detection (Hash Set Strategy)
    let localConflict = false;
    for (let h = 0; h < gene.hours; h++) {
      const time = TIME_SLOTS[startIndex + h];
      
      const teacherKey = `T-${gene.teacherId}-${gene.day}-${time}`;
      const roomKey = `R-${gene.roomId}-${gene.day}-${time}`;
      const batchKey = `B-${gene.batchId}-${gene.day}-${time}`;
      const groupKey = gene.groupId ? `G-${gene.groupId}-${gene.day}-${time}` : null;

      if (usedSlots.has(teacherKey)) { fitness += TEACHER_CONFLICT_PENALTY; localConflict = true; }
      if (usedSlots.has(roomKey)) { fitness += ROOM_CONFLICT_PENALTY; localConflict = true; }
      if (usedSlots.has(batchKey)) { fitness += TEACHER_CONFLICT_PENALTY; localConflict = true; } // Whole batch busy
      if (groupKey && usedSlots.has(groupKey)) { fitness += TEACHER_CONFLICT_PENALTY; localConflict = true; }

      usedSlots.add(teacherKey);
      usedSlots.add(roomKey);
      usedSlots.add(batchKey);
      if (groupKey) usedSlots.add(groupKey);
    }
    if (localConflict) continue; 

    // 4. Load Calculation
    const dailyMap = teacherDailyLoad.get(gene.teacherId) || new Map<Day, number>();
    const currentLoad = dailyMap.get(gene.day) || 0;
    dailyMap.set(gene.day, currentLoad + gene.hours);
    teacherDailyLoad.set(gene.teacherId, dailyMap);

    // 5. Soft Bonuses
    if (gene.hours === 2) fitness += CONTIGUOUS_BONUS;
    if (TIME_SLOTS.indexOf(gene.startTime) < 4) fitness += MORNING_BONUS;

    // Track assigned hours
    assignedCounts.set(assignKey, (assignedCounts.get(assignKey) || 0) + gene.hours);
  }

  // 6. Teacher Load Penalties
  for (const [teacherId, dailyMap] of teacherDailyLoad) {
      const teacher = teacherMap.get(teacherId);
      const maxDaily = teacher.dailyLoad || 3;
      for (const [day, hours] of dailyMap) {
          if (hours > maxDaily) fitness += LOAD_PENALTY * (hours - maxDaily);
      }
  }

  // 7. Missing Hours Check
  for (const [key, reqHours] of requiredHoursMap.entries()) {
    const assigned = assignedCounts.get(key) || 0;
    if (assigned < reqHours) fitness += MISSING_HOURS_PENALTY * (reqHours - assigned);
  }

  return fitness;
}

// ----------------- GA OPERATORS -----------------

function generateRandomChromosome(allAssignments: AssignInput[], allRooms: any[]): Chromosome {
  const chromosome: Chromosome = [];
  const lessonHours: (AssignInput & { assignedHours: number })[] = [];

  for (const assign of allAssignments) {
    let remaining = assign.hoursRequired;
    while (remaining > 0) {
      const duration = (remaining >= 2 && assign.courseType === CourseType.LAB) ? 2 : 1;
      lessonHours.push({ ...assign, assignedHours: duration });
      remaining -= duration;
    }
  }

  const shuffled = lessonHours.sort(() => Math.random() - 0.5);
  const slots = getAvailableSlots();

  for (const a of shuffled) {
    const slot = slots[Math.floor(Math.random() * slots.length)];
    
    // Filter valid rooms based on Type and Capacity (FIXED LOGIC)
    const candidateRooms = allRooms.filter(r => {
      const typeOk = a.courseType === CourseType.LAB ? r.type === "LAB" : r.type === "CLASSROOM";
      const capOk = r.capacity >= a.batchSize;
      return typeOk && capOk;
    });
    
    const room = candidateRooms.length 
      ? candidateRooms[Math.floor(Math.random() * candidateRooms.length)] 
      : allRooms[Math.floor(Math.random() * allRooms.length)];

    chromosome.push({
      courseId: a.courseId,
      teacherId: a.teacherId,
      batchId: a.batchId,
      groupId: a.groupId,
      courseType: a.courseType,
      hours: a.assignedHours,
      day: slot.day as Day,
      startTime: slot.startTime,
      roomId: room.id,
      courseTitle: a.courseTitle,
      teacherName: a.teacherName,
      batchName: a.batchName,
      batchSize: a.batchSize, // Passed correctly
      groupName: a.groupName,
      roomNumber: room.roomNumber,
    });
  }
  return chromosome;
}

function mutate(chromosome: Chromosome, allRooms: any[]) {
  for (let i = 0; i < chromosome.length; i++) {
    if (Math.random() >= MUTATION_RATE) continue;
    const gene = chromosome[i];
    const r = Math.random();
    const slots = getAvailableSlots();

    if (r < 0.5) {
      // Change Time
      const slot = slots[Math.floor(Math.random() * slots.length)];
      gene.day = slot.day as Day;
      gene.startTime = slot.startTime;
    } else {
      // Change Room (Fixed Comparison Logic)
      const candidates = allRooms.filter(rm => {
        const typeOk = (gene.courseType === CourseType.LAB) ? rm.type === "LAB" : rm.type === "CLASSROOM";
        const capOk = rm.capacity >= gene.batchSize; // Correct numeric comparison
        return typeOk && capOk;
      });
      const pick = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : allRooms[Math.floor(Math.random() * allRooms.length)];
      gene.roomId = pick.id;
      gene.roomNumber = pick.roomNumber;
    }
    gene.repaired = false;
    gene.invalid = false;
  }
  return chromosome;
}

function initializePopulation(allAssignments: AssignInput[], allRooms: any[], lookups: GALookupData): Population {
  const pop: Population = [];
  for (let i = 0; i < POPULATION_SIZE; i++) {
    const chrom = generateRandomChromosome(allAssignments, allRooms);
    repairChromosome(chrom, lookups, allRooms);
    const fitness = calculateFitness(chrom, lookups);
    pop.push({ chromosome: chrom, fitness });
  }
  return pop;
}

function tournamentSelection(pop: Population): Chromosome {
  let best = pop[Math.floor(Math.random() * pop.length)];
  for (let i = 1; i < TOURNAMENT_SIZE; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (c.fitness > best.fitness) best = c;
  }
  return JSON.parse(JSON.stringify(best.chromosome));
}

function crossover(parent1: Chromosome, parent2: Chromosome): [Chromosome, Chromosome] {
  const len = Math.max(parent1.length, parent2.length);
  const off1: Chromosome = [];
  const off2: Chromosome = [];
  for (let i = 0; i < len; i++) {
    const g1 = parent1[i];
    const g2 = parent2[i];
    if (Math.random() < 0.5) {
      if(g1) off1.push(JSON.parse(JSON.stringify(g1)));
      if(g2) off2.push(JSON.parse(JSON.stringify(g2)));
    } else {
      if(g2) off1.push(JSON.parse(JSON.stringify(g2)));
      if(g1) off2.push(JSON.parse(JSON.stringify(g1)));
    }
  }
  return [off1, off2];
}

// ----------------- EXECUTION -----------------

async function runGeneticAlgorithm(allAssignments: AssignInput[], allRooms: any[], allTeachers: any[]): Promise<Chromosome> {
  const teacherMap = new Map(allTeachers.map(t => [t.id, t]));
  const roomMap = new Map(allRooms.map(r => [r.id, r]));
  const assignmentMap = new Map(allAssignments.map(a => [getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), a]));
  const requiredHoursMap = new Map(allAssignments.map(a => [getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), a.hoursRequired]));
  const lookups: GALookupData = { teacherMap, roomMap, assignmentMap, requiredHoursMap };

  let population = initializePopulation(allAssignments, allRooms, lookups);
  let best = population.reduce((p, c) => (c.fitness > p.fitness ? c : p));

  console.log(`Initial Best Fitness: ${best.fitness.toFixed(0)}`);

  for (let gen = 0; gen < MAX_GENERATIONS; gen++) {
    population.sort((a, b) => b.fitness - a.fitness);
    const next: Population = [];
    for (let i = 0; i < ELITE_COUNT; i++) next.push(population[i]);

    while (next.length < POPULATION_SIZE) {
      const p1 = tournamentSelection(population);
      const p2 = tournamentSelection(population);
      let [o1, o2] = crossover(p1, p2);
      o1 = mutate(o1, allRooms);
      o2 = mutate(o2, allRooms);
      repairChromosome(o1, lookups, allRooms);
      repairChromosome(o2, lookups, allRooms);
      next.push({ chromosome: o1, fitness: calculateFitness(o1, lookups) });
      if (next.length < POPULATION_SIZE) next.push({ chromosome: o2, fitness: calculateFitness(o2, lookups) });
    }
    population = next;
    if (population[0].fitness > best.fitness) best = population[0];

    if ((gen + 1) % 100 === 0) console.log(`Gen ${gen + 1}: Best Fitness = ${best.fitness.toFixed(0)}`);
  }
  return best.chromosome;
}

export async function generateFullSchedule() {
  console.log("Fetching Data...");
  const courses = await prisma.course.findMany({ include: { batches: { include: { batch: true } }, teachers: true } });
  const allRooms = await prisma.room.findMany();
  const allTeachers = await prisma.teacher.findMany();
  const assignments: AssignInput[] = [];

  for (const course of courses) {
    const hours = Math.round(course.credit);
    for (const bc of course.batches) {
      const bct = course.teachers[0];
      if (!bct) continue;
      const teacherData = allTeachers.find(t => t.id === bct.teacherId);
      if (!teacherData) continue;
      const batchData = await prisma.batch.findUnique({ where: { id: bc.batchId }, select: { name: true, size: true } });
      
      // --- KEY FIX: Merge Theory Classes ---
      if (course.type === CourseType.THEORY) {
          // For theory, schedule ONCE for the whole batch
          assignments.push({
            courseId: course.id,
            teacherId: teacherData.id,
            batchId: bc.batchId,
            groupId: null, // Whole batch
            hoursRequired: hours,
            courseType: course.type,
            courseTitle: course.title,
            batchSize: batchData?.size ?? 30,
            teacherName: teacherData.name,
            batchName: batchData?.name ?? "Batch",
            groupName: null,
          });
      } else {
          // For Lab, keep separate groups
          const labGroups = await prisma.labGroup.findMany({ where: { batchCourseId: bc.id } });
          const groups = labGroups.length ? labGroups : [{ id: null, name: `${batchData?.name}-LAB`, size: batchData?.size ?? 30 }];
          for (const g of groups) {
            assignments.push({
                courseId: course.id, teacherId: teacherData.id, batchId: bc.batchId, groupId: g.id,
                hoursRequired: hours, courseType: course.type, courseTitle: course.title,
                batchSize: (g as any).size ?? batchData?.size, teacherName: teacherData.name, 
                batchName: batchData?.name ?? "Batch", groupName: (g as any).name ?? null,
            });
          }
      }
    }
  }

  console.log(`Scheduling ${assignments.length} assignments...`);
  const bestChrom = await runGeneticAlgorithm(assignments, allRooms, allTeachers);

  bestChrom.sort((a, b) => {
    const da = DAYS.indexOf(a.day); const db = DAYS.indexOf(b.day);
    if (da !== db) return da - db;
    return TIME_SLOTS.indexOf(a.startTime) - TIME_SLOTS.indexOf(b.startTime);
  });

  const rows = bestChrom.map(a => ({
    Day: a.day, Start: a.startTime, End: nextHour(a.startTime), Course: a.courseTitle,
    Teacher: a.teacherName, Batch: a.batchName, Group: a.groupName ?? "ALL",
    Room: a.roomNumber, Hours: a.hours, Invalid: !!a.invalid, Repaired: !!a.repaired
  }));

  console.log("\nFinal Routine:");
  console.table(rows);
}

generateFullSchedule()
  .then(() => { console.log("Done."); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });


//////Final One Backupp ///////
import { PrismaClient, RoomType, CourseType } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Initialize Prisma
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// --- GA CONFIGURATION ---
const POPULATION_SIZE = 150;
const MAX_GENERATIONS = 1000;
const MUTATION_RATE = 0.05;
const TOURNAMENT_SIZE = 5;
const ELITE_COUNT = 5;
const REPAIR_ATTEMPTS = 20;

// --- PENALTY WEIGHTS ---
const HARD_PENALTY = -100000;
const TEACHER_CONFLICT_PENALTY = -50000;
const ROOM_CONFLICT_PENALTY = -50000;
const WRONG_ROOMTYPE_PENALTY = -20000;
const CAPACITY_PENALTY = -20000;
const LOAD_PENALTY = -10000;
const MISSING_HOURS_PENALTY = -100000;
const SOFT_GAP_PENALTY = -20; 
const CONTIGUOUS_BONUS = 50; 
const MORNING_BONUS = 10;

type Day = "SUN" | "MON" | "TUE" | "WED" | "THU";
const DAYS: Day[] = ["SUN", "MON", "TUE", "WED", "THU"];

// 1-hour slots
const TIME_SLOTS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "01:00",
  "02:00",
  "03:00",
//   "04:00"
];

// --- TYPES ---

interface PlacedAssignment {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId: number | null;
  courseType: CourseType;
  hours: number;

  day: Day;
  startTime: string;
  roomId: number;

  courseTitle: string;
  teacherName: string;
  batchName: string;
  batchSize: number;
  groupName: string | null;
  roomNumber: string;

  repaired?: boolean;
  invalid?: boolean;
}

interface AssignInput {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId: number | null;
  hoursRequired: number;
  courseType: CourseType;
  courseTitle: string;
  batchSize: number;
  teacherName: string;
  batchName: string;
  groupName: string | null;
}

type Chromosome = PlacedAssignment[];
type Population = { chromosome: Chromosome; fitness: number }[];

interface GALookupData {
  teacherMap: Map<number, any>;
  roomMap: Map<number, any>;
  assignmentMap: Map<string, AssignInput>;
  requiredHoursMap: Map<string, number>;
}

// ------------------------------------------
function getAssignmentKey(c: number, t: number, b: number, g: number | null) {
  return `${c}-${t}-${b}-${g ?? 'null'}`;
}

function nextHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1).toString().padStart(2, "0");
  if (next === "13") return "14:00";
  return `${next}:${m.toString().padStart(2, "0")}`;
}

function getAvailableSlots() {
  return DAYS.flatMap(day => TIME_SLOTS.map(t => ({ day, startTime: t })));
}

function isTimeOverlap(g1: PlacedAssignment, g2: PlacedAssignment): boolean {
  if (g1.day !== g2.day) return false;
  const s1 = TIME_SLOTS.indexOf(g1.startTime);
  const s2 = TIME_SLOTS.indexOf(g2.startTime);
  if (s1 < 0 || s2 < 0) return false;
  const e1 = s1 + g1.hours;
  const e2 = s2 + g2.hours;
  return s1 < e2 && s2 < e1;
}

// --------------------------------------------------
// CONFLICT CHECK
function geneHasConflict(
  gene: PlacedAssignment,
  chromosome: Chromosome,
  lookups: GALookupData
): { conflict: boolean; reason?: string } {

  const room = lookups.roomMap.get(gene.roomId);
  if (!room) return { conflict: true, reason: "missing room" };

  const startIndex = TIME_SLOTS.indexOf(gene.startTime);
  if (startIndex < 0 || startIndex + gene.hours > TIME_SLOTS.length)
    return { conflict: true, reason: "bounds" };

  for (const other of chromosome) {
    if (other === gene) continue;

    if (isTimeOverlap(gene, other)) {

      if (other.teacherId === gene.teacherId)
        return { conflict: true, reason: "teacher" };

      if (other.roomId === gene.roomId)
        return { conflict: true, reason: "room" };

      if (other.batchId === gene.batchId) {
        if (
          other.groupId === null ||
          gene.groupId === null ||
          other.groupId === gene.groupId
        ) return { conflict: true, reason: "batch/group" };
      }
    }
  }
  return { conflict: false };
}

// --------------------------------------------------
// REPAIR FUNCTION
function repairChromosome(
  chrom: Chromosome,
  lookups: GALookupData,
  allRooms: any[]
) {
  const slots = getAvailableSlots();

  for (const gene of chrom) {
    const key = getAssignmentKey(
      gene.courseId,
      gene.teacherId,
      gene.batchId,
      gene.groupId
    );

    const requiredAssignment = lookups.assignmentMap.get(key);
    if (!requiredAssignment) {
      gene.invalid = true;
      continue;
    }

    const neededRoomType =
      gene.courseType === CourseType.LAB ? RoomType.LAB : RoomType.CLASSROOM;

    const room = lookups.roomMap.get(gene.roomId);
    const badRoom =
      room.type !== neededRoomType || room.capacity < gene.batchSize;

    const conflict = geneHasConflict(gene, chrom, lookups);

    if (!conflict.conflict && !badRoom) continue;

    let fixed = false;

    for (let i = 0; i < REPAIR_ATTEMPTS && !fixed; i++) {
      const slot = slots[Math.floor(Math.random() * slots.length)];

      const validRooms = allRooms.filter(r =>
        (neededRoomType === RoomType.LAB ? r.type === "LAB" : r.type === "CLASSROOM")
        && r.capacity >= gene.batchSize
      );

      if (!validRooms.length) break;
      const newRoom = validRooms[Math.floor(Math.random() * validRooms.length)];

      const prev = {
        day: gene.day,
        startTime: gene.startTime,
        roomId: gene.roomId,
        roomNumber: gene.roomNumber,
      };

      gene.day = slot.day;
      gene.startTime = slot.startTime;
      gene.roomId = newRoom.id;
      gene.roomNumber = newRoom.roomNumber;

      const after = geneHasConflict(gene, chrom, lookups);

      if (!after.conflict) {
        gene.repaired = true;
        fixed = true;
      } else {
        Object.assign(gene, prev);
      }
    }

    if (!fixed) gene.invalid = true;
  }
  return chrom;
}

// --------------------------------------------------
// FITNESS FUNCTION
function calculateFitness(chrom: Chromosome, lookups: GALookupData): number {
  let fitness = 0;

  const teacherLoad = new Map<number, Map<Day, number>>();
  const used = new Set<string>();
  const assigned = new Map<string, number>();

  for (const gene of chrom) {
    if (gene.invalid) {
      fitness += HARD_PENALTY;
      continue;
    }

    const key = getAssignmentKey(
      gene.courseId,
      gene.teacherId,
      gene.batchId,
      gene.groupId
    );

    const room = lookups.roomMap.get(gene.roomId);
    const neededType = gene.courseType === CourseType.LAB ? "LAB" : "CLASSROOM";

    if (room.type !== neededType) fitness += WRONG_ROOMTYPE_PENALTY;
    if (room.capacity < gene.batchSize) fitness += CAPACITY_PENALTY;

    const start = TIME_SLOTS.indexOf(gene.startTime);
    if (start < 0 || start + gene.hours > TIME_SLOTS.length) {
      fitness += HARD_PENALTY;
      continue;
    }

    let conflict = false;

    for (let h = 0; h < gene.hours; h++) {
      const t = TIME_SLOTS[start + h];

      const teacherKey = `T-${gene.teacherId}-${gene.day}-${t}`;
      const roomKey = `R-${gene.roomId}-${gene.day}-${t}`;
      const batchKey = `B-${gene.batchId}-${gene.day}-${t}`;
      const groupKey = gene.groupId ? `G-${gene.groupId}-${gene.day}-${t}` : null;

      if (used.has(teacherKey)) {
        fitness += TEACHER_CONFLICT_PENALTY;
        conflict = true;
      }
      if (used.has(roomKey)) {
        fitness += ROOM_CONFLICT_PENALTY;
        conflict = true;
      }
      if (used.has(batchKey)) {
        fitness += TEACHER_CONFLICT_PENALTY;
        conflict = true;
      }
      if (groupKey && used.has(groupKey)) {
        fitness += TEACHER_CONFLICT_PENALTY;
        conflict = true;
      }

      used.add(teacherKey);
      used.add(roomKey);
      used.add(batchKey);
      if (groupKey) used.add(groupKey);
    }

    if (conflict) continue;

    const map = teacherLoad.get(gene.teacherId) || new Map();
    map.set(gene.day, (map.get(gene.day) ?? 0) + gene.hours);
    teacherLoad.set(gene.teacherId, map);

    if (gene.hours === 2) fitness += CONTIGUOUS_BONUS;
    if (TIME_SLOTS.indexOf(gene.startTime) < 4) fitness += MORNING_BONUS;

    assigned.set(key, (assigned.get(key) ?? 0) + gene.hours);
  }

  for (const [teach, map] of teacherLoad) {
    const max = lookups.teacherMap.get(teach)?.dailyLoad ?? 3;
    for (const [day, hours] of map) {
      if (hours > max) fitness += LOAD_PENALTY * (hours - max);
    }
  }

  for (const [key, required] of lookups.requiredHoursMap) {
    const got = assigned.get(key) ?? 0;
    if (got < required)
      fitness += MISSING_HOURS_PENALTY * (required - got);
  }

  return fitness;
}

// --------------------------------------------------
// GENETIC OPERATORS
function generateRandomChromosome(
  assigns: AssignInput[],
  rooms: any[]
): Chromosome {

  const chrom: Chromosome = [];
  const expanded: (AssignInput & { assignedHours: number })[] = [];

  for (const a of assigns) {
    let remain = a.hoursRequired;
    while (remain > 0) {
      const hours = (remain >= 2 && a.courseType === CourseType.LAB) ? 2 : 1;
      expanded.push({ ...a, assignedHours: hours });
      remain -= hours;
    }
  }

  const shuffled = expanded.sort(() => Math.random() - 0.5);
  const slots = getAvailableSlots();

  for (const a of shuffled) {
    const slot = slots[Math.floor(Math.random() * slots.length)];

    const validRooms = rooms.filter(r =>
      (a.courseType === CourseType.LAB ? r.type === "LAB" : r.type === "CLASSROOM")
      && r.capacity >= a.batchSize
    );

    const room = validRooms.length
      ? validRooms[Math.floor(Math.random() * validRooms.length)]
      : rooms[Math.floor(Math.random() * rooms.length)];

    chrom.push({
      courseId: a.courseId,
      teacherId: a.teacherId,
      batchId: a.batchId,
      groupId: a.groupId,

      courseType: a.courseType,
      hours: a.assignedHours,

      day: slot.day as Day,
      startTime: slot.startTime,

      roomId: room.id,

      courseTitle: a.courseTitle,
      teacherName: a.teacherName,
      batchName: a.batchName,
      batchSize: a.batchSize,
      groupName: a.groupName,
      roomNumber: room.roomNumber,
    });
  }

  return chrom;
}

function mutate(chrom: Chromosome, rooms: any[]) {
  for (const gene of chrom) {
    if (Math.random() > MUTATION_RATE) continue;

    const slots = getAvailableSlots();
    const roll = Math.random();

    if (roll < 0.5) {
      const sl = slots[Math.floor(Math.random() * slots.length)];
      gene.day = sl.day as Day;
      gene.startTime = sl.startTime;
    } else {
      const valid = rooms.filter(r =>
        (gene.courseType === CourseType.LAB ? r.type === "LAB" : r.type === "CLASSROOM")
        && r.capacity >= gene.batchSize
      );
      const pick = valid.length
        ? valid[Math.floor(Math.random() * valid.length)]
        : rooms[Math.floor(Math.random() * rooms.length)];
      gene.roomId = pick.id;
      gene.roomNumber = pick.roomNumber;
    }

    gene.repaired = false;
    gene.invalid = false;
  }

  return chrom;
}

function tournamentSelection(pop: Population): Chromosome {
  let best = pop[Math.floor(Math.random() * pop.length)];
  for (let i = 1; i < TOURNAMENT_SIZE; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (c.fitness > best.fitness) best = c;
  }
  return JSON.parse(JSON.stringify(best.chromosome));
}

function crossover(a: Chromosome, b: Chromosome): [Chromosome, Chromosome] {
  const max = Math.max(a.length, b.length);
  const o1: Chromosome = [];
  const o2: Chromosome = [];

  for (let i = 0; i < max; i++) {
    const g1 = a[i];
    const g2 = b[i];
    if (Math.random() < 0.5) {
      if (g1) o1.push(JSON.parse(JSON.stringify(g1)));
      if (g2) o2.push(JSON.parse(JSON.stringify(g2)));
    } else {
      if (g2) o1.push(JSON.parse(JSON.stringify(g2)));
      if (g1) o2.push(JSON.parse(JSON.stringify(g1)));
    }
  }
  return [o1, o2];
}

function initializePopulation(
  assigns: AssignInput[],
  rooms: any[],
  lookups: GALookupData
): Population {

  const pop: Population = [];

  for (let i = 0; i < POPULATION_SIZE; i++) {
    const chrom = generateRandomChromosome(assigns, rooms);
    repairChromosome(chrom, lookups, rooms);
    pop.push({
      chromosome: chrom,
      fitness: calculateFitness(chrom, lookups)
    });
  }
  return pop;
}

// --------------------------------------------------
// MAIN GA LOOP
async function runGA(
  assigns: AssignInput[],
  rooms: any[],
  teachers: any[]
): Promise<Chromosome> {

  const teacherMap = new Map(teachers.map(t => [t.id, t]));
  const roomMap    = new Map(rooms.map(r => [r.id, r]));
  const assignmentMap = new Map(
    assigns.map(a => [getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), a])
  );
  const requiredHoursMap = new Map(
    assigns.map(a => [getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), a.hoursRequired])
  );

  const lookups: GALookupData = {
    teacherMap,
    roomMap,
    assignmentMap,
    requiredHoursMap
  };

  let population = initializePopulation(assigns, rooms, lookups);
  let best = population.reduce((a, b) => (b.fitness > a.fitness ? b : a));

  console.log(`Initial Best Fitness: ${best.fitness}`);

  for (let gen = 0; gen < MAX_GENERATIONS; gen++) {

    population.sort((a, b) => b.fitness - a.fitness);

    const next: Population = [];
    for (let i = 0; i < ELITE_COUNT; i++) next.push(population[i]);

    while (next.length < POPULATION_SIZE) {
      const p1 = tournamentSelection(population);
      const p2 = tournamentSelection(population);

      let [c1, c2] = crossover(p1, p2);
      c1 = mutate(c1, rooms);
      c2 = mutate(c2, rooms);

      repairChromosome(c1, lookups, rooms);
      repairChromosome(c2, lookups, rooms);

      next.push({ chromosome: c1, fitness: calculateFitness(c1, lookups) });
      if (next.length < POPULATION_SIZE)
        next.push({ chromosome: c2, fitness: calculateFitness(c2, lookups) });
    }

    population = next;

    if (population[0].fitness > best.fitness)
      best = population[0];

    if ((gen + 1) % 100 === 0)
      console.log(`GEN ${gen + 1}, Best = ${best.fitness}`);
  }

  return best.chromosome;
}

// --------------------------------------------------
// SCHEDULE GENERATION (*** MODIFIED AS REQUESTED ***)
export async function generateFullSchedule() {

  console.log("Loading database...");
  const courses = await prisma.course.findMany({
    include: {
      batches: { include: { batch: true } },
      teachers: true,
    }
  });

  const rooms = await prisma.room.findMany();
  const teachers = await prisma.teacher.findMany();

  const assigns: AssignInput[] = [];

  for (const course of courses) {

    const hours = Math.round(course.credit);

    for (const bc of course.batches) {

      const assignedTeacher = course.teachers[0];
      if (!assignedTeacher) continue;

      const teacherInfo = teachers.find(t => t.id === assignedTeacher.teacherId);
      if (!teacherInfo) continue;

      const batchInfo = await prisma.batch.findUnique({
        where: { id: bc.batchId },
        select: { name: true, size: true }
      });

      const batchName = batchInfo?.name ?? "Batch";
      const batchSize = batchInfo?.size ?? 30;

      // -------------------------------------------------
      // THEORY  → ALWAYS WHOLE BATCH (groupId = null)
      // -------------------------------------------------
      if (course.type === CourseType.THEORY) {
        assigns.push({
          courseId: course.id,
          teacherId: teacherInfo.id,
          batchId: bc.batchId,
          groupId: null,
          hoursRequired: hours,
          courseType: course.type,
          courseTitle: course.title,
          batchSize,
          teacherName: teacherInfo.name,
          batchName,
          groupName: null
        });
        continue;
      }

      // -------------------------------------------------
      // LAB  → MUST HAVE GROUPS
      // If DB doesn't have them, auto-generate
      // -------------------------------------------------
      const labGroups = await prisma.labGroup.findMany({
        where: { batchCourseId: bc.id }
      });

      const groups = labGroups.length
        ? labGroups
        : [
            {
              id: null,
              name: `${batchName}-Group-1`,
              size: batchSize
            }
          ];

      for (const g of groups) {
        assigns.push({
          courseId: course.id,
          teacherId: teacherInfo.id,
          batchId: bc.batchId,
          groupId: g.id,
          hoursRequired: hours,
          courseType: course.type,
          courseTitle: course.title,
          batchSize: (g as any).size ?? batchSize,
          teacherName: teacherInfo.name,
          batchName,
          groupName: g.name ?? "Group"
        });
      }
    }
  }

  console.log(`Scheduling ${assigns.length} total assignment units...`);

  const bestChrom = await runGA(assigns, rooms, teachers);

  bestChrom.sort((a, b) => {
    const d1 = DAYS.indexOf(a.day);
    const d2 = DAYS.indexOf(b.day);
    if (d1 !== d2) return d1 - d2;
    return TIME_SLOTS.indexOf(a.startTime) - TIME_SLOTS.indexOf(b.startTime);
  });

  /** Return end time string for a lesson that starts at `start` and lasts `hours` slots.
 *  Uses TIME_SLOTS so it respects lunch/irregular slots.
 */
function getEndTime(start: string, hours: number): string {
  const startIndex = TIME_SLOTS.indexOf(start);
  if (startIndex === -1) {
    // fallback to simple +hours numeric (rare)
    const [h, m] = start.split(":").map(Number);
    return `${String(h + hours).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const endIndex = startIndex + hours;
  // If endIndex points exactly to a slot (next slot after the last hour) use it; otherwise fallback.
  if (endIndex <= TIME_SLOTS.length - 1) {
    return TIME_SLOTS[endIndex];
  }
  // If out of bounds (rare), fall back to repeatedly calling nextHour
  let t = start;
  for (let i = 0; i < hours; i++) t = nextHour(t);
  return t;
}


  const output = bestChrom.map(a => ({
    Day: a.day,
    Start: a.startTime,
    // End: nextHour(a.startTime),
      End: getEndTime(a.startTime, a.hours),
    Course: a.courseTitle,
    Teacher: a.teacherName,
    Batch: a.batchName,
    Group: a.groupName ?? "ALL",
    Room: a.roomNumber,
    Hours: a.hours,
    Invalid: !!a.invalid,
    Repaired: !!a.repaired,
  }));

  console.log("\nFINAL ROUTINE:");
  console.table(output);
}

generateFullSchedule()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
