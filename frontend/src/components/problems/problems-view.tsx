"use client";

import { ProblemsPage } from "@/components/problems/problems-page";
import { useSiteFrame } from "@/components/site-frame";

export function ProblemsView() {
  const { problemsListRevision } = useSiteFrame();
  return <ProblemsPage resetListRevision={problemsListRevision} />;
}
