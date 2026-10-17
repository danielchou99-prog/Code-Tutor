import type { JudgeStatus } from "@/lib/judge-api";

const labels: Record<JudgeStatus, { zh: string; en: string }> = {
  accepted: { zh: "已通過", en: "Accepted" },
  wrong_answer: { zh: "答案錯誤", en: "Wrong Answer" },
  compile_error: { zh: "編譯錯誤", en: "Compilation Error" },
  runtime_error: { zh: "執行錯誤", en: "Runtime Error" },
  timeout: { zh: "超出時間限制", en: "Time Limit Exceeded" },
  memory_limit: { zh: "記憶體超出限制", en: "Memory Limit Exceeded" },
  output_limit: { zh: "輸出超過限制", en: "Output Limit Exceeded" },
  service_unavailable: { zh: "Judge 暫時無法使用", en: "Judge Unavailable" },
  server_busy: { zh: "Judge 忙碌中", en: "Judge Busy" },
  system_error: { zh: "Judge 系統錯誤", en: "Judge System Error" },
};

export function judgeStatusLabel(status: JudgeStatus, zh: boolean): string {
  return zh ? labels[status].zh : labels[status].en;
}
