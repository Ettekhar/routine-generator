import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; gid: string }> }
) {
  const resolvedParams = await context.params;
  const gid = Number(resolvedParams.gid);

  if (isNaN(gid)) {
    return NextResponse.json({ message: "Invalid group id" }, { status: 400 });
  }

  const group = await prisma.batchGroup.findUnique({
    where: { id: gid },
  });

  if (!group) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(group);
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; gid: string }> }
) {
  const resolvedParams = await context.params;
  const gid = Number(resolvedParams.gid);

  if (isNaN(gid)) {
    return NextResponse.json({ message: "Invalid group id" }, { status: 400 });
  }

  const data = await req.json();

  const updated = await prisma.batchGroup.update({
    where: { id: gid },
    data: {
      name: data.name,
      size: Number(data.size),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; gid: string }> }
) {
  const resolvedParams = await context.params;
  const gid = Number(resolvedParams.gid);

  if (isNaN(gid)) {
    return NextResponse.json({ message: "Invalid group id" }, { status: 400 });
  }

  await prisma.batchGroup.delete({
    where: { id: gid },
  });

  return NextResponse.json({ message: "Deleted" });
}
