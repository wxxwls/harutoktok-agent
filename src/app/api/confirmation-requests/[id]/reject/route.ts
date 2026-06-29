import { NextResponse } from "next/server";
import { rejectConfirmationRequest } from "@/lib/time-usage-agent";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const confirmation = rejectConfirmationRequest(id);
  if (!confirmation) {
    return NextResponse.json({ message: "거절할 요청을 찾지 못했습니다." }, { status: 404 });
  }
  return NextResponse.json({ confirmation_request: confirmation, message: "제안을 거절했습니다." });
}
