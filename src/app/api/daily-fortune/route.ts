import { NextResponse } from "next/server";
import { generateTodayFortune } from "@/lib/agent";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fortuneDate = searchParams.get("date") ?? store.todayText();
  const preferences = store.getPreferences();

  if (!preferences.fortuneEnabled) {
    return NextResponse.json({ message: "오늘의 운세 기능이 꺼져 있습니다." }, { status: 403 });
  }

  const fortune = store.getDailyFortune(fortuneDate) ?? generateTodayFortune({ fortuneDate });
  return NextResponse.json({ fortune });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const preferences = store.getPreferences();

  if (!preferences.fortuneEnabled) {
    return NextResponse.json({ message: "오늘의 운세 기능이 꺼져 있습니다." }, { status: 403 });
  }

  const fortune = generateTodayFortune({
    fortuneDate: body.fortune_date ?? store.todayText(),
    force: Boolean(body.force)
  });

  return NextResponse.json({ fortune });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fortuneDate = body.fortune_date ?? store.todayText();
  const feedback = body.user_feedback;
  if (!["helpful", "normal", "unsure", "not_helpful"].includes(feedback)) {
    return NextResponse.json({ message: "지원하지 않는 피드백 값입니다." }, { status: 400 });
  }

  const fortune = store.updateDailyFortune(fortuneDate, { userFeedback: feedback });
  if (!fortune) {
    return NextResponse.json({ message: "저장된 오늘의 운세가 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ fortune, message: "운세 피드백을 저장했습니다." });
}
