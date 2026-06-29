import { addDays, differenceInMinutes, format, parseISO, set } from "date-fns";
import { store } from "./store";
import type { CalendarEvent, TimeGap, TimeGapCategory, UserMemory } from "./types";
import { formatTimeRange, makeId, nowIso, rangeForDay } from "./time";

export const TIME_USAGE_AGENT_PROMPT = `너는 하루톡톡의 시간 사용 분석 Agent다.

너의 역할은 사용자의 하루 일정, 일정 완료 여부, 빈 시간 기록, 이동/식사/휴식/SNS/자기개발 시간을 분석해 사용자가 하루를 더 효율적으로 보낼 수 있도록 피드백을 제공하는 것이다.

너는 단순히 피드백만 제공하지 않는다. 반드시 다음 날 행동 계획까지 제안해야 한다.

출력 형식:
# 시간 사용 피드백
## 1. 오늘의 시간 사용 요약
## 2. 많이 사용한 시간
## 3. 시간 낭비 가능 구간
## 4. 잘한 점
## 5. 개선할 점
## 6. 내일 추천 행동
## 7. 내일 일정 제안
## 8. Memory 업데이트 후보

규칙:
1. 한국어로 작성한다.
2. 사용자를 비난하지 않는다.
3. 구체적인 시간 수치를 포함한다.
4. 이동시간, 식사시간, SNS/영상 시간이 과도하면 명확히 말한다.
5. "시간을 낭비했다"라고 단정하지 말고 "시간 낭비 가능 구간"으로 표현한다.
6. 실제 캘린더 변경은 사용자 승인 필요로 표시한다.`;

export const timeGapCategoryLabels: Record<TimeGapCategory, string> = {
  moving: "이동",
  meal: "식사",
  rest: "휴식",
  self_development: "자기개발",
  study: "공부",
  exercise: "운동",
  friends: "친구/약속",
  sns_video: "SNS/영상 시청",
  game: "게임",
  housework: "집안일",
  preparation: "준비 시간",
  waiting: "대기 시간",
  etc: "기타"
};

const wasteCategories = new Set<TimeGapCategory>(["sns_video", "game"]);

export function detectTimeGaps(input: { date: string; minMinutes?: number }) {
  const preferences = store.getPreferences();
  const range = rangeForDay(input.date);
  const events = store.listEvents(range.startAt, range.endAt);
  const dayStart = localDateTime(input.date, preferences.dayStartTime || preferences.workingHours.start || "07:00");
  const dayEnd = localDateTime(input.date, preferences.dayEndTime || "23:00");
  const existing = store.listTimeGaps(input.date);
  const minMinutes = input.minMinutes ?? 15;
  let cursor = dayStart;
  const detected: TimeGap[] = [];

  events
    .filter((event) => parseISO(event.endAt) > dayStart && parseISO(event.startAt) < dayEnd)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .forEach((event) => {
      const start = maxDate(parseISO(event.startAt), dayStart);
      const end = minDate(parseISO(event.endAt), dayEnd);
      const gapMinutes = differenceInMinutes(start, cursor);

      if (gapMinutes >= minMinutes) {
        detected.push(buildGap(input.date, cursor, start, existing));
      }
      if (end > cursor) {
        cursor = end;
      }
    });

  const tailMinutes = differenceInMinutes(dayEnd, cursor);
  if (tailMinutes >= minMinutes) {
    detected.push(buildGap(input.date, cursor, dayEnd, existing));
  }

  return detected;
}

export function saveTimeGapRecords(input: { date: string; gaps: Array<Partial<TimeGap> & Pick<TimeGap, "startTime" | "endTime" | "durationMinutes">> }) {
  const preferences = store.getPreferences();
  const gaps = input.gaps.map((gap) => ({
    id: gap.id ?? makeId("gap"),
    userId: gap.userId ?? preferences.userId,
    date: input.date,
    startTime: gap.startTime,
    endTime: gap.endTime,
    durationMinutes: gap.durationMinutes,
    category: gap.category,
    memo: gap.memo ?? "",
    isRecorded: Boolean(gap.isRecorded && gap.category),
    createdAt: gap.createdAt ?? nowIso(),
    updatedAt: nowIso()
  }));

  return store.saveTimeGaps(input.date, gaps);
}

