import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; cid: string }> }
) {
  const resolvedParams = await context.params;
  const cid = Number(resolvedParams.cid);

  if (isNaN(cid)) {
    return NextResponse.json({ message: "Invalid course id" }, { status: 400 });
  }

  const item = await prisma.batchCourse.findUnique({
    where: { id: cid },
    include: { course: true },
  });

  if (!item) return NextResponse.json({ message: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; cid: string }> }
) {
  const resolvedParams = await context.params;
  const cid = Number(resolvedParams.cid);

  if (isNaN(cid)) {
    return NextResponse.json({ message: "Invalid course id" }, { status: 400 });
  }

  const data = await req.json();

  const updated = await prisma.batchCourse.update({
    where: { id: cid },
    data: {
      courseId: data.courseId,
      requiresLab: data.requiresLab,
      groupCount: data.groupCount ? Number(data.groupCount) : null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ cid: string }> }
) {
  const resolvedParams = await context.params;
  const cid = Number(resolvedParams.cid);

  if (isNaN(cid)) {
    return NextResponse.json({ message: "Invalid course id" }, { status: 400 });
  }

  await prisma.batchCourse.delete({ where: { id: cid } });

  return NextResponse.json({ message: "Deleted" });
}
