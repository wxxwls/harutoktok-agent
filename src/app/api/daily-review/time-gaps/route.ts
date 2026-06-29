import { NextResponse } from "next/server";
import { detectTimeGaps, saveTimeGapRecords } from "@/lib/time-usage-agent";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? store.todayText();
  const gaps = detectTimeGaps({ date });
  return NextResponse.json({ date, time_gaps: gaps });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const date = body.date ?? store.todayText();
  const gaps = saveTimeGapRecords({
    date,
    gaps: Array.isArray(body.time_gaps) ? body.time_gaps : []
  });
  return NextResponse.json({ date, time_gaps: gaps });
}