export function analyzeTimeUsage(input: { date: string; satisfaction?: number }) {
  const preferences = store.getPreferences();
  const range = rangeForDay(input.date);
  const events = store.listEvents(range.startAt, range.endAt);
  const savedGaps = store.listTimeGaps(input.date);
  const gaps =
    savedGaps.length > 0
      ? savedGaps
      : saveTimeGapRecords({
          date: input.date,
          gaps: detectTimeGaps({ date: input.date })
        });
  const minutesByCategory = sumGapMinutes(gaps);
  const scheduleMinutes = events.reduce((sum, event) => sum + eventMinutes(event), 0);
  const completedScheduleMinutes = events
    .filter((event) => isLikelyCompleted(event, input.date))
    .reduce((sum, event) => sum + eventMinutes(event), 0);
  const recordedGapMinutes = gaps.filter((gap) => gap.isRecorded).reduce((sum, gap) => sum + gap.durationMinutes, 0);
  const totalGapMinutes = gaps.reduce((sum, gap) => sum + gap.durationMinutes, 0);
  const unrecordedGapMinutes = totalGapMinutes - recordedGapMinutes;
  const goalMinutes = minutesByCategory.self_development + minutesByCategory.study;
  const wasteRiskMinutes = minutesByCategory.sns_video + minutesByCategory.game;
  const totalObservedMinutes = Math.max(scheduleMinutes + totalGapMinutes, 1);
  const completionScore = scheduleMinutes > 0 ? Math.round((completedScheduleMinutes / scheduleMinutes) * 40) : 28;
  const goalScore = goalMinutes >= 60 ? 20 : goalMinutes >= 30 ? 14 : goalMinutes > 0 ? 8 : 3;
  const wasteScore = wasteRiskMinutes >= 120 ? 4 : wasteRiskMinutes >= 90 ? 10 : wasteRiskMinutes >= 45 ? 15 : 20;
  const recordScore = totalGapMinutes > 0 ? Math.round((recordedGapMinutes / totalGapMinutes) * 10) : 10;
  const satisfactionScore = Math.min(10, Math.max(0, input.satisfaction ?? 7));
  const score = Math.min(100, completionScore + goalScore + wasteScore + recordScore + satisfactionScore);
  const risks = buildWasteRiskSegments(gaps);
  const suggestions = buildTomorrowSuggestions({
    date: input.date,
    events,
    movingMinutes: minutesByCategory.moving,
    mealMinutes: minutesByCategory.meal,
    wasteRiskMinutes,
    goalMinutes,
    unrecordedGapMinutes
  });
  const confirmations = suggestions.map((suggestion) => createSuggestionConfirmation(suggestion, input.date));

  const summary = store.upsertTimeUsageSummary({
    userId: preferences.userId,
    date: input.date,
    totalScheduleMinutes: scheduleMinutes,
    completedScheduleMinutes,
    incompleteScheduleMinutes: Math.max(0, scheduleMinutes - completedScheduleMinutes),
    totalGapMinutes,
    recordedGapMinutes,
    unrecordedGapMinutes,
    movingMinutes: minutesByCategory.moving,
    mealMinutes: minutesByCategory.meal,
    restMinutes: minutesByCategory.rest,
    selfDevelopmentMinutes: minutesByCategory.self_development,
    studyMinutes: minutesByCategory.study,
    exerciseMinutes: minutesByCategory.exercise,
    snsVideoMinutes: minutesByCategory.sns_video + minutesByCategory.game,
    waitingMinutes: minutesByCategory.waiting,
    etcMinutes: minutesByCategory.etc + minutesByCategory.friends + minutesByCategory.housework + minutesByCategory.preparation,
    timeUsageScore: score,
    aiFeedback: buildAiFeedback(score, totalObservedMinutes, minutesByCategory, unrecordedGapMinutes),
    wasteRiskSegments: risks,
    strengths: buildStrengths(goalMinutes, recordedGapMinutes, totalGapMinutes, score),
    improvements: buildImprovements(minutesByCategory, unrecordedGapMinutes, goalMinutes),
    tomorrowActions: suggestions.map((suggestion) => suggestion.action),
    tomorrowPlan: buildTomorrowPlan(suggestions),
    confirmationRequestIds: confirmations.map((confirmation) => confirmation.confirmationRequestId)
  });

  updateMemoryFromAnalysis(input.date, minutesByCategory, suggestions);

  return {
    summary,
    timeGaps: gaps,
    confirmationRequests: confirmations
  };
}

