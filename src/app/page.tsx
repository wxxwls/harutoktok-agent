import { store } from "@/lib/store";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  const snapshot = store.snapshot();
  const initialState = {
    events: store.listEvents(),
    candidates: store.listCandidates(),
    connectedAccounts: snapshot.connectedAccounts,
    meetingNotes: snapshot.meetingNotes,
    dailyReviews: snapshot.dailyReviews,
    dailyFortunes: snapshot.dailyFortunes,
    timeGaps: snapshot.timeGaps,
    timeUsageSummaries: snapshot.timeUsageSummaries,
    confirmations: snapshot.confirmations,
    agentRuntime: getAgentRuntime(store.todayText()),
    preferences: snapshot.preferences
  };

  return <Dashboard initialState={initialState} />;
}
