# Code Tutor 全系統檢查與驗收清單

- 文件狀態：自動檢查完成，等待真實帳號手動驗收
- 建立日期：2026-08-09
- 檢查範圍：Frontend、Backend、Supabase、Docker Compiler、AI Tutor、帳號、設定、響應式畫面與 Git

## 一、目標

完整檢查 Code Tutor 目前已實作的功能是否能正常運作，留下可重複使用的檢查清單、實際結果與仍需使用者手動驗收的項目。

簡易說明：自動測試適合檢查程式與 API；真實 Email、登入帳號、Groq 額度和使用感受仍需要真人確認，兩者不能混為一談。

## 二、開始前狀態

- [x] Frontend 預期在 `http://127.0.0.1:3000`。
- [x] FastAPI 預期在 `http://127.0.0.1:8000`。
- [x] Docker Desktop 與 `code-tutor-compiler:local` 先前已建立。
- [x] Supabase 專案與 Groq Key 先前已由使用者完成設定。
- [x] 確認目前實際服務、版本與設定沒有漂移。

## 三、自動檢查清單

### A. 原始碼與設定

- [x] Git 工作區修改皆可對應本次檢查、修正與後續 Python 功能，沒有覆寫未知修改。
- [x] 前端公開設定完整，且沒有 Secret／service role Key 進入可提交檔案。
- [x] 後端必要設定可讀取，秘密只存在忽略的 `.env`。
- [x] 檢查當時的 Supabase 四份 migration 都存在且 SQL 結構可辨識；後續另新增 Python migration。

### B. Frontend 品質

- [x] ESLint 通過。
- [x] TypeScript `--noEmit` 通過。
- [x] Next.js production build 通過。
- [x] 首頁 HTTP 200，靜態資源可載入。
- [x] 390px、900px 與 1440px 畫面沒有明顯水平溢位。
- [x] 深色與淺藍灰模式的主要文字可讀。

### C. Frontend 功能與元件

- [x] 左上角 Code Tutor 可返回首頁。
- [x] 導覽含首頁、檔案、題目、測驗與設定，沒有「關於我們」。
- [x] 語言可切換繁體中文／English。
- [x] 未登入時顯示 Sign in，不顯示假頭像；Supabase 無回應時最多等待 5 秒。
- [x] 設定中心包含個人資料、外觀、Editor、版面、字體、執行、快捷鍵、通知、語言、Groq、帳號安全與危險區域。
- [x] AI Tutor 問候不再固定為 Daniel，會依帳號資料決定名稱。
- [x] File 頁支援多標籤搜尋、資料夾、Project 與拖曳移動程式路徑。
- [x] Project Editor 支援新增、開啟、關閉與刪除 Project 檔案。
- [x] Save、Clear 雙重確認、離開未儲存警告與重新整理還原程式路徑存在。

### D. Backend 單元與 API 測試

- [x] Backend pytest 全部通過。
- [x] `/health` 回傳 HTTP 200。
- [x] `/api/auth/me` 未登入時正確拒絕。
- [x] AI connection／AI Tutor 未登入時正確拒絕，而不是 404。
- [x] API 對錯誤格式、過大輸入、危險檔名與重複檔名正確拒絕。
- [x] Rate limit 與 execution gate 測試通過。

### E. Docker Compiler

- [x] Docker Engine 可用。
- [x] Compiler image 存在。
- [x] 正常 C++ 編譯與輸出成功。
- [x] 編譯錯誤回傳 `compile_error`。
- [x] 執行錯誤回傳 `runtime_error`。
- [x] 無限迴圈回傳 `timeout`。
- [x] 標準輸入能傳入程式。
- [x] 多個 `.cpp` 可一起編譯。
- [x] Container 無網路、非 root、根目錄唯讀。
- [x] CPU、記憶體與程序限制測試通過。
- [x] 測試後沒有殘留 Compiler container。

### F. Interactive Console

- [x] WebSocket 可以建立 session。
- [x] 程式可先輸出提示，再接收多輪 stdin。
- [x] Stop／逾時／連線關閉會清理 container。
- [x] stdout、stderr 與狀態事件格式正確。

### G. AI 與安全

- [x] Groq Key 驗證、加密、儲存與移除測試通過。
- [x] AI Analyze、Explain error、Hint、Ask 的 prompt 測試通過。
- [x] AI 串流、忙碌限制、429／401／403 錯誤映射測試通過。
- [x] 完整 API Key 不會出現在回應、Git 或可提交文件。
- [x] 前端不含 Supabase service role Key。

