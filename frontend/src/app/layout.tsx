import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dev Compass | AI Coding Workspace",
  description: "Find your direction in C++ and Python with runtime feedback, organized practice, and an AI tutor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
