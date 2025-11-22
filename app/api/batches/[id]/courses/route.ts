import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await context.params;
  const batchId = Number(resolvedParams.id);

  if (isNaN(batchId)) {
    return NextResponse.json({ message: "Invalid batch id" }, { status: 400 });
  }

  const list = await prisma.batchCourse.findMany({
    where: { batchId },
    include: { course: true },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(list);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await context.params;
  const batchId = Number(resolvedParams.id);

  if (isNaN(batchId)) {
    return NextResponse.json({ message: "Invalid batch id" }, { status: 400 });
  }

  const data = await req.json();

  const created = await prisma.batchCourse.create({
    data: {
      batchId,
      courseId: data.courseId,
      requiresLab: data.requiresLab,
      groupCount: data.groupCount ? Number(data.groupCount) : null,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
