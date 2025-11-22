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

  const groups = await prisma.batchGroup.findMany({
    where: { batchId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(groups);
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

  const created = await prisma.batchGroup.create({
    data: {
      name: data.name,
      size: Number(data.size),
      batchId,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
