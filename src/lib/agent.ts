import { differenceInMinutes, parseISO } from "date-fns";
import { store } from "./store";
import type {
  ActionItem,
  CalendarEvent,
  CandidateDetection,
  ChatResponse,
  DailyFortune,
  ScheduleCandidate,
  SourceType
} from "./types";
import {
  addMinutesIso,
  buildDateTime,
  formatKoreanDateTime,
  formatTimeRange,
  getDateFromKoreanText,
  getTimeFromKoreanText,
  getTimeRangeFromKoreanText,
  nowIso,
  rangeForDay,
  suggestAlternatives,
  toDateInput
} from "./time";

const affirmativePattern = /^(응|그래|좋아|추가해줘|등록해줘|진행해|맞아|확인|네|예|ㅇㅇ|추가|등록|승인)$/;
const rejectPattern = /^(아니|취소해|등록하지마|보류해|나중에|무시|취소|거절)$/;
const alternativeSelectionPattern = /(\d+)\s*번(?:으로)?\s*(?:해줘|할게|선택|진행|등록|추가)?/;

export const TODAY_FORTUNE_PROMPT = `너는 하루톡톡의 오늘의 운세 생성 Agent다.

너의 역할은 사용자의 생일 정보와 오늘 일정을 참고해, 사용자가 하루를 긍정적으로 시작할 수 있도록 가볍고 실용적인 운세를 생성하는 것이다.

단, 운세는 절대 단정적이거나 불안감을 조성하면 안 된다.
운세는 재미와 동기부여 목적이며, 실제 의사결정을 강요하지 않는다.

입력 정보:
- 사용자 닉네임
- 생년월일
- 양력/음력 여부
- 오늘 날짜
- 오늘 일정
- 중요한 일정
- D-Day 일정
- 최근 완료율
- 어제 하루 평가
- 연속 달성 기록

출력 형식:
# 오늘의 톡톡 운세

## 한 줄 운세
*

## 오늘의 추천 행동
*

## 주의할 점
*

## 행운의 카테고리
*

## 오늘의 작은 미션
*

## 일정별 코멘트
*

규칙:
1. 한국어로 작성한다.
2. 따뜻하지만 과장되지 않게 작성한다.
3. 사용자의 일정을 참고해 현실적인 조언을 제공한다.
4. 불안감을 주는 표현은 사용하지 않는다.
5. "반드시", "무조건", "큰일 난다" 같은 표현은 피한다.
6. 운세는 재미와 동기부여 목적임을 전제로 한다.
7. 하루 일정 관리에 도움이 되는 방향으로 작성한다.
8. 사용자의 목표와 반복 일정이 있다면 그것과 연결한다.`;

function normalizeShortReply(message: string) {
  return message.replace(/\s+/g, "").replace(/[.!?。]+$/g, "");
}

