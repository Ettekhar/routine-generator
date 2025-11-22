import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Day = "SUN" | "MON" | "TUE" | "WED" | "THU";

const DAYS: Day[] = ["SUN", "MON", "TUE", "WED", "THU"];
const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "02:00", "03:00", "04:00"];

// Convert "09:00" → "10:00"
function nextHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1).toString().padStart(2, "0");
  return `${next}:${m.toString().padStart(2, "0")}`;
}

interface AssignInput {
  courseId: number;
  teacherId: number;
  batchId: number;
  groupId?: number | null;
  hours: number;
}

export async function generateFullSchedule() {
  console.log("⏳ Fetching database data...");

  const courses = await prisma.course.findMany({
    include: {
      batches: { include: { batch: true } },
      teachers: true,
    },
  });

  const rooms = await prisma.room.findMany();
  const teachers = await prisma.teacher.findMany();

  // Clear old schedule
  await prisma.schedule.deleteMany();

  console.log("🚀 Starting schedule generation...");

  const assignments: AssignInput[] = [];

  // -------- 1) Prepare assignment list -------
  for (const course of courses) {
    const hours = Math.round(course.credit);

    for (const bc of course.batches) {
      const teacher = course.teachers[0];
      if (!teacher) continue;

      // LAB course: create multiple groups
      if (course.type === "LAB") {
        const labGroups = await prisma.labGroup.findMany({
          where: { batchCourseId: bc.id },
        });

        for (const g of labGroups) {
          assignments.push({
            courseId: course.id,
            teacherId: teacher.teacherId,
            batchId: bc.batchId,
            groupId: g.id,
            hours,
          });
        }
      } else {
        // THEORY class → Assign entire batch
        assignments.push({
          courseId: course.id,
          teacherId: teacher.teacherId,
          batchId: bc.batchId,
          groupId: null,
          hours,
        });
      }
    }
  }

  // -------- 2) Generate schedule -------
  for (const assign of assignments) {
    for (let h = 0; h < assign.hours; h++) {
      const placed = await placeOneClass(assign);
      if (!placed) {
        console.error("❌ Unable to place class:", assign);
      }
    }
  }

  console.log("✅ Schedule generation completed!");
  return { message: "Schedule generated successfully!" };
}

async function placeOneClass(assign: AssignInput) {
  for (const day of DAYS) {
    for (const startTime of TIME_SLOTS) {
      const endTime = nextHour(startTime);

      // ---- TEACHER CONFLICT ----
      const teacherBusy = await prisma.schedule.findFirst({
        where: { teacherId: assign.teacherId, day, startTime },
      });
      if (teacherBusy) continue;

      // ---- BATCH CONFLICT ----
      const batchBusy = await prisma.schedule.findFirst({
        where: {
          batchId: assign.batchId,
          day,
          startTime,
        },
      });
      if (batchBusy) continue;

      // ---- GROUP CONFLICT (LAB only) ----
      if (assign.groupId) {
        const groupBusy = await prisma.schedule.findFirst({
          where: { groupId: assign.groupId, day, startTime },
        });
        if (groupBusy) continue;
      }

      // ---- FIND AVAILABLE ROOM ----
      const rooms = await prisma.room.findMany({
        where: {
          schedules: {
            none: { day, startTime },
          },
        },
      });

      if (rooms.length === 0) continue;

      const room = rooms[0];

      // ---- INSERT NEW SCHEDULE ENTRY ----
      await prisma.schedule.create({
        data: {
          teacherId: assign.teacherId,
          batchId: assign.batchId,
          courseId: assign.courseId,
          groupId: assign.groupId,
          roomId: room.id,
          day,
          startTime,
          endTime,
        },
      });

      return true;
    }
  }

  return false;
}
import { PrismaClient, RoomType, CourseType } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Configuration for standalone script execution using PostgreSQL adapter
// Ensure your DATABASE_URL is set in your .env file
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });


import { PrismaClient, RoomType, CourseType } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Configuration for standalone script execution using PostgreSQL adapter
// Ensure your DATABASE_URL is set in your .env file
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

// --- GENETIC ALGORITHM PARAMETERS ---
const POPULATION_SIZE = 100;
const MAX_GENERATIONS = 1000;
const MUTATION_RATE = 0.05; // 5% chance per gene to randomly change placement
const TOURNAMENT_SIZE = 5; // Size of the pool for selecting parents
const ELITE_COUNT = 5; // Number of best schedules carried over to the next generation

