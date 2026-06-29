import { NextResponse } from "next/server";
import { analyzeTimeUsage } from "@/lib/time-usage-agent";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = analyzeTimeUsage({ date: body.date ?? store.todayText() });
  return NextResponse.json({
    tomorrow_plan: result.summary.tomorrowPlan,
    tomorrow_actions: result.summary.tomorrowActions,
    confirmation_requests: result.confirmationRequests
  });
}