export async function handleChat(input: {
  message: string;
  timezone?: string;
  clientNow?: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<ChatResponse> {
  const message = input.message.trim();
  const normalizedReply = normalizeShortReply(message);
  const history = input.history ?? [];

  // 이전 대화에서 AI가 확인 요청을 한 것이 있는지 파악
  const lastAgentMessage = [...history].reverse().find((h) => h.role === "agent")?.content ?? "";
  const lastUserMessage = [...history].reverse().find((h) => h.role === "user")?.content ?? "";
  const hasPendingInHistory = /캘린더에 추가할까요|일정을 |삭제할까요|변경할까요|진행할까요/.test(lastAgentMessage);

  if (affirmativePattern.test(normalizedReply)) {
    return approveLatestPendingConfirmation();
  }

  if (rejectPattern.test(normalizedReply)) {
    return rejectLatestPendingConfirmation();
  }

  const alternativeSelection = normalizedReply.match(alternativeSelectionPattern);
  if (alternativeSelection) {
    return confirmLatestAlternative(Number(alternativeSelection[1]));
  }

  if (/^(이번호|그번호|이번호로해줘|그번호로해줘|해줘|그걸로|그거로|그걸로해줘|그거로해줘)$/.test(normalizedReply)) {
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: "몇 번 시간으로 등록할지 알려주세요. 예: '1번으로 해줘'",
      requiresConfirmation: false
    };
  }

  if (/아니라|아냐|아니고|말고/.test(message) && /대체 가능한 시간|일정 후보|이미/.test(lastAgentMessage)) {
    return {
      intent: "CLARIFICATION_REQUIRED",
      reply: "좋아요. 그럼 원하는 날짜와 시간을 다시 알려주세요. 예: '모레 오후 3시에 회의 잡아줘'",
      requiresConfirmation: false
    };
  }

  // 이전 대화에서 일정 제안이 있었고 사용자가 다른 시간/날짜를 언급한 경우 (맥락 연속)
  if (hasPendingInHistory && /[0-9]시|오전|오후|내일|모레|다음\s*주|이번\s*주/.test(message) && message.length < 30) {
    // 이전 메시지에서 일정 제목 추출 후 새 시간으로 재생성
    const titleFromHistory = lastUserMessage.match(/(캡스톤|회의|면담|약속|스터디|운동|발표|면접)/)?.[1];
    const combinedMessage = titleFromHistory ? `${titleFromHistory} ${message}` : message;
    return requestCreateEvent(combinedMessage, "chat", input.clientNow);
  }

  if (/회의록|요약/.test(message) && message.length > 80) {
    const note = summarizeMeeting({
      title: "회의 메모",
      transcript: message
    });
    return {
      intent: "SUMMARIZE_MEETING",
      reply: `회의록을 요약했습니다. Action Item ${note.actionItems.length}개를 찾았습니다.`,
      requiresConfirmation: false
    };
  }

  if (/피드백|하루\s*정리|오늘\s*정리/.test(message)) {
    const review = generateDailyReview({ reviewDate: store.todayText() });
    return {
      intent: "DAILY_REVIEW",
      reply: `${review.summary}\n\n내일 추천 우선순위\n1. ${review.tomorrowPriorities[0]}\n2. ${review.tomorrowPriorities[1]}\n3. ${review.tomorrowPriorities[2]}`,
      requiresConfirmation: false
    };
  }

  if (/삭제|취소/.test(message) && /일정|회의|운동|면담|작업/.test(message)) {
    return requestDeleteEvent(message);
  }

  if (/미뤄|변경|수정|옮겨/.test(message)) {
    return requestUpdateEvent(message, input.clientNow);
  }

  if (/일정.*(알려|조회|정리)|비어\s*있는|빈\s*시간/.test(message)) {
    return searchEvents(message, input.clientNow);
  }

  if (/복잡|우선순위|정리해줘|재정리/.test(message)) {
    return reorganizePriority();
  }

  if (/잡아|추가|등록|회의|면담|약속|스터디|운동/.test(message)) {
    return requestCreateEvent(message, "chat", input.clientNow);
  }

  // 이전 대화 맥락이 있을 경우 안내 메시지 개선
  if (history.length > 0 && lastAgentMessage) {
    return {
      intent: "GENERAL_ADVICE",
      reply: "이해하지 못했어요. 일정 추가/조회/수정/삭제, 또는 '응'/'취소' 로 이전 요청을 승인하거나 취소할 수 있어요.",
      requiresConfirmation: false
    };
  }

  return {
    intent: "GENERAL_ADVICE",
    reply: "일정 생성, 조회, 수정, 삭제나 회의록 요약을 도와드릴 수 있어요. 예: '내일 오후 3시에 캡스톤 회의 잡아줘'",
    requiresConfirmation: false
  };
}

export function detectScheduleFromText(input: {
  text: string;
  source: SourceType;
  clientNow?: string;
  defaultTitle?: string;
}): CandidateDetection {
  const text = input.text.trim();
  const date = getDateFromKoreanText(text, input.clientNow);
  const timeRange = getTimeRangeFromKoreanText(text);
  const time = timeRange?.start ?? getTimeFromKoreanText(text);
  const title = extractTitle(text, input.defaultTitle);
  const location = extractLocation(text);
  const attendees = extractAttendees(text);

  if (!date && !time) {
    return {
      isScheduleCandidate: false,
      attendees: [],
      confidence: 0.2,
      reason: "날짜와 시간이 모두 없습니다."
    };
  }

  if (!date || !time || !title) {
    return {
      isScheduleCandidate: Boolean(date || time),
      title,
      attendees,
      location,
      confidence: 0.58,
      reason: "일정 가능성은 있지만 필수 정보가 부족합니다."
    };
  }

  const startAt = buildDateTime(date, time.hour, time.minute).toISOString();
  const defaultMinutes = store.getPreferences().defaultEventDurationMinutes;
  const endAt = timeRange
    ? buildDateTime(date, timeRange.end.hour, timeRange.end.minute).toISOString()
    : addMinutesIso(startAt, defaultMinutes);
  const confidence = time.ambiguous || timeRange?.ambiguous ? 0.78 : location || attendees.length > 0 ? 0.94 : 0.88;

  return {
    isScheduleCandidate: true,
    title,
    startAt,
    endAt,
    location,
    attendees,
    confidence,
    reason: "날짜, 시간, 제목을 추출했습니다."
  };
}

export function createScheduleCandidateFromDetection(input: {
  detection: CandidateDetection;
  source: SourceType;
  sourceDetail?: string;
  snippet?: string;
}) {
  if (!input.detection.isScheduleCandidate || !input.detection.startAt || !input.detection.endAt || !input.detection.title) {
    return {
      candidate: undefined,
      confirmation: undefined,
      message: "일정 후보로 저장하기에는 정보가 부족합니다."
    };
  }

  const conflicts = store.findConflicts(input.detection.startAt, input.detection.endAt);
  const durationMinutes = differenceInMinutes(parseISO(input.detection.endAt), parseISO(input.detection.startAt));
  const alternatives = conflicts.length > 0 ? suggestAlternatives(input.detection.startAt, durationMinutes, store.listEvents()) : [];
  const status = conflicts.length > 0 ? "conflict" : input.detection.confidence >= 0.7 ? "pending" : "held";

  const candidate = store.createCandidate({
    source: input.source,
    sourceDetail: input.sourceDetail,
    title: input.detection.title,
    date: toDateInput(parseISO(input.detection.startAt)),
    startAt: input.detection.startAt,
    endAt: input.detection.endAt,
    location: input.detection.location,
    attendees: input.detection.attendees,
    description: input.detection.reason,
    confidence: input.detection.confidence,
    status,
    conflictEventIds: conflicts.map((event) => event.eventId),
    alternatives,
    snippet: input.snippet
  });

  const confirmation =
    status === "pending"
      ? store.createConfirmation({
          targetType: "schedule_candidate",
          targetId: candidate.candidateId,
          action: "create",
          message: makeCandidateMessage(candidate),
          status: "pending"
        })
      : undefined;

  return {
    candidate,
    confirmation,
    message: confirmation?.message ?? makeConflictOrHeldMessage(candidate, conflicts)
  };
}

export function confirmCandidate(candidateId: string, selectedStartAt?: string, selectedEndAt?: string) {
  const candidate = store.getCandidate(candidateId);
  if (!candidate) {
    return { status: 404, body: { message: "일정 후보를 찾을 수 없습니다." } };
  }

  const startAt = selectedStartAt ?? candidate.startAt;
  const endAt = selectedEndAt ?? candidate.endAt;
  const conflicts = store.findConflicts(startAt, endAt);

  if (conflicts.length > 0) {
    const alternatives = suggestAlternatives(startAt, differenceInMinutes(parseISO(endAt), parseISO(startAt)), store.listEvents());
    store.updateCandidate(candidateId, {
      status: "conflict",
      conflictEventIds: conflicts.map((event) => event.eventId),
      alternatives
    });
    return {
      status: 409,
      body: {
        message: `해당 시간에는 '${conflicts[0].title}' 일정이 있습니다.`,
        conflicts,
        alternatives
      }
    };
  }

  const event = store.createEvent({
    title: candidate.title,
    startAt,
    endAt,
    location: candidate.location,
    attendees: candidate.attendees,
    isImportant: /중요|시험|면접|발표|제출|마감/.test(candidate.title),
    description: candidate.description,
    source: candidate.source
  });

  store.updateCandidate(candidateId, {
    status: "confirmed",
    startAt,
    endAt,
    date: toDateInput(parseISO(startAt)),
    createdCalendarEventId: event.eventId
  });

  return {
    status: 200,
    body: {
      candidateId,
      eventId: event.eventId,
      status: "confirmed",
      message: "일정을 캘린더에 추가했습니다.",
      event
    }
  };
}

export function rejectCandidate(candidateId: string, reason = "사용자가 거절했습니다.") {
  const candidate = store.updateCandidate(candidateId, { status: "rejected", description: reason });
  if (!candidate) {
    return { status: 404, body: { message: "일정 후보를 찾을 수 없습니다." } };
  }
  return {
    status: 200,
    body: {
      candidateId,
      status: "rejected"
    }
  };
}

export function summarizeMeeting(input: { title: string; transcript: string }) {
  const sentences = splitSentences(input.transcript);
  const decisions = sentences.filter((sentence) => /(결정|하기로|확정|진행하기로|채택)/.test(sentence)).slice(0, 5);
  const risks = sentences.filter((sentence) => /(리스크|문제|미정|불확실|어렵|지연|확인 필요)/.test(sentence)).slice(0, 5);
  const actionItems = extractActionItemsFromText(input.transcript);
  const discussions = sentences.filter((sentence) => !decisions.includes(sentence) && !risks.includes(sentence)).slice(0, 5);
  const summary = sentences.slice(0, 2).join(" ") || "제공된 회의 내용에서 핵심 논의를 정리했습니다.";

  return store.createMeetingNote({
    title: input.title || "회의 메모",
    transcript: input.transcript,
    summary,
    discussions,
    decisions,
    risks,
    actionItems
  });
}

export function extractActionItemsFromText(text: string): ActionItem[] {
  const sentences = splitSentences(text);
  const items = sentences.filter((sentence) => /(해야|부탁|작성|준비|공유|확인|마감|까지|진행)/.test(sentence));

  return items.slice(0, 8).map((sentence) => {
    const assigneeMatch = sentence.match(/^([가-힣]{2,4})[이가은는]\s/);
    const dueDate = getDateFromKoreanText(sentence);
    const dueTime = getTimeFromKoreanText(sentence);
    const dueAt = dueDate ? buildDateTime(dueDate, dueTime?.hour ?? 23, dueTime?.minute ?? 59).toISOString() : undefined;
    return {
      actionItemId: `act_${Math.random().toString(36).slice(2, 8)}`,
      assignee: assigneeMatch?.[1],
      task: cleanupSentence(sentence),
      dueAt,
      status: "open",
      calendarNeeded: Boolean(dueAt),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  });
}

export function generateDailyReview(input: { reviewDate: string }) {
  const range = rangeForDay(input.reviewDate);
  const events = store.listEvents(range.startAt, range.endAt);
  const imported = events.filter((event) => event.source === "gmail" || event.source === "slack");
  const meetingMinutes = events
    .filter((event) => /회의|미팅|면담/.test(event.title))
    .reduce((sum, event) => sum + differenceInMinutes(parseISO(event.endAt), parseISO(event.startAt)), 0);
  const focusMinutes = events
    .filter((event) => /작업|집중|공부|개발/.test(event.title))
    .reduce((sum, event) => sum + differenceInMinutes(parseISO(event.endAt), parseISO(event.startAt)), 0);

  return store.createDailyReview({
    reviewDate: input.reviewDate,
    summary:
      events.length > 0
        ? `오늘은 ${events.length}개의 일정이 있었고, 회의 ${meetingMinutes}분과 집중 업무 ${focusMinutes}분이 기록되었습니다.`
        : "오늘 등록된 일정이 적어 여유를 확보하기 좋은 하루입니다.",
    completedItems: events.slice(0, 2).map((event) => event.title),
    incompleteItems: events.slice(2, 4).map((event) => `${event.title} 후속 정리`),
    timeAnalysis: [
      `회의 시간: ${meetingMinutes}분`,
      `집중 업무 시간: ${focusMinutes}분`,
      events.length >= 4 ? "일정 밀도가 높아 완충 시간이 부족할 수 있습니다." : "일정 사이 완충 시간을 확보하기 좋은 구성입니다."
    ],
    importedEvents: imported.map((event) => event.title),
    strengths: ["중요한 일정을 캘린더 기준으로 확인할 수 있었습니다.", "일정 후보를 확인 후 등록하는 안전한 흐름을 유지했습니다."],
    improvements: events.length >= 4 ? ["연속 일정 사이에 15분 이상의 정리 시간을 두면 좋습니다."] : ["내일 우선순위를 미리 3개만 정하면 실행력이 좋아집니다."],
    growthPoints: ["하루를 일정 단위가 아니라 에너지 단위로도 돌아보면 다음 계획의 정확도가 올라갑니다."],
    tomorrowPriorities: buildTomorrowPriorities(events)
  });
}

export function generateTodayFortune(input: { fortuneDate: string; force?: boolean }): DailyFortune {
  const preferences = store.getPreferences();
  const existing = store.getDailyFortune(input.fortuneDate);
  if (existing && !input.force) {
    return existing;
  }

  const range = rangeForDay(input.fortuneDate);
  const events = store.listEvents(range.startAt, range.endAt);
  const recentReview = store.snapshot().dailyReviews.find((review) => review.reviewDate < input.fortuneDate);
  const previousFortunes = store.listDailyFortunes();
  const latestFeedback = previousFortunes.find((fortune) => fortune.userFeedback)?.userFeedback;
  const category = pickLuckyCategory(events, preferences.birthDate);
  const denseAfternoon = events.filter((event) => {
    const hour = parseISO(event.startAt).getHours();
    return hour >= 12 && hour < 18;
  }).length >= 2;
  const firstEvent = events[0];
  const importantEvent = events.find((event) => /회의|면담|발표|시험|면접|제출|캡스톤/.test(event.title));
  const routineEvent = events.find((event) => /공부|영어|운동|루틴|독서|자격증/.test(event.title));
  const nickname = preferences.nickname?.trim();
  const greetingName = nickname ? `${nickname}님, ` : "";
  const feedbackTone =
    latestFeedback === "not_helpful"
      ? "오늘은 더 짧고 실행하기 쉬운 조언 위주로 정리했어요."
      : latestFeedback === "helpful"
        ? "어제 도움이 되었던 흐름처럼 오늘도 일정과 바로 연결해볼게요."
        : "가볍게 참고할 수 있는 하루 힌트로 봐주세요.";

  const summary =
    events.length === 0
      ? `${greetingName}오늘은 여백을 잘 쓰면 컨디션을 정리하기 좋은 하루예요.`
      : `${greetingName}오늘은 ${events.length}개의 일정 흐름을 차분히 이어가면 작은 성취가 쌓이는 하루예요.`;
  const recommendedAction = routineEvent
    ? `먼저 "${routineEvent.title}" 일정을 기준으로 하루 리듬을 잡아보세요.`
    : firstEvent
      ? `첫 일정인 "${firstEvent.title}" 전에 10분만 준비 시간을 두면 시작이 편해져요.`
      : "가장 작은 할 일 하나를 정해서 오전에 먼저 끝내보세요.";
  const caution = denseAfternoon
    ? "오후 일정이 이어져 있으니 이동 시간과 시작 시간을 한 번 더 확인해보세요."
    : importantEvent
      ? `"${importantEvent.title}" 전후로 메모를 남겨두면 놓치는 내용을 줄일 수 있어요.`
      : "오늘은 무리하게 일정을 늘리기보다 이미 정한 일을 안정적으로 마무리해보세요.";
  const mission = importantEvent
    ? `"${importantEvent.title}"에 들어가기 전 오늘 꼭 확인할 것 1가지를 적어보세요.`
    : routineEvent
      ? `"${routineEvent.title}"을 완료한 뒤 캘린더에서 체크해보세요.`
      : "오늘 일정 중 하나를 고르고, 끝난 뒤 한 줄 메모를 남겨보세요.";
  const scheduleComments = events.slice(0, 6).map((event) => ({
    eventId: event.eventId,
    title: event.title,
    comment: buildScheduleFortuneComment(event)
  }));
  const aiFortuneText = [
    "# 오늘의 톡톡 운세",
    "",
    "## 전체 흐름",
    `${summary} ${feedbackTone}`,
    "",
    "## 오전",
    events.some((event) => parseISO(event.startAt).getHours() < 12)
      ? "오전 일정은 하루의 속도를 정하는 역할을 해요. 시작 전 필요한 자료나 준비물을 먼저 확인해보세요."
      : "오전에는 가벼운 정리나 준비 작업으로 하루의 방향을 잡기 좋아요.",
    "",
    "## 오후",
    denseAfternoon
      ? "오후에는 일정이 촘촘할 수 있어요. 약속 시간과 이동 시간을 한 번 더 확인하면 흐름이 편안해져요."
      : "오후에는 중요한 일을 하나만 분명히 잡고 처리해보세요.",
    "",
    "## 저녁",
    events.some((event) => parseISO(event.startAt).getHours() >= 18)
      ? "저녁 일정은 하루 균형을 맞추는 시간이에요. 마무리 후 짧게 기록을 남기면 내일 계획이 쉬워져요."
      : "저녁에는 새로운 일을 늘리기보다 오늘 한 일을 정리하는 쪽이 잘 맞아요.",
    "",
    "## 오늘의 작은 미션",
    mission
  ].join("\n");

  return store.upsertDailyFortune({
    userId: preferences.userId,
    fortuneDate: input.fortuneDate,
    summary,
    recommendedAction,
    caution,
    luckyCategory: category,
    mission,
    aiFortuneText,
    morning: events.some((event) => parseISO(event.startAt).getHours() < 12)
      ? "오전 일정은 먼저 준비물을 확인하고 시작해보세요."
      : "오전에는 가장 작은 준비 작업부터 시작해보세요.",
    afternoon: denseAfternoon
      ? "오후에는 일정 사이 완충 시간을 의식해보세요."
      : "오후에는 중요한 일 하나에 집중해보세요.",
    evening: events.some((event) => parseISO(event.startAt).getHours() >= 18)
      ? "저녁 일정 후 짧은 회고를 남겨보세요."
      : "저녁에는 오늘의 체크리스트를 정리해보세요.",
    scheduleComments,
    userFeedback: existing?.userFeedback ?? recentReview?.fortuneFeedback
  });
}

export function createCandidateFromActionItem(actionItem: ActionItem) {
  if (!actionItem.dueAt) {
    return undefined;
  }
  const due = parseISO(actionItem.dueAt);
  const startAt = new Date(due.getTime() - 60 * 60_000).toISOString();
  const detection: CandidateDetection = {
    isScheduleCandidate: true,
    title: actionItem.task,
    startAt,
    endAt: actionItem.dueAt,
    attendees: actionItem.assignee ? [actionItem.assignee] : [],
    confidence: 0.82,
    reason: "회의 Action Item의 마감일을 일정 후보로 전환했습니다."
  };
  return createScheduleCandidateFromDetection({
    detection,
    source: "meeting_note",
    sourceDetail: actionItem.meetingNoteId,
    snippet: actionItem.task
  });
}

function requestCreateEvent(message: string, source: SourceType, clientNow?: string): ChatResponse {
  const detection = detectScheduleFromText({ text: message, source, clientNow });
  if (!detection.startAt || !detection.endAt || !detection.title || detection.confidence < 0.5) {
    return {
      intent: "CLARIFICATION_REQUIRED",
      reply: "일정을 추가하려면 제목, 날짜, 시작 시간이 필요합니다. 예: '내일 오후 3시에 캡스톤 회의 잡아줘'",
      requiresConfirmation: false
    };
  }

  const result = createScheduleCandidateFromDetection({
    detection,
    source,
    sourceDetail: "사용자 채팅",
    snippet: message
  });

  return {
    intent: "CREATE_EVENT",
    reply: result.message,
    requiresConfirmation: Boolean(result.confirmation),
    confirmationRequestId: result.confirmation?.confirmationRequestId,
    candidate: result.candidate,
    alternatives: result.candidate?.alternatives
  };
}

function searchEvents(message: string, clientNow?: string): ChatResponse {
  const date = getDateFromKoreanText(message, clientNow) ?? new Date();
  const range = rangeForDay(toDateInput(date));
  const events = store.listEvents(range.startAt, range.endAt);

  if (/비어|빈\s*시간/.test(message)) {
    return {
      intent: "SEARCH_EVENT",
      reply: makeFreeTimeReply(events),
      requiresConfirmation: false,
      events
    };
  }

  return {
    intent: "SEARCH_EVENT",
    reply:
      events.length > 0
        ? `일정입니다.\n${events.map((event, index) => `${index + 1}. ${formatTimeRange(event.startAt, event.endAt)} ${event.title}`).join("\n")}`
        : "해당 날짜에 등록된 일정이 없습니다.",
    requiresConfirmation: false,
    events
  };
}

function requestUpdateEvent(message: string, clientNow?: string): ChatResponse {
  const detection = detectScheduleFromText({ text: message, source: "chat", clientNow });
  const targetKeyword = extractTargetKeyword(message);
  const candidates = store.findEventsByTitle(targetKeyword);

  if (candidates.length === 0) {
    return {
      intent: "CLARIFICATION_REQUIRED",
      reply: "수정할 일정을 찾지 못했습니다. 일정 제목을 조금 더 정확히 알려주세요.",
      requiresConfirmation: false
    };
  }

  if (!detection.startAt || !detection.endAt) {
    return {
      intent: "CLARIFICATION_REQUIRED",
      reply: "어느 시간으로 변경할지 알려주세요. 예: '내일 회의 오후 5시로 미뤄줘'",
      requiresConfirmation: false
    };
  }

  const event = candidates[0];
  const conflicts = store.findConflicts(detection.startAt, detection.endAt, event.eventId);
  if (conflicts.length > 0) {
    return {
      intent: "UPDATE_EVENT",
      reply: `변경하려는 시간에는 '${conflicts[0].title}' 일정이 있습니다. 다른 시간을 선택해주세요.`,
      requiresConfirmation: false,
      alternatives: suggestAlternatives(detection.startAt, 60, store.listEvents())
    };
  }

  const confirmation = store.createConfirmation({
    targetType: "calendar_event",
    targetId: event.eventId,
    action: "update",
    message: `'${event.title}' 일정을 ${formatKoreanDateTime(detection.startAt, detection.endAt)}로 변경할까요?`,
    payload: {
      startAt: detection.startAt,
      endAt: detection.endAt
    },
    status: "pending"
  });

  return {
    intent: "UPDATE_EVENT",
    reply: confirmation.message,
    requiresConfirmation: true,
    confirmationRequestId: confirmation.confirmationRequestId
  };
}

function requestDeleteEvent(message: string): ChatResponse {
  const targetKeyword = extractTargetKeyword(message);
  const candidates = store.findEventsByTitle(targetKeyword);
  if (candidates.length === 0) {
    return {
      intent: "CLARIFICATION_REQUIRED",
      reply: "삭제할 일정을 찾지 못했습니다. 일정 제목을 조금 더 정확히 알려주세요.",
      requiresConfirmation: false
    };
  }

  const event = candidates[0];
  const confirmation = store.createConfirmation({
    targetType: "calendar_event",
    targetId: event.eventId,
    action: "delete",
    message: `'${event.title}' 일정을 삭제할까요?`,
    status: "pending"
  });

  return {
    intent: "DELETE_EVENT",
    reply: confirmation.message,
    requiresConfirmation: true,
    confirmationRequestId: confirmation.confirmationRequestId
  };
}

function approveLatestPendingConfirmation(): ChatResponse {
  const confirmation = [...store.snapshot().confirmations].reverse().find((item) => item.status === "pending");
  if (!confirmation) {
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: "현재 승인 대기 중인 요청이 없습니다.",
      requiresConfirmation: false
    };
  }

  store.approveConfirmation(confirmation.confirmationRequestId);

  if (confirmation.targetType === "schedule_candidate") {
    const result = confirmCandidate(confirmation.targetId);
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: "message" in result.body ? String(result.body.message) : "처리했습니다.",
      requiresConfirmation: false
    };
  }

  if (confirmation.action === "update") {
    const event = store.updateEvent(confirmation.targetId, confirmation.payload as Partial<CalendarEvent>);
    return {
      intent: "UPDATE_EVENT",
      reply: event ? "일정을 수정했습니다." : "수정할 일정을 찾지 못했습니다.",
      requiresConfirmation: false
    };
  }

  if (confirmation.action === "delete") {
    const deleted = store.deleteEvent(confirmation.targetId);
    return {
      intent: "DELETE_EVENT",
      reply: deleted ? "일정을 삭제했습니다." : "삭제할 일정을 찾지 못했습니다.",
      requiresConfirmation: false
    };
  }

  return {
    intent: "CONFIRM_SCHEDULE_CANDIDATE",
    reply: "요청을 처리했습니다.",
    requiresConfirmation: false
  };
}