// --- CORE DATA & TYPES ---
type Day = "SUN" | "MON" | "TUE" | "WED" | "THU";
const DAYS: Day[] = ["SUN", "MON", "TUE", "WED", "THU"];

const TIME_SLOTS = [
    "09:00", "10:00", "11:00", "12:00", 
    "02:00", // Lunch Break Skip
    "03:00", "04:00",
];

// Gene/Assignment in the Schedule (Chromosome)
interface PlacedAssignment {
    // Required Lesson Metadata
    courseId: number;
    teacherId: number;
    batchId: number;
    groupId: number | null; 
    courseType: CourseType;
    hours: number; // Duration of this specific gene (usually 1 or 2)

    // Placement Data (the gene's value)
    day: Day;
    startTime: string;
    roomId: number;

    // Metadata for output and fitness calculation
    courseTitle: string;
    teacherName: string;
    batchName: string;
    groupName: string | null;
    roomNumber: string;
}

// Assignment structure from the DB (The list of requirements)
interface AssignInput {
    courseId: number;
    teacherId: number;
    batchId: number;
    groupId: number | null;
    hoursRequired: number; // Total hours required for this specific group/course assignment
    courseType: CourseType;
    courseTitle: string;
    batchSize: number;
    teacherName: string;
    batchName: string;
    groupName: string | null;
}

// Chromosome is an array of placed assignments
type Chromosome = PlacedAssignment[];

// Population is an array of chromosomes with their fitness score
type Population = { chromosome: Chromosome; fitness: number }[];

// Composite key for looking up assignments in a Map
function getAssignmentKey(courseId: number, teacherId: number, batchId: number, groupId: number | null): string {
    return `${courseId}-${teacherId}-${batchId}-${groupId || 'null'}`;
}

// Optimized lookup data structure for GA performance
interface GALookupData {
    teacherMap: Map<number, any>; // key: teacherId
    roomMap: Map<number, any>;     // key: roomId
    assignmentMap: Map<string, AssignInput>; // key: compositeKey
}


// ----------------------------------------------------------------------------
// UTILITY FUNCTIONS (Time and Gap Calculation)
// ----------------------------------------------------------------------------

/**
 * Calculates the next valid time slot, handling the lunch break skip (12:00 -> 02:00).
 */
function nextHour(time: string): string {
    const [h, m] = time.split(":").map(Number);
    const next = (h + 1).toString().padStart(2, "0");
    if (next === "13") return "14:00"; // 1pm is 2pm after lunch
    return `${next}:${m.toString().padStart(2, "0")}`;
}

/**
 * Calculates gaps in a batch's schedule for a given day (Soft Constraint SC2).
 */
function getBatchGaps(chromosome: Chromosome, batchId: number, day: Day): number {
    // Get all start times for this batch/day and map them to their index in TIME_SLOTS
    const entries = chromosome
        .filter(s => s.batchId === batchId && s.day === day)
        // Map to the first slot index
        .map(s => TIME_SLOTS.indexOf(s.startTime))
        .sort((a, b) => a - b);

    if (entries.length <= 1) return 0;
    let gaps = 0;
    
    for (let i = 1; i < entries.length; i++) {
        const prevEntry = entries[i - 1];
        const currentEntry = entries[i];
        
        // Gap calculation: difference in slot indices minus 1 (for the hour itself)
        const diff = currentEntry - prevEntry;
        if (diff > 1) {
            // Check for lunch break skip (12:00 -> 02:00 is a 2-slot gap, but should count as 0 gap)
            // The time slot array accounts for the lunch break, so a diff of 1 is contiguous.
            // If there's a 2-hour assignment, it occupies slots X and X+1.
            // If the next assignment starts at X+2, the diff is 2, meaning 1 gap (diff - 1).
            gaps += (diff - 1); 
        }
    }
    return gaps;
}


// ----------------------------------------------------------------------------
// 1. GENETIC ALGORITHM CORE FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Calculates the fitness score of a single schedule (Chromosome).
 * Uses pre-computed maps for O(1) lookups.
 */
