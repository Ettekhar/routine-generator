import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const batches = await prisma.batch.findMany({
    orderBy: { name: "asc" },
    include: {
      groups: true,
      courses: true,
    },
  });

  return NextResponse.json(batches);
}

export async function POST(req: Request) {
  const body = await req.json();

  const created = await prisma.batch.create({
    data: {
      name: body.name,
      size: Number(body.size),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
