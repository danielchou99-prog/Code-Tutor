# Code Tutor 帳號系統實作計畫

- 文件狀態：註冊、Email 驗證、登入與未登入按鈕微調完成
- 最後更新：2026-08-09
- 使用方案：Supabase Auth + Next.js Cookie-based session

## 一、目標

讓 Code Tutor 使用者可以用 Email 與密碼註冊、登入、登出及申請重設密碼，並讓右上角帳號圖示顯示目前登入狀態。登入基礎完成後，後端才能安全區分每位使用者的檔案、AI API key 與 AI 使用量。

## 二、目前狀態

- [x] Supabase Free project 已建立。
- [x] Groq API key 已建立，完整內容不會放入前端或 Git。
- [x] Frontend Supabase 連線層已完成，等待 Project URL 與 Publishable key。
- [x] 帳號圖示已提供註冊、登入、忘記密碼及登出介面。
- [x] Backend 已建立 Supabase JWT 簽章驗證。

## 三、階段一：Supabase 前端基礎

### 執行步驟

- [x] 安裝官方 `@supabase/supabase-js` 與 `@supabase/ssr` 套件。
- [x] 增加 browser、server 與 Proxy Supabase client。
- [x] 在 `.env.example` 記錄 Project URL 與 Publishable key 變數。
- [x] 未設定 Supabase 時顯示清楚提示，不讓整個網站故障。
- [x] 以 Cookie-based session 保存及更新登入狀態。

### 簡易說明

Publishable key 只是讓網站知道要連接哪個 Supabase 專案；真正的身分由使用者登入後取得的 JWT 表示。Proxy 會在 JWT 即將過期時更新 Cookie，讓使用者不用頻繁重新登入。

## 四、階段二：帳號操作介面

### 執行步驟

- [x] 點擊右上帳號圖示開啟帳號選單或登入視窗。
- [x] 加入 Email／密碼登入。
- [x] 加入 Email／密碼註冊與確認信提示。
- [x] 加入忘記密碼信件申請。
- [ ] 登入後顯示 Email、帳號設定入口與登出（Email 與登出已完成，設定頁留待 AI key 階段）。
- [x] 加入繁體中文與英文文字。
- [x] 加入基本欄位檢查、等待狀態與錯誤提示。

### 簡易說明

Supabase 負責安全保存密碼與寄送驗證信；Code Tutor 只呼叫官方 Auth API，不自行建立密碼資料表，也不會看到使用者的原始密碼。

## 五、階段三：確認信與密碼更新

### 執行步驟

- [x] 建立 `/auth/confirm`，把 Email 確認 token 換成登入 session。
- [x] 建立 `/auth/update-password`，讓重設信返回後設定新密碼。
- [x] 提供並完成 Supabase Dashboard 的本機 Site URL 與 Redirect URL 設定；免費預設寄信服務先使用預設 Email Template，不啟用自訂 SMTP。

### 簡易說明

使用者點擊 Email 裡的連結後，需要回到 Code Tutor 的指定頁面。確認頁會驗證一次性 token；密碼更新頁只在有效的復原 session 中允許設定新密碼。

## 六、階段四：後端驗證基礎

### 執行步驟

- [x] FastAPI 從 `Authorization: Bearer <JWT>` 讀取登入 token。
- [x] 使用 Supabase JWKS 驗證簽章、issuer、audience 與到期時間。
- [x] 建立測試用受保護 endpoint，確認未登入回傳 401。
- [x] 不信任前端自行提供的 user id。

### 簡易說明

前端顯示「已登入」只影響畫面，不能當成安全依據。每個需要個人資料或 AI 的後端請求都必須重新驗證 JWT，才能確定呼叫者身分。

## 七、驗收方式

- 未設定環境變數時，首頁仍可使用並提示管理者完成設定。
- 使用者可以註冊並收到確認信。
- 確認 Email 後可以登入，重新整理頁面仍保持登入。
- 右上帳號選單顯示目前 Email，登出後恢復訪客狀態。
- 忘記密碼信可以返回 Code Tutor 並更新密碼。
- 未帶有效 JWT 呼叫後端保護 endpoint 時得到 401。
- ESLint、Next.js production build 與後端測試通過。