## 四、需要真實帳號的手動驗收清單

- [ ] 註冊新帳號並收到確認信。
- [ ] 登入後右上角顯示該使用者的暱稱縮寫或頭像。
- [ ] AI Tutor 問候顯示該帳號暱稱，而不是固定名稱。
- [ ] 修改暱稱、Username、頭像網址與自我介紹後重新整理仍正確。
- [ ] 修改 Email 會收到確認信；修改密碼後可以重新登入。
- [ ] 登出後表單不保留密碼；登出所有裝置會結束 session。
- [ ] 建立資料夾與 Project，加入多個 `#標籤` 並用多標籤搜尋。
- [ ] 將 Project 拖入資料夾，再移回 My files。
- [ ] 在 Project 內新增 `.cpp/.h/.hpp`，關閉再重新開啟分頁。
- [ ] 未 Save 就離開／重新整理／刪除／關閉檔案時出現警告。
- [ ] Save 後重新整理仍停在原 Project 與原檔案。
- [ ] Text 模式正常 Run；Interactive Console 可像 CMD 多輪輸入。
- [ ] Groq 顯示 Connected，Analyze／Explain／Hint／Ask 各執行一次。
- [ ] 深色／淺藍灰、主題色、字體、Tab、Word Wrap、Console 高度與 AI 位置設定在重新整理後保留。
- [ ] 繁體中文與 English 的主要頁面文字、按鈕與錯誤訊息正確。
- [ ] 手機或窄視窗可以操作首頁、File、Project、Settings 與 AI Tutor。

## 五、驗收標準

1. 所有自動檢查項目必須有成功、失敗或受限原因，不可空白結案。
2. 發現程式問題時先記錄原因；若屬於本次檢查範圍內的小型修正，修正後重測。
3. 需要真實 Email、Supabase session 或 Groq 額度的項目明確交給使用者，不擅自操作帳號。
4. 最後提供總結：通過數、失敗數、待手動數、阻塞問題與下一步。

## 六、執行步驟與簡易說明

- [x] 盤點服務、版本、環境設定與 Git 狀態。
  - 簡易說明：先確認測試的是目前版本，不是殘留舊程序。
- [x] 執行 Frontend lint、型別、build 與瀏覽器檢查。
  - 簡易說明：同時檢查程式品質、正式建置與實際畫面。
- [x] 執行 Backend 全測試與真實 API smoke test。
  - 簡易說明：自動測試檢查各種邊界，smoke test 確認服務真的正在運作。
- [x] 執行 Docker、Interactive 與安全檢查。
  - 簡易說明：Online Compiler 最重要的是結果正確，而且不影響主機。
- [x] 搜尋秘密與核對 Git，整理手動驗收項目。
  - 簡易說明：程式通過不代表帳號信件或真人操作體驗已驗收。

## 七、執行結果

- 瀏覽器測試發現：Supabase 無法連線時，帳號入口會長時間停在載入骨架。
- 處理方式：加入 5 秒初始化逾時與 Promise 失敗回復；即使 Supabase 暫時無法連線，仍會顯示可操作的 Sign in，而不是永久載入。
- 原始碼檢查發現：站內離開已有自訂確認，但重新整理／關閉分頁缺少 `beforeunload`。
- 處理方式：未儲存時註冊瀏覽器原生離開警告；完成 Save 後立即移除，不干擾正常重新整理。
- 自動檢查結果：45 項通過、0 項失敗；真實帳號手動驗收共 16 項待使用者操作。
- Backend：57 個當時既有測試全部通過；加入 Python 後擴充為 66 個並再次全部通過。
- Frontend：ESLint、TypeScript、Next.js production build 全部通過。
- 真實 API：健康檢查、C++ 正常／stdin／編譯錯誤／執行錯誤／逾時／多檔案皆通過；後續 Python smoke test亦通過。
- 響應式畫面證據：`plan/evidence/full-system/home-desktop.png`、`home-tablet.png`、`home-mobile.png`。
- 限制：目前的 Headless Edge 無法可靠觸發 React hydration 後的點擊事件，因此登入後資料操作與 Groq 真實額度不冒充為自動驗證，保留在上方手動清單。
