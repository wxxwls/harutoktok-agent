import { NextResponse } from "next/server";
import { createScheduleCandidateFromDetection, detectScheduleFromText } from "@/lib/agent";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const snippet = String(body.snippet ?? body.text ?? "").trim();

  if (!subject && !snippet) {
    return NextResponse.json({ message: "Gmail 감지를 실행하려면 subject 또는 snippet이 필요합니다." }, { status: 400 });
  }

  const text = `${subject}\n${snippet}`;
  const detection = detectScheduleFromText({
    text,
    source: "gmail",
    defaultTitle: subject || undefined
  });
  const result = createScheduleCandidateFromDetection({
    detection,
    source: "gmail",
    sourceDetail: body.sender ?? body.source_detail ?? "Gmail",
    snippet
  });

  return NextResponse.json({
    status: result.candidate ? "detected" : "ignored",
    message: result.message,
    candidate: result.candidate
  });
}
