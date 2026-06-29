import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const storePath = join(process.cwd(), ".data", "harutoktok-store.json");
const now = "2026-06-29T13:30:00.000Z";
const userId = "local-user";

function iso(date, time) {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

function id(prefix, index) {
  return `${prefix}_demo_${String(index).padStart(2, "0")}`;
}

function event(index, date, start, end, title, options = {}) {
  return {
    eventId: id("evt", index),
    title,
    startAt: iso(date, start),
    endAt: iso(date, end),
    category: options.category ?? "일정",
    location: options.location,
    attendees: options.attendees ?? [],
    isImportant: Boolean(options.isImportant),
    isCompleted: Boolean(options.isCompleted),
    completedAt: options.isCompleted ? iso(date, end) : undefined,
    description: options.description ?? "데모 시연용 일정",
    memo: options.memo,
    recordingTranscript: options.recordingTranscript,
    aiSummary: options.aiSummary,
    source: options.source ?? "chat",
    createdAt: now,
    updatedAt: now
  };
}

function gap(index, date, start, end, category, memo, isRecorded = true) {
  const startAt = iso(date, start);
  const endAt = iso(date, end);
  return {
    id: id("gap", index),
    userId,
    date,
    startTime: startAt,
    endTime: endAt,
    durationMinutes: Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000),
    category,
    memo,
    isRecorded,
    createdAt: now,
    updatedAt: now
  };
}

function confirmation(index, title, startAt, endAt, reason) {
  const message = `${formatTime(startAt)} ~ ${formatTime(endAt)}에 "${title}" 일정을 추가할까요?`;
  return {
    confirmationRequestId: id("conf", index),
    targetType: "time_usage_plan",
    targetId: "2026-06-29",
    action: "create",
    message,
    payload: {
      sourceDate: "2026-06-29",
      calendarPayload: {
        title,
        startAt,
        endAt,
        description: reason
      }
    },
    status: "pending",
    createdAt: now
  };
}

