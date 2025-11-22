import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const resolvedParams = await context.params; // ✅ unwrap the promise
  console.log("resolvedParams:", resolvedParams);

  const id = Number(resolvedParams.id);
  if (isNaN(id)) return NextResponse.json({ message: "Invalid id" }, { status: 400 });

  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher) return NextResponse.json({ message: "Not found" }, { status: 404 });

  return NextResponse.json(teacher);
}


export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  const body = await req.json();
  const updated = await prisma.teacher.update({ where: { id }, data: body });

  return NextResponse.json(updated);
}


export async function DELETE(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params; // unwrap the promise
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  await prisma.teacher.delete({ where: { id } });
  return NextResponse.json({ message: "Deleted" });
}
