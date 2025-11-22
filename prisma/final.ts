import { PrismaClient, RoomType, CourseType } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// --- GA parameters (tweakable) ---
const POPULATION_SIZE = 150; // Increased for diversity
const MAX_GENERATIONS = 1000;
const MUTATION_RATE = 0.06;
const TOURNAMENT_SIZE = 5;
const ELITE_COUNT = 5;
const REPAIR_ATTEMPTS = 30;

// --- PENALTY WEIGHTS ---
// HARD Constraints (Must be resolved)
const HARD_PENALTY = -100000;
const TEACHER_CONFLICT_PENALTY = -50000;
const ROOM_CONFLICT_PENALTY = -50000;
const WRONG_ROOMTYPE_PENALTY = -20000;
const CAPACITY_PENALTY = -20000;
const LUNCH_VIOLATION_PENALTY = -20000; // New specific penalty for lunch overlap
const MISSING_HOURS_PENALTY = -100000;

// SOFT Constraints (Optimization Goals - "The AI Brain")
const LOAD_PENALTY = -10000;            // Teacher daily load exceeded
const SOFT_GAP_PENALTY = -500;          // Penalty per 1-hour gap in a student's day
const PENALTY_ISOLATED_CLASS = -2000;   // Penalty for coming to uni for just 1 hour
const PENALTY_ACTIVE_DAY = -100;        // Small penalty for every day attended (encourages days off)
const PENALTY_LATE_CLASS = -10;         // Slight penalty for late classes (after 3pm)

// NEW SOFT PENALTIES
const PENALTY_CONSECUTIVE_SAME_COURSE = -200;   // Same subject back-to-back
const PENALTY_EMPTY_DAY = -300;                 // No class on a weekday
const PENALTY_LAB_MISALIGN = -300;              // Group A/B labs not same day
const PENALTY_OVERLOADED_DAY = -200;            // More than 2 classes in one day
const PENALTY_TEACHER_NO_BREAK = -150;          // Teacher teaches 2+ hrs without break


// BONUSES (Rewards)
const BONUS_CONTIGUOUS = 200;           // Reward for 2-hour block (Labs)
const BONUS_MORNING = 30;               // Reward for morning slots
const BONUS_COMPACT_DAY = 100;          // Reward for a day with multiple classes and 0 gaps

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
  "04:00"
];

// Lunch window
const LUNCH_START = "01:00";
const LUNCH_END   = "02:00";

function overlapsLunch(start: string, hours: number): boolean {
  const startIndex = TIME_SLOTS.indexOf(start);
  if (startIndex < 0) return false;

  const endIndex = startIndex + hours;

  const lunchStart = TIME_SLOTS.indexOf(LUNCH_START);
  const lunchEnd = TIME_SLOTS.indexOf(LUNCH_END);

  if (lunchStart === -1 || lunchEnd === -1) return false;

  // Returns true if the class duration crosses the lunch boundary
  return startIndex < lunchEnd && endIndex > lunchStart;
}

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

function getAssignmentKey(c: number, t: number, b: number, g: number | null) {
  return `${c}-${t}-${b}-${g ?? 'null'}`;
}

function nextHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1).toString().padStart(2, "0");
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

// ----------------- Repair Logic -----------------

