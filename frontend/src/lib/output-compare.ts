import type { ProblemSample } from "@/components/problems/problem-data";

/** Mirrors the judge's rule (backend/app/scoring.py): ignore trailing spaces on each line and trailing blank lines. */
export function normalizeOutput(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\s+$/u, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

/** Index of the example whose input equals `stdin`, or -1 when the run used other data. */
export function findMatchingSample(samples: ProblemSample[], stdin: string): number {
  const normalizedInput = normalizeOutput(stdin);
  return samples.findIndex((sample) => normalizeOutput(sample.input) === normalizedInput);
}
