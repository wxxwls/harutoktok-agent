import { NextResponse } from "next/server";
import { generateDailyReview } from "@/lib/agent";
import { store } from "@/lib/store";
import { analyzeTimeUsage } from "@/lib/time-usage-agent";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const date = body.date ?? body.review_date ?? store.todayText();
  const review = generateDailyReview({ reviewDate: date });
  const usage = analyzeTimeUsage({ date, satisfaction: body.satisfaction });
  return NextResponse.json({
    review,
    time_usage_summary: usage.summary,
    confirmation_requests: usage.confirmationRequests
  });
}