function geneHasConflict(
  gene: PlacedAssignment,
  chromosome: Chromosome,
  lookups: GALookupData
): { conflict: boolean; reason?: string } {
  const room = lookups.roomMap.get(gene.roomId);
  if (!room) return { conflict: true, reason: "missing_room" };

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

function repairChromosome(
  chrom: Chromosome,
  lookups: GALookupData,
  allRooms: any[]
) {
  const slots = getAvailableSlots();
  // Use a shuffled copy of rooms for randomness in repair
  const roomCandidates = allRooms.slice();

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
    // Check Type and Capacity
    const badRoom = room.type !== neededRoomType || room.capacity < gene.batchSize;

    const conflict = geneHasConflict(gene, chrom, lookups);
    const lunchIssue = overlapsLunch(gene.startTime, gene.hours);

    if (!conflict.conflict && !badRoom && !lunchIssue) continue;

    let fixed = false;

    for (let i = 0; i < REPAIR_ATTEMPTS && !fixed; i++) {
      // Bias towards morning slots for first few attempts to satisfy "Morning Bonus"
      const slot = (i < 8)
        ? slots[Math.floor(Math.random() * Math.min(15, slots.length))]
        : slots[Math.floor(Math.random() * slots.length)];

      if (overlapsLunch(slot.startTime, gene.hours)) continue;

      // Filter rooms that fit constraints
      const validRooms = roomCandidates.filter(r =>
        ((neededRoomType === RoomType.LAB) ? r.type === "LAB" : r.type === "CLASSROOM")
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

      if (!after.conflict && !overlapsLunch(gene.startTime, gene.hours)) {
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

// ----------------- Advanced Fitness Function -----------------

function calculateFitness(chrom: Chromosome, lookups: GALookupData): number {
  let fitness = 0;

  // Tracking structures
  const teacherDailyLoad = new Map<number, Map<Day, number>>();
  const used = new Set<string>();
  const assigned = new Map<string, number>();

  const batchSchedules = new Map<number, Map<Day, { start: number, end: number }[]>>();
  const teacherSchedules = new Map<number, Map<Day, { start: number, end: number }[]>>();

  // ============================
  // PASS 1: Scoring Each Gene
  // ============================
  for (const gene of chrom) {

    // Invalid gene = automatic hard failure
    if (gene.invalid) {
      fitness += HARD_PENALTY;
      continue;
    }

    const key = getAssignmentKey(gene.courseId, gene.teacherId, gene.batchId, gene.groupId);
    const room = lookups.roomMap.get(gene.roomId);
    const neededType = gene.courseType === CourseType.LAB ? "LAB" : "CLASSROOM";

    // Wrong room type
    if (room.type !== neededType) {
      fitness += WRONG_ROOMTYPE_PENALTY;
    }

    // Capacity violation
    if (room.capacity < gene.batchSize) {
      fitness += CAPACITY_PENALTY;
    }

    // Lunch violation (strict)
    if (overlapsLunch(gene.startTime, gene.hours)) {
        fitness += LUNCH_VIOLATION_PENALTY;
    }

    // Validate slot
    const start = TIME_SLOTS.indexOf(gene.startTime);
    if (start < 0 || start + gene.hours > TIME_SLOTS.length) {
      fitness += HARD_PENALTY;
      continue;
    }

    // Conflict checks
    let conflict = false;
    for (let h = 0; h < gene.hours; h++) {
      const t = TIME_SLOTS[start + h];

      const teacherKey = `T-${gene.teacherId}-${gene.day}-${t}`;
      const roomKey = `R-${gene.roomId}-${gene.day}-${t}`;
      const groupKey = gene.groupId ? `G-${gene.groupId}-${gene.day}-${t}` : null;

      if (used.has(teacherKey)) {
        fitness += TEACHER_CONFLICT_PENALTY;
        conflict = true;
      }
      if (used.has(roomKey)) {
        fitness += ROOM_CONFLICT_PENALTY;
        conflict = true;
      }

      used.add(teacherKey);
      used.add(roomKey);
      if (groupKey) used.add(groupKey);
    }

    if (conflict) continue;

    // Track teacher's daily hours
    const map = teacherDailyLoad.get(gene.teacherId) || new Map();
    map.set(gene.day, (map.get(gene.day) ?? 0) + gene.hours);
    teacherDailyLoad.set(gene.teacherId, map);

    // Bonuses / Soft penalties
    if (gene.hours === 2) fitness += BONUS_CONTIGUOUS;
    if (start < 4) fitness += BONUS_MORNING;
    if (start > 6) fitness += PENALTY_LATE_CLASS;

    assigned.set(key, (assigned.get(key) ?? 0) + gene.hours);

    // Build batch schedule
    if (!batchSchedules.has(gene.batchId)) batchSchedules.set(gene.batchId, new Map());
    const batchDay = batchSchedules.get(gene.batchId)!;
    if (!batchDay.has(gene.day)) batchDay.set(gene.day, []);
    batchDay.get(gene.day)!.push({ start: start, end: start + gene.hours });

    // Build teacher schedule
    if (!teacherSchedules.has(gene.teacherId)) teacherSchedules.set(gene.teacherId, new Map());
    const tDay = teacherSchedules.get(gene.teacherId)!;
    if (!tDay.has(gene.day)) tDay.set(gene.day, []);
    tDay.get(gene.day)!.push({ start: start, end: start + gene.hours });
  }

  // ============================
  // PASS 2: Batch Day Analysis
  // ============================
  for (const [batchId, dayMap] of batchSchedules) {
    
    // Less active days = better
    fitness += (dayMap.size * PENALTY_ACTIVE_DAY);

    for (const [day, slots] of dayMap) {
      slots.sort((a, b) => a.start - b.start);

      const firstStart = slots[0].start;
      const lastEnd = slots[slots.length - 1].end;
      const span = lastEnd - firstStart;

      let activeHours = 0;
      for (const s of slots) activeHours += (s.end - s.start);

      const gaps = span - activeHours;

      if (gaps > 0) {
        fitness += gaps * SOFT_GAP_PENALTY;
      }

      if (activeHours <= 1) {
        fitness += PENALTY_ISOLATED_CLASS;
      }

      if (activeHours > 1 && gaps === 0) {
        fitness += BONUS_COMPACT_DAY;
      }
    }
  }

  // ============================
  // PASS 3: Teacher Workload
  // ============================
  for (const [teacherId, dayMap] of teacherSchedules) {
    const maxLoad = lookups.teacherMap.get(teacherId)?.dailyLoad ?? 3;

    for (const [day, slots] of dayMap) {
      let daily = 0;
      for (const s of slots) daily += (s.end - s.start);

      if (daily > maxLoad) {
        fitness += LOAD_PENALTY * (daily - maxLoad);
      }

      if (daily <= 1) {
        fitness += PENALTY_ISOLATED_CLASS;
      }
    }
  }

  // ============================
  // PASS 4: Missing Hours
  // ============================
  for (const [key, required] of lookups.requiredHoursMap) {
    const got = assigned.get(key) ?? 0;
    if (got < required) {
      fitness += MISSING_HOURS_PENALTY * (required - got);
    }
  }

  return fitness;
}


// ----------------- Genetic Operators -----------------

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
      ((a.courseType === CourseType.LAB) ? r.type === "LAB" : r.type === "CLASSROOM")
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
      // Change Time
      const sl = slots[Math.floor(Math.random() * slots.length)];
      gene.day = sl.day as Day;
      gene.startTime = sl.startTime;
    } else {
      // Change Room
      const valid = rooms.filter(r =>
        ((gene.courseType === CourseType.LAB) ? r.type === "LAB" : r.type === "CLASSROOM")
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
      console.log(`Gen ${gen + 1}: Best Fitness = ${best.fitness}`);
  }

  console.log(`\nGA Complete. Final Best Fitness: ${best.fitness.toFixed(2)}`);
  return best.chromosome;
}

// --------------------------------------------------
// HELPER: Helper for Time Minutes
function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

// --------------------------------------------------
// SCHEDULE GENERATION
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

      // THEORY  → ALWAYS WHOLE BATCH (groupId = null)
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

      // LAB  → MUST HAVE GROUPS
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

  /** Return end time string for a lesson */
  function getEndTime(start: string, hours: number): string {
    const startIndex = TIME_SLOTS.indexOf(start);
    if (startIndex === -1) {
      const [h, m] = start.split(":").map(Number);
      return `${String(h + hours).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const endIndex = startIndex + hours;
    if (endIndex <= TIME_SLOTS.length - 1) {
      return TIME_SLOTS[endIndex];
    }
    let t = start;
    for (let i = 0; i < hours; i++) t = nextHour(t);
    return t;
  }

  const output = bestChrom.map(a => ({
    Day: a.day,
    Start: a.startTime,
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
