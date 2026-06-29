import { NextResponse } from "next/server";
import { createScheduleCandidateFromDetection, detectScheduleFromText } from "@/lib/agent";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const event = body.event ?? body;
  const text = String(event.text ?? "").trim();

  if (!text) {
    return NextResponse.json({ message: "Slack 감지를 실행하려면 event.text가 필요합니다." }, { status: 400 });
  }

  const detection = detectScheduleFromText({
    text,
    source: "slack"
  });
  const result = createScheduleCandidateFromDetection({
    detection,
    source: "slack",
    sourceDetail: event.channel ?? body.channel ?? "Slack",
    snippet: text
  });

  return NextResponse.json({
    status: result.candidate ? "detected" : "ignored",
    message: result.message,
    candidate: result.candidate
  });
}
