import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(room);
}

export async function PUT(req: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const updated = await prisma.room.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  await prisma.room.delete({ where: { id } });
  return NextResponse.json({ message: "Deleted" });
}