export function executeConfirmationRequest(confirmationRequestId: string) {
  const confirmation = store.getConfirmation(confirmationRequestId);
  if (!confirmation || confirmation.status !== "pending") {
    return undefined;
  }

  if (confirmation.action === "create" && confirmation.payload?.calendarPayload) {
    const payload = confirmation.payload.calendarPayload as {
      title: string;
      startAt: string;
      endAt: string;
      description?: string;
    };
    store.createEvent({
      title: payload.title,
      startAt: payload.startAt,
      endAt: payload.endAt,
      attendees: [],
      isCompleted: false,
      description: payload.description,
      source: "chat"
    });
  }

  const approved = store.approveConfirmation(confirmationRequestId);
  store.addUserMemory({
    userId: store.getPreferences().userId,
    memoryType: "accepted_suggestion",
    memoryContent: confirmation.message,
    confidence: 0.8,
    sourceDate: format(parseISO(String(confirmation.payload?.sourceDate ?? new Date().toISOString())), "yyyy-MM-dd")
  });
  return approved;
}

export function rejectConfirmationRequest(confirmationRequestId: string) {
  const confirmation = store.rejectConfirmation(confirmationRequestId);
  if (confirmation) {
    store.addUserMemory({
      userId: store.getPreferences().userId,
      memoryType: "rejected_suggestion",
      memoryContent: confirmation.message,
      confidence: 0.7,
      sourceDate: format(parseISO(String(confirmation.payload?.sourceDate ?? new Date().toISOString())), "yyyy-MM-dd")
    });
  }
  return confirmation;
}

function buildGap(date: string, start: Date, end: Date, existing: TimeGap[]) {
  const startTime = start.toISOString();
  const endTime = end.toISOString();
  const saved = existing.find((gap) => gap.startTime === startTime && gap.endTime === endTime);
  return {
    id: saved?.id ?? makeId("gap"),
    userId: store.getPreferences().userId,
    date,
    startTime,
    endTime,
    durationMinutes: differenceInMinutes(end, start),
    category: saved?.category,
    memo: saved?.memo ?? "",
    isRecorded: saved?.isRecorded ?? false,
    createdAt: saved?.createdAt ?? nowIso(),
    updatedAt: saved?.updatedAt ?? nowIso()
  };
}

function sumGapMinutes(gaps: TimeGap[]) {
  const result = Object.keys(timeGapCategoryLabels).reduce(
    (accumulator, category) => ({ ...accumulator, [category]: 0 }),
    {} as Record<TimeGapCategory, number>
  );
  gaps.forEach((gap) => {
    if (gap.isRecorded && gap.category) {
      result[gap.category] += gap.durationMinutes;
    }
  });
  return result;
}

function eventMinutes(event: CalendarEvent) {
  return Math.max(0, differenceInMinutes(parseISO(event.endAt), parseISO(event.startAt)));
}

function isLikelyCompleted(event: CalendarEvent, date: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (typeof event.isCompleted === "boolean") {
    return event.isCompleted;
  }
  return date < today || parseISO(event.endAt) <= new Date();
}

function buildWasteRiskSegments(gaps: TimeGap[]) {
  return gaps
    .filter((gap) => gap.category && wasteCategories.has(gap.category) && gap.durationMinutes >= 45)
    .map((gap) => `${formatTimeRange(gap.startTime, gap.endTime)} ${timeGapCategoryLabels[gap.category!]} ${formatMinutes(gap.durationMinutes)}`);
}

