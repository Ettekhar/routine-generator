import { NextResponse } from "next/server";
import  prisma  from "@/lib/prisma";

export async function GET() {
  try {
    const schedules = await prisma.schedule.findMany({
      include: {
        teacher: true,
        course: true,
        batch: true,
        room: true,
        group: true,
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(schedules);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}



export async function POST(req: Request) {
  try {
    const body = await req.json();

    const schedule = await prisma.schedule.create({
      data: {
        day: body.day,
        startTime: body.startTime,
        endTime: body.endTime,
        teacherId: body.teacherId,
        courseId: body.courseId,
        batchId: body.batchId,
        groupId: body.groupId || null,
        roomId: body.roomId,
      },
    });

    return NextResponse.json(schedule);
  } catch (e) {
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}


export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.schedule.delete({
      where: { id: Number(params.id) },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
