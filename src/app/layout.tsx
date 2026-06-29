import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "하루톡톡",
  description: "개인의 일상과 성장을 돕는 AI Agent",
  icons: {
    icon: "/harutoktok-icon.png",
    apple: "/apple-touch-icon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
