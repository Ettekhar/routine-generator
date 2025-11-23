import { NextResponse } from "next/server";
import { generateFullSchedule } from "@/lib/generateSchedule"; // <-- we will move your huge code here
import  prisma  from "@/lib/prisma";


export async function POST() {
  try {
    console.log("API: Generating schedule...");
    const result = await generateFullSchedule();

    return NextResponse.json(
      {
        success: true,
        id: result.scheduleGroupId ?? null,
        message: "Schedule generated successfully"
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Generation Error:", error);
    return NextResponse.json(
      { success: false, error: "Schedule generation failed" },
      { status: 500 }
    );
  }
}
 