function calculateFitness(chromosome: Chromosome, lookups: GALookupData): number {
    let fitness = 0;
    const { teacherMap, roomMap, assignmentMap } = lookups;

    // Track daily/weekly load and conflicts using Sets/Maps
    const teacherDailyLoad = new Map<number, Map<Day, number>>();
    const teacherWeeklyLoad = new Map<number, number>();
    const timeSlotKeys = new Set<string>(); // Used for collision detection (Teacher, Batch/Group, Room)

    // --- A. ITERATE AND APPLY CONSTRAINTS ---
    for (const assignment of chromosome) {
        const { teacherId, batchId, groupId, day, startTime, roomId, courseType, hours, courseId } = assignment;
        
        const room = roomMap.get(roomId);
        const teacher = teacherMap.get(teacherId);
        const assignmentKey = getAssignmentKey(courseId, teacherId, batchId, groupId);
        const requiredAssignment = assignmentMap.get(assignmentKey);
        
        // Fail fast if required metadata is missing
        if (!room || !teacher || !requiredAssignment) { 
            fitness -= 5000; 
            continue; 
        }

        // --- A1. HARD CONSTRAINTS (PENALTIES) ---
        let hardConflict = false;

        // Check Time Conflicts (Teacher, Batch/Group, Room) for the duration
        for (let h = 0; h < hours; h++) {
            const timeIndex = TIME_SLOTS.indexOf(startTime) + h;
            
            // Time index check (out of bounds or invalid time slot)
            if (timeIndex >= TIME_SLOTS.length) { 
                hardConflict = true; 
                break; 
            }

            const currentTime = TIME_SLOTS[timeIndex];
            // Check for invalid time slot that might result from a 2-hour block crossing the end (e.g., 4:00 to 5:00)
            if (!currentTime) {
                hardConflict = true;
                break;
            }
            
            const teacherKey = `T-${teacherId}-${day}-${currentTime}`;
            const batchKey = `B-${batchId}-${day}-${currentTime}`;
            const roomKey = `R-${roomId}-${day}-${currentTime}`;
            const groupKey = groupId ? `G-${groupId}-${day}-${currentTime}` : null;

            // Check for existing collision
            if (timeSlotKeys.has(teacherKey) || timeSlotKeys.has(batchKey) || timeSlotKeys.has(roomKey) || (groupKey && timeSlotKeys.has(groupKey))) {
                hardConflict = true;
                break;
            }
            
            // Add keys for future checks
            timeSlotKeys.add(teacherKey);
            timeSlotKeys.add(batchKey);
            timeSlotKeys.add(roomKey);
            if (groupKey) timeSlotKeys.add(groupKey);
        }

        // A2. Resource Matching (Room Type)
        const requiredType = courseType === CourseType.LAB ? RoomType.LAB : RoomType.CLASSROOM;
        if (room.type !== requiredType) hardConflict = true;
        
        // A3. Room Capacity Check (using requiredAssignment looked up above)
        if (room.capacity < requiredAssignment.batchSize) hardConflict = true;

        // A4. Load Limits
        const currentDailyLoad = (teacherDailyLoad.get(teacherId)?.get(day) || 0) + hours;
        const currentWeeklyLoad = (teacherWeeklyLoad.get(teacherId) || 0) + hours;

        // Check against the teacher's load limits (if defined)
        if (teacher.dailyLoad !== null && currentDailyLoad > teacher.dailyLoad) hardConflict = true;
        if (teacher.weeklyLoad !== null && currentWeeklyLoad > teacher.weeklyLoad) hardConflict = true;
        
        // APPLY HARD PENALTY
        if (hardConflict) {
            fitness -= 1000; 
            continue; 
        }
        
        // Update daily/weekly load trackers (only if no hard conflict)
        const dailyMap = teacherDailyLoad.get(teacherId) || new Map<Day, number>();
        dailyMap.set(day, currentDailyLoad);
        teacherDailyLoad.set(teacherId, dailyMap);
        teacherWeeklyLoad.set(teacherId, currentWeeklyLoad);


        // --- B. SOFT CONSTRAINTS (BONUSES) ---
        
        // SC1: Contiguous Hour Bonus (Highest Bonus)
        if (hours === 2) {
            // Note: The hard conflict check already ensures this 2-hour block is collision-free.
            fitness += 100;
        }

        // SC3: Avoid 09:00 Start (for batches)
        if (startTime === '09:00') {
            fitness -= 5;
        }
        
        // SC4: Prefer Morning Slots (Before lunch break '02:00')
        if (TIME_SLOTS.indexOf(startTime) < TIME_SLOTS.indexOf('02:00')) {
            fitness += 2 * hours;
        }
    }

    // --- B2. WHOLE-SCHEDULE CONSTRAINTS (Gaps) ---
    const uniqueBatches = Array.from(new Set(chromosome.map(c => c.batchId)));

    for (const batchId of uniqueBatches) {
        for (const day of DAYS) {
            // SC2: Minimize Gaps (High Penalty)
            const gaps = getBatchGaps(chromosome, batchId, day);
            fitness -= gaps * 10;
        }
    }

    return fitness;
}


