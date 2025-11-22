import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(course);
}

export async function PUT(req: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();

  // Remove id if it exists
  const { id: _, ...data } = body;

  const updated = await prisma.course.update({
    where: { id },
    data, // safe to pass
  });

  return NextResponse.json(updated);
}


export async function DELETE(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  await prisma.course.delete({ where: { id } });
  return NextResponse.json({ message: "Deleted" });
}
