import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ teacherId: string }> }
) {
  console.log("🔥 params received:", context.params);
  const resolvedParams = await context.params;
  const teacherId = Number(resolvedParams.teacherId);
  console.log({teacherId})
  if (isNaN(teacherId)) {
    return NextResponse.json({ message: "Invalid teacher ID" }, { status: 400 });
  }
  const assignments = await prisma.courseAssignment.findMany({
    where: { teacherId },
  });
  console.log({assignments})
  return NextResponse.json(assignments);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ teacherId: string }> }
) {
  const resolvedParams = await context.params;
  const teacherId = Number(resolvedParams.teacherId);

  if (isNaN(teacherId)) {
    return NextResponse.json({ message: "Invalid teacher ID" }, { status: 400 });
  }

  const { courseIds } = await req.json(); // array of course IDs

  // Remove old assignments
  await prisma.courseAssignment.deleteMany({ where: { teacherId } });

  // Create new assignments
  const newAssignments = courseIds.map((courseId: number) => ({
    teacherId,
    courseId,
  }));

  await prisma.courseAssignment.createMany({ data: newAssignments });

  return NextResponse.json({ success: true });
}
