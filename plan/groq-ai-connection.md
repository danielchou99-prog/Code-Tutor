# Code Tutor Groq AI 安全連線實作計畫

- 文件狀態：程式、Supabase migration、後端秘密設定與自動檢查完成，等待真實 Key 驗收
- 最後更新：2026-08-09
- 前置條件：Supabase 帳號系統、後端 JWT 驗證與使用者 Groq API Key 已準備完成

## 一、目標

讓已登入使用者能從 Code Tutor 的設定介面安全連接自己的 Groq API Key。完整 Key 只送到 FastAPI 後端，經驗證與加密後保存；前端只能看到連線狀態與最後四碼，不能讀回完整 Key。

## 二、目前狀態

- [x] Supabase 註冊、確認信與登入可用。
- [x] FastAPI 能驗證 Supabase JWT。
- [x] 使用者已建立 Groq API Key，且未提供給對話或 GitHub。
- [x] AI 連線資料表與 RLS migration 已建立，等待套用。
- [x] 後端加密、Groq 測試與管理 API 已建立。
- [x] 設定介面已連接 AI API。

## 三、執行步驟與簡易說明

### 1. 建立 AI 連線資料表

- [x] 建立 `ai_connections` migration，保存使用者、provider、加密內容、Key 最後四碼及更新時間。
- [x] 建立 `ai_usage` migration，供後續每日次數與 token 限制使用。
- [x] 啟用 RLS，確保每位使用者只能看到自己的連線狀態與用量。
- [x] 不在任何欄位保存明文 API Key。

簡易說明：資料表只保存上鎖後的 Key。RLS 像資料庫門禁，即使使用者知道別人的資料編號，也不能讀取別人的資料。

### 2. 建立後端加密與 Groq Adapter

- [x] 增加後端加密主密鑰設定，缺少時安全停用 AI 連線功能。
- [x] 使用經驗證的對稱加密保存與解密 Key。
- [x] 以 Groq 官方 API 測試 Key，不把 Key 寫入 log 或錯誤回應。
- [x] 將 Groq 呼叫包在 provider adapter，方便後續加入 Gemini 或 Ollama。

簡易說明：使用者的 Key 會先在後端上鎖才進入資料庫；只有持有部署環境主密鑰的後端能在呼叫 Groq 時暫時解鎖。

### 3. 建立受保護的 AI 連線 API

- [x] 建立查詢連線狀態 API，只回傳 provider、最後四碼與更新時間。
- [x] 建立新增／更換 Key API，先驗證 Groq Key 再加密保存。
- [x] 建立移除 Key API。
- [x] 所有 API 必須驗證 Supabase JWT，不能相信前端提供的 user id。
- [x] 加入輸入大小、timeout 與安全錯誤分類。

簡易說明：瀏覽器只負責把使用者當次輸入送到後端；之後不會再取得完整 Key，降低外洩風險。

### 4. 建立帳號設定介面

- [x] 讓頂端 `Settings／設定` 按鈕可開啟設定視窗。
- [x] 未登入時說明需要先登入；已登入時顯示 Groq 連線狀態。
- [x] 加入 API Key 輸入、連接／更換、測試與移除操作。
- [x] 關閉或完成操作後立即清空輸入欄，不寫入 localStorage。
- [x] 提供繁體中文與英文提示。

簡易說明：設定頁只顯示「已連接」與最後四碼，類似信用卡畫面，不會把完整秘密重新顯示出來。

### 5. 測試與安全檢查

- [x] 後端測試未登入、無效 JWT、無效 Key、有效 Key、替換與移除流程。
- [x] 驗證 API 回應、前端 bundle、Git、localStorage 與 log 都沒有完整 Key。
- [x] 完成 Frontend ESLint、TypeScript、production build 與 Backend pytest。
- [ ] 使用真實登入帳號與 Groq Key完成一次人工連線驗收。

簡易說明：這個階段先驗證「安全連上 AI」，下一份計畫才會讓 Analyze Code、Explain Error 與 Give Hint 正式發送問題。

## 四、驗收方式

1. 未登入呼叫 AI 連線 API 會得到 401。
2. 有效 Key 可以連接，畫面只顯示最後四碼。
3. 錯誤 Key 顯示清楚訊息且不寫入資料庫。
4. 重新整理後仍顯示已連接，但完整 Key不會出現在任何前端回應或儲存空間。
5. 更換或移除 Key 後狀態正確更新。
6. 使用者不能讀取或修改其他帳號的 AI 連線。

## 五、需要使用者手動操作

- [x] 在 Supabase SQL Editor 執行本階段建立的 migration。
- [x] 已由本機安全設定工具產生加密主密鑰、複製 publishable key 並寫入忽略版控的 `backend/.env`，秘密未顯示於對話。
- [ ] 在設定介面自行貼入 Groq API Key，完成真實連線測試；Key 不要貼到對話。

簡易說明：Supabase migration 與秘密環境變數需要專案擁有者權限，所以由使用者操作；程式、測試、文件與非秘密設定由開發工具完成。

目前紀錄：migration 已由使用者執行；本機後端 AI service 已成功啟用，`/health` 回傳 `ok` 且 Compiler 可用。剩餘手動步驟只有在設定視窗自行輸入 Groq API Key 完成真實連線驗收。

### 本機 HTTPS 憑證修正

- [x] 由 `Failed to fetch` 找出舊 Backend 未載入 AI API，已停止舊程序並啟動最新版。
- [x] 驗證 AI API 回傳 401、CORS preflight 回傳 200，且允許 `PUT`。
- [x] 找出 Supabase 儲存失敗原因為 Windows Python `CERTIFICATE_VERIFY_FAILED`。
- [x] 改用 Windows 系統信任憑證庫驗證 Groq 與 Supabase HTTPS，不停用 SSL 驗證。
- [x] 重新執行後端測試，確認 31 項通過、9 項依環境略過，套件相依正常。
- [ ] 使用真實 Groq Key 完成連線與儲存驗收。

簡易說明：目前網路的 HTTPS 憑證受到 Windows 信任，但 Python 內建憑證清單不完整。改用 Windows 系統憑證庫可以解決連線，同時繼續檢查伺服器身分；不可使用 `verify=False`，否則 API Key 可能在不安全連線中外洩。

## 六、本階段不包含

- AI Tutor 對話與串流回覆。
- Analyze Code、Explain Error、Give Hint 的 prompt。
- AI Memory 與學習弱點分析。
- Gemini、Ollama 或其他 provider。

這些功能會在 Groq 安全連線驗收後，另建 AI Tutor API 計畫執行。