/**
 * Generates a single, randomized schedule (Chromosome) by assigning all required hours.
 */
function generateRandomChromosome(allAssignments: AssignInput[], allRooms: any[]): Chromosome {
    const chromosome: Chromosome = [];
    
    // Combine all assignments, replicating them by the number of hours required
    const lessonHours: (AssignInput & { assignedHours: number })[] = [];
    for (const assign of allAssignments) {
        let remainingHours = assign.hoursRequired;
        while (remainingHours > 0) {
            // Labs try to place 2 hours, theory 1 hour
            // Ensure the duration doesn't exceed remaining hours
            const duration = (remainingHours >= 2 && assign.courseType === CourseType.LAB) ? 2 : 1;
            lessonHours.push({ ...assign, assignedHours: duration }); // Store duration
            remainingHours -= duration;
        }
    }
    
    // Shuffle the lessons to randomize placement order (better starting chromosomes)
    const shuffledLessonHours = lessonHours.sort(() => Math.random() - 0.5);

    const availableSlots = DAYS.flatMap(day => TIME_SLOTS.map(time => ({ day, startTime: time })));

    for (const assign of shuffledLessonHours) {
        // Randomly select a slot and room
        const randomSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
        const randomRoom = allRooms[Math.floor(Math.random() * allRooms.length)];
        
        if (!randomSlot || !randomRoom) continue;

        // Create the gene (placed assignment)
        const gene: PlacedAssignment = {
            courseId: assign.courseId,
            teacherId: assign.teacherId,
            batchId: assign.batchId,
            groupId: assign.groupId,
            courseType: assign.courseType,
            hours: assign.assignedHours, // Use the determined duration (1 or 2)
            day: randomSlot.day as Day,
            startTime: randomSlot.startTime,
            roomId: randomRoom.id,
            
            courseTitle: assign.courseTitle,
            teacherName: assign.teacherName,
            batchName: assign.batchName,
            groupName: assign.groupName,
            roomNumber: randomRoom.roomNumber,
        };
        
        chromosome.push(gene);
    }
    return chromosome;
}

/**
 * Creates the initial population of random schedules.
 */
function initializePopulation(allAssignments: AssignInput[], allRooms: any[], lookups: GALookupData): Population {
    const population: Population = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
        const chromosome = generateRandomChromosome(allAssignments, allRooms);
        const fitness = calculateFitness(chromosome, lookups);
        population.push({ chromosome, fitness });
    }
    return population;
}

/**
 * Selects parents using Tournament Selection.
 */
function tournamentSelection(population: Population): Chromosome {
    let best = population[Math.floor(Math.random() * population.length)];
    for (let i = 1; i < TOURNAMENT_SIZE; i++) {
        const contestant = population[Math.floor(Math.random() * population.length)];
        if (contestant.fitness > best.fitness) {
            best = contestant;
        }
    }
    return best.chromosome;
}

/**
 * Creates two offspring from two parent chromosomes using Single-Point Crossover.
 */
function crossover(parent1: Chromosome, parent2: Chromosome): [Chromosome, Chromosome] {
    const minLength = Math.min(parent1.length, parent2.length);
    if (minLength < 2) return [parent1, parent2]; 
    
    // Select crossover point (1 to length - 1)
    const crossoverPoint = Math.floor(Math.random() * (minLength - 1)) + 1;
    
    // Offspring 1: P1[0:point] + P2[point:end]
    const offspring1 = [
        ...parent1.slice(0, crossoverPoint),
        ...parent2.slice(crossoverPoint, parent2.length)
    ];

    // Offspring 2: P2[0:point] + P1[point:end]
    const offspring2 = [
        ...parent2.slice(0, crossoverPoint),
        ...parent1.slice(crossoverPoint, parent1.length)
    ];

    return [offspring1, offspring2] as [Chromosome, Chromosome];
}


/**
 * Randomly changes the time/day/room of a gene based on the mutation rate.
 */
