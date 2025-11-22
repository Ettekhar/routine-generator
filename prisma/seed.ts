import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });


async function main() {
  console.log("🌱 Seeding database...");

  // ----------------------------
  // 1. Create Teachers
  // ----------------------------
  const [t1, t2] = await Promise.all([
    prisma.teacher.create({
      data: {
        name: "Dr. Alice Khan",
        shortName: "AK",
        designation: "Professor",
        department: "CSE",
        contact: "alice@example.com",
        weeklyLoad: 12,
        dailyLoad: 3,
      },
    }),
    prisma.teacher.create({
      data: {
        name: "Md. Rafiq Hasan",
        shortName: "RH",
        designation: "Lecturer",
        department: "CSE",
        contact: "rafiq@example.com",
        weeklyLoad: 10,
        dailyLoad: 3,
      },
    }),
  ]);

  // ----------------------------
  // 2. Create Courses
  // ----------------------------
  const [c1, c2, c3] = await Promise.all([
    prisma.course.create({
      data: {
        code: "CSE101",
        title: "Introduction to Programming",
        credit: 3,
        semester: 1,
        type: "THEORY",
      },
    }),
    prisma.course.create({
      data: {
        code: "CSE102",
        title: "Programming Lab",
        credit: 1.5,
        semester: 1,
        type: "LAB",
      },
    }),
    prisma.course.create({
      data: {
        code: "CSE201",
        title: "Data Structures",
        credit: 3,
        semester: 2,
        type: "THEORY",
      },
    }),
  ]);

  // ----------------------------
  // 3. Course Assignments
  // ----------------------------
  await Promise.all([
    prisma.courseAssignment.create({
      data: { teacherId: t1.id, courseId: c1.id },
    }),
    prisma.courseAssignment.create({
      data: { teacherId: t2.id, courseId: c2.id },
    }),
    prisma.courseAssignment.create({
      data: { teacherId: t1.id, courseId: c3.id },
    }),
  ]);

  // ----------------------------
  // 4. Batches
  // ----------------------------
  const b1 = await prisma.batch.create({
    data: {
      name: "CSE-55",
      size: 60,
    },
  });

  // ----------------------------
  // 5. Batch ⇔ Course relations
  // ----------------------------
  const bcLab = await prisma.batchCourse.create({
    data: {
      batchId: b1.id,
      courseId: c2.id,
      requiresLab: true,
      groupCount: 2,
    },
  });

  // ----------------------------
  // 6. Create Batch Groups
  // ----------------------------
  const groupA = await prisma.batchGroup.create({
    data: {
      name: "A",
      size: 30,
      batchId: b1.id,
    },
  });

  const groupB = await prisma.batchGroup.create({
    data: {
      name: "B",
      size: 30,
      batchId: b1.id,
    },
  });

  // ----------------------------
  // 7. Lab Sub-groups under BatchCourse
  // ----------------------------
  await prisma.labGroup.createMany({
    data: [
      {
        batchCourseId: bcLab.id,
        name: "Group A",
        size: 30,
      },
      {
        batchCourseId: bcLab.id,
        name: "Group B",
        size: 30,
      },
    ],
  });

  // ----------------------------
  // 8. Rooms
  // ----------------------------
  const [r1, r2] = await Promise.all([
    prisma.room.create({
      data: {
        roomNumber: "CSE-301",
        capacity: 60,
        type: "CLASSROOM",
      },
    }),
    prisma.room.create({
      data: {
        roomNumber: "CSE-LAB-01",
        capacity: 30,
        type: "LAB",
      },
    }),
  ]);

  // ----------------------------
  // 9. Example Class Schedules
  // ----------------------------
  await prisma.schedule.createMany({
    data: [
      {
        day: "SUN",
        startTime: "10:00",
        endTime: "11:00",
        teacherId: t1.id,
        roomId: r1.id,
        courseId: c1.id,
        batchId: b1.id,
      },
      {
        day: "SUN",
        startTime: "11:00",
        endTime: "01:00",
        teacherId: t2.id,
        roomId: r2.id,
        courseId: c2.id,
        batchId: b1.id,
        groupId: groupA.id,
      },
    ],
  });

  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
