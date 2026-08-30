# Problem automatic translation

## 2026-08-25 Groq model repair

- [x] Replace the retired `llama-3.3-70b-versatile` default with Groq's recommended `openai/gpt-oss-120b` model.
- [x] Apply the same model to problem translation and AI Tutor so the two features do not drift apart.
- [x] Restart FastAPI and verify an authenticated translation request no longer returns the retired-model 503 response.

Plain explanation: Groq shut down the previous model for free/developer accounts on 2026-08-16. The API key remains valid; the backend must request an available model.

## Goal

Make problem administration Chinese-first: administrators enter only Traditional Chinese display content, while the trusted backend translates all English display text before saving. Remove editable English fields without changing the bilingual learner interface.

## Current status

- [x] Problem records already store Traditional Chinese and English separately.
- [x] Administrators can connect a private Groq API key through the existing encrypted account connection.
- [x] The administration form no longer asks the administrator to type English translations.
- [x] Saving a problem verifies that every English text item was generated from the current Chinese text.

## Implementation steps

- [x] 1. Add a structured backend translation service using the administrator's encrypted Groq connection.
  - Plain explanation: send only the Chinese display strings to Groq, require a strict ID-to-translation JSON response, and reject incomplete or malformed translations.
- [x] 2. Add an administrator-only translation API.
  - Plain explanation: normal users cannot use this endpoint, API keys remain on the backend, and the response contains translations only—never the key.
- [x] 3. Remove English inputs from problem administration.
  - Plain explanation: title, summary, statement, formats, constraints, tag labels, and scoring-group text show only one Traditional Chinese field. Internal tag slugs remain because they are stable identifiers, not displayed English translations.
- [x] 4. Translate immediately before saving.
  - Plain explanation: clicking Save first translates the latest Chinese text, then sends the complete bilingual problem to the existing save API. If translation fails, nothing is overwritten and the Chinese draft stays on screen.
- [x] 5. Add tests and run frontend/backend verification.
  - Plain explanation: verify authorization, strict response parsing, no missing translations, no English editor fields, lint, TypeScript, build, and backend tests.

## Acceptance criteria

- The administrator sees no editable English translation fields.
- Changing Chinese and saving refreshes every English display field from the new Chinese content.
- Switching the learner website to English still displays stored English translations.
- A disconnected, rate-limited, or failed translation service prevents the save and shows a useful error without losing the Chinese draft.
- Groq API keys are never sent to the browser or included in API responses/log messages.

## Manual user actions

- [ ] Keep Groq connected in **Settings → AI / Groq** for the administrator account.
- [ ] Restart FastAPI after implementation.
- [ ] Test one unpublished problem in Chinese, save it, then switch the website language to English and review the generated translation.

## Status

Complete on 2026-08-25.

- Backend: 77 tests passed and 18 environment-dependent tests skipped.
- Frontend: ESLint, TypeScript, and the production build passed.
- No Supabase migration is required for this change because bilingual columns already exist.