function confirmLatestAlternative(selectionNumber: number): ChatResponse {
  const candidate = [...store.snapshot().candidates]
    .reverse()
    .find((item) => item.status === "conflict" && item.alternatives.length > 0);

  if (!candidate) {
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: "선택할 수 있는 대체 시간이 없습니다. 먼저 일정을 요청해 주세요.",
      requiresConfirmation: false
    };
  }

  const slot = candidate.alternatives[selectionNumber - 1];
  if (!slot) {
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: `대체 시간은 1번부터 ${candidate.alternatives.length}번까지 선택할 수 있어요.`,
      requiresConfirmation: false
    };
  }

  const result = confirmCandidate(candidate.candidateId, slot.startAt, slot.endAt);
  if (result.status >= 400) {
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: "message" in result.body ? String(result.body.message) : "선택한 시간으로 등록하지 못했습니다.",
      requiresConfirmation: false,
      alternatives: "alternatives" in result.body ? result.body.alternatives : undefined
    };
  }

  return {
    intent: "CONFIRM_SCHEDULE_CANDIDATE",
    reply: `"${candidate.title}" 일정을 ${slot.label}에 추가했습니다.`,
    requiresConfirmation: false
  };
}

function rejectLatestPendingConfirmation(): ChatResponse {
  const confirmation = [...store.snapshot().confirmations].reverse().find((item) => item.status === "pending");
  if (!confirmation) {
    return {
      intent: "CONFIRM_SCHEDULE_CANDIDATE",
      reply: "현재 거절할 요청이 없습니다.",
      requiresConfirmation: false
    };
  }
  store.rejectConfirmation(confirmation.confirmationRequestId);
  if (confirmation.targetType === "schedule_candidate") {
    store.updateCandidate(confirmation.targetId, { status: "rejected" });
  }
  return {
    intent: "CONFIRM_SCHEDULE_CANDIDATE",
    reply: "요청을 취소했습니다.",
    requiresConfirmation: false
  };
}

