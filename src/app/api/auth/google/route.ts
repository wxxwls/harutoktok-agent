import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message: "Google OAuth는 실제 Client ID/Secret과 callback URL 설정 후 활성화됩니다.",
      required_env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]
    },
    { status: 501 }
  );
}
