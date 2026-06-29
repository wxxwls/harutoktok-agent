import { addDays, parseISO, startOfDay } from "date-fns";
import { store } from "./store";
import type { AgentRuntime, CalendarEvent, TimeUsageSummary, UserMemory } from "./types";
import { detectTimeGaps } from "./time-usage-agent";
import { rangeForDay, toDateInput } from "./time";

export function getAgentRuntime(date = store.todayText()): AgentRuntime {
  const range = rangeForDay(date);
  const events = store.listEvents(range.startAt, range.endAt);
  const importantEvents = events.filter((event) => event.isImportant);
  const completedEvents = events.filter((event) => event.isCompleted);
  const pendingConfirmations = store.snapshot().confirmations.filter((confirmation) => confirmation.status === "pending");
  const savedGaps = store.listTimeGaps(date);
  const detectedGaps = savedGaps.length > 0 ? savedGaps : detectTimeGaps({ date });
  const unrecordedGapMinutes = detectedGaps.filter((gap) => !gap.isRecorded).reduce((sum, gap) => sum + gap.durationMinutes, 0);
  const latestSummary = store.getTimeUsageSummary(date);
  const memories = store.listUserMemory();
  const rewards = buildRewardRuntime(date, events, store.snapshot().timeUsageSummaries, store.snapshot().dailyReviews);
  const riskSignals = buildRiskSignals({
    events,
    summaries: store.snapshot().timeUsageSummaries,
    unrecordedGapMinutes,
    latestSummary
  });
  const proactiveMessages = buildProactiveMessages({
    date,
    events,
    importantEvents,
    pendingConfirmations: pendingConfirmations.length,
    unrecordedGapMinutes,
    latestSummary,
    riskSignals,
    streakDays: rewards.streakDays
  });
  const memoryApplied = buildMemoryApplied(memories);
  const completionRate = events.length > 0 ? Math.round((completedEvents.length / events.length) * 100) : 0;

  return {
    date,
    loop: [
      {
        step: "Observe",
        status: "done",
        summary: `오늘 일정 ${events.length}개, 빈 시간 ${detectedGaps.length}개를 관찰했습니다.`
      },
      {
        step: "Analyze",
        status: latestSummary ? "done" : "pending",
        summary: latestSummary ? `시간 사용 점수 ${latestSummary.timeUsageScore}점을 계산했습니다.` : "빈 시간 기록 후 시간 사용 분석이 필요합니다."
      },
      {
        step: "Plan",
        status: latestSummary ? "done" : "pending",
        summary: latestSummary?.tomorrowActions[0] ?? "분석 결과를 바탕으로 내일 제안을 생성합니다."
      },
      {
        step: "Confirm",
        status: pendingConfirmations.length > 0 ? "waiting" : "done",
        summary: pendingConfirmations.length > 0 ? `승인 대기 작업 ${pendingConfirmations.length}개가 있습니다.` : "현재 승인 대기 작업은 없습니다."
      },
      {
        step: "Act",
        status: "done",
        summary: "승인된 작업만 캘린더에 반영합니다."
      },
      {
        step: "Remember",
        status: memories.length > 0 ? "done" : "pending",
        summary: memories.length > 0 ? `Memory ${memories.length}개를 다음 추천에 반영합니다.` : "승인/거절과 생활 패턴이 쌓이면 추천이 개인화됩니다."
      },
      {
        step: "Improve",
        status: memoryApplied.length > 0 ? "done" : "pending",
        summary: memoryApplied[0] ?? "Memory 기반 추천을 준비 중입니다."
      }
    ],
    observed: {
      todayEventCount: events.length,
      completedEventCount: completedEvents.length,
      importantEventCount: importantEvents.length,
      timeGapCount: detectedGaps.length,
      unrecordedGapMinutes,
      pendingConfirmationCount: pendingConfirmations.length
    },
    analysis: {
      completionRate,
      latestTimeUsageScore: latestSummary?.timeUsageScore,
      riskSignals
    },
    plan: {
      headline: buildPlanHeadline(latestSummary, riskSignals, memoryApplied),
      recommendedActions: latestSummary?.tomorrowActions?.slice(0, 3) ?? ["빈 시간을 기록하면 내일 추천 행동을 만들 수 있어요."],
      memoryApplied
    },
    proactiveMessages,
    rewards
  };
}

function buildRiskSignals(input: {
  events: CalendarEvent[];
  summaries: TimeUsageSummary[];
  unrecordedGapMinutes: number;
  latestSummary?: TimeUsageSummary;
}) {
  const signals: string[] = [];
  const incomplete = input.events.filter((event) => !event.isCompleted);
  if (incomplete.length >= 2) {
    signals.push(`미완료 일정 ${incomplete.length}개`);
  }
  if (input.unrecordedGapMinutes >= 60) {
    signals.push(`미기록 빈 시간 ${formatMinutes(input.unrecordedGapMinutes)}`);
  }
  if (input.latestSummary && input.latestSummary.snsVideoMinutes >= 90) {
    signals.push(`SNS/영상/게임 ${formatMinutes(input.latestSummary.snsVideoMinutes)}`);
  }
  if (input.latestSummary && input.latestSummary.movingMinutes >= 120) {
    signals.push(`이동 시간 ${formatMinutes(input.latestSummary.movingMinutes)}`);
  }
  const recentGoalShortage = input.summaries.slice(0, 3).filter((summary) => summary.studyMinutes + summary.selfDevelopmentMinutes < 30).length;
  if (recentGoalShortage >= 2) {
    signals.push("목표 관련 시간 2일 이상 부족");
  }
  return signals;
}

