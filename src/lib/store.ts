import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { format } from "date-fns";
import type {
  ActionItem,
  CalendarEvent,
  ConfirmationRequest,
  ConnectedAccount,
  DailyFortune,
  DailyReview,
  MeetingNote,
  ScheduleCandidate,
  TimeGap,
  TimeUsageSummary,
  UserMemory,
  UserPreferences
} from "./types";
import { eventOverlaps, makeId, nowIso } from "./time";

type StoreState = {
  events: CalendarEvent[];
  candidates: ScheduleCandidate[];
  confirmations: ConfirmationRequest[];
  connectedAccounts: ConnectedAccount[];
  meetingNotes: MeetingNote[];
  actionItems: ActionItem[];
  dailyReviews: DailyReview[];
  dailyFortunes: DailyFortune[];
  timeGaps: TimeGap[];
  timeUsageSummaries: TimeUsageSummary[];
  userMemory: UserMemory[];
  preferences: UserPreferences;
};

const storeDirectory = process.env.HARUTOKTOK_STORE_DIR ?? join(process.cwd(), ".data");
const storePath = join(storeDirectory, "harutoktok-store.json");
const demoSeedPath = join(process.cwd(), "scripts", "demo-state.json");

const globalForStore = globalThis as unknown as {
  harutoktokStore?: StoreState;
};

function defaultPreferences(): UserPreferences {
  return {
    userId: "local-user",
    onboardingCompleted: false,
    nickname: "",
    birthDate: "",
    birthCalendarType: "solar",
    birthTime: "",
    birthTimeUnknown: true,
    dayStartTime: "07:00",
    dayEndTime: "23:00",
    fortuneEnabled: true,
    shortTermGoal: "",
    longTermGoal: "",
    goalCategory: "공부",
    timezone: "Asia/Seoul",
    defaultEventDurationMinutes: 60,
    workingHours: {
      start: "09:00",
      end: "18:00"
    },
    focusBlocks: [],
    notificationChannels: {
      inApp: true,
      email: false,
      slack: false
    },
    autoScanGmail: false,
    autoScanSlack: false,
    watchedSlackChannels: []
  };
}

function initialState(): StoreState {
  return {
    events: [],
    candidates: [],
    confirmations: [],
    connectedAccounts: [],
    meetingNotes: [],
    actionItems: [],
    dailyReviews: [],
    dailyFortunes: [],
    timeGaps: [],
    timeUsageSummaries: [],
    userMemory: [],
    preferences: defaultPreferences()
  };
}

function normalizeState(value: Partial<StoreState>): StoreState {
  return {
    events: value.events ?? [],
    candidates: value.candidates ?? [],
    confirmations: value.confirmations ?? [],
    connectedAccounts: value.connectedAccounts ?? [],
    meetingNotes: value.meetingNotes ?? [],
    actionItems: value.actionItems ?? [],
    dailyReviews: value.dailyReviews ?? [],
    dailyFortunes: value.dailyFortunes ?? [],
    timeGaps: value.timeGaps ?? [],
    timeUsageSummaries: value.timeUsageSummaries ?? [],
    userMemory: value.userMemory ?? [],
    preferences: {
      ...defaultPreferences(),
      ...(value.preferences ?? {}),
      workingHours: {
        ...defaultPreferences().workingHours,
        ...(value.preferences?.workingHours ?? {})
      },
      notificationChannels: {
        ...defaultPreferences().notificationChannels,
        ...(value.preferences?.notificationChannels ?? {})
      }
    }
  };
}

function loadState(): StoreState {
  if (!existsSync(storePath)) {
    const shouldSeedDemo = process.env.HARUTOKTOK_SEED_DEMO === "true";
    if (shouldSeedDemo && existsSync(demoSeedPath)) {
      try {
        const seeded = normalizeState(JSON.parse(readFileSync(demoSeedPath, "utf8")) as Partial<StoreState>);
        persist(seeded);
        return seeded;
      } catch {
        return initialState();
      }
    }

    return initialState();
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Partial<StoreState>;
    return normalizeState(parsed);
  } catch {
    return initialState();
  }
}

function persist(current: StoreState) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(current, null, 2));
}

function state() {
  if (!globalForStore.harutoktokStore) {
    globalForStore.harutoktokStore = loadState();
  }
  return globalForStore.harutoktokStore;
}