function reorganizePriority(): ChatResponse {
  const today = store.todayText();
  const range = rangeForDay(today);
  const events = store.listEvents(range.startAt, range.endAt);
  const fixed = events.filter((event) => /회의|면담|약속|미팅/.test(event.title));
  const focus = events.filter((event) => /작업|집중|개발|공부/.test(event.title));
  const rest = events.filter((event) => !fixed.includes(event) && !focus.includes(event));

  return {
    intent: "PRIORITY_REORGANIZATION",
    reply: [
      "오늘 일정 우선순위를 이렇게 정리해볼 수 있습니다.",
      ...fixed.map((event, index) => `${index + 1}. 고정 일정: ${event.title} (${formatTimeRange(event.startAt, event.endAt)})`),
      ...focus.map((event, index) => `${fixed.length + index + 1}. 집중 업무: ${event.title}`),
      ...rest.map((event, index) => `${fixed.length + focus.length + index + 1}. 선택 일정: ${event.title}`),
      "일정 변경은 승인 후에만 실행합니다."
    ].join("\n"),
    requiresConfirmation: false,
    events
  };
}

function makeCandidateMessage(candidate: ScheduleCandidate) {
  return `일정 후보를 발견했습니다.

일정명: ${candidate.title}
시간: ${formatKoreanDateTime(candidate.startAt, candidate.endAt)}
장소: ${candidate.location ?? "미정"}

캘린더에 추가할까요?`;
}

