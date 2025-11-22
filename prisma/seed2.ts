import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {

  // ============= TEACHERS =============
  await prisma.teacher.createMany({
    data: [
      {
        name: "Dr. Nazmul Huda",
        shortName: "NH",
        designation: "Associate Professor",
        department: "CSE",
        contact: "01711100022",
        weeklyLoad: 12,
        dailyLoad: 3
      },
      {
        name: "Ms. Farhana Iqbal",
        shortName: "FI",
        designation: "Assistant Professor",
        department: "CSE",
        contact: "01711555555",
        weeklyLoad: 10,
        dailyLoad: 3
      },
      {
        name: "Engr. Tahmid Rahman",
        shortName: "TR",
        designation: "Lecturer",
        department: "CSE",
        contact: "01900022233",
        weeklyLoad: 8,
        dailyLoad: 3
      }
    ]
  });

  // ============= ROOMS =============
  await prisma.room.createMany({
    data: [
      { roomNumber: "CSE-302", capacity: 60, type: "CLASSROOM" },
      { roomNumber: "CSE-303", capacity: 50, type: "CLASSROOM" },
      { roomNumber: "CSE-LAB-02", capacity: 30, type: "LAB" },
      { roomNumber: "CSE-LAB-03", capacity: 25, type: "LAB" }
    ]
  });

  // ============= NEW COURSES =============
  const courses = await prisma.course.createMany({
    data: [
      {
        code: "CSE210",
        title: "Discrete Mathematics",
        credit: 3,
        semester: 2,
        type: "THEORY"
      },
      {
        code: "CSE211",
        title: "Database Systems",
        credit: 3,
        semester: 2,
        type: "THEORY"
      },
      {
        code: "CSE212",
        title: "Database Lab",
        credit: 1,
        semester: 2,
        type: "LAB"
      },
      {
        code: "CSE213",
        title: "OOP in Java",
        credit: 3,
        semester: 2,
        type: "THEORY"
      }
    ]
  });

  // Fetch created courses IDs
  const allCourses = await prisma.course.findMany();
  const map = Object.fromEntries(allCourses.map((c) => [c.code, c.id]));

  // ============= NEW BATCH =============
  const batch = await prisma.batch.create({
    data: {
      name: "CSE-60",
      size: 65,
    }
  });

  // ============= SPLIT BATCH INTO GROUPS =============
  const batchGroups = await prisma.batchGroup.createMany({
    data: [
      { batchId: batch.id, name: "Group A", size: 32 },
      { batchId: batch.id, name: "Group B", size: 33 }
    ]
  });

  // ============= ASSIGN COURSES TO BATCH =============
  const assignments = await prisma.batchCourse.createMany({
    data: [
      { batchId: batch.id, courseId: map["CSE210"], requiresLab: false },
      { batchId: batch.id, courseId: map["CSE211"], requiresLab: false },
      { batchId: batch.id, courseId: map["CSE212"], requiresLab: true, groupCount: 2 },
      { batchId: batch.id, courseId: map["CSE213"], requiresLab: false }
    ]
  });

  const batchCourses = await prisma.batchCourse.findMany();

  // ============= CREATE LAB SUBGROUPS (Group A/B) =============
  for (const bc of batchCourses) {
    if (bc.requiresLab) {
      await prisma.labGroup.createMany({
        data: [
          { batchCourseId: bc.id, name: "Group A", size: 32 },
          { batchCourseId: bc.id, name: "Group B", size: 33 }
        ]
      });
    }
  }

  console.log("New data inserted successfully!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