function buildProactiveMessages(input: {
  date: string;
  events: CalendarEvent[];
  importantEvents: CalendarEvent[];
  pendingConfirmations: number;
  unrecordedGapMinutes: number;
  latestSummary?: TimeUsageSummary;
  riskSignals: string[];
  streakDays: number;
}) {
  const messages: string[] = [];
  const now = new Date();
  const isToday = input.date === toDateInput(now);
  const incomplete = input.events.filter((event) => !event.isCompleted);
  const tomorrowStart = startOfDay(addDays(now, 1)).getTime();
  const tomorrowEnd = startOfDay(addDays(now, 2)).getTime();
  const importantTomorrow = input.importantEvents.some((event) => {
    const time = new Date(event.startAt).getTime();
    return time >= tomorrowStart && time < tomorrowEnd;
  });

  if (isToday && now.getHours() >= 21 && !input.latestSummary) {
    messages.push("오늘 하루 평가가 아직 완료되지 않았어요. 빈 시간을 기록하면 성장보고서를 만들 수 있어요.");
  }
  if (input.unrecordedGapMinutes >= 60) {
    messages.push(`기록되지 않은 빈 시간이 ${formatMinutes(input.unrecordedGapMinutes)} 있어요. 1시간 이상 구간만 빠르게 기록해볼까요?`);
  }
  if (incomplete.length >= 2) {
    messages.push(`오늘 완료하지 못한 일정이 ${incomplete.length}개 있어요. 내일 빈 시간에 다시 배치할 수 있습니다.`);
  }
  if (importantTomorrow) {
    messages.push("내일 중요한 일정이 있어요. 10분 준비 시간을 추가할지 확인해보세요.");
  }
  if (input.pendingConfirmations > 0) {
    messages.push(`승인 대기 작업 ${input.pendingConfirmations}개가 있어요. 승인하면 실제 캘린더에 반영됩니다.`);
  }
  if (input.streakDays > 0 && isToday && now.getHours() >= 20 && !input.latestSummary) {
    messages.push(`연속 기록 ${input.streakDays}일을 이어가는 중이에요. 오늘 한 줄 회고만 남겨도 흐름을 유지할 수 있습니다.`);
  }
  return [...new Set(messages)].slice(0, 5);
}

function buildRewardRuntime(date: string, events: CalendarEvent[], summaries: TimeUsageSummary[], reviews: Array<{ reviewDate: string }>) {
  const completedDates = new Set<string>();
  summaries.forEach((summary) => {
    if (summary.timeUsageScore >= 60) {
      completedDates.add(summary.date);
    }
  });
  reviews.forEach((review) => completedDates.add(review.reviewDate));

  let streakDays = 0;
  let cursor = startOfDay(parseISO(`${date}T00:00:00`));
  while (completedDates.has(toDateInput(cursor))) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  const completedCount = events.filter((event) => event.isCompleted).length;
  const unlockedBadges = [
    completedCount > 0 ? "첫 일정 완료" : "",
    streakDays >= 3 ? "3일 연속 기록" : "",
    streakDays >= 7 ? "7일 성장 배지" : "",
    summaries.some((summary) => summary.recordedGapMinutes > 0) ? "빈 시간 기록 완료" : "",
    summaries.filter((summary) => summary.studyMinutes + summary.selfDevelopmentMinutes >= 30).length >= 5 ? "목표 관련 일정 5회 완료" : ""
  ].filter(Boolean);

  return {
    streakDays,
    unlockedBadges,
    grassIntensity: Math.min(4, completedCount)
  };
}

function buildMemoryApplied(memories: UserMemory[]) {
  return memories
    .slice(0, 8)
    .map((memory) => {
      if (memory.memoryType === "accepted_suggestion") {
        return `승인 이력 반영: ${memory.memoryContent}`;
      }
      if (memory.memoryType === "rejected_suggestion") {
        return `거절 이력 반영: ${memory.memoryContent}`;
      }
      if (memory.memoryType === "goal_shortage") {
        return "목표 관련 시간 부족 패턴을 추천에 반영합니다.";
      }
      if (memory.memoryType === "sns_pattern") {
        return "SNS/영상 시간이 길어진 패턴을 감지했습니다.";
      }
      if (memory.memoryType === "moving_pattern") {
        return "이동 시간이 긴 패턴을 감지했습니다.";
      }
      return memory.memoryContent;
    })
    .slice(0, 3);
}

function buildPlanHeadline(summary: TimeUsageSummary | undefined, riskSignals: string[], memoryApplied: string[]) {
  if (summary?.tomorrowActions?.[0]) {
    return summary.tomorrowActions[0];
  }
  if (riskSignals.length > 0) {
    return `${riskSignals[0]} 신호가 있어 내일 계획 조정이 필요합니다.`;
  }
  if (memoryApplied.length > 0) {
    return "저장된 Memory를 바탕으로 다음 추천을 개인화할 수 있습니다.";
  }
  return "오늘 일정과 빈 시간을 기록하면 Agent가 다음 행동을 제안합니다.";
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}분`;
  }
  if (rest === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${rest}분`;
}