function makeConflictOrHeldMessage(candidate: ScheduleCandidate, conflicts: CalendarEvent[]) {
  if (candidate.status === "conflict") {
    return `'${candidate.title}' 일정 후보를 발견했지만, 해당 시간에는 이미 '${conflicts[0]?.title}' 일정이 있습니다.

대체 가능한 시간:
${candidate.alternatives.map((slot, index) => `${index + 1}. ${slot.label}`).join("\n") || "추천 가능한 시간이 없습니다."}`;
  }
  return `'${candidate.title}' 후보를 보류 목록에 저장했습니다. 날짜 또는 시간이 더 명확해지면 캘린더에 추가할 수 있습니다.`;
}

function pickLuckyCategory(events: CalendarEvent[], birthDate?: string) {
  const categories = [
    { label: "공부 / 자격증", pattern: /공부|영어|자격증|시험|독서|학습/ },
    { label: "프로젝트 / 협업", pattern: /회의|프로젝트|캡스톤|발표|개발|기획/ },
    { label: "운동 / 건강", pattern: /운동|러닝|런닝|헬스|산책|요가/ },
    { label: "정리 / 루틴", pattern: /정리|루틴|청소|계획|회고/ },
    { label: "관계 / 약속", pattern: /약속|식사|친구|가족|면담|상담/ }
  ];
  const matched = categories.find((category) => events.some((event) => category.pattern.test(event.title)));
  if (matched) {
    return matched.label;
  }
  const seed = birthDate ? Number(birthDate.replace(/\D/g, "").slice(-2)) || 0 : events.length;
  return categories[seed % categories.length].label;
}

