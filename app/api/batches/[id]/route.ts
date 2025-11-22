import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: { groups: true },
  });

  if (!batch) {
    return NextResponse.json({ message: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json(batch);
}

export async function PUT(req: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const data = await req.json();

  const updated = await prisma.batch.update({
    where: { id },
    data: {
      name: data.name,
      size: Number(data.size),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, context: { params: Promise<Record<string, string>> }) {
  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);

  if (isNaN(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  await prisma.batch.delete({ where: { id } });

  return NextResponse.json({ message: "Deleted" });
}
