import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getPreferences());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  return NextResponse.json(store.updatePreferences(body));
}