function commit() {
  persist(state());
}

export const store = {
  snapshot() {
    return state();
  },

  listTimeGaps(date: string) {
    return state().timeGaps
      .filter((gap) => gap.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  },

  upsertTimeGap(input: Omit<TimeGap, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const existing = input.id
      ? state().timeGaps.find((gap) => gap.id === input.id)
      : state().timeGaps.find((gap) => gap.date === input.date && gap.startTime === input.startTime && gap.endTime === input.endTime);

    if (existing) {
      Object.assign(existing, input, { updatedAt: nowIso() });
      commit();
      return existing;
    }

    const gap: TimeGap = {
      ...input,
      id: input.id ?? makeId("gap"),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state().timeGaps.push(gap);
    commit();
    return gap;
  },

  saveTimeGaps(date: string, gaps: TimeGap[]) {
    const ids = new Set(gaps.map((gap) => gap.id));
    state().timeGaps = state().timeGaps.filter((gap) => gap.date !== date || ids.has(gap.id));
    gaps.forEach((gap) => {
      const existing = state().timeGaps.find((item) => item.id === gap.id);
      if (existing) {
        Object.assign(existing, gap, { updatedAt: nowIso() });
      } else {
        state().timeGaps.push(gap);
      }
    });
    commit();
    return this.listTimeGaps(date);
  },

  getTimeUsageSummary(date: string) {
    return state().timeUsageSummaries.find((summary) => summary.date === date);
  },

  upsertTimeUsageSummary(input: Omit<TimeUsageSummary, "id" | "createdAt">) {
    const existing = state().timeUsageSummaries.find((summary) => summary.date === input.date);
    if (existing) {
      Object.assign(existing, input);
      commit();
      return existing;
    }

    const summary: TimeUsageSummary = {
      ...input,
      id: makeId("usage"),
      createdAt: nowIso()
    };
    state().timeUsageSummaries.unshift(summary);
    commit();
    return summary;
  },

  listUserMemory() {
    return [...state().userMemory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  addUserMemory(input: Omit<UserMemory, "id" | "createdAt">) {
    const memory: UserMemory = {
      ...input,
      id: makeId("mem"),
      createdAt: nowIso()
    };
    state().userMemory.unshift(memory);
    commit();
    return memory;
  },

  listEvents(startAt?: string, endAt?: string) {
    const events = state().events;
    if (!startAt || !endAt) {
      return [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return events
      .filter((event) => event.startAt < endAt && event.endAt > startAt)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  },

  createEvent(input: Omit<CalendarEvent, "eventId" | "createdAt" | "updatedAt">) {
    const event: CalendarEvent = {
      ...input,
      eventId: makeId("evt"),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state().events.push(event);
    commit();
    return event;
  },

  updateEvent(eventId: string, patch: Partial<CalendarEvent>) {
    const event = state().events.find((item) => item.eventId === eventId);
    if (!event) {
      return undefined;
    }
    Object.assign(event, patch, { updatedAt: nowIso() });
    commit();
    return event;
  },

  deleteEvent(eventId: string) {
    const before = state().events.length;
    state().events = state().events.filter((event) => event.eventId !== eventId);
    const deleted = state().events.length < before;
    if (deleted) {
      commit();
    }
    return deleted;
  },

  findEventsByTitle(title: string) {
    return state().events.filter((event) => event.title.includes(title) || title.includes(event.title));
  },

  findConflicts(startAt: string, endAt: string, excludeEventId?: string) {
    return state().events.filter((event) => event.eventId !== excludeEventId && eventOverlaps(startAt, endAt, event));
  },

  listCandidates(status?: string, source?: string) {
    return state().candidates
      .filter((candidate) => !status || candidate.status === status)
      .filter((candidate) => !source || candidate.source === source)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  createCandidate(input: Omit<ScheduleCandidate, "candidateId" | "createdAt" | "updatedAt">) {
    const candidate: ScheduleCandidate = {
      ...input,
      candidateId: makeId("cand"),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state().candidates.push(candidate);
    commit();
    return candidate;
  },

  updateCandidate(candidateId: string, patch: Partial<ScheduleCandidate>) {
    const candidate = state().candidates.find((item) => item.candidateId === candidateId);
    if (!candidate) {
      return undefined;
    }
    Object.assign(candidate, patch, { updatedAt: nowIso() });
    commit();
    return candidate;
  },

  getCandidate(candidateId: string) {
    return state().candidates.find((candidate) => candidate.candidateId === candidateId);
  },

  createConfirmation(input: Omit<ConfirmationRequest, "confirmationRequestId" | "createdAt">) {
    const confirmation: ConfirmationRequest = {
      ...input,
      confirmationRequestId: makeId("conf"),
      createdAt: nowIso()
    };
    state().confirmations.push(confirmation);
    commit();
    return confirmation;
  },

  getConfirmation(confirmationRequestId: string) {
    return state().confirmations.find((confirmation) => confirmation.confirmationRequestId === confirmationRequestId);
  },

  approveConfirmation(confirmationRequestId: string) {
    const confirmation = this.getConfirmation(confirmationRequestId);
    if (!confirmation) {
      return undefined;
    }
    confirmation.status = "approved";
    confirmation.approvedAt = nowIso();
    commit();
    return confirmation;
  },

  rejectConfirmation(confirmationRequestId: string) {
    const confirmation = this.getConfirmation(confirmationRequestId);
    if (!confirmation) {
      return undefined;
    }
    confirmation.status = "rejected";
    confirmation.rejectedAt = nowIso();
    commit();
    return confirmation;
  },

  upsertConnectedAccount(provider: "google" | "slack", label: string, scopes: string[]) {
    const existing = state().connectedAccounts.find((account) => account.provider === provider);
    if (existing) {
      existing.status = "active";
      existing.scopes = scopes;
      existing.label = label;
      existing.updatedAt = nowIso();
      commit();
      return existing;
    }
    const account: ConnectedAccount = {
      connectedAccountId: makeId("acc"),
      provider,
      providerAccountId: `${provider}-${makeId("account")}`,
      label,
      scopes,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state().connectedAccounts.push(account);
    commit();
    return account;
  },

  createMeetingNote(input: Omit<MeetingNote, "meetingNoteId" | "createdAt" | "updatedAt">) {
    const note: MeetingNote = {
      ...input,
      meetingNoteId: makeId("meet"),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state().meetingNotes.unshift(note);
    state().actionItems.push(...note.actionItems);
    commit();
    return note;
  },

  createDailyReview(input: Omit<DailyReview, "dailyReviewId" | "createdAt">) {
    const review: DailyReview = {
      ...input,
      dailyReviewId: makeId("review"),
      createdAt: nowIso()
    };
    state().dailyReviews.unshift(review);
    commit();
    return review;
  },

  listDailyFortunes() {
    return [...state().dailyFortunes].sort((a, b) => b.fortuneDate.localeCompare(a.fortuneDate));
  },

  getDailyFortune(fortuneDate: string) {
    return state().dailyFortunes.find((fortune) => fortune.fortuneDate === fortuneDate);
  },

  upsertDailyFortune(input: Omit<DailyFortune, "id" | "createdAt">) {
    const existing = state().dailyFortunes.find((fortune) => fortune.fortuneDate === input.fortuneDate);
    if (existing) {
      Object.assign(existing, input);
      commit();
      return existing;
    }

    const fortune: DailyFortune = {
      ...input,
      id: makeId("fortune"),
      createdAt: nowIso()
    };
    state().dailyFortunes.unshift(fortune);
    commit();
    return fortune;
  },

  updateDailyFortune(fortuneDate: string, patch: Partial<DailyFortune>) {
    const fortune = this.getDailyFortune(fortuneDate);
    if (!fortune) {
      return undefined;
    }
    Object.assign(fortune, patch);
    commit();
    return fortune;
  },

  getPreferences() {
    return state().preferences;
  },

  updatePreferences(patch: Partial<UserPreferences>) {
    state().preferences = {
      ...state().preferences,
      ...patch,
      notificationChannels: {
        ...state().preferences.notificationChannels,
        ...patch.notificationChannels
      },
      workingHours: {
        ...state().preferences.workingHours,
        ...patch.workingHours
      }
    };
    commit();
    return state().preferences;
  },

  todayText() {
    return format(new Date(), "yyyy-MM-dd");
  }
};
