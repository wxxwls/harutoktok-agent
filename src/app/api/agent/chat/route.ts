import { NextResponse } from "next/server";
import { handleChat } from "@/lib/agent";

export async function POST(request: Request) {
  const body = await request.json();
  const result = await handleChat({
    message: body.message ?? "",
    timezone: body.timezone ?? "Asia/Seoul",
    clientNow: body.client_now ?? body.clientNow,
    history: body.history ?? []
  });
  return NextResponse.json(result);
}
