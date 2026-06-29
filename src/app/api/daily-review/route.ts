import { NextResponse } from "next/server";
import { generateDailyReview } from "@/lib/agent";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const review = generateDailyReview({
    reviewDate: body.review_date ?? store.todayText()
  });

  return NextResponse.json({
    daily_review_id: review.dailyReviewId,
    review_date: review.reviewDate,
    summary: review.summary,
    completed_items: review.completedItems,
    incomplete_items: review.incompleteItems,
    time_analysis: review.timeAnalysis,
    imported_events: review.importedEvents,
    strengths: review.strengths,
    improvements: review.improvements,
    growth_points: review.growthPoints,
    tomorrow_priorities: review.tomorrowPriorities
  });
}