function buildScheduleFortuneComment(event: CalendarEvent) {
  if (/공부|영어|자격증|시험|독서|학습/.test(event.title)) {
    return "집중력이 필요한 일정이에요. 시작 전에 목표 분량을 작게 정해두면 좋아요.";
  }
  if (/회의|프로젝트|캡스톤|발표|개발|기획/.test(event.title)) {
    return "소통이 중요한 일정이에요. 핵심 의견을 짧게 정리해두면 흐름이 좋아져요.";
  }
  if (/운동|러닝|런닝|헬스|산책|요가/.test(event.title)) {
    return "하루 균형을 잡아주는 일정이에요. 무리하지 않는 선에서 완료해보세요.";
  }
  if (/약속|식사|친구|가족|면담|상담/.test(event.title)) {
    return "사람들과의 약속은 시간을 한 번 더 확인하면 더 편안하게 이어갈 수 있어요.";
  }
  return "일정 전후로 짧은 메모를 남기면 다음 계획이 더 쉬워져요.";
}

function extractTitle(text: string, fallback?: string) {
  const explicit = text.match(/[‘'"]([^‘'"]+)[’'"]/);
  if (explicit) {
    return explicit[1].trim();
  }

  const known = text.match(/(캡스톤 회의|프로젝트 회의|온라인 면접|교수님 면담|팀 회의|스터디|런닝|러닝|운동|발표자료 초안|회의|면담|약속|면접|상담|발표|제출|예약)/);
  if (known) {
    return known[1];
  }

  const cleaned = text
    .replace(/오늘|내일|모레|다음\s*주|이번\s*주/g, "")
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, "")
    .replace(/(오전|오후|아침|저녁|밤)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?\s*(?:부터|에서|~|-)\s*(오전|오후|아침|저녁|밤)?\s*\d{1,2}(?:\s*시)?(?:\s*\d{1,2}\s*분)?\s*(?:까지)?/g, "")
    .replace(/(오전|오후|아침|저녁|밤)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?\s+(오전|오후|아침|저녁|밤)?\s*\d{1,2}(?:\s*시)?(?:\s*\d{1,2}\s*분)?\s*까지/g, "")
    .replace(/오전|오후|아침|저녁|밤/g, "")
    .replace(/\d{1,2}\s*시(\s*\d{1,2}\s*분)?/g, "")
    .replace(/잡아줘|등록해줘|추가해줘|진행|가능|할까요|하자|부탁해|부터|까지|로|에/g, "")
    .trim();

  if (!cleaned || /^(일정|일정잡아|일정잡아줘)$/.test(cleaned.replace(/\s+/g, ""))) {
    return fallback ?? "새 일정";
  }

  return cleaned.length >= 2 ? cleaned.slice(0, 30) : fallback ?? "새 일정";
}

