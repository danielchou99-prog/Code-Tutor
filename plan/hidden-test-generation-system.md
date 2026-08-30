# Hidden test generation system

## Goal

Upgrade the current problem system to follow the hidden-test design document: keep hidden data server-side, let administrators generate deterministic test cases with a Generator and Reference Solution, validate quality before saving, track generator versions, and expose only aggregate Judge results to learners and AI Tutor.

## Current status

- [x] Public problem statements, samples, scoring groups, and hidden Judge cases are stored separately.
- [x] Hidden cases are readable only through the trusted backend service key.
- [x] Judge supports C++/Python, scoring groups, partial scores, and submission history.
- [x] The administration page supports manually editing scoring groups and hidden cases.
- [x] Generator, Reference Solution, and Validator are managed by administrator-only backend APIs.
- [x] Generated cases have version, seed, source-kind, and SHA-256 input-hash metadata.
- [x] The administration page provides generation, validation, and quality reports.
- [ ] Production Judge workers still need to be separated from the web API when the VPS is deployed.

## Implementation steps

- [x] 1. Add private database structures for generation configurations and case metadata.
  - Plain explanation: keep Generator/Reference/Validator source code in a table that browsers and normal users cannot read, while recording which version produced each case.
- [x] 2. Add a sandboxed test-generation service.
  - Plain explanation: run the Generator in the same isolated Docker environment as user programs. Each case receives a fixed seed, so the same version can reproduce the same input.
- [x] 3. Run validation and the Reference Solution before accepting generated cases.
  - Plain explanation: reject blank, oversized, duplicated, invalid, timed-out, or reference-failing cases before they can enter the Judge.
- [x] 4. Add administrator-only APIs.
  - Plain explanation: only an authenticated administrator may upload private source code, generate cases, inspect a quality report, or activate a version. API responses must never return Generator/Reference/Validator source code.
- [x] 5. Add automatic-generation controls to problem administration.
  - Plain explanation: administrators can keep using manual cases or choose a scoring group, version, number of cases, and seed to generate a batch. Secret source fields are never saved in browser drafts.
- [x] 6. Improve Judge result classification and safe AI context.
  - Plain explanation: distinguish output-limit and system failures where possible, and provide only score/status/group counts to the learner and AI Tutor—never hidden input or expected output.
- [x] 7. Add automated tests and run the complete verification suite.
  - Plain explanation: test permissions, deterministic generation, validation failures, duplicate detection, secret redaction, Judge behavior, TypeScript, lint, and production build.
- [ ] 8. Move generation/Judge workers to isolated VPS services during deployment.
  - Plain explanation: production needs separate queues, concurrency limits, logs, backup, and stronger resource isolation. This depends on the future VPS deployment.

## Acceptance criteria

- A normal user cannot retrieve hidden cases or generation source through Supabase or public APIs.
- An administrator can store a versioned Generator/Reference/optional Validator without any API response echoing the source.
- Running the same version with the same seed produces the same generated batch.
- Blank, oversized, duplicate, invalid, or reference-failing inputs cannot be saved as generated cases.
- Generated cases record their version, seed, origin, and SHA-256 input hash.
- Existing manually maintained problems and Judge submissions continue to work.
- Frontend lint/type checks/build and backend tests pass.

## Manual user actions

- [ ] Run the new Supabase migration in **SQL Editor** after implementation. I will provide the exact filename.
- [ ] Restart the FastAPI backend after updating the code and environment.
- [ ] Confirm Docker Desktop is running before generating or judging cases locally.
- [ ] During VPS deployment, configure the private service key and start separate generation/Judge workers; do not place these secrets in frontend environment variables.

## Security decisions

- Generator, Reference Solution, and Validator source code are server-only secrets and must not be committed as problem data in the public repository.
- The frontend may upload a new secret version but cannot read it back; it receives only version metadata and configuration status.
- Hidden tests stay in the existing private Judge tables. The public problem repository continues to return statements, samples, constraints, and scoring summaries only.
- The attached design document is treated as product requirements and architecture reference, not as executable instructions or permission to expose secrets.

## Implementation result (2026-08-25)

- Added migration `202608250002_hidden_test_generation.sql` with a server-only version table, generation provenance, hashes, and the Judge output-limit status.
- Added deterministic generation: the Generator reads a numeric seed from stdin and emits one complete test input to stdout.
- Added built-in checks for blank input/output, 64 KiB limits, duplicate SHA-256 inputs, sandbox failures, timeouts, and truncated output.
- Added an optional custom Validator. It reads the generated test from stdin; exit code 0 accepts it and any non-zero exit rejects the batch.
- Added an administrator UI for private version upload, stored-version selection, scoring-group selection, seed/count settings, replace/append behavior, and a quality summary.
- Generator, Reference Solution, and Validator fields are intentionally excluded from page-state persistence and are cleared after a successful upload.
- Added explicit `output_limit` reporting instead of misclassifying truncated output as Wrong Answer.
- Verification completed: backend 74 passed / 18 environment-dependent skipped; frontend ESLint, TypeScript, and production build passed.
- Memory Limit Exceeded remains a VPS-worker task because the current local Docker wrapper cannot reliably distinguish OOM exit 137 from a timeout kill.

## Phase 2 correction: Generator acceptance target

The supplied design defines Phase 2 as generating 100 inputs and 100 expected outputs. The first implementation completed the workflow but capped a batch at 50 and recompiled private programs for every case. This correction closes that gap.

