import { NextResponse } from "next/server";
import { rejectCandidate } from "@/lib/agent";

type Context = {
  params: Promise<{
    candidate_id: string;
  }>;
};

export async function POST(request: Request, context: Context) {
  const { candidate_id: candidateId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = rejectCandidate(candidateId, body.reason);
  return NextResponse.json(result.body, { status: result.status });
}
