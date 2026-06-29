import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const confirmation = store.createConfirmation({
    targetType: body.target_type ?? "time_usage_plan",
    targetId: body.target_id ?? body.source_date ?? store.todayText(),
    action: body.action_type ?? "create",
    message: body.title ?? body.message ?? "승인이 필요한 작업입니다.",
    payload: body.payload ?? {},
    status: "pending"
  });

  return NextResponse.json({ confirmation_request: confirmation });
}
