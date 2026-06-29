import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { CalendarEvent } from "@/lib/types";

type Context = {
  params: Promise<{
    event_id: string;
  }>;
};

export async function PATCH(request: Request, context: Context) {
  const { event_id: eventId } = await context.params;
  const body = await request.json();
  const patch = {
    title: body.title,
    startAt: body.start_at,
    endAt: body.end_at,
    category: body.category,
    location: body.location,
    attendees: body.attendees,
    isImportant: body.is_important,
    isCompleted: body.is_completed,
    completedAt: body.is_completed === true ? new Date().toISOString() : body.is_completed === false ? "" : undefined,
    description: body.description,
    memo: body.memo,
    recordingTranscript: body.recording_transcript,
    aiSummary: body.ai_summary
  };
  const event = store.updateEvent(
    eventId,
    Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<CalendarEvent>
  );

  if (!event) {
    return NextResponse.json({ message: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    event_id: event.eventId,
    status: "updated",
    message: "일정을 수정했습니다.",
    event
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { event_id: eventId } = await context.params;
  const deleted = store.deleteEvent(eventId);
  if (!deleted) {
    return NextResponse.json({ message: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    event_id: eventId,
    status: "deleted",
    message: "일정을 삭제했습니다."
  });
}
