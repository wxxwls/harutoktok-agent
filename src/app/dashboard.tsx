"use client";

import {
  CalendarCheck,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  Link2,
  Mail,
  Mic,
  Moon,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  CheckSquare,
  Square,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Sun,
  Star
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionItem,
  AgentRuntime,
  CalendarEvent,
  ConfirmationRequest,
  ConnectedAccount,
  DailyFortune,
  DailyReview,
  MeetingNote,
  ScheduleCandidate,
  TimeGap,
  TimeGapCategory,
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

type ChatMessage = {
  role: "user" | "agent";
  text: string;
};

type MeetingSummaryResponse = {
  meeting_note_id: string;
  summary: string;
  discussions: string[];
  decisions: string[];
  risks: string[];
  action_items: ActionItem[];
  schedule_candidates: Array<ScheduleCandidate | undefined>;
};

type TimeGapResponse = {
  date: string;
  time_gaps: TimeGap[];
};

type TimeUsageResponse = {
  summary: TimeUsageSummary;
  time_gaps: TimeGap[];
  confirmation_requests: ConfirmationRequest[];
};

type SpeechRecognitionEventLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type EventDraft = {
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  attendees: string;
  isImportant?: boolean;
};

type OnboardingRoutineDraft = {
  title: string;
  category: string;
  start: string;
  end: string;
  location: string;
  repeat: "daily" | "weekday" | "weekend" | "weekly";
  weekdays: number[];
  isImportant: boolean;
};

type OnboardingRoutineItem = OnboardingRoutineDraft & {
  id: string;
};

type CandidateDraft = {
  source: "gmail" | "slack";
  subject: string;
  sourceDetail: string;
  text: string;
};

type ProfileDraft = {
  nickname: string;
  birthDate: string;
  birthCalendarType: "solar" | "lunar";
  birthTime: string;
  birthTimeUnknown: boolean;
  dayStartTime: string;
  dayEndTime: string;
  fortuneEnabled: boolean;
  shortTermGoal: string;
  longTermGoal: string;
  goalCategory: string;
};

const tabs = [
  { id: "calendar", label: "일정 캘린더", icon: CalendarCheck },
  { id: "review", label: "하루 성장 보고서", icon: Moon }
] as const;

type TabId = "calendar" | "candidates" | "meeting" | "review" | "settings";

const hours = Array.from({ length: 17 }, (_, index) => index + 7);
const hourHeight = 72;

export function Dashboard({ initialState }: { initialState: AppState }) {
  const today = new Date();
  const [activeTab, setActiveTab] = useState<TabId>("calendar");
  const [appState, setAppState] = useState<AppState | undefined>(initialState);
  const [selectedDate, setSelectedDate] = useState(startOfDay(today));
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventMemo, setEventMemo] = useState("");
  const [eventRecording, setEventRecording] = useState("");
  const [isEventRecording, setIsEventRecording] = useState(false);
  const [toast, setToast] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventDraft>({
    title: "",
    date: toInputDate(today),
    start: "09:00",
    end: "10:00",
    location: "",
    attendees: "",
    isImportant: false
  });
  const [routineDraft, setRoutineDraft] = useState<OnboardingRoutineDraft>({
    title: "",
    category: "공부",
    start: "09:00",
    end: "10:00",
    location: "",
    repeat: "daily",
    weekdays: [today.getDay()],
    isImportant: false
  });
  const [routineItems, setRoutineItems] = useState<OnboardingRoutineItem[]>([]);
  const [candidateDraft, setCandidateDraft] = useState<CandidateDraft>({
    source: "gmail",
    subject: "",
    sourceDetail: "",
    text: ""
  });
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingText, setMeetingText] = useState("");
  const [timeGaps, setTimeGaps] = useState<TimeGap[]>([]);
  const [timeUsageResult, setTimeUsageResult] = useState<TimeUsageResponse>();
  const [reviewSatisfaction, setReviewSatisfaction] = useState(7);
  const [isFortuneDetailOpen, setIsFortuneDetailOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"start" | "basic" | "goals" | "routine" | "complete">("start");
  const [isOnboardingPreview, setIsOnboardingPreview] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const eventRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const eventTranscriptRef = useRef("");
  const shouldSummarizeRecordingRef = useRef(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => profileDraftFromPreferences(initialState.preferences));

  // 리뉴얼 추가 상태
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showCreateNoteForm, setShowCreateNoteForm] = useState(false);
  const [activeSummaryTab, setActiveSummaryTab] = useState<"summary" | "decisions" | "actions">("summary");
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});

  // 오디오 플레이어 모크 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState<number>(1.0);
  const audioDuration = 180; // 모크 재생 길이 (3분)

  useEffect(() => {
    refresh();
    setIsOnboardingPreview(new URLSearchParams(window.location.search).get("onboarding") === "1");
  }, []);

  useEffect(() => {
    if (activeTab === "review") {
      void loadTimeGaps();
    }
    // 날짜나 탭이 바뀔 때만 빈 시간을 다시 감지합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDate]);

  useEffect(() => {
    if (appState?.preferences) {
      setProfileDraft(profileDraftFromPreferences(appState.preferences));
    }
  }, [appState?.preferences]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const message = toast.trim();
    if (!message) {
      return;
    }
    setNotifications((previous) => [message, ...previous.filter((item) => item !== message)].slice(0, 8));
    setIsNotificationOpen(true);
    const timer = window.setTimeout(() => setToast(""), 250);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const proactive = appState?.agentRuntime?.proactiveMessages ?? [];
    if (proactive.length === 0) {
      return;
    }
    setNotifications((previous) => [...proactive, ...previous.filter((item) => !proactive.includes(item))].slice(0, 8));
  }, [appState?.agentRuntime?.proactiveMessages]);

  const events = useMemo(() => appState?.events ?? [], [appState?.events]);
  const importantEvents = useMemo(() => {
    return events
      .filter((event) => event.isImportant)
      .sort((a, b) => {
        const aStart = new Date(a.startAt).getTime();
        const bStart = new Date(b.startAt).getTime();
        const now = startOfDay(new Date()).getTime();
        const aDistance = Math.abs(startOfDay(new Date(a.startAt)).getTime() - now);
        const bDistance = Math.abs(startOfDay(new Date(b.startAt)).getTime() - now);
        return aDistance - bDistance || aStart - bStart;
      });
  }, [events]);
  const weeklyAchievements = useMemo(
    () => buildWeeklyAchievements(appState?.timeUsageSummaries ?? [], appState?.dailyReviews ?? []),
    [appState?.timeUsageSummaries, appState?.dailyReviews]
  );

  // 오디오 타이머 인터랙션
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= audioDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / audioSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, audioSpeed]);

  const candidates = appState?.candidates ?? [];
  const pendingCandidates = candidates.filter((candidate) => ["pending", "conflict", "held"].includes(candidate.status));
  const todayKey = toInputDate(new Date());
  const todayFortune = appState?.dailyFortunes.find((fortune) => fortune.fortuneDate === todayKey);
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  
  const visibleEvents = useMemo(() => {
    const weekEnd = addDays(weekStart, 7);
    return events.filter((event) => {
      const start = new Date(event.startAt);
      return start >= weekStart && start < weekEnd;
    });
  }, [events, weekStart]);
  
  const agendaEvents = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 12);

  useEffect(() => {
    if (!appState?.preferences.fortuneEnabled || todayFortune) {
      return;
    }
    let cancelled = false;
    async function createInitialFortune() {
      const response = await fetch("/api/daily-fortune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fortune_date: todayKey })
      });
      if (!response.ok || cancelled) {
        return;
      }
      const data = (await response.json()) as { fortune: DailyFortune };
      setAppState((previous) =>
        previous
          ? {
              ...previous,
              dailyFortunes: [data.fortune, ...previous.dailyFortunes.filter((fortune) => fortune.fortuneDate !== data.fortune.fortuneDate)]
            }
          : previous
      );
    }
    void createInitialFortune();
    return () => {
      cancelled = true;
    };
  }, [appState?.preferences.fortuneEnabled, todayFortune, todayKey]);

  // 파형 데이터
  const barsCount = 42;
  const barHeights = useMemo(() => {
    return Array.from({ length: barsCount }, (_, index) => {
      // 그럴싸한 파형 모양을 만들기 위해 sine 파형 생성
      return 8 + Math.abs(Math.sin(index * 0.3)) * 18 + (index % 3 === 0 ? 5 : 0);
    });
  }, []);

  // 선택된 회의록 객체 찾기
  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return appState?.meetingNotes.find((note) => note.meetingNoteId === selectedNoteId) || null;
  }, [selectedNoteId, appState?.meetingNotes]);

  const selectedEvent = useMemo(() => {
    return events.find((event) => event.eventId === selectedEventId) || null;
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedEvent) {
      setEventMemo("");
      setEventRecording("");
      return;
    }
    setEventMemo(selectedEvent.memo ?? "");
    setEventRecording(selectedEvent.recordingTranscript ?? "");
  }, [selectedEvent]);

  async function refresh() {
    const response = await fetch("/api/state", { cache: "no-store" });
    const data = (await response.json()) as AppState;
    setAppState(data);
  }

  async function postJson<T>(url: string, body: unknown = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await response.json()) as T & { message?: string };
    if (!response.ok) {
      throw new Error(data.message ?? "요청 처리에 실패했습니다.");
    }
    return data;
  }

  async function sendChat(event?: FormEvent, overrideText?: string) {
    event?.preventDefault();
    const text = (overrideText ?? chatInput).trim();
    if (!text) {
      return;
    }

    const historySnapshot = messages; // 현재 대화 히스토리 스냅샷
    setMessages((previous) => [...previous, { role: "user", text }]);
    setChatInput("");
    setIsLoading(true);

    try {
      const result = await postJson<{ reply: string }>("/api/agent/chat", {
        message: text,
        timezone: "Asia/Seoul",
        client_now: new Date().toISOString(),
        // 최근 10턴까지의 대화 히스토리를 함께 전달
        history: historySnapshot.slice(-20).map((m) => ({
          role: m.role,
          content: m.text
        }))
      });
      setMessages((previous) => [...previous, { role: "agent", text: result.reply }]);
      await refresh();
    } catch (error) {
      setMessages((previous) => [...previous, { role: "agent", text: getErrorMessage(error) }]);
    } finally {
      setIsLoading(false);
    }
  }

  async function createManualEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventDraft.title.trim()) {
      setToast("일정 제목을 입력해주세요.");
      return;
    }

    const startAt = toLocalIso(eventDraft.date, eventDraft.start);
    const endAt = toLocalIso(eventDraft.date, eventDraft.end);
    if (new Date(endAt) <= new Date(startAt)) {
      setToast("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }

    try {
      const result = await postJson<{ message: string }>("/api/calendar/events", {
        title: eventDraft.title.trim(),
        start_at: startAt,
        end_at: endAt,
        location: eventDraft.location.trim() || undefined,
        attendees: splitPeople(eventDraft.attendees),
        is_important: Boolean(eventDraft.isImportant),
        description: "사용자가 직접 추가한 일정"
      });
      setToast(result.message ?? "일정을 추가했습니다.");
      setEventDraft((previous) => ({ ...previous, title: "", location: "", attendees: "", isImportant: false }));
      setShowQuickCreate(false);
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function deleteEvent(eventId: string) {
    const response = await fetch(`/api/calendar/events/${eventId}`, { method: "DELETE" });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setToast(data.message ?? "일정 삭제에 실패했습니다.");
      return;
    }
    setToast(data.message ?? "일정을 삭제했습니다.");
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
    }
    await refresh();
  }

  async function toggleEventImportance(event: CalendarEvent) {
    try {
      await fetch(`/api/calendar/events/${event.eventId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          is_important: !event.isImportant
        })
      });
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function toggleEventCompletion(event: CalendarEvent) {
    try {
      await fetch(`/api/calendar/events/${event.eventId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          is_completed: !event.isCompleted
        })
      });
      setToast(!event.isCompleted ? "일정을 완료 처리했습니다." : "완료 표시를 해제했습니다.");
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function saveEventNote(options: { summarize?: boolean; memoOverride?: string; recordingOverride?: string } = {}) {
    if (!selectedEvent) {
      return;
    }

    setIsLoading(true);
    const memoText = options.memoOverride ?? eventMemo;
    const recordingText = options.recordingOverride ?? eventRecording;
    const aiSummary = options.summarize
      ? summarizeEventNote(selectedEvent, memoText, recordingText)
      : selectedEvent.aiSummary;

    try {
      const response = await fetch(`/api/calendar/events/${selectedEvent.eventId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          memo: memoText.trim(),
          recording_transcript: recordingText.trim(),
          ai_summary: aiSummary
        })
      });
      const result = (await response.json()) as { message?: string; event?: CalendarEvent };
      if (!response.ok) {
        throw new Error(result.message ?? "일정 기록 저장에 실패했습니다.");
      }
      setToast(options.summarize ? "AI가 일정 내용을 요약했습니다." : result.message ?? "일정 기록을 저장했습니다.");
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function startEventRecording() {
    if (isEventRecording) {
      stopEventRecording();
      return;
    }

    const speechWindow = window as Window &
      typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast("이 브라우저는 음성 입력을 지원하지 않습니다. 전사 텍스트를 직접 입력해주세요.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = false;
    eventTranscriptRef.current = eventRecording.trim();
    shouldSummarizeRecordingRef.current = false;
    eventRecognitionRef.current = recognition;
    recognition.onend = () => {
      const finalRecording = eventTranscriptRef.current;
      const shouldSummarize = shouldSummarizeRecordingRef.current;
      eventRecognitionRef.current = null;
      shouldSummarizeRecordingRef.current = false;
      setIsEventRecording(false);
      if (shouldSummarize) {
        void saveEventNote({ summarize: true, recordingOverride: finalRecording });
      }
    };
    recognition.onerror = () => {
      setIsEventRecording(false);
      eventRecognitionRef.current = null;
      shouldSummarizeRecordingRef.current = false;
      setToast("음성 입력을 완료하지 못했습니다. 다시 시도해주세요.");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const nextTranscript = [eventTranscriptRef.current, transcript].filter(Boolean).join("\n");
      eventTranscriptRef.current = nextTranscript;
      setEventRecording(nextTranscript);
    };
    setIsEventRecording(true);
    recognition.start();
  }

  function stopEventRecording() {
    if (!eventRecognitionRef.current) {
      setIsEventRecording(false);
      return;
    }
    shouldSummarizeRecordingRef.current = true;
    eventRecognitionRef.current.stop();
  }

  async function detectCandidate(event: FormEvent) {
    event.preventDefault();
    if (!candidateDraft.text.trim() && !candidateDraft.subject.trim()) {
      setToast("감지할 메일 또는 메시지 내용을 입력해주세요.");
      return;
    }

    try {
      const result =
        candidateDraft.source === "gmail"
          ? await postJson<{ message: string }>("/api/gmail/webhook", {
              subject: candidateDraft.subject,
              snippet: candidateDraft.text,
              sender: candidateDraft.sourceDetail
            })
          : await postJson<{ message: string }>("/api/slack/events", {
              event: {
                text: candidateDraft.text,
                channel: candidateDraft.sourceDetail
              }
            });
      setToast(result.message);
      setCandidateDraft((previous) => ({ ...previous, subject: "", text: "" }));
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function confirmCandidate(candidate: ScheduleCandidate, alternative?: { startAt: string; endAt: string }) {
    try {
      const data = await postJson<{ message: string }>(`/api/schedule-candidates/${candidate.candidateId}/confirm`, {
        selected_start_at: alternative?.startAt,
        selected_end_at: alternative?.endAt
      });
      setToast(data.message ?? "일정을 추가했습니다.");
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
      await refresh();
    }
  }

  async function rejectCandidate(candidate: ScheduleCandidate) {
    await postJson(`/api/schedule-candidates/${candidate.candidateId}/reject`, {
      reason: "사용자가 무시하기를 선택함"
    });
    setToast("일정 후보를 무시했습니다.");
    await refresh();
  }

  async function connect(provider: "google" | "slack") {
    try {
      const data = await postJson<{ message: string }>(`/api/auth/${provider}`, {});
      setToast(data.message);
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function summarizeMeeting() {
    if (!meetingText.trim()) {
      setToast("회의록 내용을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const data = await postJson<MeetingSummaryResponse>("/api/meeting/summarize", {
        title: meetingTitle || "새 회의록",
        transcript: meetingText
      });
      setToast("회의록을 요약했습니다.");
      
      setMeetingTitle("");
      setMeetingText("");
      setShowCreateNoteForm(false);
      
      // 새로 등록된 회의록 상세 페이지로 즉시 이동
      setSelectedNoteId(data.meeting_note_id);
      
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTimeGaps() {
    try {
      const date = toInputDate(selectedDate);
      const response = await fetch(`/api/daily-review/time-gaps?date=${date}`, { cache: "no-store" });
      const data = (await response.json()) as TimeGapResponse;
      if (response.ok) {
        setTimeGaps(data.time_gaps);
      }
    } catch {
      setToast("빈 시간 정보를 불러오지 못했습니다.");
    }
  }

  function updateTimeGap(gapId: string, patch: Partial<TimeGap>) {
    setTimeGaps((previous) => previous.map((gap) => (gap.id === gapId ? { ...gap, ...patch } : gap)));
  }

  async function saveTimeGaps() {
    setIsLoading(true);
    try {
      const data = await postJson<TimeGapResponse>("/api/daily-review/time-gaps", {
        date: toInputDate(selectedDate),
        time_gaps: timeGaps
      });
      setTimeGaps(data.time_gaps);
      setToast("빈 시간 기록을 저장했습니다.");
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function analyzeTimeUsageFromGaps() {
    setIsLoading(true);
    try {
      await postJson<TimeGapResponse>("/api/daily-review/time-gaps", {
        date: toInputDate(selectedDate),
        time_gaps: timeGaps
      });
      const data = await postJson<TimeUsageResponse>("/api/daily-review/analyze-time-usage", {
        date: toInputDate(selectedDate),
        satisfaction: reviewSatisfaction
      });
      setTimeGaps(data.time_gaps);
      setTimeUsageResult(data);
      setToast("빈 시간 기반 성장 분석을 생성했습니다.");
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function resolveConfirmation(confirmationId: string, action: "approve" | "reject") {
    try {
      const data = await postJson<{ message: string }>(`/api/confirmation-requests/${confirmationId}/${action}`, {});
      setToast(data.message);
      await refresh();
      setTimeUsageResult((previous) =>
        previous
          ? {
              ...previous,
              confirmation_requests: previous.confirmation_requests.map((request) =>
                request.confirmationRequestId === confirmationId
                  ? { ...request, status: action === "approve" ? "approved" : "rejected" }
                  : request
              )
            }
          : previous
      );
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function savePreferences(patch: Partial<UserPreferences>, successMessage = "프로필 정보를 저장했습니다.") {
    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      setToast(successMessage);
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function saveProfileDraft(options: { completeOnboarding?: boolean; message?: string } = {}) {
    await savePreferences(
      {
        nickname: profileDraft.nickname.trim(),
        birthDate: normalizeBirthDate(profileDraft.birthDate),
        birthCalendarType: profileDraft.birthCalendarType,
        birthTime: profileDraft.birthTimeUnknown ? "" : profileDraft.birthTime,
        birthTimeUnknown: profileDraft.birthTimeUnknown,
        dayStartTime: profileDraft.dayStartTime || "07:00",
        dayEndTime: profileDraft.dayEndTime || "23:00",
        fortuneEnabled: profileDraft.fortuneEnabled,
        shortTermGoal: profileDraft.shortTermGoal.trim(),
        longTermGoal: profileDraft.longTermGoal.trim(),
        goalCategory: profileDraft.goalCategory,
        onboardingCompleted: options.completeOnboarding ?? appState?.preferences.onboardingCompleted ?? false
      },
      options.message
    );
  }

  async function completeOnboarding() {
    const canComplete = await createOnboardingRoutineEvents();
    if (!canComplete) {
      return;
    }
    if (isOnboardingPreview) {
      setIsOnboardingPreview(false);
      window.history.replaceState(null, "", window.location.pathname);
      await refresh();
      return;
    }
    await saveProfileDraft({ completeOnboarding: true, message: "온보딩을 완료했습니다." });
  }

  function addOnboardingRoutine() {
    if (!routineDraft.title.trim()) {
      setToast("반복 일정 제목을 입력해주세요.");
      return;
    }
    if (routineDraft.repeat === "weekly" && routineDraft.weekdays.length === 0) {
      setToast("매주 반복할 요일을 선택해주세요.");
      return;
    }
    if (timeToMinutes(routineDraft.end) <= timeToMinutes(routineDraft.start)) {
      setToast("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }

    setRoutineItems((previous) => [
      ...previous,
      {
        ...routineDraft,
        id: `routine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: routineDraft.title.trim(),
        location: routineDraft.location.trim()
      }
    ]);
    setRoutineDraft((previous) => ({ ...previous, title: "", location: "" }));
  }

  function removeOnboardingRoutine(id: string) {
    setRoutineItems((previous) => previous.filter((item) => item.id !== id));
  }

  async function createOnboardingRoutineEvents() {
    const pendingRoutine = routineDraft.title.trim()
      ? [
          {
            ...routineDraft,
            id: "pending",
            title: routineDraft.title.trim(),
            location: routineDraft.location.trim()
          }
        ]
      : [];
    const routinesToCreate = [...routineItems, ...pendingRoutine];

    if (routinesToCreate.length === 0) {
      return true;
    }

    for (const routine of routinesToCreate) {
      if (routine.repeat === "weekly" && routine.weekdays.length === 0) {
        setToast(`"${routine.title}"의 반복 요일을 선택해주세요.`);
        return false;
      }
      if (timeToMinutes(routine.end) <= timeToMinutes(routine.start)) {
        setToast(`"${routine.title}"의 종료 시간은 시작 시간보다 늦어야 합니다.`);
        return false;
      }
      const dates = expandRoutineDates(routine, new Date(), 28);
      for (const date of dates) {
        const dateText = toInputDate(date);
        await postJson("/api/calendar/events", {
          title: routine.title,
          start_at: toLocalIso(dateText, routine.start),
          end_at: toLocalIso(dateText, routine.end),
          location: routine.location || undefined,
          attendees: [],
          is_important: routine.isImportant,
          description: `온보딩에서 등록한 ${repeatLabel(routine.repeat)} 반복 일정`
        });
      }
    }
    return true;
  }

  async function skipBirthdayInput() {
    setProfileDraft((previous) => ({
      ...previous,
      birthDate: "",
      birthTime: "",
      birthTimeUnknown: true,
      fortuneEnabled: false
    }));
    await savePreferences(
      {
        birthDate: "",
        birthTime: "",
        birthTimeUnknown: true,
        fortuneEnabled: false
      },
      "생일 입력을 건너뛰었습니다."
    );
    setOnboardingStep("goals");
  }

  async function reopenOnboarding() {
    setOnboardingStep("start");
    setIsOnboardingPreview(true);
    window.history.replaceState(null, "", `${window.location.pathname}?onboarding=1`);
  }

  async function generateFortune(force = false) {
    if (!appState?.preferences.fortuneEnabled) {
      return;
    }
    try {
      const data = await postJson<{ fortune: DailyFortune }>("/api/daily-fortune", {
        fortune_date: todayKey,
        force
      });
      setAppState((previous) =>
        previous
          ? {
              ...previous,
              dailyFortunes: [data.fortune, ...previous.dailyFortunes.filter((fortune) => fortune.fortuneDate !== data.fortune.fortuneDate)]
            }
          : previous
      );
      if (force) {
        setToast("오늘의 톡톡 운세를 새로 만들었습니다.");
      }
    } catch (error) {
      if (force) {
        setToast(getErrorMessage(error));
      }
    }
  }

  async function saveFortuneFeedback(feedback: DailyFortune["userFeedback"]) {
    if (!feedback) {
      return;
    }
    try {
      const data = await fetch("/api/daily-fortune", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fortune_date: todayKey, user_feedback: feedback })
      });
      if (!data.ok) {
        const errorBody = (await data.json()) as { message?: string };
        throw new Error(errorBody.message ?? "운세 피드백 저장에 실패했습니다.");
      }
      setToast("운세 피드백을 저장했습니다.");
      await refresh();
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  function startVoiceInput() {
    const speechWindow = window as Window &
      typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast("현재 브라우저에서 음성 인식을 사용할 수 없습니다.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setToast("음성 인식을 완료하지 못했습니다. 다시 시도해주세요.");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      // 음성 인식 완료 후 자동으로 바로 전송 (저장 후 즉시 AI에게 전달)
      sendChat(undefined, transcript);
    };
    setIsListening(true);
    recognition.start();
  }

  // 대화 기록 화자별 파싱 헬퍼
  const parsedTranscript = useMemo(() => {
    if (!selectedNote) return [];
    const text = selectedNote.transcript;
    const lines = text.split("\n").filter((line) => line.trim());
    return lines.map((line, index) => {
      const match = line.match(/^([^:\(]+)(?:\(([^)]+)\))?\s*:\s*(.*)$/);
      if (match) {
        return {
          speaker: match[1].trim(),
          time: match[2]?.trim() || `00:${String(index * 12).padStart(2, "0")}`,
          text: match[3].trim()
        };
      }
      return {
        speaker: index % 2 === 0 ? "참석자 A" : "참석자 B",
        time: `00:${String(index * 12).padStart(2, "0")}`,
        text: line.trim()
      };
    });
  }, [selectedNote]);

  // 대화 행 클릭시 재생 위치 모크 이동
  const jumpToTime = (timeStr: string) => {
    const parts = timeStr.split(":");
    let secs = 0;
    if (parts.length === 2) {
      secs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    } else if (parts.length === 3) {
      secs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
    }
    setCurrentTime(Math.min(secs, audioDuration));
    setIsPlaying(true);
  };

  const toggleActionItem = (itemId: string) => {
    setCheckedActions((previous) => ({
      ...previous,
      [itemId]: !previous[itemId]
    }));
  };

  if (appState && (!appState.preferences.onboardingCompleted || isOnboardingPreview)) {
    return (
      <OnboardingFlow
        step={onboardingStep}
        draft={profileDraft}
        onStepChange={setOnboardingStep}
        onDraftChange={setProfileDraft}
        routineDraft={routineDraft}
        onRoutineDraftChange={setRoutineDraft}
        routineItems={routineItems}
        onAddRoutine={addOnboardingRoutine}
        onRemoveRoutine={removeOnboardingRoutine}
        onSkipBirthday={skipBirthdayInput}
        onComplete={completeOnboarding}
        isPreview={isOnboardingPreview}
      />
    );
  }

  return (
    <main className="calendar-shell">
      {/* 사이드바 */}
      <aside className="dark-sidebar">
        <div className="brand-block sidebar-brand">
          <BrandMark compact />
          <div>
            <strong>하루톡톡</strong>
          </div>
        </div>

        {/* 세로형 클로바노트식 메뉴 */}
        <nav className="sidebar-nav" aria-label="메인 메뉴">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`sidebar-nav-item ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedNoteId(null);
                  setShowCreateNoteForm(false);
                }}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 미니 달력 */}
        <MiniMonth
          selectedDate={selectedDate}
          events={events}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setEventDraft((previous) => ({ ...previous, date: toInputDate(date) }));
          }}
        />

        {/* 빠른 등록 버튼 및 드로어 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            className="create-button"
            onClick={() => setShowQuickCreate(!showQuickCreate)}
            style={{ width: "100%" }}
          >
            <Plus size={16} />
            <span>새로운 일정</span>
          </button>
          
          {showQuickCreate ? (
            <form className="quick-create" onSubmit={createManualEvent}>
              <div className="form-row full">
                <label>Title</label>
                <input
                  aria-label="Event title"
                  placeholder="일정 제목"
                  value={eventDraft.title}
                  onChange={(event) => setEventDraft((previous) => ({ ...previous, title: event.target.value }))}
                />
              </div>
              <div className="form-grid">
                <div className="form-row">
                  <label>Date</label>
                  <input
                    aria-label="Event date"
                    type="date"
                    value={eventDraft.date}
                    onChange={(event) => setEventDraft((previous) => ({ ...previous, date: event.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>Start</label>
                  <input
                    aria-label="Event start time"
                    type="time"
                    value={eventDraft.start}
                    onChange={(event) => setEventDraft((previous) => ({ ...previous, start: event.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>End</label>
                  <input
                    aria-label="Event end time"
                    type="time"
                    value={eventDraft.end}
                    onChange={(event) => setEventDraft((previous) => ({ ...previous, end: event.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>Place</label>
                  <input
                    aria-label="Event place"
                    placeholder="장소"
                    value={eventDraft.location}
                    onChange={(event) => setEventDraft((previous) => ({ ...previous, location: event.target.value }))}
                  />
                </div>
              </div>
              <div className="form-row full">
                <label>People</label>
                <input
                  aria-label="Event people"
                  placeholder="참석자 이메일/이름"
                  value={eventDraft.attendees}
                  onChange={(event) => setEventDraft((previous) => ({ ...previous, attendees: event.target.value }))}
                />
              </div>
              <button className="create-button" type="submit" style={{ background: "var(--ink)" }}>
                <span>일정 등록</span>
              </button>
            </form>
          ) : null}
        </div>

        {/* 다가오는 일정 목록 */}
        <SidebarDdayList events={importantEvents.slice(0, 3)} onSelect={setSelectedEventId} />

        <div className="sidebar-agenda">
          <div className="agenda-heading">
            <span>다가오는 일정 ({agendaEvents.length})</span>
          </div>
          <AgendaList events={agendaEvents} onSelect={setSelectedEventId} onDelete={deleteEvent} />
        </div>
      </aside>

      {/* 메인 콘텐츠 작업영역 */}
      <section className="calendar-workspace">
        {/* 상단 툴바 */}
        <header className="calendar-toolbar">
          <div className="toolbar-left">
            <button className="square-button" onClick={() => setSelectedDate(addDays(selectedDate, -7))} title="이전 주">
              <ChevronLeft size={18} />
            </button>
            <button className="today-button" onClick={() => setSelectedDate(startOfDay(new Date()))}>Today</button>
            <button className="square-button" onClick={() => setSelectedDate(addDays(selectedDate, 7))} title="다음 주">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="calendar-period">
            <strong>{monthTitle(selectedDate)}</strong>
          </div>

          <div className="notification-center">
            <button
              type="button"
              className="notification-trigger"
              onClick={() => setIsNotificationOpen((previous) => !previous)}
              title="알림"
              aria-label="알림"
            >
              <Bell size={17} />
              {notifications.length > 0 ? <span>{notifications.length}</span> : null}
            </button>
            {isNotificationOpen ? (
              <div className="notification-popover" role="status">
                <div className="notification-popover-header">
                  <strong>알림</strong>
                  {notifications.length > 0 ? (
                    <button type="button" onClick={() => setNotifications([])}>
                      모두 지우기
                    </button>
                  ) : null}
                </div>
                {notifications.length === 0 ? (
                  <p className="notification-empty">새 알림이 없습니다.</p>
                ) : (
                  <ul>
                    {notifications.map((message, index) => (
                      <li key={`${message}-${index}`}>
                        <span>{message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </header>

        {/* 1. 일정 캘린더 탭 */}
        {activeTab === "calendar" ? (
          <>
            {appState?.preferences.fortuneEnabled ? (
              <div className="top-card-row">
                <FortuneCard fortune={todayFortune} onOpen={() => setIsFortuneDetailOpen(true)} onRefresh={() => generateFortune(true)} />
                <MissionCard fortune={todayFortune} />
              </div>
            ) : null}
            {/* 캘린더 바디 */}
            <div className="week-calendar-scroll">
              <WeekCalendar
                days={weekDays}
                events={visibleEvents}
                onSelect={setSelectedEventId}
                onDelete={deleteEvent}
                onToggleImportant={toggleEventImportance}
                onToggleComplete={toggleEventCompletion}
              />
            </div>
          </>
        ) : null}

        {/* 2. 일정 후보 수신함 탭 */}
        {activeTab === "candidates" ? (
          <section className="product-panel candidates-layout">
            <div className="panel-heading">
              <div>
                <span>Inbox 수신함</span>
                <h1>검출된 일정 후보군</h1>
              </div>
              <strong>{pendingCandidates.length}건 보류 중</strong>
            </div>

            {/* 테스트 드로어 */}
            <details className="dev-test-drawer">
              <summary className="dev-test-drawer-summary">
                <ChevronDown size={16} />
                <span>[개발 검증용] 메일/메시지 수동 생성기</span>
              </summary>
              <form className="candidate-detect" onSubmit={detectCandidate}>
                <div className="source-toggle">
                  <button
                    type="button"
                    className={candidateDraft.source === "gmail" ? "active" : ""}
                    onClick={() => setCandidateDraft((previous) => ({ ...previous, source: "gmail" }))}
                  >
                    <Mail size={14} />
                    <span>Gmail</span>
                  </button>
                  <button
                    type="button"
                    className={candidateDraft.source === "slack" ? "active" : ""}
                    onClick={() => setCandidateDraft((previous) => ({ ...previous, source: "slack" }))}
                  >
                    <Users size={14} />
                    <span>Slack</span>
                  </button>
                </div>
                
                <input
                  aria-label="보낸 사람"
                  value={candidateDraft.sourceDetail}
                  onChange={(event) => setCandidateDraft((previous) => ({ ...previous, sourceDetail: event.target.value }))}
                  placeholder={candidateDraft.source === "gmail" ? "보낸 사람 (이메일)" : "채널명 (예: #general)"}
                />
                
                {candidateDraft.source === "gmail" ? (
                  <input
                    aria-label="메일 제목"
                    value={candidateDraft.subject}
                    onChange={(event) => setCandidateDraft((previous) => ({ ...previous, subject: event.target.value }))}
                    placeholder="이메일 제목"
                  />
                ) : <div />}

                <textarea
                  aria-label="본문 메시지"
                  value={candidateDraft.text}
                  onChange={(event) => setCandidateDraft((previous) => ({ ...previous, text: event.target.value }))}
                  placeholder="분석을 실행할 텍스트 내용을 입력하세요..."
                />
                <button className="primary-action" type="submit">
                  <Sparkles size={16} />
                  <span>AI 분석 실행</span>
                </button>
              </form>
            </details>

            {/* 일정 후보 카드 목록 */}
            <CandidateList
              candidates={candidates}
              onConfirm={confirmCandidate}
              onReject={rejectCandidate}
            />
          </section>
        ) : null}

        {/* 3. 회의록 요약 탭 */}
        {activeTab === "meeting" ? (
          <section className="product-panel meeting-layout">
            
            {/* 회의록 리스트 및 디테일 분기 */}
            {!selectedNoteId && !showCreateNoteForm ? (
              <div className="notes-list-view">
                <div className="notes-list-header">
                  <div>
                    <span>최근 녹음 회의록</span>
                    <h1>회의 요약 리스트</h1>
                  </div>
                  <button className="primary-action" onClick={() => setShowCreateNoteForm(true)}>
                    <Plus size={16} />
                    <span>회의록 직접 작성</span>
                  </button>
                </div>

                {appState?.meetingNotes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
                    <FileText size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
                    <p>작성된 회의록이 없습니다.</p>
                  </div>
                ) : (
                  <div className="notes-grid">
                    {appState?.meetingNotes.map((note) => (
                      <div key={note.meetingNoteId} className="note-card" onClick={() => setSelectedNoteId(note.meetingNoteId)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <h3>{note.title}</h3>
                          <Sparkles size={14} style={{ color: "var(--accent)" }} />
                        </div>
                        <div className="note-card-meta">
                          <span>일시: {formatDateTime(note.createdAt)}</span>
                        </div>
                        <p>{note.summary || "AI가 요약 분석을 수행한 요약 요약글이 이곳에 표시됩니다."}</p>
                        <div className="note-card-footer">
                          <Users size={12} />
                          <span>참석자: 2명</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* 새 회의록 등록 폼 */}
            {showCreateNoteForm ? (
              <div className="create-note-view">
                <div className="notes-list-header">
                  <div>
                    <span>새 회의 요약 분석</span>
                    <h1>회의록 작성</h1>
                  </div>
                  <button className="square-button" onClick={() => setShowCreateNoteForm(false)} title="취소">
                    <X size={16} />
                  </button>
                </div>

                <input
                  aria-label="Meeting title"
                  className="title-input"
                  value={meetingTitle}
                  onChange={(event) => setMeetingTitle(event.target.value)}
                  placeholder="회의 주제를 입력하세요 (예: 캡스톤 프로젝트 정기 주간 회의)"
                />
                
                <textarea
                  aria-label="Meeting transcript"
                  value={meetingText}
                  onChange={(event) => setMeetingText(event.target.value)}
                  placeholder="여기에 회의록 전사 텍스트를 붙여넣거나 직접 작성하세요.&#10;예)&#10;우진: 이번 시연을 준비하기 위해 발표 자료 초안을 금요일까지 완성합시다.&#10;지영: 좋습니다. 슬라이드 템플릿은 제가 잡아둘 테니 텍스트 정리해서 보내주세요."
                />

                <div className="create-note-view-buttons">
                  <button className="square-button" onClick={() => setShowCreateNoteForm(false)} style={{ padding: "0 16px", height: "38px" }}>
                    취소
                  </button>
                  <button className="primary-action" onClick={summarizeMeeting} disabled={isLoading}>
                    <Sparkles size={16} />
                    <span>AI 요약하기</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* 회의록 상세 뷰 (클로바노트식 2단 분할 레이아웃 연동) */}
            {selectedNoteId && selectedNote ? (
              <div className="note-detail-view">
                <div className="note-detail-header">
                  <div className="note-detail-title-area">
                    <h2>{selectedNote.title}</h2>
                    <div>
                      <span>작성일시: {formatDateTime(selectedNote.createdAt)}</span>
                      <span>•</span>
                      <span>참석자: 2명</span>
                    </div>
                  </div>
                  <div className="note-detail-actions">
                    <button className="square-button" onClick={() => setSelectedNoteId(null)}>
                      <ArrowLeft size={14} />
                      <span>목록보기</span>
                    </button>
                  </div>
                </div>

                {/* 오디오 플레이어 비주얼라이저 모형 */}
                <div className="audio-player-mock">
                  <div className="audio-controls">
                    <button onClick={() => setCurrentTime(Math.max(0, currentTime - 10))} title="10초 뒤로">
                      <RotateCcw size={14} />
                    </button>
                    <button className="play-btn" onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? "일시정지" : "재생"}>
                      {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: "2px" }} />}
                    </button>
                  </div>
                  
                  <div className="audio-time">
                    {formatAudioTime(currentTime)} / {formatAudioTime(audioDuration)}
                  </div>

                  {/* 파형 렌더링 (클릭 시 이동) */}
                  <div className={`audio-waveform-mock ${isPlaying ? "active" : ""}`}>
                    {barHeights.map((heightValue, index) => {
                      const barProgress = (index / barsCount) * audioDuration;
                      const isPlayed = currentTime >= barProgress;
                      return (
                        <span
                          key={index}
                          className={isPlayed ? "played" : ""}
                          style={{ height: `${heightValue}px`, cursor: "pointer" }}
                          onClick={() => {
                            setCurrentTime(Math.round(barProgress));
                            setIsPlaying(true);
                          }}
                        />
                      );
                    })}
                  </div>

                  <div
                    className="audio-speed"
                    onClick={() => {
                      setAudioSpeed((prev) => (prev === 1.0 ? 1.5 : prev === 1.5 ? 2.0 : 1.0));
                    }}
                  >
                    {audioSpeed.toFixed(1)}x 배속
                  </div>
                </div>

                {/* 2단 분할 영역 */}
                <div className="notes-split-container">
                  
                  {/* 왼쪽: 대화 기록 */}
                  <div className="transcript-pane">
                    <div className="transcript-pane-header">
                      전사 대화 기록 ({parsedTranscript.length}문장)
                    </div>
                    <div className="transcript-scroll">
                      {parsedTranscript.map((row, index) => {
                        const rowSecs = row.time.split(":").reduce((acc, val, i) => acc + parseInt(val, 10) * (i === 0 ? 60 : 1), 0);
                        const isCurrentlyPlayingRow = isPlaying && currentTime >= rowSecs && currentTime < rowSecs + 12;
                        return (
                          <div
                            key={index}
                            className="speaker-row"
                            onClick={() => jumpToTime(row.time)}
                            style={{
                              cursor: "pointer",
                              padding: "6px 8px",
                              borderRadius: "8px",
                              background: isCurrentlyPlayingRow ? "var(--accent-soft)" : "transparent"
                            }}
                          >
                            <div className="speaker-avatar">
                              {row.speaker.charAt(0)}
                            </div>
                            <div className="speaker-content">
                              <div className="speaker-meta">
                                <span className="speaker-name">{row.speaker}</span>
                                <span className="speaker-time">{row.time}</span>
                              </div>
                              <div className="speaker-text">{row.text}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 오른쪽: AI 분석 결과 */}
                  <div className="ai-pane">
                    <div className="tab-headers">
                      <button
                        className={`tab-header-btn ${activeSummaryTab === "summary" ? "active" : ""}`}
                        onClick={() => setActiveSummaryTab("summary")}
                      >
                        <FileText size={14} />
                        <span>AI 요약</span>
                      </button>
                      <button
                        className={`tab-header-btn ${activeSummaryTab === "decisions" ? "active" : ""}`}
                        onClick={() => setActiveSummaryTab("decisions")}
                      >
                        <CheckCircle2 size={14} />
                        <span>결정 사항</span>
                      </button>
                      <button
                        className={`tab-header-btn ${activeSummaryTab === "actions" ? "active" : ""}`}
                        onClick={() => setActiveSummaryTab("actions")}
                      >
                        <CheckSquare size={14} />
                        <span>Action Items</span>
                      </button>
                    </div>

                    <div className="ai-pane-content">
                      {activeSummaryTab === "summary" ? (
                        <div className="result-block">
                          <h3>핵심 요약</h3>
                          <p style={{ whiteSpace: "pre-line" }}>{selectedNote.summary}</p>
                        </div>
                      ) : null}

                      {activeSummaryTab === "decisions" ? (
                        <div className="result-block">
                          <h3>결정 사항</h3>
                          {selectedNote.decisions.length === 0 ? (
                            <p style={{ color: "var(--muted)" }}>합의된 주요 결정 사항이 없습니다.</p>
                          ) : (
                            <ol>
                              {selectedNote.decisions.map((decision, index) => (
                                <li key={index} style={{ marginBottom: "6px" }}>{decision}</li>
                              ))}
                            </ol>
                          )}
                          
                          <h3 style={{ marginTop: "16px" }}>리스크 요소</h3>
                          {selectedNote.risks.length === 0 ? (
                            <p style={{ color: "var(--muted)" }}>감지된 리스크 요소가 없습니다.</p>
                          ) : (
                            <ul>
                              {selectedNote.risks.map((risk, index) => (
                                <li key={index} style={{ color: "var(--rose)", marginBottom: "4px" }}>
                                  <AlertTriangle size={12} style={{ display: "inline", marginRight: "4px" }} />
                                  {risk}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}

                      {activeSummaryTab === "actions" ? (
                        <div className="result-block">
                          <h3>할 일 리스트</h3>
                          {selectedNote.actionItems.length === 0 ? (
                            <p style={{ color: "var(--muted)" }}>추출된 액션 아이템이 없습니다.</p>
                          ) : (
                            <div className="table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th style={{ width: "36px" }}>상태</th>
                                    <th>할 일 내용</th>
                                    <th>담당자</th>
                                    <th>마감일</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedNote.actionItems.map((item) => {
                                    const isDone = checkedActions[item.actionItemId];
                                    return (
                                      <tr key={item.actionItemId} style={{ opacity: isDone ? 0.6 : 1 }}>
                                        <td>
                                          <button onClick={() => toggleActionItem(item.actionItemId)} style={{ display: "flex", color: isDone ? "var(--accent)" : "var(--muted)" }}>
                                            {isDone ? <CheckSquare size={16} /> : <Square size={16} />}
                                          </button>
                                        </td>
                                        <td style={{ textDecoration: isDone ? "line-through" : "none", fontWeight: 500 }}>
                                          {item.task}
                                        </td>
                                        <td>
                                          <span className="source-badge" style={{ display: "inline-block", padding: "2px 6px" }}>
                                            {item.assignee || "미지정"}
                                          </span>
                                        </td>
                                        <td style={{ color: "var(--muted)", fontSize: "11px" }}>
                                          {item.dueAt ? formatDateTime(item.dueAt) : "미정"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 4. 하루 성장 보고서 탭 */}
        {activeTab === "review" ? (
          <section className="product-panel">
            <div className="panel-heading">
              <div>
                <span>하루 피드백</span>
                <h1>하루 성장보고서</h1>
              </div>
              <div className="review-actions">
                <button className="secondary-action" onClick={saveTimeGaps} disabled={isLoading}>
                  <Check size={16} />
                  <span>저장</span>
                </button>
                <button className="primary-action" onClick={analyzeTimeUsageFromGaps} disabled={isLoading}>
                  <span>시간 사용 분석</span>
                </button>
              </div>
            </div>

            <TimeGapRecorder
              selectedDate={selectedDate}
              events={events.filter((event) => isSameDay(new Date(event.startAt), selectedDate))}
              gaps={timeGaps}
              satisfaction={reviewSatisfaction}
              onSatisfactionChange={setReviewSatisfaction}
              onChange={updateTimeGap}
            />

            <TimeUsageAnalysis
              summary={timeUsageResult?.summary ?? appState?.timeUsageSummaries.find((summary) => summary.date === toInputDate(selectedDate))}
              confirmations={
                timeUsageResult?.confirmation_requests ??
                appState?.confirmations.filter((request) => request.targetType === "time_usage_plan" && request.targetId === toInputDate(selectedDate)) ??
                []
              }
              onResolve={resolveConfirmation}
            />

            <WeeklyAchievementBadges achievements={weeklyAchievements} />
          </section>
        ) : null}

        {/* 5. 설정 탭 */}
        {activeTab === "settings" ? (
          <section className="product-panel settings-layout">
            <div className="panel-heading">
              <div>
                <span>서비스 연동 관리</span>
                <h1>외부 플랫폼 연결 설정</h1>
              </div>
            </div>

            <div className="settings-section-title">계정 연동 상태</div>
            
            <div className="connection-row">
              <div>
                <div className="connection-logo" style={{ color: "#e03131", background: "#fff5f5" }}>G</div>
                <div className="connection-info">
                  <strong>Google Calendar / Gmail 연동</strong>
                  <ProviderStatus provider="google" accounts={appState?.connectedAccounts ?? []} />
                </div>
              </div>
              <button onClick={() => connect("google")}>
                <Link2 size={15} />
                <span>새 계정 연결</span>
              </button>
            </div>

            <div className="connection-row">
              <div>
                <div className="connection-logo" style={{ color: "#4a154b", background: "#f3f0ff" }}>S</div>
                <div className="connection-info">
                  <strong>Slack 워크스페이스 연동</strong>
                  <ProviderStatus provider="slack" accounts={appState?.connectedAccounts ?? []} />
                </div>
              </div>
              <button onClick={() => connect("slack")}>
                <Link2 size={15} />
                <span>워크스페이스 연결</span>
              </button>
            </div>

            <div className="settings-section-title" style={{ marginTop: "24px" }}>사용자 알림 및 선호도 요약</div>
            {appState?.preferences ? <PreferencesView preferences={appState.preferences} /> : null}

            <div className="settings-section-title" style={{ marginTop: "24px" }}>오늘의 운세 및 기본 정보</div>
            <ProfileSettings
              draft={profileDraft}
              onDraftChange={setProfileDraft}
              onSave={() => saveProfileDraft({ message: "기본 정보와 운세 설정을 저장했습니다." })}
              onPreviewOnboarding={reopenOnboarding}
            />
          </section>
        ) : null}
      </section>

      {isFortuneDetailOpen && todayFortune ? (
        <FortuneDetailModal
          fortune={todayFortune}
          onClose={() => setIsFortuneDetailOpen(false)}
          onFeedback={saveFortuneFeedback}
        />
      ) : null}

      {selectedEvent ? (
        <EventDetailPanel
          event={selectedEvent}
          recording={eventRecording}
          isLoading={isLoading}
          isRecording={isEventRecording}
          onRecordingChange={setEventRecording}
          onStartRecording={startEventRecording}
          onStopRecording={stopEventRecording}
          onClose={() => setSelectedEventId(null)}
          onSave={() => saveEventNote()}
          onSummarize={() => saveEventNote({ summarize: true })}
          onToggleComplete={() => toggleEventCompletion(selectedEvent)}
        />
      ) : null}

      {isAgentOpen ? (
        <aside className="floating-agent" aria-label="AI 대화창">
          <div className="agent-popup-header">
            <div className="agent-popup-brand">
              <BrandMark compact />
              <span>하루톡톡</span>
            </div>
            <button
              type="button"
              className="agent-minimize"
              onClick={() => setIsAgentOpen(false)}
              title="대화창 내리기"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="agent-thread">
            {messages.length === 0 && !isListening ? (
              <p className="agent-thread-empty">마이크나 텍스트로 일정을 말해보세요.</p>
            ) : null}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`thread-message ${message.role}`}>
                <span>{message.text}</span>
              </div>
            ))}
            {isListening ? (
              <div className="thread-message agent listening">
                <span className="listening-dots" aria-label="듣는 중">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
          <form className="agent-command" onSubmit={sendChat}>
            <button type="button" onClick={startVoiceInput} title="음성 입력" className={isListening ? "listening" : ""}>
              <Mic size={17} />
            </button>
            <input
              aria-label="Agent command"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="내일 오후 3시에 회의 잡아줘"
            />
            <button type="submit" disabled={isLoading} title="전송">
              <Send size={17} />
            </button>
          </form>
        </aside>
      ) : (
        <button
          type="button"
          className="agent-launcher"
          onClick={() => setIsAgentOpen(true)}
          title="하루톡톡 열기"
          aria-label="하루톡톡 AI 대화창 열기"
        >
          <BrandMark compact />
          <span>하루톡톡</span>
        </button>
      )}
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`haru-brand-mark ${compact ? "compact" : ""}`} aria-hidden="true" />;
}

// 캘린더 미니 달력 컴포넌트
function MiniMonth({ selectedDate, events, onSelectDate }: { selectedDate: Date; events: CalendarEvent[]; onSelectDate: (date: Date) => void }) {
  const start = startOfWeek(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));

  return (
    <div className="mini-month">
      <div className="mini-weekdays">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mini-grid">
        {days.map((day) => {
          const dayEvents = events.filter((event) => isSameDay(new Date(event.startAt), day));
          const selected = isSameDay(day, selectedDate);
          const outside = day.getMonth() !== selectedDate.getMonth();
          return (
            <button key={day.toISOString()} className={`${selected ? "selected" : ""} ${outside ? "outside" : ""}`} onClick={() => onSelectDate(day)}>
              <span>{day.getDate()}</span>
              {dayEvents.length > 0 ? <i /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 다가오는 일정 목록 컴포넌트
function AgendaList({
  events,
  onSelect,
  onDelete
}: {
  events: CalendarEvent[];
  onSelect: (eventId: string) => void;
  onDelete: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return <p className="empty-dark" style={{ padding: "12px", textAlign: "center" }}>다가오는 일정이 없습니다.</p>;
  }

  return (
    <div className="agenda-list">
      {events.map((event) => (
        <article key={event.eventId} onClick={() => onSelect(event.eventId)}>
          <span className={`dot ${eventTone(event)}`} />
          <div>
            <strong>{event.title}</strong>
            <p>{formatAgendaDate(event.startAt)} · {formatTimeRange(event.startAt, event.endAt)}</p>
          </div>
          <button onClick={(clickEvent) => { clickEvent.stopPropagation(); onDelete(event.eventId); }} title="삭제">
            <Trash2 size={13} />
          </button>
        </article>
      ))}
    </div>
  );
}

// 주간 캘린더 뷰
function WeekCalendar({
  days,
  events,
  onSelect,
  onDelete,
  onToggleImportant,
  onToggleComplete
}: {
  days: Date[];
  events: CalendarEvent[];
  onSelect: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onToggleImportant: (event: CalendarEvent) => void;
  onToggleComplete: (event: CalendarEvent) => void;
}) {
  return (
    <section className="week-calendar">
      <div className="calendar-head">
        <div className="timezone">KST<br />(GMT+9)</div>
        {days.map((day) => (
          <div key={day.toISOString()} className={isSameDay(day, new Date()) ? "today" : ""}>
            <span>{weekdayLabel(day)}</span>
            <strong>{day.getDate()}</strong>
          </div>
        ))}
      </div>
      <div className="calendar-body" style={{ height: hours.length * hourHeight }}>
        <div className="time-axis">
          {hours.map((hour) => (
            <span key={hour} style={{ top: (hour - hours[0]) * hourHeight }}>
              {formatHour(hour)}
            </span>
          ))}
        </div>
        <div className="day-columns">
          {days.map((day) => (
            <div key={day.toISOString()} className={`day-column ${isSameDay(day, new Date()) ? "today" : ""}`}>
              {hours.map((hour) => (
                <span key={hour} className="hour-line" style={{ top: (hour - hours[0]) * hourHeight }} />
              ))}
              {events
                .filter((event) => isSameDay(new Date(event.startAt), day))
                .map((event) => (
                  <CalendarBlock
                    key={event.eventId}
                    event={event}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onToggleImportant={onToggleImportant}
                    onToggleComplete={onToggleComplete}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 주간 캘린더 블록
function CalendarBlock({
  event,
  onSelect,
  onDelete,
  onToggleImportant,
  onToggleComplete
}: {
  event: CalendarEvent;
  onSelect: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onToggleImportant: (event: CalendarEvent) => void;
  onToggleComplete: (event: CalendarEvent) => void;
}) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const top = Math.max(0, (startHour - hours[0]) * hourHeight);
  const height = Math.max(38, (endHour - startHour) * hourHeight - 7);

  return (
    <article className={`calendar-event ${eventTone(event)} ${event.isImportant ? "important" : ""} ${event.isCompleted ? "completed" : ""}`} style={{ top, height }} onClick={() => onSelect(event.eventId)}>
      <div>
        <span>{formatEventTime(event.startAt)}</span>
        <strong>{event.title}</strong>
        {event.location ? <p>{event.location}</p> : null}
      </div>
      <div className="calendar-event-actions">
        <button
          className={`complete-toggle ${event.isCompleted ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(event);
          }}
          title={event.isCompleted ? "완료 해제" : "일정 완료"}
          aria-label={event.isCompleted ? "완료 해제" : "일정 완료"}
        >
          <Check size={12} />
        </button>
        <button
          className={`important-toggle ${event.isImportant ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleImportant(event);
          }}
          title={event.isImportant ? "중요 일정 해제" : "중요 일정 표시"}
          aria-label={event.isImportant ? "중요 일정 해제" : "중요 일정 표시"}
        >
          <Star size={12} fill={event.isImportant ? "currentColor" : "none"} />
        </button>
        <button className="delete-event-button" onClick={(e) => { e.stopPropagation(); onDelete(event.eventId); }} title="삭제">
          <Trash2 size={12} />
        </button>
      </div>
    </article>
  );
}

function EventDetailPanel({
  event,
  recording,
  isLoading,
  isRecording,
  onRecordingChange,
  onStartRecording,
  onStopRecording,
  onClose,
  onSave,
  onSummarize,
  onToggleComplete
}: {
  event: CalendarEvent;
  recording: string;
  isLoading: boolean;
  isRecording: boolean;
  onRecordingChange: (value: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClose: () => void;
  onSave: () => void;
  onSummarize: () => void;
  onToggleComplete: () => void;
}) {
  return (
    <aside className="event-detail-panel" aria-label="일정 기록">
      <div className="event-detail-header">
        <div>
          <span>일정 기록</span>
          <h2>{event.title}</h2>
          <p>{formatDateTimeRange(event.startAt, event.endAt)}</p>
        </div>
        <button type="button" onClick={onClose} title="닫기">
          <X size={16} />
        </button>
      </div>

      <button type="button" className={`event-complete-row ${event.isCompleted ? "completed" : ""}`} onClick={onToggleComplete}>
        <CheckCircle2 size={17} />
        <span>{event.isCompleted ? "완료된 일정입니다" : "이 일정을 완료로 표시"}</span>
      </button>

      <div className="event-detail-section">
        <div className="recording-agent">
          <div>
            <strong>{isRecording ? "내용을 듣고 있어요..." : "녹음을 시작하면 종료 시 자동 요약돼요."}</strong>
          </div>
          <button
            type="button"
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={isRecording ? "recording" : ""}
          >
            {isRecording ? <Square size={15} /> : <Mic size={15} />}
            <span>{isRecording ? "녹음 종료" : "녹음 시작"}</span>
          </button>
        </div>
        <label htmlFor="event-recording">실시간 기록</label>
        <textarea
          id="event-recording"
          value={recording}
          onChange={(changeEvent) => onRecordingChange(changeEvent.target.value)}
          placeholder="녹음을 시작하면 인식된 내용이 여기에 쌓입니다."
        />
      </div>

      <div className="event-detail-actions">
        <button type="button" className="square-button" onClick={onSave} disabled={isLoading}>
          저장
        </button>
        <button type="button" className="primary-action" onClick={onSummarize} disabled={isLoading}>
          <span>요약 다시 생성</span>
        </button>
      </div>

      <section className="event-summary-card">
        <div>
          <strong>AI 요약</strong>
        </div>
        {event.aiSummary ? (
          <p>{event.aiSummary}</p>
        ) : (
          <p className="muted">녹음 종료를 누르면 자동으로 요약됩니다.</p>
        )}
      </section>
    </aside>
  );
}

// 후보 리스트 컴포넌트
function CandidateList({
  candidates,
  onConfirm,
  onReject
}: {
  candidates: ScheduleCandidate[];
  onConfirm: (candidate: ScheduleCandidate, alternative?: { startAt: string; endAt: string }) => void;
  onReject: (candidate: ScheduleCandidate) => void;
}) {
  const filtered = candidates.filter((item) => ["pending", "conflict", "held"].includes(item.status));

  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px", color: "var(--muted)" }}>
        <Inbox size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
        <p>수신된 일정 분석 후보가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="candidate-list">
      {filtered.map((candidate) => (
        <article key={candidate.candidateId} className={`candidate-card ${candidate.status}`}>
          <div className="candidate-head">
            <span className="confidence">
              신뢰도 {Math.round(candidate.confidence * 100)}%
            </span>
          </div>
          <h3>{candidate.title}</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "4px 0" }}>
            <p>
              <Clock size={14} />
              <span>{formatDateTimeRange(candidate.startAt, candidate.endAt)}</span>
            </p>
            {candidate.location ? (
              <p>
                <Users size={14} />
                <span>장소: {candidate.location}</span>
              </p>
            ) : null}
          </div>

          {candidate.snippet ? <blockquote>&ldquo;{candidate.snippet}&rdquo;</blockquote> : null}
          
          {candidate.status === "conflict" && candidate.alternatives && candidate.alternatives.length > 0 ? (
            <div className="alternative-list">
              <p>⚠️ 기존의 일정과 충돌이 감지되었습니다. AI가 추천하는 대체 시간대:</p>
              <div className="alternative-list-buttons">
                {candidate.alternatives.map((slot) => (
                  <button key={slot.startAt} onClick={() => onConfirm(candidate, slot)}>
                    <Clock size={12} />
                    <span>{slot.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          
          <div className="card-actions">
            <button onClick={() => onConfirm(candidate)} disabled={candidate.status === "confirmed" || candidate.status === "rejected"}>
              <Check size={14} />
              <span>캘린더 등록</span>
            </button>
            <button className="ghost" onClick={() => onReject(candidate)} disabled={candidate.status === "confirmed" || candidate.status === "rejected"}>
              <X size={14} />
              <span>보류/무시</span>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function OnboardingFlow({
  step,
  draft,
  onStepChange,
  onDraftChange,
  routineDraft,
  onRoutineDraftChange,
  routineItems,
  onAddRoutine,
  onRemoveRoutine,
  onSkipBirthday,
  onComplete,
  isPreview
}: {
  step: "start" | "basic" | "goals" | "routine" | "complete";
  draft: ProfileDraft;
  onStepChange: (step: "start" | "basic" | "goals" | "routine" | "complete") => void;
  onDraftChange: (draft: ProfileDraft | ((previous: ProfileDraft) => ProfileDraft)) => void;
  routineDraft: OnboardingRoutineDraft;
  onRoutineDraftChange: (draft: OnboardingRoutineDraft | ((previous: OnboardingRoutineDraft) => OnboardingRoutineDraft)) => void;
  routineItems: OnboardingRoutineItem[];
  onAddRoutine: () => void;
  onRemoveRoutine: (id: string) => void;
  onSkipBirthday: () => void;
  onComplete: () => void;
  isPreview?: boolean;
}) {
  return (
    <main className={`onboarding-shell ${step === "start" ? "start-screen" : ""}`}>
      <section className={`onboarding-card ${step === "start" ? "hero-onboarding-card" : ""}`}>
        {step === "start" ? (
          <div className="hero-onboarding">
            <div className="hero-copy">
              <h1>오늘 일정과 톡톡 운세를 한눈에</h1>
              <p>말하듯 일정을 추가하고 하루 목표와 루틴을 확인해보세요. 하루톡톡이 오늘의 작은 미션까지 함께 정리해드릴게요.</p>
              <div className="hero-actions">
                <button className="primary-action" onClick={() => onStepChange("basic")}>
                  <span>시작하기</span>
                </button>
                <button className="hero-secondary" onClick={() => onStepChange("basic")}>
                  생일 입력은 나중에 할게요
                </button>
              </div>
            </div>
            <div className="hero-product-motion" aria-hidden="true">
              <div className="motion-topbar">
                <span />
                <span />
                <span />
              </div>
              <div className="motion-calendar">
                <div className="motion-calendar-head">
                  <strong>2026년 6월</strong>
                  <small>오늘의 흐름</small>
                </div>
                <div className="motion-grid">
                  {["07:00", "10:00", "13:00", "15:00", "19:00"].map((time, index) => (
                    <div key={time} className={`motion-event motion-event-${index + 1}`}>
                      <span>{time}</span>
                      <strong>{["영어 루틴", "집중 공부", "BBC English", "캡스톤 회의", "운동"][index]}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="motion-fortune-card">
                <Sun size={16} />
                <div>
                  <span>오늘의 톡톡 운세</span>
                  <strong>오전 루틴이 하루 흐름을 잡아줘요.</strong>
                </div>
              </div>
              <div className="motion-chat-card">
                <Sparkles size={15} />
                <span>내일 오후 3시 회의 잡아줘</span>
              </div>
            </div>
          </div>
        ) : null}

        {step === "basic" ? (
          <div className="onboarding-step">
            <BrandMark compact />
            <span>기본 정보</span>
            <h1>하루톡톡이 당신의 하루를 더 잘 맞춰드릴게요.</h1>
            <p>생일과 생활 패턴을 입력하면 오늘의 운세와 하루 추천을 더 개인화할 수 있어요.</p>
            <ProfileFields draft={draft} onDraftChange={onDraftChange} compact />
            <p className="privacy-note">생년월일은 오늘의 운세와 개인화된 하루 추천에만 사용하며, 주민등록번호 같은 민감한 정보는 받지 않습니다.</p>
            <div className="onboarding-actions">
              <button className="square-button" onClick={onSkipBirthday}>건너뛰기</button>
              <button className="primary-action" onClick={() => onStepChange("goals")}>다음으로</button>
            </div>
          </div>
        ) : null}

        {step === "goals" ? (
          <div className="onboarding-step">
            <BrandMark compact />
            <span>목표 설정</span>
            <h1>함께 일정을 정해보아요.</h1>
            <p>단기 목표와 장기 목표를 적어두면 하루 추천이 목표와 더 잘 연결됩니다.</p>
            <div className="profile-form-grid">
              <label>
                <span>단기 목표</span>
                <input value={draft.shortTermGoal} placeholder="예: 매일 영어 공부 30분" onChange={(event) => onDraftChange((previous) => ({ ...previous, shortTermGoal: event.target.value }))} />
              </label>
              <label>
                <span>장기 목표</span>
                <input value={draft.longTermGoal} placeholder="예: 6개월 안에 자격증 취득" onChange={(event) => onDraftChange((previous) => ({ ...previous, longTermGoal: event.target.value }))} />
              </label>
              <label>
                <span>목표 카테고리</span>
                <select value={draft.goalCategory} onChange={(event) => onDraftChange((previous) => ({ ...previous, goalCategory: event.target.value }))}>
                  {["공부", "운동", "자격증", "취업", "프로젝트", "생활습관", "기타"].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="onboarding-actions">
              <button className="square-button" onClick={() => onStepChange("basic")}>이전</button>
              <button className="primary-action" onClick={() => onStepChange("routine")}>다음으로</button>
            </div>
          </div>
        ) : null}

        {step === "routine" ? (
          <div className="onboarding-step">
            <BrandMark compact />
            <span>반복 일정 등록</span>
            <h1>자주 반복되는 일정을 먼저 등록해볼까요?</h1>
            <p>매일 공부, 평일 루틴, 주말 운동처럼 반복되는 일정을 여러 개 추가할 수 있어요. 등록한 루틴은 앞으로 4주 일정표에 자동으로 반영됩니다.</p>
            <div className="onboarding-routine-form">
              <label className="full">
                <span>일정 제목</span>
                <input
                  value={routineDraft.title}
                  placeholder="예: 매일 영어 공부 30분"
                  onChange={(event) => onRoutineDraftChange((previous) => ({ ...previous, title: event.target.value }))}
                />
              </label>
              <label>
                <span>카테고리</span>
                <select value={routineDraft.category} onChange={(event) => onRoutineDraftChange((previous) => ({ ...previous, category: event.target.value }))}>
                  {["공부", "운동", "자격증", "취업", "프로젝트", "생활습관", "기타"].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>반복 주기</span>
                <select value={routineDraft.repeat} onChange={(event) => onRoutineDraftChange((previous) => ({ ...previous, repeat: event.target.value as OnboardingRoutineDraft["repeat"] }))}>
                  <option value="daily">매일</option>
                  <option value="weekday">평일</option>
                  <option value="weekend">주말</option>
                  <option value="weekly">매주</option>
                </select>
              </label>
              {routineDraft.repeat === "weekly" ? (
                <div className="routine-weekday-picker">
                  <span>반복 요일</span>
                  <div>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={routineDraft.weekdays.includes(day) ? "active" : ""}
                        onClick={() =>
                          onRoutineDraftChange((previous) => ({
                            ...previous,
                            weekdays: previous.weekdays.includes(day)
                              ? previous.weekdays.filter((item) => item !== day)
                              : [...previous.weekdays, day].sort()
                          }))
                        }
                      >
                        {["일", "월", "화", "수", "목", "금", "토"][day]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label>
                <span>시작 시간</span>
                <input type="time" value={routineDraft.start} onChange={(event) => onRoutineDraftChange((previous) => ({ ...previous, start: event.target.value }))} />
              </label>
              <label>
                <span>종료 시간</span>
                <input type="time" value={routineDraft.end} onChange={(event) => onRoutineDraftChange((previous) => ({ ...previous, end: event.target.value }))} />
              </label>
              <label>
                <span>장소</span>
                <input value={routineDraft.location} placeholder="선택 입력" onChange={(event) => onRoutineDraftChange((previous) => ({ ...previous, location: event.target.value }))} />
              </label>
              <button
                type="button"
                className={`routine-important-button ${routineDraft.isImportant ? "active" : ""}`}
                onClick={() => onRoutineDraftChange((previous) => ({ ...previous, isImportant: !previous.isImportant }))}
              >
                <Star size={16} fill={routineDraft.isImportant ? "currentColor" : "none"} />
                <span>중요 일정</span>
              </button>
              <button type="button" className="routine-add-button" onClick={onAddRoutine}>
                <Plus size={16} />
                <span>반복 일정 추가</span>
              </button>
            </div>
            {routineItems.length > 0 ? (
              <div className="routine-list">
                {routineItems.map((routine) => (
                  <div key={routine.id} className="routine-list-item">
                    <div>
                      <strong>{routine.title}</strong>
                      <span>
                        {repeatLabel(routine.repeat)}
                        {" · "}
                        {routine.start} ~ {routine.end}
                        {routine.location ? ` · ${routine.location}` : ""}
                      </span>
                    </div>
                    {routine.isImportant ? <Star size={14} fill="currentColor" /> : null}
                    <button type="button" onClick={() => onRemoveRoutine(routine.id)} title="반복 일정 삭제">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="onboarding-actions">
              <button className="square-button" onClick={() => onStepChange("goals")}>이전</button>
              <button className="primary-action" onClick={() => onStepChange("complete")}>다음으로</button>
            </div>
          </div>
        ) : null}

        {step === "complete" ? (
          <div className="onboarding-step">
            <BrandMark compact />
            <span>준비 완료</span>
            <h1>좋아요. 이제 하루톡톡이 당신의 하루를 함께 관리할게요.</h1>
            <p>캘린더에 들어가면 오늘 일정과 연결된 톡톡 운세를 함께 확인할 수 있어요.</p>
            <button className="primary-action" onClick={onComplete}>{isPreview ? "캘린더로 돌아가기" : "내 캘린더로 이동하기"}</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function FortuneCard({ fortune, onOpen, onRefresh }: { fortune?: DailyFortune; onOpen: () => void; onRefresh: () => void }) {
  return (
    <button className="fortune-card" onClick={fortune ? onOpen : onRefresh}>
      <div className="fortune-card-icon">
        <Sun size={18} />
      </div>
      <div>
        <span>오늘의 톡톡 운세</span>
        <strong>{fortune?.summary ?? "오늘 일정과 연결된 운세를 준비하고 있어요."}</strong>
        {fortune ? <small>추천 행동: {fortune.recommendedAction}</small> : <small>잠시 후 다시 확인해보세요.</small>}
      </div>
      <Sparkles size={18} />
    </button>
  );
}

function MissionCard({ fortune }: { fortune?: DailyFortune }) {
  return (
    <article className="mission-card">
      <div>
        <span>오늘의 작은 미션</span>
        <strong>{fortune?.mission ?? "중요 일정 하나를 고르고 한 줄 메모를 남겨보세요."}</strong>
      </div>
      <CheckCircle2 size={20} />
    </article>
  );
}

function FortuneDetailModal({
  fortune,
  onClose,
  onFeedback
}: {
  fortune: DailyFortune;
  onClose: () => void;
  onFeedback: (feedback: DailyFortune["userFeedback"]) => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="fortune-modal">
        <header>
          <div>
            <span>오늘의 톡톡 운세</span>
            <h2>{fortune.summary}</h2>
          </div>
          <button className="square-button" onClick={onClose} title="닫기">
            <X size={16} />
          </button>
        </header>
        <div className="fortune-detail-grid">
          <article>
            <span>오늘의 추천 행동</span>
            <p>{fortune.recommendedAction}</p>
          </article>
          <article>
            <span>주의할 일정</span>
            <p>{fortune.caution}</p>
          </article>
          <article>
            <span>행운의 카테고리</span>
            <p>{fortune.luckyCategory}</p>
          </article>
          <article>
            <span>오늘의 작은 미션</span>
            <p>{fortune.mission}</p>
          </article>
        </div>
        <div className="fortune-flow">
          <div><strong>오전</strong><p>{fortune.morning}</p></div>
          <div><strong>오후</strong><p>{fortune.afternoon}</p></div>
          <div><strong>저녁</strong><p>{fortune.evening}</p></div>
        </div>
        <div className="fortune-comments">
          <h3>일정별 코멘트</h3>
          {fortune.scheduleComments.length === 0 ? (
            <p>오늘 등록된 일정이 적어, 작은 미션 중심으로 하루를 정리해볼 수 있어요.</p>
          ) : (
            fortune.scheduleComments.map((item) => (
              <div key={item.eventId}>
                <strong>{item.title}</strong>
                <p>{item.comment}</p>
              </div>
            ))
          )}
        </div>
        <FortuneFeedback selected={fortune.userFeedback} onSelect={onFeedback} />
      </section>
    </div>
  );
}

function SidebarDdayList({ events, onSelect }: { events: CalendarEvent[]; onSelect: (eventId: string) => void }) {
  return (
    <div className="sidebar-dday">
      <div className="agenda-heading">
        <span>중요 일정 D-Day</span>
      </div>
      {events.length === 0 ? (
        <p className="sidebar-dday-empty">별표 표시한 중요 일정이 없습니다.</p>
      ) : (
        <div className="sidebar-dday-list">
          {events.map((event) => (
            <button key={event.eventId} onClick={() => onSelect(event.eventId)}>
              <span>{formatDday(event.startAt)}</span>
              <div>
                <strong>{event.title}</strong>
                <p>{formatKoreanShortDate(event.startAt)} {formatEventTime(event.startAt)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const timeGapCategoryOptions: Array<{ value: TimeGapCategory; label: string }> = [
  { value: "moving", label: "이동" },
  { value: "meal", label: "식사" },
  { value: "rest", label: "휴식" },
  { value: "self_development", label: "자기개발" },
  { value: "study", label: "공부" },
  { value: "exercise", label: "운동" },
  { value: "friends", label: "친구/약속" },
  { value: "sns_video", label: "SNS/영상 시청" },
  { value: "game", label: "게임" },
  { value: "housework", label: "집안일" },
  { value: "preparation", label: "준비 시간" },
  { value: "waiting", label: "대기 시간" },
  { value: "etc", label: "기타" }
];

function TimeGapRecorder({
  selectedDate,
  events,
  gaps,
  satisfaction,
  onSatisfactionChange,
  onChange
}: {
  selectedDate: Date;
  events: CalendarEvent[];
  gaps: TimeGap[];
  satisfaction: number;
  onSatisfactionChange: (value: number) => void;
  onChange: (gapId: string, patch: Partial<TimeGap>) => void;
}) {
  return (
    <section className="time-gap-panel">
      <div className="time-gap-header">
        <div>
          <span>{formatKoreanShortDate(selectedDate.toISOString())}</span>
          <h2>비어 있던 시간에는 무엇을 하셨나요?</h2>
          <p>일정 사이의 빈 시간을 기록하면 하루톡톡이 시간 사용 패턴을 분석해 더 나은 내일을 제안해드려요.</p>
        </div>
      </div>

      <div className="today-schedule-strip">
        <strong>오늘 일정</strong>
        {events.length === 0 ? (
          <span>등록된 일정이 없습니다.</span>
        ) : (
          events.slice(0, 5).map((event) => (
            <span key={event.eventId}>
              {formatTimeRange(event.startAt, event.endAt)} {event.title}
            </span>
          ))
        )}
      </div>

      <div className="satisfaction-row">
        <span>하루 만족도</span>
        <input type="range" min="0" max="10" value={satisfaction} onChange={(event) => onSatisfactionChange(Number(event.target.value))} />
        <strong>{satisfaction}점</strong>
      </div>

      {gaps.length === 0 ? (
        <div className="empty-gap-state">
          <Clock size={22} />
          <p>분석 대상 빈 시간이 없습니다. 하루 시작/마무리 시간 또는 오늘 일정을 확인해주세요.</p>
        </div>
      ) : (
        <div className="time-gap-list">
          {gaps.map((gap) => (
            <article className={`time-gap-card ${gap.isRecorded ? "recorded" : ""}`} key={gap.id}>
              <div className="time-gap-card-top">
                <div>
                  <strong>{formatTimeRange(gap.startTime, gap.endTime)}</strong>
                  <span>{formatMinutes(gap.durationMinutes)}</span>
                </div>
                <button
                  type="button"
                  className={gap.isRecorded ? "ghost-pill active" : "ghost-pill"}
                  onClick={() => onChange(gap.id, { isRecorded: !gap.isRecorded })}
                >
                  {gap.isRecorded ? "기록됨" : "기록하지 않음"}
                </button>
              </div>
              <label>
                <span>카테고리</span>
                <select
                  value={gap.category ?? ""}
                  onChange={(event) =>
                    onChange(gap.id, {
                      category: event.target.value as TimeGapCategory,
                      isRecorded: Boolean(event.target.value)
                    })
                  }
                >
                  <option value="">선택해주세요</option>
                  {timeGapCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>간단 메모</span>
                <textarea
                  rows={2}
                  value={gap.memo ?? ""}
                  placeholder="예: 학교 이동 및 수업 전 대기"
                  onChange={(event) => onChange(gap.id, { memo: event.target.value, isRecorded: Boolean(gap.category) })}
                />
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TimeUsageAnalysis({
  summary,
  confirmations,
  onResolve
}: {
  summary?: TimeUsageSummary;
  confirmations: ConfirmationRequest[];
  onResolve: (confirmationId: string, action: "approve" | "reject") => void;
}) {
  const pendingConfirmations = confirmations.filter((request) => request.status === "pending");

  if (!summary) {
    return (
      <section className="usage-empty-panel">
        <Sparkles size={20} />
        <div>
          <strong>시간 사용 분석을 생성해보세요.</strong>
          <p>빈 시간 기록을 저장한 뒤 분석하면 점수, 피드백, 내일 일정 제안이 만들어집니다.</p>
        </div>
      </section>
    );
  }

  const rows = [
    ["일정 수행", summary.totalScheduleMinutes],
    ["이동", summary.movingMinutes],
    ["식사", summary.mealMinutes],
    ["휴식", summary.restMinutes],
    ["공부/자기개발", summary.studyMinutes + summary.selfDevelopmentMinutes],
    ["운동", summary.exerciseMinutes],
    ["SNS/영상/게임", summary.snsVideoMinutes],
    ["대기", summary.waitingMinutes],
    ["미기록", summary.unrecordedGapMinutes]
  ].filter(([, minutes]) => Number(minutes) > 0);

  return (
    <section className="usage-analysis-panel">
      <div className="usage-score-card">
        <span>오늘의 시간 사용 점수</span>
        <strong>{summary.timeUsageScore}</strong>
        <p>{summary.aiFeedback}</p>
      </div>

      <div className="usage-analysis-grid">
        <div>
          <h3>시간 사용 분석</h3>
          <div className="usage-table">
            {rows.map(([label, minutes]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{formatMinutes(Number(minutes))}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>내일 추천 시간 배치</h3>
          <ul className="soft-list">
            <li>오전: {summary.tomorrowPlan.morning}</li>
            <li>오후: {summary.tomorrowPlan.afternoon}</li>
            <li>저녁: {summary.tomorrowPlan.evening}</li>
          </ul>
        </div>
      </div>

      <div className="usage-analysis-grid">
        <div>
          <h3>잘한 점</h3>
          <List items={summary.strengths} empty="기록이 없습니다." />
        </div>
        <div>
          <h3>개선할 점</h3>
          <List items={summary.improvements} empty="기록이 없습니다." />
        </div>
      </div>

      <div className="confirmation-panel">
        <h3>사용자 승인 필요 작업</h3>
        {pendingConfirmations.length === 0 ? (
          <p>승인이 필요한 일정 변경 제안이 없습니다.</p>
        ) : (
          pendingConfirmations.map((request) => (
            <div className="confirmation-row" key={request.confirmationRequestId}>
              <div>
                <strong>{request.message}</strong>
                <span>승인 대기</span>
              </div>
              <div>
                <button type="button" onClick={() => onResolve(request.confirmationRequestId, "reject")}>거절</button>
                <button type="button" className="primary-mini" onClick={() => onResolve(request.confirmationRequestId, "approve")}>승인</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type WeeklyAchievement = {
  id: string;
  title: string;
  description: string;
  requiredDays: number;
  completedDays: number;
  unlocked: boolean;
  tone: "mint" | "blue" | "purple";
};

function WeeklyAchievementBadges({ achievements }: { achievements: WeeklyAchievement[] }) {
  return (
    <section className="achievement-panel">
      <div className="achievement-heading">
        <div>
          <span>업적</span>
          <h2>일주일 성장 배지</h2>
          <p>하루 평가와 시간 사용 분석을 꾸준히 완료하면 배지가 열립니다.</p>
        </div>
      </div>
      <div className="achievement-grid">
        {achievements.map((achievement) => (
          <article className={`achievement-badge-card ${achievement.tone} ${achievement.unlocked ? "unlocked" : "locked"}`} key={achievement.id}>
            <div className="achievement-badge-icon">
              <span>{achievement.completedDays}</span>
              <CheckCircle2 size={34} />
            </div>
            <div>
              <strong>{achievement.title}</strong>
              <p>{achievement.description}</p>
              <div className="achievement-progress">
                <div style={{ width: `${Math.min(100, Math.round((achievement.completedDays / achievement.requiredDays) * 100))}%` }} />
              </div>
              <small>
                {achievement.completedDays}/{achievement.requiredDays}일 {achievement.unlocked ? "달성 완료" : "진행 중"}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FortuneFeedback({
  selected,
  onSelect
}: {
  selected?: DailyFortune["userFeedback"];
  onSelect: (feedback: DailyFortune["userFeedback"]) => void;
}) {
  const options: Array<{ value: NonNullable<DailyFortune["userFeedback"]>; label: string }> = [
    { value: "helpful", label: "도움이 됐어요" },
    { value: "normal", label: "보통이에요" },
    { value: "unsure", label: "잘 모르겠어요" },
    { value: "not_helpful", label: "별로였어요" }
  ];
  return (
    <div className="fortune-feedback">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={selected === option.value ? "active" : ""}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ProfileSettings({
  draft,
  onDraftChange,
  onSave,
  onPreviewOnboarding
}: {
  draft: ProfileDraft;
  onDraftChange: (draft: ProfileDraft | ((previous: ProfileDraft) => ProfileDraft)) => void;
  onSave: () => void;
  onPreviewOnboarding: () => void;
}) {
  return (
    <div className="profile-settings-card">
      <ProfileFields draft={draft} onDraftChange={onDraftChange} />
      <div className="profile-settings-footer">
        <p>생일 정보는 오늘의 운세와 하루 추천 개인화에만 사용됩니다.</p>
        <button className="square-button profile-preview-button" onClick={onPreviewOnboarding}>
          <Sparkles size={15} />
          <span>온보딩 다시 보기</span>
        </button>
        <button className="primary-action" onClick={onSave}>
          <Check size={15} />
          <span>저장</span>
        </button>
      </div>
    </div>
  );
}

function ProfileFields({
  draft,
  onDraftChange,
  compact = false
}: {
  draft: ProfileDraft;
  onDraftChange: (draft: ProfileDraft | ((previous: ProfileDraft) => ProfileDraft)) => void;
  compact?: boolean;
}) {
  return (
    <div className={`profile-form-grid ${compact ? "compact" : ""}`}>
      <label>
        <span>이름 또는 닉네임</span>
        <input value={draft.nickname} placeholder="홍길동" onChange={(event) => onDraftChange((previous) => ({ ...previous, nickname: event.target.value }))} />
      </label>
      <label>
        <span>생년월일</span>
        <input value={draft.birthDate} placeholder="2001.03.15" onChange={(event) => onDraftChange((previous) => ({ ...previous, birthDate: event.target.value }))} />
      </label>
      <label>
        <span>양력 / 음력</span>
        <select value={draft.birthCalendarType} onChange={(event) => onDraftChange((previous) => ({ ...previous, birthCalendarType: event.target.value as "solar" | "lunar" }))}>
          <option value="solar">양력</option>
          <option value="lunar">음력</option>
        </select>
      </label>
      <label>
        <span>출생 시간</span>
        <div className="inline-input-row">
          <input
            type="time"
            value={draft.birthTime}
            disabled={draft.birthTimeUnknown}
            onChange={(event) => onDraftChange((previous) => ({ ...previous, birthTime: event.target.value }))}
          />
          <button
            type="button"
            className={draft.birthTimeUnknown ? "toggle-pill active" : "toggle-pill"}
            onClick={() => onDraftChange((previous) => ({ ...previous, birthTimeUnknown: !previous.birthTimeUnknown }))}
          >
            모름
          </button>
        </div>
      </label>
      <label>
        <span>하루 시작 시간</span>
        <input type="time" value={draft.dayStartTime} onChange={(event) => onDraftChange((previous) => ({ ...previous, dayStartTime: event.target.value }))} />
      </label>
      <label>
        <span>하루 마무리 시간</span>
        <input type="time" value={draft.dayEndTime} onChange={(event) => onDraftChange((previous) => ({ ...previous, dayEndTime: event.target.value }))} />
      </label>
      <label className="profile-toggle-row">
        <span>오늘의 운세 기능</span>
        <button
          type="button"
          className={draft.fortuneEnabled ? "toggle-pill active" : "toggle-pill"}
          onClick={() => onDraftChange((previous) => ({ ...previous, fortuneEnabled: !previous.fortuneEnabled }))}
        >
          {draft.fortuneEnabled ? "켜짐" : "꺼짐"}
        </button>
      </label>
    </div>
  );
}

// 선호도 정보 컴포넌트
function PreferencesView({ preferences }: { preferences: UserPreferences }) {
  return (
    <div className="preferences-grid">
      <div>
        <span>지역 타임존</span>
        <strong>{preferences.timezone}</strong>
      </div>
      <div>
        <span>기본 일정 진행 시간</span>
        <strong>{preferences.defaultEventDurationMinutes}분</strong>
      </div>
      <div>
        <span>업무 집중 시간대</span>
        <strong>{preferences.workingHours.start} ~ {preferences.workingHours.end}</strong>
      </div>
      <div>
        <span>닉네임</span>
        <strong>{preferences.nickname || "설정 없음"}</strong>
      </div>
      <div>
        <span>생년월일</span>
        <strong>{preferences.birthDate || "선택 안 함"}</strong>
      </div>
      <div>
        <span>오늘의 운세</span>
        <strong>{preferences.fortuneEnabled ? "사용 중" : "꺼짐"}</strong>
      </div>
      <div>
        <span>하루 생활 시간</span>
        <strong>{preferences.dayStartTime} ~ {preferences.dayEndTime}</strong>
      </div>
      <div>
        <span>목표 카테고리</span>
        <strong>{preferences.goalCategory || "설정 없음"}</strong>
      </div>
      <div>
        <span>Gmail 자동 일정 스캔</span>
        <strong>{preferences.autoScanGmail ? "자동 스캔 활성" : "수동 스캔 전용"}</strong>
      </div>
      <div>
        <span>Slack 자동 일정 스캔</span>
        <strong>{preferences.autoScanSlack ? "자동 스캔 활성" : "수동 스캔 전용"}</strong>
      </div>
      <div>
        <span>모니터링 슬랙 채널</span>
        <strong>{preferences.watchedSlackChannels.join(", ") || "설정 없음"}</strong>
      </div>
    </div>
  );
}

// 외부 연동 플랫폼 표시 컴포넌트
function ProviderStatus({ provider, accounts }: { provider: "google" | "slack"; accounts: ConnectedAccount[] }) {
  const account = accounts.find((item) => item.provider === provider);
  const isActive = account?.status === "active";
  return (
    <span className={`status ${isActive ? "active" : ""}`}>
      {isActive ? "인증 성공 (정상 연결됨)" : "연결 대기 상태"}
    </span>
  );
}

// 범용 리스트 목록 컴포넌트
function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items || items.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: "12.5px" }}>{empty}</p>;
  }
  return (
    <ul style={{ paddingLeft: "16px" }}>
      {items.map((item, index) => (
        <li key={index} style={{ marginBottom: "4px", fontSize: "13px" }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

// 날짜 연산 및 포맷 유틸리티
function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function splitPeople(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", year: "numeric" }).format(date);
}

function weekdayLabel(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date).toUpperCase();
}

function formatHour(hour: number) {
  if (hour === 12) {
    return "오후 12시";
  }
  if (hour > 12) {
    return `오후 ${hour - 12}시`;
  }
  return `오전 ${hour}시`;
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatAgendaDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short"
  }).format(new Date(value));
}

function formatKoreanShortDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(value));
}

function formatDday(value: string) {
  const todayTime = startOfDay(new Date()).getTime();
  const eventTime = startOfDay(new Date(value)).getTime();
  const diff = Math.round((eventTime - todayTime) / 86_400_000);
  if (diff === 0) {
    return "D-Day";
  }
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTimeRange(startAt: string, endAt: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${formatter.format(new Date(startAt))} ~ ${formatter.format(new Date(endAt))}`;
}