## 八、需要使用者手動操作

1. [x] 將 Supabase `Connect` 的 `Project URL` 與 `Publishable key` 填進已建立的 `frontend/.env.local`；Project URL 也填入 `backend/.env`。
2. 絕對不要提供 `Secret key`、`service_role key`、資料庫密碼或完整 Groq API key。
3. [x] Supabase Dashboard 已設定本機 Site URL 與 Redirect URLs；新版介面未啟用自訂 SMTP 時不可修改 Email Template，因此本機測試先使用預設模板。
4. [ ] 使用自己的 Email 完成一次註冊、確認信、登入與忘記密碼測試（前三項已通過，忘記密碼待測）。

## 九、目前驗收紀錄

- 未設定 Supabase 時，瀏覽器可開啟帳號視窗並顯示設定提示，其他頁面仍正常。
- 畫面證據：`plan/evidence/account-system-unconfigured.png`。
- 公開連線資料填入後，Supabase Auth settings endpoint 回應 HTTP 200，Frontend 顯示真正的登入表單。
- 已連線畫面證據：`plan/evidence/account-system-configured.png`。
- Backend 已讀取 Supabase Project URL，`/health` 與 Docker Compiler 維持正常。
- Supabase URL Configuration 已由使用者完成，包含本機 Site URL 與 Redirect URLs。
- 使用者已實際收到確認信，完成 Email 驗證並成功回到 Code Tutor 登入狀態。
- Frontend ESLint 與 Next.js production build 通過；產生 `/auth/confirm` 與 `/auth/update-password` 路由。
- Backend 完整 33 項測試通過，包含 9 項真實 Docker，以及有效 JWT、錯誤 audience、未登入 401 與已驗證身分回應。
- npm audit 沒有 high／critical 漏洞；既有 Monaco Editor 仍有 DOMPurify 1 low／1 moderate，`npm audit fix` 尚無法更新且未使用 `--force`。
- 真實 Supabase 註冊、確認信與登入已通過；登入保持與忘記密碼流程等待後續驗收。

## 九之一、未登入按鈕微調

- [x] 未登入時不顯示圓形頭像，改成有外框的固定英文 `Sign in` 按鈕。
- [x] 登入後才顯示圓形帳號字母。
- [x] 按下 `Sign in` 仍開啟原本的登入視窗。
- [x] 完成 ESLint、production build 與未登入瀏覽器畫面驗收。

畫面證據：`plan/evidence/account-system-signed-out.png`。

## 九之二、登出與登入表單隱私

- [x] 登入成功後立即清除元件記憶體中的 Email、密碼與確認密碼。
- [x] 登出後清除 Supabase session 與所有登入表單欄位。
- [x] 關閉登入視窗時也清除已輸入內容，重新開啟保持空白。
- [x] 關閉登入表單 autocomplete，降低瀏覽器在共用裝置自動填入的機會。
- [x] 驗證 Code Tutor 不把密碼寫入 localStorage、sessionStorage 或其他應用程式儲存位置。
- [x] 完成 ESLint、production build 與瀏覽器欄位清除測試。

### 簡易說明

Code Tutor 只把密碼直接交給 Supabase Auth 驗證，不會自行保存原始密碼。網站可以清除自己畫面與 session，但無法刪除使用者曾主動存在 Edge／Chrome 密碼管理員裡的資料；那部分必須由使用者在瀏覽器設定中管理。

驗證結果：在登入欄位輸入測試資料，關閉視窗後重新開啟，Email 與密碼皆為空白，且欄位的 autocomplete 已關閉。ESLint 與 production build 均通過。畫面證據：`plan/evidence/account-system-credentials-cleared.png`。

## 十、官方依據

- Supabase Next.js Auth 使用 Cookie-based session：<https://supabase.com/docs/guides/auth/quickstarts/nextjs>
- Supabase SSR client 與 Proxy：<https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs>
- Supabase Publishable key 用途：<https://supabase.com/docs/guides/getting-started/api-keys>
