import { NextResponse } from "next/server";
import { confirmCandidate } from "@/lib/agent";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startAt = searchParams.get("start");
  const endAt = searchParams.get("end");
  return NextResponse.json({
    events: store.listEvents(startAt ?? undefined, endAt ?? undefined)
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.candidate_id) {
    const result = confirmCandidate(body.candidate_id, body.start_at, body.end_at);
    return NextResponse.json(result.body, { status: result.status });
  }

  if (!body.title || !body.start_at || !body.end_at) {
    return NextResponse.json({ message: "title, start_at, end_at은 필수입니다." }, { status: 400 });
  }

  const event = store.createEvent({
    title: body.title,
    startAt: body.start_at,
    endAt: body.end_at,
    category: body.category,
    location: body.location,
    attendees: body.attendees ?? [],
    isImportant: Boolean(body.is_important),
    isCompleted: Boolean(body.is_completed),
    completedAt: body.is_completed ? new Date().toISOString() : undefined,
    description: body.description,
    source: "chat"
  });

  return NextResponse.json({
    event_id: event.eventId,
    status: "created",
    message: "일정을 캘린더에 추가했습니다.",
    event
  });
}
