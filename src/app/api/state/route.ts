import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getAgentRuntime } from "@/lib/agent-runtime";

export async function GET() {
  const snapshot = store.snapshot();
  return NextResponse.json({
    events: store.listEvents(),
    candidates: store.listCandidates(),
    connectedAccounts: snapshot.connectedAccounts,
    meetingNotes: snapshot.meetingNotes,
    dailyReviews: snapshot.dailyReviews,
    dailyFortunes: snapshot.dailyFortunes,
    timeGaps: snapshot.timeGaps,
    timeUsageSummaries: snapshot.timeUsageSummaries,
    confirmations: snapshot.confirmations,
    userMemory: snapshot.userMemory,
    agentRuntime: getAgentRuntime(store.todayText()),
    preferences: snapshot.preferences
  });
}
