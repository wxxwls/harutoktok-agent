import { addDays, format, isBefore, parseISO, startOfDay } from "date-fns";
import type { CalendarEvent, TimeSlot } from "./types";

const weekdayMap: Record<string, number> = {
  일요일: 0,
  일: 0,
  월요일: 1,
  월: 1,
  화요일: 2,
  화: 2,
  수요일: 3,
  수: 3,
  목요일: 4,
  목: 4,
  금요일: 5,
  금: 5,
  토요일: 6,
  토: 6
};

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function toDateInput(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function formatKoreanDateTime(startAt: string, endAt?: string) {
  const start = parseISO(startAt);
  const date = format(start, "yyyy년 M월 d일");
  const startText = format(start, "HH:mm");
  if (!endAt) {
    return `${date} ${startText}`;
  }
  return `${date} ${startText} ~ ${format(parseISO(endAt), "HH:mm")}`;
}

export function formatTimeRange(startAt: string, endAt: string) {
  return `${format(parseISO(startAt), "HH:mm")} ~ ${format(parseISO(endAt), "HH:mm")}`;
}

export function getDateFromKoreanText(text: string, clientNow?: string) {
  const base = clientNow ? parseISO(clientNow) : new Date();
  const dayStart = startOfDay(base);

  if (/내일\s*모레|내일모레|모레/.test(text)) {
    return addDays(dayStart, 2);
  }
  if (/오늘/.test(text)) {
    return dayStart;
  }
  if (/내일/.test(text)) {
    return addDays(dayStart, 1);
  }

  const iso = text.match(/(20\d{2})[-.년/]\s*(\d{1,2})[-.월/]\s*(\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const monthDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (monthDay) {
    const candidate = new Date(base.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
    if (isBefore(candidate, dayStart)) {
      return new Date(base.getFullYear() + 1, Number(monthDay[1]) - 1, Number(monthDay[2]));
    }
    return candidate;
  }

  const fullWeekday = text.match(/(다음\s*주|이번\s*주)?\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/);
  const shortWeekday = text.match(/(^|[^가-힣])(다음\s*주|이번\s*주)?\s*(월|화|수|목|금|토|일)(?=\s*(까지|에|오전|오후|날|$))/);
  const weekday = fullWeekday
    ? { prefix: fullWeekday[1], day: fullWeekday[2] }
    : shortWeekday
      ? { prefix: shortWeekday[2], day: shortWeekday[3] }
      : undefined;

  if (weekday) {
    const target = weekdayMap[weekday.day];
    const current = dayStart.getDay();
    let diff = target - current;
    if (weekday.prefix?.replace(/\s/g, "") === "다음주") {
      diff += diff <= 0 ? 7 : 0;
      diff += 7;
    } else if (diff <= 0) {
      diff += 7;
    }
    return addDays(dayStart, diff);
  }

  return undefined;
}

export function getTimeFromKoreanText(text: string) {
  const colonTime = text.match(/([01]?\d|2[0-3])\s*[:시]\s*([0-5]\d)\s*분?/);
  const hourOnly = text.match(/(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*시/);

  if (colonTime && !/시/.test(colonTime[0])) {
    return {
      hour: Number(colonTime[1]),
      minute: Number(colonTime[2]),
      ambiguous: false
    };
  }

  if (!hourOnly) {
    return undefined;
  }

  const meridiem = hourOnly[1];
  let hour = Number(hourOnly[2]);
  const minute = colonTime ? Number(colonTime[2]) : 0;
  let ambiguous = false;

  if (meridiem === "오후" || meridiem === "저녁" || meridiem === "밤") {
    if (hour < 12) {
      hour += 12;
    }
  } else if (meridiem === "오전" || meridiem === "아침") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (hour >= 1 && hour <= 7) {
    hour += 12;
    ambiguous = true;
  }

  return { hour, minute, ambiguous };
}

export function getTimeRangeFromKoreanText(text: string) {
  const explicitRange = text.match(
    /(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*([0-5]?\d)\s*분)?\s*(?:부터|에서|~|-)\s*(오전|오후|아침|저녁|밤)?\s*(\d{1,2})(?:\s*시)?(?:\s*([0-5]?\d)\s*분)?\s*(?:까지)?/
  );
  const implicitRange = text.match(
    /(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*([0-5]?\d)\s*분)?\s+(오전|오후|아침|저녁|밤)?\s*(\d{1,2})(?:\s*시)?(?:\s*([0-5]?\d)\s*분)?\s*까지/
  );
  const range = explicitRange ?? implicitRange;

  if (!range) {
    return undefined;
  }

  const start = normalizeKoreanTime(range[1], Number(range[2]), range[3] ? Number(range[3]) : 0);
  const end = normalizeKoreanTime(range[4] || range[1], Number(range[5]), range[6] ? Number(range[6]) : 0);

  if (end.hour < start.hour || (end.hour === start.hour && end.minute <= start.minute)) {
    end.hour += 12;
  }

  return {
    start,
    end,
    ambiguous: start.ambiguous || end.ambiguous
  };
}

function normalizeKoreanTime(meridiem: string | undefined, rawHour: number, minute = 0) {
  let hour = rawHour;
  let ambiguous = false;

  if (meridiem === "오후" || meridiem === "저녁" || meridiem === "밤") {
    if (hour < 12) {
      hour += 12;
    }
  } else if (meridiem === "오전" || meridiem === "아침") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (hour >= 1 && hour <= 7) {
    hour += 12;
    ambiguous = true;
  }

  return { hour, minute, ambiguous };
}

export function buildDateTime(date: Date, hour: number, minute = 0) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

export function addMinutesIso(startAt: string, minutes: number) {
  return new Date(parseISO(startAt).getTime() + minutes * 60_000).toISOString();
}

export function eventOverlaps(startAt: string, endAt: string, event: CalendarEvent) {
  const start = parseISO(startAt).getTime();
  const end = parseISO(endAt).getTime();
  const eventStart = parseISO(event.startAt).getTime();
  const eventEnd = parseISO(event.endAt).getTime();
  return start < eventEnd && end > eventStart;
}

export function suggestAlternatives(startAt: string, durationMinutes: number, events: CalendarEvent[]): TimeSlot[] {
  const start = parseISO(startAt);
  const day = startOfDay(start);
  const candidates = [
    setTime(day, 10, 0),
    setTime(day, 15, 0),
    setTime(day, 16, 0),
    setTime(addDays(day, 1), 10, 0),
    setTime(addDays(day, 1), 14, 0)
  ];

  return candidates
    .map((candidate) => {
      const slotStart = candidate.toISOString();
      const slotEnd = addMinutesIso(slotStart, durationMinutes);
      return {
        startAt: slotStart,
        endAt: slotEnd,
        label: formatKoreanDateTime(slotStart, slotEnd)
      };
    })
    .filter((slot) => !events.some((event) => eventOverlaps(slot.startAt, slot.endAt, event)))
    .slice(0, 3);
}

export function setTime(date: Date, hour: number, minute: number) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

export function rangeForDay(dateText: string) {
  const start = parseISO(`${dateText}T00:00:00`);
  const end = parseISO(`${dateText}T23:59:59`);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}