function formatTime(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function summary(index, date, score, overrides = {}) {
  return {
    id: id("usage", index),
    userId,
    date,
    totalScheduleMinutes: overrides.totalScheduleMinutes ?? 360,
    completedScheduleMinutes: overrides.completedScheduleMinutes ?? 270,
    incompleteScheduleMinutes: overrides.incompleteScheduleMinutes ?? 90,
    totalGapMinutes: overrides.totalGapMinutes ?? 600,
    recordedGapMinutes: overrides.recordedGapMinutes ?? 480,
    unrecordedGapMinutes: overrides.unrecordedGapMinutes ?? 120,
    movingMinutes: overrides.movingMinutes ?? 90,
    mealMinutes: overrides.mealMinutes ?? 90,
    restMinutes: overrides.restMinutes ?? 80,
    selfDevelopmentMinutes: overrides.selfDevelopmentMinutes ?? 30,
    studyMinutes: overrides.studyMinutes ?? 90,
    exerciseMinutes: overrides.exerciseMinutes ?? 60,
    snsVideoMinutes: overrides.snsVideoMinutes ?? 80,
    waitingMinutes: overrides.waitingMinutes ?? 30,
    etcMinutes: overrides.etcMinutes ?? 40,
    timeUsageScore: score,
    aiFeedback:
      overrides.aiFeedback ??
      `오늘의 시간 사용 점수는 ${score}점입니다. 일정 수행은 안정적이었고, 빈 시간 기록을 바탕으로 내일 계획을 더 구체화할 수 있습니다.`,
    wasteRiskSegments: overrides.wasteRiskSegments ?? ["21:30 ~ 22:40 SNS/영상 시청 1시간 10분"],
    strengths: overrides.strengths ?? ["오전 학습 루틴을 완료했습니다.", "운동 일정을 캘린더에 남겨 하루 균형을 확인할 수 있었습니다."],
    improvements: overrides.improvements ?? ["저녁 SNS 시간이 길어질 수 있어 짧은 대체 루틴이 필요합니다."],
    tomorrowActions:
      overrides.tomorrowActions ??
      ["내일 실제 빈 시간에 목표 관련 집중 30분을 배치해보세요.", "저녁에는 30분 SNS 제한 미션을 시도해보세요."],
    tomorrowPlan:
      overrides.tomorrowPlan ?? {
        morning: "아침 영어 루틴 후 10분 복습을 이어가보세요.",
        afternoon: "회의 전후로 15분 정리 시간을 남겨두세요.",
        evening: "운동 뒤에는 SNS 대신 짧은 회고를 남겨보세요."
      },
    confirmationRequestIds: overrides.confirmationRequestIds ?? [],
    createdAt: now
  };
}

function review(index, date, scoreText) {
  return {
    dailyReviewId: id("review", index),
    reviewDate: date,
    summary: `${scoreText} 빈 시간 기록과 완료 체크를 바탕으로 내일 계획을 조정했습니다.`,
    completedItems: ["Grammar in Use", "운동", "BBC 6 Minute English"].slice(0, Math.max(1, index % 3 + 1)),
    incompleteItems: index % 2 === 0 ? ["산업안전기사 기출 풀이"] : [],
    timeAnalysis: ["목표 관련 시간 1시간 이상 확보", "저녁 SNS 시간 관리 필요"],
    importedEvents: ["Slack 팀 회의 후보", "Gmail 발표 리허설 안내"].slice(0, index % 2),
    strengths: ["하루를 기록으로 남긴 점이 좋습니다."],
    improvements: ["중요 일정 전 준비 시간을 10분 확보해보세요."],
    growthPoints: ["완료 체크와 빈 시간 기록이 다음 추천 정확도를 높였습니다."],
    tomorrowPriorities: ["목표 관련 집중 30분", "캡스톤 회의 준비", "저녁 운동"],
    fortuneFeedback: index % 2 === 0 ? "helpful" : "normal",
    createdAt: now
  };
}

const confirmations = [
  confirmation(1, "목표 관련 집중 30분", iso("2026-06-30", "08:00"), iso("2026-06-30", "08:30"), "오늘 목표 관련 시간이 부족했고, 내일 캘린더의 실제 빈 시간을 확인했습니다."),
  confirmation(2, "발표 리허설 준비 20분", iso("2026-06-30", "14:20"), iso("2026-06-30", "14:40"), "금요일 발표 리허설 D-Day가 가까워 준비 시간이 필요합니다."),
  confirmation(3, "저녁 SNS 제한 미션", iso("2026-06-30", "21:00"), iso("2026-06-30", "21:30"), "오늘 저녁 SNS 시간이 길어져 대체 루틴을 제안합니다.")
];

const data = {
  events: [
    event(1, "2026-06-29", "07:00", "08:00", "Grammar in Use", { category: "공부", isCompleted: true, source: "chat" }),
    event(2, "2026-06-29", "10:00", "12:00", "캡스톤 회의", {
      category: "프로젝트",
      location: "공학관 305호",
      attendees: ["우진", "지연"],
      isImportant: true,
      isCompleted: true,
      memo: "시연 흐름과 발표 역할을 확정했다.",
      recordingTranscript: "우진은 캘린더 화면과 일정 상세 모달 UI를 담당하고, 지연은 AI 요약 API 연결을 맡기로 했다. 다음 회의 전까지 각자 맡은 부분의 1차 화면 또는 기능 흐름을 준비하기로 했다.",
      aiSummary:
        "핵심 요약: 캡스톤 서비스 시연 흐름과 역할을 확정했습니다.\n후속 확인: 우진은 캘린더 화면과 일정 상세 모달 UI를, 지연은 AI 요약 API 연결을 준비하기로 했습니다.\n기록 기준: 6월 29일 오전 10:00 ~ 오후 12:00"
    }),
    event(3, "2026-06-29", "13:00", "14:00", "BBC 6 Minute English", { category: "공부", isCompleted: true }),
    event(4, "2026-06-29", "15:00", "16:00", "러닝 5km", { category: "운동", location: "한강공원", isCompleted: true }),
    event(5, "2026-06-29", "19:00", "20:30", "친구와 저녁 약속", { category: "약속", location: "성수", isCompleted: false }),
    event(6, "2026-06-29", "20:45", "21:30", "산업안전기사 기출 풀이", { category: "자격증", isImportant: true, isCompleted: false }),

    event(7, "2026-06-30", "07:00", "08:00", "매일 영어공부", { category: "반복 루틴", isCompleted: false }),
    event(8, "2026-06-30", "09:30", "10:30", "포트폴리오 리서치", { category: "자기개발", isCompleted: false }),
    event(9, "2026-06-30", "11:00", "12:00", "교수님 피드백 정리", { category: "프로젝트", isImportant: true, isCompleted: false }),
    event(10, "2026-06-30", "13:30", "14:20", "팀 피드백 반영 회의", { category: "회의", location: "온라인", attendees: ["우진", "지연"], isCompleted: false }),
    event(11, "2026-06-30", "15:00", "16:00", "운동", { category: "운동", location: "학교 체육관", isCompleted: false }),
    event(12, "2026-06-30", "17:00", "18:00", "BBC 쉐도잉", { category: "공부", isCompleted: false }),

    event(13, "2026-07-01", "08:00", "09:00", "자격증 공식 암기", { category: "자격증", isCompleted: false }),
    event(14, "2026-07-01", "10:00", "12:00", "캡스톤 기능 테스트", { category: "프로젝트", location: "랩실", isCompleted: false }),
    event(15, "2026-07-01", "13:00", "15:00", "운동", { category: "운동", location: "공원", attendees: ["친구"], isCompleted: false }),
    event(16, "2026-07-01", "16:00", "17:00", "AI Agent 발표 스크립트 작성", { category: "발표", isImportant: true, isCompleted: false }),
    event(17, "2026-07-01", "20:00", "21:00", "하루 성장보고서 회고", { category: "회고", isCompleted: false }),

    event(18, "2026-07-02", "07:30", "08:30", "Grammar in Use 복습", { category: "공부", isCompleted: false }),
    event(19, "2026-07-02", "09:00", "11:30", "캡스톤 데모 녹화", { category: "프로젝트", location: "스튜디오", isImportant: true, isCompleted: false }),
    event(20, "2026-07-02", "12:30", "13:30", "점심 및 이동", { category: "식사", isCompleted: false }),
    event(21, "2026-07-02", "14:00", "16:00", "서비스 QA", { category: "개발", attendees: ["지연"], isCompleted: false }),
    event(22, "2026-07-02", "18:30", "19:30", "가벼운 산책", { category: "운동", isCompleted: false }),

    event(23, "2026-07-03", "08:00", "09:00", "발표 자료 최종 점검", { category: "발표", isImportant: true, isCompleted: false }),
    event(24, "2026-07-03", "10:00", "12:00", "캡스톤 발표 리허설", { category: "발표", location: "강의실 B101", attendees: ["팀원"], isImportant: true, isCompleted: false }),
    event(25, "2026-07-03", "14:00", "15:00", "교수님 면담", { category: "면담", location: "교수 연구실", isImportant: true, isCompleted: false }),
    event(26, "2026-07-03", "16:00", "17:00", "휴식 및 정리", { category: "휴식", isCompleted: false }),
    event(27, "2026-07-03", "20:00", "21:00", "영어 듣기 루틴", { category: "공부", isCompleted: false }),

    event(28, "2026-07-04", "09:00", "10:00", "주간 회고", { category: "회고", isCompleted: false }),
    event(29, "2026-07-04", "11:00", "13:00", "가족 점심", { category: "약속", location: "잠실", isCompleted: false }),
    event(30, "2026-07-04", "15:00", "17:00", "포트폴리오 정리", { category: "자기개발", isImportant: true, isCompleted: false }),
    event(31, "2026-07-04", "19:00", "20:00", "가벼운 러닝", { category: "운동", isCompleted: false }),

    event(32, "2026-07-05", "10:00", "11:00", "다음 주 일정 설계", { category: "계획", isCompleted: false }),
    event(33, "2026-07-05", "14:00", "16:00", "자격증 모의고사", { category: "자격증", isImportant: true, isCompleted: false }),
    event(34, "2026-07-05", "20:00", "20:30", "오늘의 톡톡 운세 피드백", { category: "회고", isCompleted: false })
  ],
  candidates: [
    {
      candidateId: id("cand", 1),
      source: "gmail",
      sourceDetail: "professor@example.edu",
      title: "캡스톤 발표 리허설",
      date: "2026-07-03",
      startAt: iso("2026-07-03", "10:00"),
      endAt: iso("2026-07-03", "12:00"),
      location: "강의실 B101",
      attendees: ["팀원"],
      confidence: 0.93,
      status: "confirmed",
      conflictEventIds: [],
      alternatives: [],
      createdCalendarEventId: id("evt", 24),
      snippet: "금요일 10시에 발표 리허설을 진행합니다.",
      createdAt: now,
      updatedAt: now
    },
    {
      candidateId: id("cand", 2),
      source: "slack",
      sourceDetail: "#capstone",
      title: "서비스 QA",
      date: "2026-07-02",
      startAt: iso("2026-07-02", "14:00"),
      endAt: iso("2026-07-02", "16:00"),
      attendees: ["지연"],
      confidence: 0.88,
      status: "confirmed",
      conflictEventIds: [],
      alternatives: [],
      createdCalendarEventId: id("evt", 21),
      snippet: "목요일 오후 2시에 QA 같이 보죠.",
      createdAt: now,
      updatedAt: now
    }
  ],
  confirmations,
  connectedAccounts: [
    {
      connectedAccountId: id("acc", 1),
      provider: "google",
      providerAccountId: "demo-google-calendar",
      label: "Google Calendar 데모 연결",
      scopes: ["calendar.events"],
      status: "active",
      createdAt: now,
      updatedAt: now
    },
    {
      connectedAccountId: id("acc", 2),
      provider: "slack",
      providerAccountId: "demo-slack",
      label: "Slack 데모 워크스페이스",
      scopes: ["channels:history", "chat:write"],
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ],
  meetingNotes: [
    {
      meetingNoteId: id("meet", 1),
      title: "캡스톤 회의",
      transcript: "우진은 캘린더 화면을 담당하고 지연은 AI 요약 API를 연결하기로 했다. 금요일 전까지 발표 리허설 자료를 완성하기로 했다.",
      summary: "캘린더 화면과 AI 요약 API 역할을 나누고 발표 리허설 준비 일정을 정했습니다.",
      discussions: ["Agent 상태를 과하게 노출하지 않고 기능 안에서 자연스럽게 보여주기", "데모 데이터로 전체 기능 시연 준비"],
      decisions: ["금요일 발표 리허설 전까지 주요 화면을 완성한다."],
      risks: ["자연어 일정 파싱이 애매한 문장에서는 추가 질문이 필요하다."],
      actionItems: [],
      createdAt: now,
      updatedAt: now
    }
  ],
  actionItems: [
    {
      actionItemId: id("act", 1),
      meetingNoteId: id("meet", 1),
      assignee: "우진",
      task: "캘린더 화면 최종 점검",
      dueAt: iso("2026-07-03", "09:00"),
      status: "open",
      calendarNeeded: true,
      scheduleCandidateId: id("cand", 1),
      createdAt: now,
      updatedAt: now
    }
  ],
  dailyReviews: [
    review(1, "2026-06-23", "월요일은 루틴을 다시 시작한 날입니다."),
    review(2, "2026-06-24", "화요일은 공부와 프로젝트 균형이 좋았습니다."),
    review(3, "2026-06-25", "수요일은 이동 시간이 길었지만 기록을 남겼습니다."),
    review(4, "2026-06-26", "목요일은 발표 준비에 집중했습니다."),
    review(5, "2026-06-27", "금요일은 운동과 회고를 모두 완료했습니다."),
    review(6, "2026-06-28", "일요일은 다음 주를 준비했습니다."),
    review(7, "2026-06-29", "오늘은 목표 시간과 휴식 시간을 함께 점검했습니다.")
  ],
  dailyFortunes: [
    {
      id: id("fortune", 1),
      userId,
      fortuneDate: "2026-06-29",
      summary: "오늘은 학습과 협업의 균형을 잘 잡으면 좋은 흐름이 생기는 날이에요.",
      recommendedAction: "오전 학습 루틴을 먼저 끝내고, 캡스톤 회의 전에는 확인할 질문 1가지를 적어보세요.",
      caution: "저녁 일정 뒤에는 SNS 시간이 길어질 수 있으니 하루 회고를 먼저 남겨보세요.",
      luckyCategory: "공부 / 프로젝트",
      mission: "중요 일정 하나를 별표로 표시하고, 끝난 뒤 한 줄 메모를 남겨보세요.",
      aiFortuneText:
        "# 오늘의 톡톡 운세\n\n## 전체 흐름\n오늘은 학습과 협업이 모두 중요한 하루입니다. 오전 루틴으로 흐름을 만들고, 캡스톤 회의에서는 의견을 짧고 명확하게 전달해보세요.\n\n## 오전\nGrammar in Use를 먼저 끝내면 하루의 리듬이 안정됩니다.\n\n## 오후\n캡스톤 회의와 영어 루틴 사이에 짧은 정리 시간을 남겨두세요.\n\n## 저녁\n저녁 약속 뒤에는 산업안전기사 기출 풀이를 짧게라도 확인하면 좋습니다.",
      morning: "오전 루틴을 먼저 완료해 하루 속도를 잡아보세요.",
      afternoon: "회의 전후 10분 정리 시간을 남겨두세요.",
      evening: "저녁에는 SNS보다 짧은 회고를 먼저 해보세요.",
      scheduleComments: [
        { eventId: id("evt", 1), title: "Grammar in Use", comment: "하루 집중력을 여는 루틴입니다." },
        { eventId: id("evt", 2), title: "캡스톤 회의", comment: "핵심 질문 1가지를 준비하면 회의 밀도가 올라갑니다." },
        { eventId: id("evt", 6), title: "산업안전기사 기출 풀이", comment: "짧게라도 확인하면 목표 흐름이 끊기지 않습니다." }
      ],
      userFeedback: "helpful",
      createdAt: now
    }
  ],
  timeGaps: [
    gap(1, "2026-06-29", "08:00", "10:00", "moving", "등교 및 회의실 이동, 발표 자료 확인", true),
    gap(2, "2026-06-29", "12:00", "13:00", "meal", "점심 식사와 팀원과 짧은 대화", true),
    gap(3, "2026-06-29", "14:00", "15:00", "rest", "커피 마시며 휴식", true),
    gap(4, "2026-06-29", "16:00", "19:00", "friends", "친구와 이동 및 저녁 전 대화", true),
    gap(5, "2026-06-29", "21:30", "23:00", "sns_video", "유튜브와 SNS를 조금 오래 봄", true)
  ],
  timeUsageSummaries: [
    summary(1, "2026-06-23", 72),
    summary(2, "2026-06-24", 78),
    summary(3, "2026-06-25", 70),
    summary(4, "2026-06-26", 83),
    summary(5, "2026-06-27", 76),
    summary(6, "2026-06-28", 81),
    summary(7, "2026-06-29", 74, {
      totalScheduleMinutes: 465,
      completedScheduleMinutes: 360,
      incompleteScheduleMinutes: 105,
      totalGapMinutes: 480,
      recordedGapMinutes: 480,
      unrecordedGapMinutes: 0,
      movingMinutes: 120,
      mealMinutes: 60,
      restMinutes: 60,
      selfDevelopmentMinutes: 0,
      studyMinutes: 120,
      exerciseMinutes: 60,
      snsVideoMinutes: 90,
      waitingMinutes: 0,
      etcMinutes: 30,
      aiFeedback: "오늘의 시간 사용 점수는 74점입니다. 오전 학습과 운동은 좋았고, 저녁 SNS 시간이 길어져 내일은 실제 빈 시간에 목표 관련 집중 시간을 먼저 배치하는 것이 좋습니다.",
      wasteRiskSegments: ["21:30 ~ 23:00 SNS/영상 시청 1시간 30분"],
      strengths: ["오전 영어 루틴을 완료했습니다.", "캡스톤 회의 후 메모와 요약을 남겼습니다.", "운동 일정을 완료해 하루 균형을 만들었습니다."],
      improvements: ["저녁 SNS 시간이 길어졌습니다.", "산업안전기사 기출 풀이가 미완료라 내일 빈 시간에 재배치하는 것이 좋습니다."],
      tomorrowActions: ["내일 08:00 ~ 08:30 빈 시간에 목표 관련 집중 30분을 배치해보세요.", "발표 리허설 전 준비 시간을 20분 확보해보세요.", "저녁 SNS 제한 미션을 만들어보세요."],
      tomorrowPlan: {
        morning: "08:00 ~ 08:30 목표 관련 집중 시간을 먼저 확보하세요.",
        afternoon: "팀 회의 전후 10분 정리 시간을 남겨두세요.",
        evening: "운동 후 SNS 제한 미션을 먼저 실행하세요."
      },
      confirmationRequestIds: confirmations.map((item) => item.confirmationRequestId)
    })
  ],
  userMemory: [
    {
      id: id("mem", 1),
      userId,
      memoryType: "accepted_suggestion",
      memoryContent: "오전 빈 시간에 목표 관련 집중 시간을 배치하는 제안을 승인함",
      confidence: 0.82,
      sourceDate: "2026-06-28",
      createdAt: now
    },
    {
      id: id("mem", 2),
      userId,
      memoryType: "sns_pattern",
      memoryContent: "저녁 21시 이후 SNS/영상 시간이 길어지는 패턴",
      confidence: 0.74,
      sourceDate: "2026-06-29",
      createdAt: now
    },
    {
      id: id("mem", 3),
      userId,
      memoryType: "moving_pattern",
      memoryContent: "월요일 오전 이동 시간이 긴 편",
      confidence: 0.67,
      sourceDate: "2026-06-29",
      createdAt: now
    },
    {
      id: id("mem", 4),
      userId,
      memoryType: "goal_shortage",
      memoryContent: "자격증 공부 시간이 부족한 날에는 다음 날 오전 빈 시간 제안이 효과적",
      confidence: 0.71,
      sourceDate: "2026-06-29",
      createdAt: now
    }
  ],
  preferences: {
    userId,
    onboardingCompleted: true,
    nickname: "우진",
    birthDate: "2001-03-15",
    birthCalendarType: "solar",
    birthTime: "",
    birthTimeUnknown: true,
    dayStartTime: "07:00",
    dayEndTime: "23:00",
    fortuneEnabled: true,
    shortTermGoal: "캡스톤 발표 시연 완성",
    longTermGoal: "AI Agent 서비스 기획자로 성장하기",
    goalCategory: "공부",
    timezone: "Asia/Seoul",
    defaultEventDurationMinutes: 60,
    workingHours: {
      start: "09:00",
      end: "18:00"
    },
    focusBlocks: [
      { day: "weekday", start: "07:00", end: "09:00" },
      { day: "weekday", start: "20:00", end: "21:30" }
    ],
    notificationChannels: {
      inApp: true,
      email: false,
      slack: false
    },
    autoScanGmail: true,
    autoScanSlack: true,
    watchedSlackChannels: ["#capstone", "#schedule"]
  }
};

mkdirSync(dirname(storePath), { recursive: true });
if (existsSync(storePath)) {
  const backupPath = `${storePath}.backup-${Date.now()}`;
  writeFileSync(backupPath, readFileSync(storePath, "utf8"));
  console.log(`기존 데이터 백업: ${backupPath}`);
}
writeFileSync(storePath, JSON.stringify(data, null, 2));
console.log("하루톡톡 데모 데이터를 생성했습니다.");
console.log(`일정 ${data.events.length}개, 빈 시간 ${data.timeGaps.length}개, 승인 대기 ${data.confirmations.length}개, Memory ${data.userMemory.length}개`);
