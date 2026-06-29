export type SourceType = "voice" | "chat" | "gmail" | "slack" | "meeting_note";
export type CandidateStatus = "pending" | "held" | "confirmed" | "rejected" | "expired" | "conflict";
export type ConfirmationStatus = "pending" | "approved" | "rejected" | "expired";
export type ConnectedProvider = "google" | "slack";

export type CalendarEvent = {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  category?: string;
  location?: string;
  attendees: string[];
  isImportant?: boolean;
  isCompleted?: boolean;
  completedAt?: string;
  description?: string;
  memo?: string;
  recordingTranscript?: string;
  aiSummary?: string;
  source: SourceType | "google_calendar";
  createdAt: string;
  updatedAt: string;
};

export type ScheduleCandidate = {
  candidateId: string;
  source: SourceType;
  sourceDetail?: string;
  title: string;
  date: string;
  startAt: string;
  endAt: string;
  location?: string;
  attendees: string[];
  description?: string;
  confidence: number;
  status: CandidateStatus;
  conflictEventIds: string[];
  alternatives: TimeSlot[];
  createdCalendarEventId?: string;
  snippet?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmationRequest = {
  confirmationRequestId: string;
  targetType: "schedule_candidate" | "calendar_event" | "time_usage_plan";
  targetId: string;
  action: "create" | "update" | "delete" | "reschedule" | "create_routine" | "create_reminder";
  message: string;
  payload?: Record<string, unknown>;
  status: ConfirmationStatus;
  expiresAt?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
};

export type ConnectedAccount = {
  connectedAccountId: string;
  provider: ConnectedProvider;
  providerAccountId: string;
  label: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  createdAt: string;
  updatedAt: string;
};

export type ActionItem = {
  actionItemId: string;
  meetingNoteId?: string;
  assignee?: string;
  task: string;
  dueAt?: string;
  status: "open" | "done" | "deferred" | "cancelled";
  calendarNeeded: boolean;
  scheduleCandidateId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MeetingNote = {
  meetingNoteId: string;
  title: string;
  transcript: string;
  summary: string;
  discussions: string[];
  decisions: string[];
  risks: string[];
  actionItems: ActionItem[];
  createdAt: string;
  updatedAt: string;
};

export type DailyReview = {
  dailyReviewId: string;
  reviewDate: string;
  summary: string;
  completedItems: string[];
  incompleteItems: string[];
  timeAnalysis: string[];
  importedEvents: string[];
  strengths: string[];
  improvements: string[];
  growthPoints: string[];
  tomorrowPriorities: string[];
  fortuneFeedback?: "helpful" | "normal" | "unsure" | "not_helpful";
  createdAt: string;
};

export type TimeGapCategory =
  | "moving"
  | "meal"
  | "rest"
  | "self_development"
  | "study"
  | "exercise"
  | "friends"
  | "sns_video"
  | "game"
  | "housework"
  | "preparation"
  | "waiting"
  | "etc";

export type TimeGap = {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  category?: TimeGapCategory;
  memo?: string;
  isRecorded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TimeUsageSummary = {
  id: string;
  userId: string;
  date: string;
  totalScheduleMinutes: number;
  completedScheduleMinutes: number;
  incompleteScheduleMinutes: number;
  totalGapMinutes: number;
  recordedGapMinutes: number;
  unrecordedGapMinutes: number;
  movingMinutes: number;
  mealMinutes: number;
  restMinutes: number;
  selfDevelopmentMinutes: number;
  studyMinutes: number;
  exerciseMinutes: number;
  snsVideoMinutes: number;
  waitingMinutes: number;
  etcMinutes: number;
  timeUsageScore: number;
  aiFeedback: string;
  wasteRiskSegments: string[];
  strengths: string[];
  improvements: string[];
  tomorrowActions: string[];
  tomorrowPlan: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  confirmationRequestIds: string[];
  createdAt: string;
};

export type UserMemory = {
  id: string;
  userId: string;
  memoryType:
    | "frequent_gap"
    | "moving_pattern"
    | "meal_pattern"
    | "sns_pattern"
    | "focus_pattern"
    | "goal_shortage"
    | "accepted_suggestion"
    | "rejected_suggestion";
  memoryContent: string;
  confidence?: number;
  sourceDate: string;
  createdAt: string;
};

export type AgentRuntime = {
  date: string;
  loop: Array<{
    step: "Observe" | "Analyze" | "Plan" | "Confirm" | "Act" | "Remember" | "Improve";
    status: "done" | "pending" | "waiting";
    summary: string;
  }>;
  observed: {
    todayEventCount: number;
    completedEventCount: number;
    importantEventCount: number;
    timeGapCount: number;
    unrecordedGapMinutes: number;
    pendingConfirmationCount: number;
  };
  analysis: {
    completionRate: number;
    latestTimeUsageScore?: number;
    riskSignals: string[];
  };
  plan: {
    headline: string;
    recommendedActions: string[];
    memoryApplied: string[];
  };
  proactiveMessages: string[];
  rewards: {
    streakDays: number;
    unlockedBadges: string[];
    grassIntensity: number;
  };
};

export type DailyFortune = {
  id: string;
  userId: string;
  fortuneDate: string;
  summary: string;
  recommendedAction: string;
  caution: string;
  luckyCategory: string;
  mission: string;
  aiFortuneText: string;
  morning: string;
  afternoon: string;
  evening: string;
  scheduleComments: Array<{
    eventId: string;
    title: string;
    comment: string;
  }>;
  userFeedback?: "helpful" | "normal" | "unsure" | "not_helpful";
  createdAt: string;
};

export type UserPreferences = {
  userId: string;
  onboardingCompleted: boolean;
  nickname?: string;
  birthDate?: string;
  birthCalendarType: "solar" | "lunar";
  birthTime?: string;
  birthTimeUnknown: boolean;
  dayStartTime: string;
  dayEndTime: string;
  fortuneEnabled: boolean;
  shortTermGoal?: string;
  longTermGoal?: string;
  goalCategory?: string;
  timezone: string;
  defaultEventDurationMinutes: number;
  workingHours: {
    start: string;
    end: string;
  };
  focusBlocks: Array<{
    day: "weekday" | "weekend" | string;
    start: string;
    end: string;
  }>;
  notificationChannels: {
    inApp: boolean;
    email: boolean;
    slack: boolean;
  };
  autoScanGmail: boolean;
  autoScanSlack: boolean;
  watchedSlackChannels: string[];
};

export type TimeSlot = {
  startAt: string;
  endAt: string;
  label: string;
};

export type ChatResponse = {
  intent: string;
  reply: string;
  requiresConfirmation: boolean;
  confirmationRequestId?: string;
  candidate?: ScheduleCandidate;
  events?: CalendarEvent[];
  alternatives?: TimeSlot[];
};

export type CandidateDetection = {
  isScheduleCandidate: boolean;
  title?: string;
  startAt?: string;
  endAt?: string;
  location?: string;
  attendees: string[];
  confidence: number;
  reason: string;
};