function buildAiFeedback(
  score: number,
  totalObservedMinutes: number,
  minutesByCategory: Record<TimeGapCategory, number>,
  unrecordedGapMinutes: number
) {
  const movingRatio = Math.round((minutesByCategory.moving / totalObservedMinutes) * 100);
  const parts = [`오늘의 시간 사용 점수는 ${score}점입니다.`];
  if (minutesByCategory.moving >= 120 || movingRatio >= 20) {
    parts.push(`이동 시간이 ${formatMinutes(minutesByCategory.moving)}으로 긴 편이라, 이동 중 듣기 자료나 단어 복습처럼 가벼운 루틴을 붙이기 좋습니다.`);
  }
  if (minutesByCategory.meal >= 150) {
    parts.push(`식사 관련 시간이 ${formatMinutes(minutesByCategory.meal)}로 길게 기록되어 내일은 식사 후 바로 시작할 작은 행동을 정해두면 좋아요.`);
  }
  if (minutesByCategory.sns_video + minutesByCategory.game >= 90) {
    parts.push(`SNS/영상/게임 시간이 ${formatMinutes(minutesByCategory.sns_video + minutesByCategory.game)}로 길어졌습니다. 내일은 30분 단위로 끊어보는 제안을 드릴게요.`);
  }
  if (unrecordedGapMinutes >= 60) {
    parts.push(`기록되지 않은 빈 시간이 ${formatMinutes(unrecordedGapMinutes)} 있어요. 내일부터 1시간 이상 비는 구간만이라도 기록하면 분석 정확도가 올라갑니다.`);
  }
  if (parts.length === 1) {
    parts.push("기록된 일정과 빈 시간의 균형이 안정적입니다. 내일도 중요한 일정 하나를 먼저 처리하는 흐름을 유지해보세요.");
  }
  return parts.join(" ");
}

function buildStrengths(goalMinutes: number, recordedGapMinutes: number, totalGapMinutes: number, score: number) {
  const strengths = [];
  if (goalMinutes >= 30) {
    strengths.push(`목표와 연결된 시간 ${formatMinutes(goalMinutes)}을 확보했습니다.`);
  }
  if (totalGapMinutes === 0 || recordedGapMinutes / Math.max(totalGapMinutes, 1) >= 0.7) {
    strengths.push("빈 시간 기록 성실도가 높아 내일 계획을 더 정확히 세울 수 있습니다.");
  }
  if (score >= 75) {
    strengths.push("일정 수행과 휴식의 균형이 좋은 편입니다.");
  }
  return strengths.length > 0 ? strengths : ["오늘 하루를 캘린더 기준으로 다시 볼 수 있는 기록을 남겼습니다."];
}

function buildImprovements(minutesByCategory: Record<TimeGapCategory, number>, unrecordedGapMinutes: number, goalMinutes: number) {
  const improvements = [];
  if (minutesByCategory.moving >= 120) {
    improvements.push("이동 시간이 많은 날에는 이동 중 가능한 가벼운 루틴을 미리 준비해보세요.");
  }
  if (minutesByCategory.meal >= 150) {
    improvements.push("식사 시간이 길어진 날은 식사 직후 10분짜리 시작 행동을 붙이면 흐름이 덜 끊깁니다.");
  }
  if (minutesByCategory.sns_video + minutesByCategory.game >= 90) {
    improvements.push("영상/SNS/게임은 휴식 시간으로 인정하되, 30분 단위 제한을 두면 다음 일정으로 돌아오기 쉽습니다.");
  }
  if (goalMinutes < 30) {
    improvements.push("목표와 직접 연결된 시간이 적어 내일은 30분짜리 목표 일정을 먼저 확보하는 것이 좋습니다.");
  }
  if (unrecordedGapMinutes >= 60) {
    improvements.push("1시간 이상 비는 시간만이라도 기록하면 다음 피드백이 더 정확해집니다.");
  }
  return improvements.length > 0 ? improvements : ["내일도 오늘처럼 중요한 일정을 먼저 확인하고 시작해보세요."];
}

