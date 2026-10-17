# 登入錯誤訊息明確化

## 目標

登入、註冊、重設密碼等流程失敗時，使用者要看到明確、可行動的訊息，而不是瀏覽器原始的 `Failed to fetch` 或英文 Supabase 錯誤。

## 目前狀態

- `auth-context.tsx` 直接把 Supabase 的 `error.message` 傳給畫面。
- 網路／DNS 無法連到 Supabase 時，`signInWithPassword` 可能回傳 `Failed to fetch`，或直接丟出例外（沒有被 try/catch，介面會停在「登入中」）。
- 2026-10-17 曾因 `orslmyilsbobgrhbbfpo.supabase.co` DNS 暫時解析失敗而無法登入，隨後自行恢復；Supabase 本身正常。

## 執行步驟

- [x] 重試 Supabase 連線：Auth health、settings、JWKS 皆回 200，錯誤登入回 400，服務正常。
  - 說明：確認先前失敗是暫時性 DNS 問題，不是專案被刪除。
- [x] 新增 `frontend/src/lib/supabase/auth-errors.ts`，把 Supabase 錯誤分類成錯誤代碼。
  - 說明：集中判斷網路失敗、帳密錯誤、Email 未驗證、請求過多、帳號已存在、密碼太弱。
- [x] `auth-context.tsx` 所有 Auth 呼叫改用統一包裝，捕捉例外並回傳 `{ error, errorCode }`。
  - 說明：避免例外讓表單卡在載入中。
- [x] `language-context.tsx` 新增中英文錯誤訊息文字。
- [x] 登入面板、重設密碼頁、設定頁改顯示翻譯後的錯誤訊息。
- [x] 前端沒有測試框架，改以 TypeScript、ESLint 與實際呼叫 supabase-js 驗證分類。

## 驗收方式

1. `npx tsc --noEmit` 與 `npm run lint` 通過。
2. 暫時把 `NEXT_PUBLIC_SUPABASE_URL` 指向不存在的網域，登入時顯示「無法連線到登入服務」類訊息，且按鈕恢復可再次點擊。
3. 輸入錯誤密碼時顯示「Email 或密碼不正確」。
4. 還原正確網址後可正常登入。

## 需要使用者手動操作

- 用正確帳號在瀏覽器實際登入一次做最終驗收。
- 若再次出現「無法連線到登入服務」，先確認網路與 DNS（可換用 1.1.1.1 / 8.8.8.8），再查 Supabase Dashboard 專案是否被暫停。

## 驗證紀錄（2026-10-17）

- [x] `npx tsc --noEmit`、`eslint`（lib、auth、settings）皆無錯誤。
- [x] 不存在的網域：回傳 `AuthRetryableFetchError`，分類為 `network`。
- [x] 正確網域＋錯誤密碼：回傳 `invalid_credentials`（400），分類為 `invalid_credentials`。
- [ ] 瀏覽器實際登入畫面驗收（需使用者操作，且前端／後端目前未啟動）。