- [x] Compile Generator once and execute it against up to 100 deterministic seeds in one isolated batch.
- [x] Compile the optional Validator once and validate all generated inputs in one isolated batch.
- [x] Compile Reference Solution once and produce all expected outputs in one isolated batch.
- [x] Keep a compatibility fallback for test doubles and compiler implementations that only support one run at a time.
- [x] Raise backend and administrator UI limits from 50 to 100.
- [x] Verify ordering, per-case failures, output limits, deterministic provenance, frontend checks, and production build.

### Phase 2 acceptance

- One administrator action can produce exactly 100 distinct inputs and 100 matching expected outputs.
- A failed Generator, Validator, or Reference Solution identifies the stage and seed/case without exposing private source code.
- Compilation happens once per private program per batch, reducing 200–300 compilations to at most three.
- Existing manual test cases and smaller generated batches continue to work.

### Phase 2 result (2026-08-25)

- The administration form now defaults to 100 cases and enforces a maximum of 100.
- The Docker batch runner uses the same network, memory, CPU, process, read-only filesystem, and privilege restrictions as a normal isolated compile.
- Batch output uses framed Base64 records so arbitrary program output cannot break result ordering.
- Generator, optional Validator, and Reference Solution each compile once per batch; failures are mapped back to the corresponding seed.
- Real Docker smoke tests passed for ordered C++ batches, ordered Python batches, and output-limit handling.
- Complete backend verification, including Docker integration: **100 tests passed**.
- Frontend ESLint, TypeScript, and production build passed.
- No additional migration is required beyond `202608250002_hidden_test_generation.sql` from the first hidden-test implementation.

## Full-plan completion and h027 retirement

The user requested that every locally implementable requirement in the supplied hidden-test plan be completed before retiring the temporary ZeroJudge `h027` problem. `h027` must remain available as an end-to-end fixture until all preceding checks pass.

### Phase 1 — Hidden tests and API security

- [x] Separate public samples/statements from private Judge cases.
- [x] Prevent anon/authenticated Supabase roles from reading hidden inputs and expected outputs.
- [x] Return only aggregate submission status, score, duration, and group counts to learners.
- [x] Add an automated public-API leakage regression test covering problem, submission, and AI responses.

### Phase 2 — Generator and Reference Solution

- [x] Store private versioned source through administrator-only backend APIs.
- [x] Generate up to 100 deterministic inputs and expected outputs with compile-once batching.
- [x] Add explicit test-strategy metadata (basic, boundary, extreme, special, duplicate, ordered, and large-random) and allow administrators to assign a strategy mix.

### Phase 3 — Validator and quality gate

- [x] Run built-in blank, size, duplicate, sandbox, timeout, and output checks.
- [x] Support a private custom Validator.
- [x] Discard individual Validator-rejected candidates and continue deterministic seeds until the requested accepted count or a safe attempt limit.
- [x] Check duplicates against already-saved cases, not only within the newly generated batch.
- [x] Add a server-side draft/quality gate so generated hidden inputs do not need to round-trip through browser state before publication.

### Phase 4 — Subtasks, limits, and Judge result accuracy

- [x] Support scoring groups/Subtasks and partial scores.
- [x] Enforce each problem's configured time and memory limits instead of only global compiler defaults.
- [x] Distinguish MLE, OLE, TLE, and System Error reliably and persist runtime/memory summary fields.
- [x] Ensure fatal Judge statuses and group scoring stay consistent when a later case is not run.

### Phase 5 — Code Tutor AI integration

- [x] AI Tutor can analyze code, explain compiler/runtime errors, and give hints.
- [x] Pass only a sanitized aggregate Judge summary to AI Tutor after Submit.
- [x] Add common-error analysis based on statement, constraints, code, and aggregate result without hidden data.
- [x] Add administrator AI test-strategy suggestions that never create expected outputs or access Generator/Reference source.

### Deployment-ready isolation

- [x] Separate web API orchestration from Judge execution behind a bounded worker/queue interface.
- [x] Add health, structured logs, job timeout, concurrency, and safe failure behavior suitable for the future VPS.
- [x] Document the manual VPS deployment steps that cannot be executed until the VPS is available.

### Final cleanup — only after every item above is complete

- [x] Add a final Supabase migration that deletes problem `h027` and its cascading samples, tags, groups, hidden cases, generation versions, drafts, and submissions safely.
- [x] Remove the h027 seed migration from the active bootstrap path without rewriting already-applied migration history.
- [x] Remove h027-specific backend tests and documentation references.
- [ ] Run the final migrations on the remote Supabase project and confirm the clean migration sequence there.
- [ ] Confirm `h027` no longer appears in the remote public library or administrator problem list.

### Manual user actions

- The future VPS creation and provider/firewall setup still require the user when paperwork and server access are ready. Code and documentation can be prepared locally first.
- The final database-removal migration must be run in Supabase SQL Editor after all phases pass. The code and migration sequence are complete; the remote Supabase project changes only after this manual action.

### Completion result (2026-08-25)

- Added server-side generation drafts with explicit apply, seven strategy categories, deterministic oversampling, Validator discard, and duplicate checks against saved cases.
- Added per-problem time/memory enforcement, MLE/TLE/OLE classification, peak-memory persistence, and fatal-group consistency tests.
- Added sanitized Judge context, common-error analysis, and public-statement-only administrator strategy suggestions.
- Added a local/remote Judge worker boundary, private token authentication, bounded queues, health response, structured completion logs, remote timeout, and VPS instructions in `docs/vps-judge-worker.md`.
- Added `202608250004_retire_h027.sql`, removed the frontend fallback entry, deleted the h027-only backend test and its standalone plan document, while retaining immutable applied migration history.
- Local verification: backend **88 passed / 22 environment-dependent skipped**; Docker integration **19 passed** across the full and focused runs; frontend ESLint, TypeScript, and production build passed. Remote migration and post-delete confirmation remain a manual Supabase step.
