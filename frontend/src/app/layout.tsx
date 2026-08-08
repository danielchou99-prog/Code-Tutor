import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Tutor | AI Coding Workspace",
  description: "Learn C++ with compiler feedback and an AI tutor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
