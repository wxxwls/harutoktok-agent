import { NextResponse } from "next/server";
import { executeConfirmationRequest } from "@/lib/time-usage-agent";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const confirmation = executeConfirmationRequest(id);
  if (!confirmation) {
    return NextResponse.json({ message: "승인할 요청을 찾지 못했습니다." }, { status: 404 });
  }
  return NextResponse.json({ confirmation_request: confirmation, message: "승인된 작업을 캘린더에 반영했습니다." });
}
