import { NextResponse } from "next/server";
import { createCandidateFromActionItem, summarizeMeeting } from "@/lib/agent";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.transcript) {
    return NextResponse.json({ message: "transcript는 필수입니다." }, { status: 400 });
  }

  const note = summarizeMeeting({
    title: body.title ?? "회의 메모",
    transcript: body.transcript
  });

  const candidates = note.actionItems
    .filter((item) => item.calendarNeeded)
    .map((item) => createCandidateFromActionItem({ ...item, meetingNoteId: note.meetingNoteId }))
    .filter(Boolean);

  return NextResponse.json({
    meeting_note_id: note.meetingNoteId,
    summary: note.summary,
    discussions: note.discussions,
    decisions: note.decisions,
    risks: note.risks,
    action_items: note.actionItems,
    schedule_candidates: candidates.map((item) => item?.candidate)
  });
}