function formatDateTimeRange(startAt: string, endAt: string) {
  return `${formatDateTime(startAt)} ~ ${formatTimeRange(startAt, endAt).split(" ~ ")[1]}`;
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

function buildWeeklyAchievements(summaries: TimeUsageSummary[], reviews: DailyReview[]): WeeklyAchievement[] {
  const completedDates = new Set<string>();
  summaries.forEach((summary) => {
    if (summary.timeUsageScore >= 60) {
      completedDates.add(summary.date);
    }
  });
  reviews.forEach((review) => completedDates.add(review.reviewDate));

  const today = startOfDay(new Date());
  const recentDays = Array.from({ length: 7 }, (_, index) => toInputDate(addDays(today, -index)));
  const completedDays = recentDays.filter((date) => completedDates.has(date)).length;

  return [
    {
      id: "three-day",
      title: "3일 스타터",
      description: "하루 평가 흐름을 만들기 시작했어요.",
      requiredDays: 3,
      completedDays: Math.min(completedDays, 3),
      unlocked: completedDays >= 3,
      tone: "mint"
    },
    {
      id: "five-day",
      title: "5일 루틴",
      description: "평일 대부분의 하루를 기록했어요.",
      requiredDays: 5,
      completedDays: Math.min(completedDays, 5),
      unlocked: completedDays >= 5,
      tone: "blue"
    },
    {
      id: "seven-day",
      title: "7일 성장 배지",
      description: "일주일 동안 하루를 돌아본 멋진 기록이에요.",
      requiredDays: 7,
      completedDays,
      unlocked: completedDays >= 7,
      tone: "purple"
    }
  ];
}

function summarizeEventNote(event: CalendarEvent, memo: string, recording: string) {
  const lines = [memo, recording]
    .join("\n")
    .split(/\n+|(?<=[.!?。])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return `${event.title} 일정에 대한 추가 기록이 아직 없습니다. 회의 내용, 결정 사항, 해야 할 일을 남기면 AI 요약을 생성할 수 있습니다.`;
  }

  const primary = lines.slice(0, 2).join(" ");
  const actionLine = lines.find((line) => /(해야|필요|확인|공유|작성|준비|마감|다음|todo|action)/i.test(line));

  return [
    `핵심 요약: ${primary}`,
    actionLine ? `후속 확인: ${actionLine}` : "후속 확인: 다음 행동이나 결정 사항이 있다면 메모에 추가해두면 좋아요.",
    `기록 기준: ${formatDateTimeRange(event.startAt, event.endAt)}`
  ].join("\n");
}

function eventTone(event: CalendarEvent) {
  const toneKey = `${event.title}${event.source}`;
  const tones = ["blue", "green", "purple", "amber", "rose"];
  const index = Array.from(toneKey).reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length;
  return tones[index];
}

function profileDraftFromPreferences(preferences: UserPreferences): ProfileDraft {
  return {
    nickname: preferences.nickname ?? "",
    birthDate: preferences.birthDate ?? "",
    birthCalendarType: preferences.birthCalendarType ?? "solar",
    birthTime: preferences.birthTime ?? "",
    birthTimeUnknown: preferences.birthTimeUnknown ?? true,
    dayStartTime: preferences.dayStartTime ?? preferences.workingHours.start ?? "07:00",
    dayEndTime: preferences.dayEndTime ?? "23:00",
    fortuneEnabled: preferences.fortuneEnabled ?? true,
    shortTermGoal: preferences.shortTermGoal ?? "",
    longTermGoal: preferences.longTermGoal ?? "",
    goalCategory: preferences.goalCategory ?? "공부"
  };
}

function normalizeBirthDate(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) {
    return value.trim();
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function repeatLabel(repeat: OnboardingRoutineDraft["repeat"]) {
  const labels: Record<OnboardingRoutineDraft["repeat"], string> = {
    daily: "매일",
    weekday: "평일",
    weekend: "주말",
    weekly: "매주"
  };
  return labels[repeat];
}

function expandRoutineDates(routine: OnboardingRoutineDraft, baseDate: Date, daysToCreate: number) {
  return Array.from({ length: daysToCreate }, (_, index) => addDays(startOfDay(baseDate), index)).filter((date) => {
    const day = date.getDay();
    if (routine.repeat === "daily") {
      return true;
    }
    if (routine.repeat === "weekday") {
      return day >= 1 && day <= 5;
    }
    if (routine.repeat === "weekend") {
      return day === 0 || day === 6;
    }
    return routine.weekdays.includes(day);
  });
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리에 실패했습니다.";
}

// 초를 MM:SS 로 변환
function formatAudioTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