function buildTomorrowSuggestions(input: {
  date: string;
  events: CalendarEvent[];
  movingMinutes: number;
  mealMinutes: number;
  wasteRiskMinutes: number;
  goalMinutes: number;
  unrecordedGapMinutes: number;
}) {
  const tomorrow = addDays(parseISO(`${input.date}T00:00:00`), 1);
  const memories = store.listUserMemory();
  const avoidsMorning = memories.some((memory) => memory.memoryType === "rejected_suggestion" && /오전|09:00|9시/.test(memory.memoryContent));
  const prefersMorning = memories.some((memory) => memory.memoryType === "accepted_suggestion" && /오전|09:00|9시/.test(memory.memoryContent));
  const allocator = createTomorrowSlotAllocator(tomorrow, avoidsMorning, prefersMorning);
  const suggestions: Array<{ title: string; action: string; reason: string; startAt: string; endAt: string }> = [];

  if (input.movingMinutes >= 120) {
    const slot = allocator.take(20, ["afternoon", "morning", "evening"]);
    if (slot) {
      suggestions.push({
        title: "이동 중 영어 듣기 20분",
        action: `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 이동 중 영어 듣기 20분 루틴을 추가해보세요.`,
        reason: "오늘 이동 시간이 많아 가벼운 자기개발 루틴을 붙이기 좋습니다.",
        startAt: slot.startAt,
        endAt: slot.endAt
      });
    }
  }
  if (input.wasteRiskMinutes >= 60 || input.goalMinutes < 30) {
    const slot = allocator.take(30, avoidsMorning ? ["afternoon", "evening", "morning"] : ["morning", "afternoon", "evening"]);
    if (slot) {
      suggestions.push({
        title: "목표 관련 집중 30분",
        action: avoidsMorning
          ? `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 목표 관련 집중 시간을 30분 배치해보세요. 최근 오전 제안을 거절한 기록을 반영했습니다.`
          : prefersMorning
            ? `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 목표 관련 집중 시간을 먼저 배치해보세요. 이전 승인 흐름을 반영했습니다.`
            : `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 목표 관련 집중 시간을 30분 배치해보세요.`,
        reason: input.goalMinutes < 30
          ? "오늘 목표 관련 시간이 부족했고, 내일 실제 캘린더의 빈 시간을 확인했습니다."
          : "영상/SNS 이후 목표 일정으로 돌아오는 장치가 필요하고, 내일 실제 빈 시간을 확인했습니다.",
        startAt: slot.startAt,
        endAt: slot.endAt
      });
    }
  }
  if (input.mealMinutes >= 150) {
    const slot = allocator.take(10, ["evening", "afternoon", "morning"]);
    if (slot) {
      suggestions.push({
        title: "식사 후 10분 정리",
        action: `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 식사 후 10분 정리 루틴을 넣어 흐름을 이어가보세요.`,
        reason: "오늘 식사 시간이 길어지며 다른 일정으로 전환하는 시간이 늘어났습니다.",
        startAt: slot.startAt,
        endAt: slot.endAt
      });
    }
  }
  if (input.unrecordedGapMinutes >= 60 && suggestions.length < 3) {
    const slot = allocator.take(30, ["evening", "afternoon", "morning"]);
    if (slot) {
      suggestions.push({
        title: "빈 시간 1줄 기록",
        action: `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 하루 평가와 빈 시간 1줄 기록을 남겨보세요.`,
        reason: "오늘 기록되지 않은 빈 시간이 있어 분석 정확도를 높일 수 있습니다.",
        startAt: slot.startAt,
        endAt: slot.endAt
      });
    }
  }

  if (suggestions.length === 0) {
    const slot = allocator.take(10, ["morning", "afternoon", "evening"]);
    if (slot) {
      suggestions.push({
        title: "내일 첫 일정 10분 준비",
        action: `${formatTimeRange(slot.startAt, slot.endAt)} 빈 시간에 첫 일정 준비 10분을 확보해보세요.`,
        reason: "오늘의 안정적인 흐름을 내일도 이어가기 위한 작은 준비입니다.",
        startAt: slot.startAt,
        endAt: slot.endAt
      });
    }
  }

  return suggestions.slice(0, 3);
}

