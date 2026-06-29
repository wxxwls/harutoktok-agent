"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "./dashboard";
import type {
  AgentRuntime,
  CalendarEvent,
  ConfirmationRequest,
  ConnectedAccount,
  DailyFortune,
  DailyReview,
  MeetingNote,
  ScheduleCandidate,
  TimeGap,
  TimeUsageSummary,
  UserPreferences
} from "@/lib/types";

type AppState = {
  events: CalendarEvent[];
  candidates: ScheduleCandidate[];
  connectedAccounts: ConnectedAccount[];
  meetingNotes: MeetingNote[];
  dailyReviews: DailyReview[];
  dailyFortunes: DailyFortune[];
  timeGaps: TimeGap[];
  timeUsageSummaries: TimeUsageSummary[];
  confirmations: ConfirmationRequest[];
  agentRuntime: AgentRuntime;
  preferences: UserPreferences;
};

export function ClientDashboard({ initialState }: { initialState: AppState }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <main className="calendar-shell" aria-label="하루톡톡 로딩 중" />;
  }

  return <Dashboard initialState={initialState} />;
}
