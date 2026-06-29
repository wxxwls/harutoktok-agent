import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message: "Slack OAuth는 실제 App Client ID/Secret과 signing secret 설정 후 활성화됩니다.",
      required_env: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET"]
    },
    { status: 501 }
  );
}