type SlotPeriod = "morning" | "afternoon" | "evening";

function createTomorrowSlotAllocator(tomorrow: Date, avoidsMorning: boolean, prefersMorning: boolean) {
  const date = format(tomorrow, "yyyy-MM-dd");
  const preferences = store.getPreferences();
  const dayStart = localDateTime(date, preferences.dayStartTime || preferences.workingHours.start || "07:00");
  const dayEnd = localDateTime(date, preferences.dayEndTime || preferences.workingHours.end || "23:00");
  const range = rangeForDay(date);
  const tomorrowEvents = store.listEvents(range.startAt, range.endAt);
  const freeIntervals = findFreeIntervals(dayStart, dayEnd, tomorrowEvents).filter((slot) => differenceInMinutes(slot.end, slot.start) >= 10);
  const used: Array<{ start: Date; end: Date }> = [];

  return {
    take(durationMinutes: number, periods: SlotPeriod[]) {
      const orderedPeriods = prefersMorning && !avoidsMorning
        ? prioritizePeriods(periods, "morning")
        : avoidsMorning
          ? deprioritizePeriod(periods, "morning")
          : periods;

      for (const period of orderedPeriods) {
        const slot = findSlotInPeriod(freeIntervals, used, durationMinutes, period);
        if (slot) {
          used.push({ start: parseISO(slot.startAt), end: parseISO(slot.endAt) });
          return slot;
        }
      }

      const fallback = findSlotInPeriod(freeIntervals, used, durationMinutes);
      if (fallback) {
        used.push({ start: parseISO(fallback.startAt), end: parseISO(fallback.endAt) });
      }
      return fallback;
    }
  };
}

function findFreeIntervals(dayStart: Date, dayEnd: Date, events: CalendarEvent[]) {
  let cursor = dayStart;
  const intervals: Array<{ start: Date; end: Date }> = [];

  events
    .filter((event) => parseISO(event.endAt) > dayStart && parseISO(event.startAt) < dayEnd)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .forEach((event) => {
      const start = maxDate(parseISO(event.startAt), dayStart);
      const end = minDate(parseISO(event.endAt), dayEnd);
      if (differenceInMinutes(start, cursor) >= 10) {
        intervals.push({ start: cursor, end: start });
      }
      if (end > cursor) {
        cursor = end;
      }
    });

  if (differenceInMinutes(dayEnd, cursor) >= 10) {
    intervals.push({ start: cursor, end: dayEnd });
  }
  return intervals;
}

function findSlotInPeriod(
  intervals: Array<{ start: Date; end: Date }>,
  used: Array<{ start: Date; end: Date }>,
  durationMinutes: number,
  period?: SlotPeriod
) {
  const matchingIntervals = intervals.filter((interval) => !period || intervalMatchesPeriod(interval, period));

  for (const interval of matchingIntervals) {
    const start = alignToNextHalfHour(maxDate(interval.start, periodStart(interval.start, period)));
    const latestStart = new Date(interval.end.getTime() - durationMinutes * 60_000);
    let cursor = start;

    while (cursor <= latestStart) {
      const end = new Date(cursor.getTime() + durationMinutes * 60_000);
      if (!used.some((slot) => cursor < slot.end && end > slot.start)) {
        return {
          startAt: cursor.toISOString(),
          endAt: end.toISOString()
        };
      }
      cursor = new Date(cursor.getTime() + 30 * 60_000);
    }
  }

  return undefined;
}

function intervalMatchesPeriod(interval: { start: Date; end: Date }, period: SlotPeriod) {
  const start = periodStart(interval.start, period);
  const end = periodEnd(interval.start, period);
  return interval.start < end && interval.end > start;
}

