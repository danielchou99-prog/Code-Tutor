import type { components } from "@/lib/api-schema";
import { getApiUrl } from "@/lib/compiler-api";
import { bearerHeader, getAccessToken } from "@/lib/api-client";

// Derived from the backend models; run `npm run gen:api` after changing them.
type Schemas = components["schemas"];
type DefaultedCaseFields = "source_kind" | "generation_strategy";

export type AdminLocalizedText = Schemas["LocalizedText"];
export type AdminTag = Schemas["AdminTag"];
export type AdminSample = Schemas["AdminSample"];
export type GenerationStrategy = Exclude<Schemas["AdminTestCase"]["generation_strategy"], "manual">;
// The server fills source_kind / generation_strategy when a draft omits them.
export type AdminTestCase = Omit<Schemas["AdminTestCase"], DefaultedCaseFields> &
  Partial<Pick<Schemas["AdminTestCase"], DefaultedCaseFields>>;
export type AdminTestGroup = Omit<Schemas["AdminTestGroup"], "cases"> & { cases: AdminTestCase[] };
export type AdminProblem = Omit<Schemas["AdminProblem"], "test_groups"> & { test_groups: AdminTestGroup[] };
export type AdminProblemCreate = Omit<AdminProblem, "id">;
export type AdminProblemSummary = Schemas["AdminProblemSummary"];

export type PrivateProgram = { language: "cpp" | "python"; source: string };
export type GenerationVersionUpload = {
  version: string;
  generator: PrivateProgram;
  reference_solution: PrivateProgram;
  validator: PrivateProgram | null;
};
export type GenerationVersionMetadata = {
  version: string;
  generator_language: "cpp" | "python";
  reference_language: "cpp" | "python";
  has_validator: boolean;
  created_at: string;
};
export type GeneratedCasesResponse = {
  batch_id: string;
  cases: Array<{
    case_order: number;
    generator_seed: number;
    generation_strategy: GenerationStrategy;
    input_sha256: string;
    input_bytes: number;
    output_bytes: number;
    score_points: number;
  }>;
  report: {
    requested: number;
    accepted: number;
    attempted: number;
    discarded_invalid: number;
    discarded_duplicate: number;
    duplicate_inputs: number;
    total_input_bytes: number;
    largest_input_bytes: number;
    validator_enabled: boolean;
    strategy_counts: Record<string, number>;
  };
};
export type AiGeneratedTestsResponse = {
  version: string;
  replace_existing: boolean;
  groups: Array<{
    group_order: number;
    batch_id: string;
    requested: number;
    accepted: number;
    attempted: number;
    discarded_invalid: number;
    discarded_duplicate: number;
    strategy_counts: Record<string, number>;
    boundary: {
      target_value: number;
      actual_value: number;
      tolerance: number;
      generator_seed: number;
    };
    cases: GeneratedCasesResponse["cases"];
  }>;
};

export class ProblemAdminApiError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

async function adminRequest<T extends object>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new ProblemAdminApiError("Authentication is required.", 401);
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      ...bearerHeader(accessToken),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json() as T | { detail?: string | Array<{ msg?: string }> };
  if (!response.ok) {
    const detail = "detail" in body ? body.detail : null;
    const message = typeof detail === "string"
      ? detail
      : Array.isArray(detail) ? detail.map((item) => item.msg).filter(Boolean).join("; ") : `Admin API returned HTTP ${response.status}.`;
    throw new ProblemAdminApiError(message || `Admin API returned HTTP ${response.status}.`, response.status);
  }
  return body as T;
}

export async function getProblemAdminStatus(): Promise<boolean> {
  const response = await adminRequest<{ is_admin: boolean }>("/api/admin/me");
  return response.is_admin;
}

export function listAdminProblems(): Promise<AdminProblemSummary[]> {
  return adminRequest("/api/admin/problems");
}

export function getAdminProblem(problemId: string): Promise<AdminProblem> {
  return adminRequest(`/api/admin/problems/${encodeURIComponent(problemId)}`);
}

export function createAdminProblem(problem: AdminProblemCreate): Promise<AdminProblem> {
  return adminRequest("/api/admin/problems", {
    method: "POST",
    body: JSON.stringify(problem),
  });
}

export function saveAdminProblem(problem: AdminProblem): Promise<AdminProblem> {
  return adminRequest(`/api/admin/problems/${encodeURIComponent(problem.id)}`, {
    method: "PUT",
    body: JSON.stringify(problem),
  });
}

