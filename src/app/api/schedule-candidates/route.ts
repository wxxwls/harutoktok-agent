import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json({
    candidates: store.listCandidates(searchParams.get("status") ?? undefined, searchParams.get("source") ?? undefined)
  });
}