function mutate(chromosome: Chromosome, allRooms: any[]): Chromosome {
    const newChromosome = [...chromosome];
    const availableSlots = DAYS.flatMap(day => TIME_SLOTS.map(time => ({ day, startTime: time })));

    for (let i = 0; i < newChromosome.length; i++) {
        if (Math.random() < MUTATION_RATE) {
            const gene = newChromosome[i];
            
            // 1. Change Slot (Day and Time)
            const newSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
            gene.day = newSlot.day as Day;
            gene.startTime = newSlot.startTime;
            
            // 2. Change Room
            const newRoom = allRooms[Math.floor(Math.random() * allRooms.length)];
            gene.roomId = newRoom.id;
            // IMPORTANT: Update roomNumber metadata for display/lookup consistency
            gene.roomNumber = newRoom.roomNumber; 
        }
    }
    return newChromosome;
}

/**
 * The main GA execution loop.
 */
async function runGeneticAlgorithm(allAssignments: AssignInput[], allRooms: any[], allTeachers: any[]): Promise<Chromosome> {
    
    // --- PRE-PROCESSING STEP (CRITICAL FOR PERFORMANCE) ---
    const teacherMap = new Map(allTeachers.map(t => [t.id, t]));
    const roomMap = new Map(allRooms.map(r => [r.id, r]));
    const assignmentMap = new Map(allAssignments.map(a => [
        getAssignmentKey(a.courseId, a.teacherId, a.batchId, a.groupId), 
        a
    ]));
    
    const lookups: GALookupData = { teacherMap, roomMap, assignmentMap };
    
    // 1. Initialize Population
    let population = initializePopulation(allAssignments, allRooms, lookups);
    
    let bestChromosome = population.reduce((prev, current) => (prev.fitness > current.fitness) ? prev : current);
    console.log(`\nInitial Population created. Best starting Fitness: ${bestChromosome.fitness.toFixed(2)}`);

    for (let generation = 0; generation < MAX_GENERATIONS; generation++) {
        const nextGeneration: Population = [];

        // Sort population by fitness (descending)
        population.sort((a, b) => b.fitness - a.fitness);

        // 2. Elitism: Carry over the best schedules
        for (let i = 0; i < ELITE_COUNT; i++) {
            nextGeneration.push(population[i]);
        }
        
        // Update the globally best chromosome
        if (population[0].fitness > bestChromosome.fitness) {
            bestChromosome = population[0];
        }


        // 3. Reproduction (Crossover and Mutation)
        while (nextGeneration.length < POPULATION_SIZE) {
            // Selection
            const parent1 = tournamentSelection(population);
            const parent2 = tournamentSelection(population);

            // Crossover
            let [offspring1, offspring2] = crossover(parent1, parent2);

            // Mutation
            offspring1 = mutate(offspring1, allRooms);
            offspring2 = mutate(offspring2, allRooms);

            // Evaluation and Addition to next generation
            nextGeneration.push({ 
                chromosome: offspring1, 
                fitness: calculateFitness(offspring1, lookups) // Use the lookups map
            });

            if (nextGeneration.length < POPULATION_SIZE) {
                nextGeneration.push({ 
                    chromosome: offspring2, 
                    fitness: calculateFitness(offspring2, lookups) // Use the lookups map
                });
            }
        }
        
        // Update population 
        population = nextGeneration;
        
        if (generation % 100 === 0 || generation === MAX_GENERATIONS - 1) {
            console.log(`Generation ${generation + 1}: Current Best Fitness = ${bestChromosome.fitness.toFixed(2)}`);
        }
    }

    console.log(`\n🎉 GA Complete. Final Best Fitness: ${bestChromosome.fitness.toFixed(2)}`);
    return bestChromosome.chromosome;
}


// ----------------------------------------------------------------------------
// MAIN EXECUTION
// ----------------------------------------------------------------------------