export async function translateAdminProblem(problem: AdminProblem): Promise<AdminProblem> {
  const allItems: Array<{ id: string; text: string }> = [
    { id: "title", text: problem.title.zh },
    { id: "summary", text: problem.summary.zh },
    { id: "input-format", text: problem.input_format.zh },
    { id: "output-format", text: problem.output_format.zh },
    ...problem.description.map((item, index) => ({ id: `description.${index}`, text: item.zh })),
    ...problem.constraints.map((item, index) => ({ id: `constraint.${index}`, text: item.zh })),
    ...problem.tags.map((item, index) => ({ id: `tag.${index}`, text: item.label_zh })),
    ...problem.test_groups.flatMap((group, index) => [
      { id: `group.${index}.name`, text: group.name.zh },
      { id: `group.${index}.condition`, text: group.condition.zh },
    ]),
    ...problem.samples.flatMap((sample, index) => sample.explanation
      ? [{ id: `sample.${index}.explanation`, text: sample.explanation.zh }]
      : []),
  ];
  const items = allItems.filter((item) => item.text.trim().length > 0);
  const response = items.length > 0
    ? await adminRequest<{ items: Array<{ id: string; text: string }> }>("/api/admin/problem-translations", {
        method: "POST",
        body: JSON.stringify({ items }),
      })
    : { items: [] };
  const translated = new Map(response.items.map((item) => [item.id, item.text]));
  const english = (id: string, chinese: string) => {
    if (!chinese.trim()) return "";
    const value = translated.get(id);
    if (!value) throw new ProblemAdminApiError(`Missing translation: ${id}`, 502);
    return value;
  };
  return {
    ...problem,
    title: { ...problem.title, en: english("title", problem.title.zh) },
    summary: { ...problem.summary, en: english("summary", problem.summary.zh) },
    input_format: { ...problem.input_format, en: english("input-format", problem.input_format.zh) },
    output_format: { ...problem.output_format, en: english("output-format", problem.output_format.zh) },
    description: problem.description.map((item, index) => ({ ...item, en: english(`description.${index}`, item.zh) })),
    constraints: problem.constraints.map((item, index) => ({ ...item, en: english(`constraint.${index}`, item.zh) })),
    tags: problem.tags.map((item, index) => ({ ...item, label_en: english(`tag.${index}`, item.label_zh) })),
    test_groups: problem.test_groups.map((group, index) => ({
      ...group,
      name: { ...group.name, en: english(`group.${index}.name`, group.name.zh) },
      condition: { ...group.condition, en: english(`group.${index}.condition`, group.condition.zh) },
    })),
    samples: problem.samples.map((sample, index) => ({
      ...sample,
      explanation: sample.explanation
        ? { ...sample.explanation, en: english(`sample.${index}.explanation`, sample.explanation.zh) }
        : null,
    })),
  };
}

export function listGenerationVersions(problemId: string): Promise<GenerationVersionMetadata[]> {
  return adminRequest(`/api/admin/problems/${encodeURIComponent(problemId)}/generation-versions`);
}

export function saveGenerationVersion(problemId: string, payload: GenerationVersionUpload): Promise<GenerationVersionMetadata> {
  return adminRequest(`/api/admin/problems/${encodeURIComponent(problemId)}/generation-versions/${encodeURIComponent(payload.version)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function generateHiddenTests(problemId: string, payload: { version: string; count: number; first_seed: number; default_points_per_case: number; group_order: number; strategy_allocations: Array<{ strategy: GenerationStrategy; count: number }> }): Promise<GeneratedCasesResponse> {
  return adminRequest(`/api/admin/problems/${encodeURIComponent(problemId)}/generate-tests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateHiddenTestsWithAi(problemId: string, payload: { groups: Array<{ group_order: number; count: number; default_points_per_case: number }>; first_seed: number; replace_existing: boolean }): Promise<AiGeneratedTestsResponse> {
  return adminRequest(`/api/admin/problems/${encodeURIComponent(problemId)}/generate-tests/ai`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function applyGenerationBatch(batchId: string, payload: { group_order: number; replace_existing: boolean; case_scores: number[] }): Promise<{ batch_id: string; applied_cases: number }> {
  return adminRequest(`/api/admin/generation-batches/${encodeURIComponent(batchId)}/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
