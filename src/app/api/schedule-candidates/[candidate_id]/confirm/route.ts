import { NextResponse } from "next/server";
import { confirmCandidate } from "@/lib/agent";

type Context = {
  params: Promise<{
    candidate_id: string;
  }>;
};

export async function POST(request: Request, context: Context) {
  const { candidate_id: candidateId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = confirmCandidate(candidateId, body.selected_start_at, body.selected_end_at);
  return NextResponse.json(result.body, { status: result.status });
}