function periodStart(date: Date, period?: SlotPeriod) {
  if (period === "afternoon") {
    return set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 });
  }
  if (period === "evening") {
    return set(date, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 });
  }
  return set(date, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
}

function periodEnd(date: Date, period: SlotPeriod) {
  if (period === "morning") {
    return set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 });
  }
  if (period === "afternoon") {
    return set(date, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 });
  }
  return set(date, { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 });
}

function alignToNextHalfHour(date: Date) {
  const result = new Date(date);
  result.setSeconds(0, 0);
  const minutes = result.getMinutes();
  if (minutes === 0 || minutes === 30) {
    return result;
  }
  result.setMinutes(minutes < 30 ? 30 : 60);
  return result;
}

function prioritizePeriods(periods: SlotPeriod[], first: SlotPeriod) {
  return [first, ...periods.filter((period) => period !== first)];
}

function deprioritizePeriod(periods: SlotPeriod[], last: SlotPeriod): SlotPeriod[] {
  return [...periods.filter((period) => period !== last), ...(periods.includes(last) ? [last] : [])];
}

function createSuggestionConfirmation(suggestion: { title: string; reason: string; startAt: string; endAt: string }, sourceDate: string) {
  const message = `${formatTimeRange(suggestion.startAt, suggestion.endAt)}에 "${suggestion.title}" 일정을 추가할까요?`;
  const existing = store
    .snapshot()
    .confirmations.find((confirmation) => confirmation.targetType === "time_usage_plan" && confirmation.targetId === sourceDate && confirmation.status === "pending" && confirmation.message === message);
  if (existing) {
    return existing;
  }

  return store.createConfirmation({
    targetType: "time_usage_plan",
    targetId: sourceDate,
    action: "create",
    message,
    payload: {
      sourceDate,
      calendarPayload: {
        title: suggestion.title,
        startAt: suggestion.startAt,
        endAt: suggestion.endAt,
        description: suggestion.reason
      }
    },
    status: "pending"
  });
}

function buildTomorrowPlan(suggestions: Array<{ action: string }>) {
  return {
    morning: suggestions[0]?.action ?? "첫 일정 전에 10분 준비 시간을 확보해보세요.",
    afternoon: suggestions[1]?.action ?? "오후 일정 사이에는 이동 시간과 시작 시간을 한 번 더 확인해보세요.",
    evening: suggestions[2]?.action ?? "저녁에는 오늘의 체크리스트를 짧게 정리해보세요."
  };
}

function updateMemoryFromAnalysis(date: string, minutesByCategory: Record<TimeGapCategory, number>, suggestions: Array<{ action: string }>) {
  const memories: Array<Omit<UserMemory, "id" | "createdAt">> = [];
  const userId = store.getPreferences().userId;
  if (minutesByCategory.moving >= 120) {
    memories.push({ userId, memoryType: "moving_pattern", memoryContent: `이동 시간이 ${formatMinutes(minutesByCategory.moving)}로 길었던 날`, confidence: 0.55, sourceDate: date });
  }
  if (minutesByCategory.sns_video + minutesByCategory.game >= 90) {
    memories.push({ userId, memoryType: "sns_pattern", memoryContent: `SNS/영상/게임 시간이 ${formatMinutes(minutesByCategory.sns_video + minutesByCategory.game)}로 길었던 날`, confidence: 0.55, sourceDate: date });
  }
  if (minutesByCategory.study + minutesByCategory.self_development < 30) {
    memories.push({ userId, memoryType: "goal_shortage", memoryContent: "목표 관련 시간이 30분 미만이었던 날", confidence: 0.6, sourceDate: date });
  }
  suggestions.slice(0, 1).forEach((suggestion) => {
    memories.push({ userId, memoryType: "focus_pattern", memoryContent: `다음 추천 후보: ${suggestion.action}`, confidence: 0.45, sourceDate: date });
  });
  memories.forEach((memory) => store.addUserMemory(memory));
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

function localDateTime(date: string, time: string) {
  return parseISO(`${date}T${time}:00`);
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}
