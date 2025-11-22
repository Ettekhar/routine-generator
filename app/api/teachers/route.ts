// app/api/teachers/route.ts
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const teachers = await prisma.teacher.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(teachers);
}

export async function POST(req: Request) {
  const data = await req.json();
  // Basic validation
  const created = await prisma.teacher.create({ data });
  return NextResponse.json(created, { status: 201 });
}
