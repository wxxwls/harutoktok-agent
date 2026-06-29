import { NextResponse } from "next/server";
import { analyzeTimeUsage } from "@/lib/time-usage-agent";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = analyzeTimeUsage({
    date: body.date ?? store.todayText(),
    satisfaction: typeof body.satisfaction === "number" ? body.satisfaction : undefined
  });
  return NextResponse.json({
    summary: result.summary,
    time_gaps: result.timeGaps,
    confirmation_requests: result.confirmationRequests
  });
}
