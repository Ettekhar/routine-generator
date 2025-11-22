// app/api/courses/route.ts
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const courses = await prisma.course.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(courses);
}

export async function POST(req: Request) {
  const body = await req.json();
  const created = await prisma.course.create({ data: body });
  return NextResponse.json(created, { status: 201 });
}
