import type { JudgeStatus } from "@/lib/judge-api";
import type { TranslationKey } from "@/lib/language-context";

const labelKeys: Record<JudgeStatus, TranslationKey> = {
  accepted: "judgeAccepted",
  wrong_answer: "judgeWrongAnswer",
  compile_error: "judgeCompileError",
  runtime_error: "judgeRuntimeError",
  timeout: "judgeTimeout",
  memory_limit: "judgeMemoryLimit",
  output_limit: "judgeOutputLimit",
  service_unavailable: "judgeServiceUnavailable",
  server_busy: "judgeServerBusy",
  system_error: "judgeSystemError",
};

export function judgeStatusLabel(status: JudgeStatus, t: (key: TranslationKey) => string): string {
  return t(labelKeys[status]);
}