function extractTargetKeyword(text: string) {
  const known = text.match(/(캡스톤 회의|프로젝트 회의|온라인 면접|교수님 면담|팀 회의|스터디|운동|발표자료|회의|면담|약속|면접|상담|발표|제출|예약)/);
  return known?.[1] ?? text.replace(/삭제|취소|미뤄|변경|수정|옮겨|내일|오늘|일정|오전|오후|\d{1,2}시/g, "").trim();
}

function extractLocation(text: string) {
  if (/온라인|줌|zoom|구글\s*밋|meet/i.test(text)) {
    return "온라인";
  }

  const explicitLocation = text.match(
    /(?:장소\s*(?:는|은|:|：)?|위치\s*(?:는|은|:|：)?|곳\s*(?:은|:|：)?)\s*([가-힣A-Za-z0-9\s·.-]+?)(?=\s*(?:에서|으로|로)?\s*(?:일정|운동|회의|약속|잡아|추가|등록|할게|해줘|입니다|이에요|예요|$)|[,.!?])/
  );
  if (explicitLocation?.[1]?.trim()) {
    return explicitLocation[1].trim();
  }

  const location = text.match(/(공원|도서관|연구실|강의실|회의실|카페|학교|회사|온라인)/);
  return location?.[1];
}

function extractAttendees(text: string) {
  const attendees = text.match(/참석자[:：]\s*([가-힣,\s]+)/);
  if (!attendees) {
    const names = text.match(/(우진|민수|지훈|교수님|팀원|현수|지민)/g);
    return Array.from(new Set(names ?? []));
  }
  return attendees[1]
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function splitSentences(text: string) {
  return text
    .split(/[\n.?!。]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function cleanupSentence(sentence: string) {
  return sentence.replace(/^[-*\d.\s]+/, "").trim();
}

function buildTomorrowPriorities(events: CalendarEvent[]) {
  const followUps = events
    .filter((event) => /회의|면담|미팅/.test(event.title))
    .map((event) => `${event.title} 후속 Action Item 정리`);
  return [...followUps, "가장 중요한 집중 업무 1개 먼저 완료", "Gmail/Slack 일정 후보 확인"].slice(0, 3);
}

function makeFreeTimeReply(events: CalendarEvent[]) {
  if (events.length === 0) {
    return "해당 날짜는 등록된 일정이 없어 대부분의 시간이 비어 있습니다.";
  }
  const busy = events.map((event) => `${formatTimeRange(event.startAt, event.endAt)} ${event.title}`).join("\n");
  return `이미 잡힌 일정입니다.\n${busy}\n\n오전 9시 이전, 점심 전후, 마지막 일정 이후 시간을 우선 확인해보세요.`;
}
