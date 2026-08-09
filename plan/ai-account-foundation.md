# Code Tutor 免費 AI 與帳號管理計畫

- 文件狀態：帳號基礎完成；Groq 安全連線程式完成，等待環境設定與真實驗收
- 最後更新：2026-08-09
- 建議方案：Supabase Auth + 使用者自備 Groq API key（BYOK）

## 一、目標

先建立 Code Tutor 使用者帳號，再讓每位使用者連接自己的免費 AI 供應商額度。AI 會針對目前程式碼、編譯錯誤與題目提供解釋或提示，但預設不直接給完整答案。

## 二、為何不直接共用一把免費 API key

- 免費額度通常屬於一個供應商帳號或 organization，不會自動依 Code Tutor 使用者分開。
- 多人共用時，一位使用者就可能耗盡全部額度。
- API key 若出現在瀏覽器或 GitHub，任何人都能盜用。
- Code Tutor 需要自己的帳號與用量紀錄，才能限制每人每日 AI 次數。

簡易說明：Code Tutor 帳號是學生證，AI API key 是使用者自己的點數卡。兩者分開，網站才能知道是誰在使用，也不必由網站擁有者負擔所有人的額度。

## 三、官方方案調查（2026-08-09）

### Groq Free Plan（建議第一個 Adapter）

- 官方 Free Plan 依模型提供 RPM、RPD、TPM、TPD 限制；例如部分模型為 30 RPM。
- API 提供 OpenAI 相容的 chat completions 格式，後端整合較簡單。
- 限制套用在供應商 organization，仍需要每位使用者自己的 key 才能真正分開額度。
- 來源：[Groq Rate Limits](https://console.groq.com/docs/rate-limits)、[Groq API Reference](https://console.groq.com/docs/api-reference)

### Gemini Free Tier（可作第二個 Adapter）

- 官方提供免費輸入與輸出 token，但只開放部分模型並有免費層限制。
- 免費層內容可能用來改善 Google 產品，因此送出學生程式前必須清楚告知。
- Google 明確要求 production 不可把 API key 暴露在 browser，必須經過 backend proxy。
- 來源：[Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing)、[Gemini API Key Security](https://ai.google.dev/gemini-api/docs/api-key)

### Ollama（本機開發與隱私選項）

- 模型可以在自己的 Windows／Linux 主機執行，API 預設位於 `http://localhost:11434/api`。
- 沒有外部 token 費用，但需要足夠的 RAM／GPU，公開部署時成本轉為主機硬體與電力。
- 來源：[Ollama API](https://docs.ollama.com/api/introduction)、[Ollama Quickstart](https://docs.ollama.com/quickstart)

### Supabase Free（帳號與資料庫建議）

- 官方 Free Plan 目前包含 50,000 MAU、500 MB database、兩個 active free projects；閒置專案可能暫停。
- Supabase Auth 支援 email/password、social login，並能以 Row Level Security 保護每位使用者資料。
- 來源：[Supabase Pricing](https://supabase.com/pricing)、[Supabase Auth](https://supabase.com/docs/guides/auth)

## 四、執行順序

### 階段一：帳號基礎

- [x] 建立 Supabase Free project。
- [x] 建立 email/password 註冊、登入、登出與忘記密碼頁面。
- [x] Backend 驗證 Supabase JWT，不信任前端自行提供的 user id。
- [x] 建立 `ai_connections`、`ai_usage` 資料表與 RLS migration；`profiles` 留到個人資料頁階段。
- [x] 將目前右上帳號圖示接到登入狀態與帳號選單。

### 階段二：安全連接使用者 AI

- [x] 第一版建立 Groq provider adapter。
- [x] 使用者在帳號設定貼上自己的 Groq API key，經 HTTP(S) 送到 backend；正式環境強制 HTTPS。
- [x] Backend 驗證 key 後以伺服器端主密鑰加密保存；前端永遠不能再次讀回完整 key。
- [x] 提供移除／更換 key、連線測試與最後四碼提示。
- [x] 不將 key 寫入 log、Git、localStorage 或錯誤訊息。

### 階段三：AI Tutor API

- [ ] 建立 `/api/ai/chat`，只接受已登入使用者。
- [ ] 加入每日請求與 token 限制、timeout、內容大小限制與錯誤分類。
- [ ] 只送出使用者同意的程式碼、錯誤與題目內容。
- [ ] 加入 Coach prompt：先解釋與提示，預設不直接輸出完整解答。
- [ ] 串流回覆到右側 AI Tutor，保存最少必要的對話資料。

### 階段四：其他 Provider

- [ ] 加入 Gemini adapter，連接前顯示免費層資料使用提醒。
- [ ] 本機開發加入 Ollama adapter。
- [ ] Provider 暫時失效或額度用完時顯示清楚提示。

## 五、驗收方式

- 未登入不能使用 AI 或存取其他使用者資料。
- API key 不出現在前端 bundle、localStorage、Git、log 或 API 回應。
- 每位使用者只能看到自己的連線狀態與用量。
- Groq 免費額度用完時不會影響 Compiler，並顯示稍後重試／更換 Provider。
- AI 回覆可使用目前程式碼與 Compiler 結果，且繁中／英文介面皆可用。

## 六、需要使用者手動操作

1. 建立或登入 Supabase 帳號，建立 Free project 並提供 Project URL 與 publishable key；service role key 只放 backend secret。
2. 從官方 [Groq API Keys](https://console.groq.com/keys) 建立 API key 供個人測試；不要將 key 貼在對話、GitHub 或前端程式碼。
3. 正式部署前建立後端加密主密鑰，並使用部署平台 Secret 管理。

## 七、目前建議

先完成帳號系統，再正式串接 AI。開發期間若想提前驗證 AI prompt，可先用開發者自己的 Groq Free key放在 backend 環境變數，但不開放給其他使用者，並且不得提交到 Git。