export async function generateFullSchedule() {
    console.log("⏳ Fetching database data...");

    const courses = await prisma.course.findMany({
        include: {
            batches: { include: { batch: true } },
            teachers: true,
        },
    });

    const allRooms = await prisma.room.findMany();
    const allTeachers = await prisma.teacher.findMany(); 

    const assignments: AssignInput[] = [];

    // --- 1) Build Assignment List (Requirements) ---
    for (const course of courses) {
        const hours = Math.round(course.credit);

        for (const bc of course.batches) {
            // Use the first teacher associated with the course (assuming one teacher per course/batch for simplicity)
            const bct = course.teachers[0]; 
            if (!bct) continue;

            const teacherData = allTeachers.find(t => t.id === bct.teacherId);
            if (!teacherData) continue;

            const batchData = await prisma.batch.findUnique({ 
                where: { id: bc.batchId }, 
                select: { name: true, size: true } 
            });
            
            const batchSize = batchData?.size ?? 30;
            const batchName = batchData?.name ?? 'Unknown Batch';

            if (course.type === CourseType.LAB) {
                // Check for explicit Lab Groups
                const labGroups = await prisma.labGroup.findMany({ where: { batchCourseId: bc.id } });
                
                // If no lab groups are defined, treat the whole batch as one group
                const groupsToSchedule = labGroups.length > 0 
                    ? labGroups.map(g => ({ id: g.id, name: g.name, size: g.size }))
                    : [{ id: null, name: `${batchName}-LAB`, size: batchSize }];
                
                const estimatedGroupSize = groupsToSchedule[0].size; 

                for (const g of groupsToSchedule) {
                    assignments.push({
                        courseId: course.id,
                        teacherId: teacherData.id, 
                        batchId: bc.batchId,
                        groupId: g.id, 
                        hoursRequired: hours,
                        courseType: course.type,
                        courseTitle: course.title,
                        batchSize: estimatedGroupSize,
                        teacherName: teacherData.name, 
                        batchName: batchName,
                        groupName: g.name,
                    });
                }
            } else {
                // THEORY courses (Using BatchGroup as the general grouping mechanism if defined)
                const batchGroups = await prisma.batchGroup.findMany({ where: { batchId: bc.batchId } });
                
                // If no batch groups are defined, treat the whole batch as one group
                const groupsToSchedule = batchGroups.length > 0 
                    ? batchGroups.map(g => ({ id: g.id, name: g.name, size: g.size }))
                    : [{ id: null, name: batchName, size: batchSize }];

                const estimatedGroupSize = groupsToSchedule[0].size;
                
                for (const g of groupsToSchedule) {
                    assignments.push({
                        courseId: course.id,
                        teacherId: teacherData.id, 
                        batchId: bc.batchId,
                        groupId: g.id,
                        hoursRequired: hours,
                        courseType: course.type,
                        courseTitle: course.title,
                        batchSize: estimatedGroupSize,
                        teacherName: teacherData.name, 
                        batchName: batchName,
                        groupName: g.name,
                    });
                }
            }
        }
    }

    // --- 2) Generate schedule using Genetic Algorithm ---
    console.log(`Total assignments to schedule (in hours): ${assignments.length}`);
    console.log("🧬 Starting Genetic Algorithm (GA) generation...");
    
    // Pass the full data objects to the GA runner
    const bestChromosome = await runGeneticAlgorithm(assignments, allRooms, allTeachers);
    
    // --- 3) Format and Display Results ---
    const finalSchedule: PlacedAssignment[] = bestChromosome;

    // Sorting the final schedule for readability: Day -> Start Time -> Batch
    finalSchedule.sort((a, b) => {
        const dayA = DAYS.indexOf(a.day);
        const dayB = DAYS.indexOf(b.day);
        if (dayA !== dayB) return dayA - dayB;

        const timeA = TIME_SLOTS.indexOf(a.startTime);
        const timeB = TIME_SLOTS.indexOf(b.startTime);
        if (timeA !== timeB) return timeA - timeB;

        return a.batchName.localeCompare(b.batchName);
    });
    
    // Helper to structure for table output
    const scheduleRows = finalSchedule.map(a => ({
        Day: a.day,
        StartTime: a.startTime,
        EndTime: nextHour(a.startTime),
        Course: a.courseTitle,
        Teacher: a.teacherName,
        Batch: a.batchName,
        Group: a.groupName || a.batchName,
        Room: a.roomNumber,
        Hours: a.hours,
    }));


    console.log("\n✅ Schedule generation complete via Genetic Algorithm.");
    
    console.log("\n📌 Generated Routine (Sorted by Day and Time)\n");
    console.table(scheduleRows);


    console.log("\n🎓 FINAL SCHEDULE (Truncated for console)\n");
    console.table(scheduleRows.slice(0, 10)); // Show top 10 rows
}


generateFullSchedule()
    .then(() => {
        console.log("Done!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Global Error during scheduling:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });