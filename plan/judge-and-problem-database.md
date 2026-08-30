# 正式題庫與判題系統計畫

## 目標

將目前前端內建的示範題目改成可由 Supabase 管理的正式題庫，並建立需要登入、測資不會外洩的 Submit／Judge API。Run 仍只執行使用者自行輸入的測試資料；Submit 才使用後端隱藏測資並保存分數。

## 目前狀態

- [x] Problems 題目列表、搜尋、標籤、題目詳情與作答版面已完成。
- [x] C++20 與 Python 3 的 Docker Compiler 已可執行程式。
- [x] Run 與 Submit 在畫面上已分開。
- [x] 題庫資料層已可讀取 Supabase；migration 套用前會安全退回 `problem-data.ts`。
- [x] Submit／計分／Submission 程式已完成；等待真實 Supabase migration 與秘密設定。
- [x] 後端已設定只供伺服器使用的 Supabase Secret key，且可讀取正式 Judge 資料。

## 執行步驟

- [x] 1. 設計並建立 Supabase migration。
  - 簡易說明：建立題目、標籤、範例、配分群組、隱藏測資與提交紀錄資料表；一般使用者只能讀公開題目與自己的提交紀錄，不能讀隱藏輸入和答案。
- [x] 2. 加入四道現有題目的種子資料。
  - 簡易說明：先把目前畫面上的題目搬進資料庫，並提供可真正驗證答案的測資，migration 完成後不會出現空題庫。
- [x] 3. 建立後端題庫儲存層。
  - 簡易說明：後端用新式 Secret key（或舊 service role）讀取隱藏測資、建立提交紀錄；秘密只存在後端環境變數，不傳給瀏覽器。
- [x] 4. 建立 `/api/problems/{problem_id}/submit` Judge API。
  - 簡易說明：驗證登入、語言及程式碼，逐筆執行測資、比對輸出、計算群組分數，回傳 Accepted／Wrong Answer／Compile Error／Runtime Error／Time Limit。
- [x] 5. 加入 Judge 的 rate limit、佇列與錯誤保護。
  - 簡易說明：Submit 與 Run 共用安全執行限制，避免使用者一次送出大量容器工作拖垮電腦。
- [x] 6. 建立後端單元測試與 API 測試。
  - 簡易說明：用假的題庫與假的 Compiler 驗證分數、錯誤分類、登入限制與測資不會出現在回應中。
- [x] 7. 建立前端題庫 API 資料層與安全降級。
  - 簡易說明：Supabase migration 尚未套用或暫時離線時先保留目前示範題目，避免網站完全無法使用；資料庫可用後自動採用正式資料。
- [x] 8. 將 Submit 串接 Judge Result。
  - 簡易說明：按 Submit 後顯示判題中、各群組通過數、配分、總分與錯誤類型，並與 Run 的 Output 保持分離。
- [x] 9. 完成 lint、TypeScript、backend tests、production build 與瀏覽器驗收。
  - 簡易說明：先用自動測試確認程式正確，再由真實 Supabase 與 Docker 做最後驗收。
- [x] 10. 建立並執行正式環境 Judge 設定驗證腳本。
  - 簡易說明：後端使用 Secret 讀取一筆隱藏測資，分別執行 C++ 與 Python，只輸出狀態與答案是否相符，絕不輸出測資內容或金鑰。

## 驗收方式

- [x] 未登入時 Submit 回傳 401，畫面提示先登入。
- [x] 未登入／公開金鑰無法從 Supabase API 讀取隱藏測資；正式登入者的跨帳號 RLS 仍待人工驗收。
- [x] 正確 C++ 與 Python 程式可取得 100 分及 Accepted。
- [x] 錯誤答案、編譯錯誤、執行錯誤與超時能正確分類。
- [x] Judge Result 顯示各配分群組與總分，但不洩漏隱藏輸入或答案。
- [x] 登入帳號可完成 C++／Python Submission；跨帳號隔離仍保留為日後雙帳號驗收項目。
- [x] Run 仍只使用使用者輸入，不會建立正式 Submission。
- [x] Supabase 尚未套 migration 時，題庫畫面仍能使用內建示範資料。

## 自動驗收結果

- [x] Backend：57 項單元與 API 測試通過，18 項需真實 Docker 的測試在沙箱內跳過。
- [x] Docker：原有 13 項 C++／Python／隔離／資源限制測試全部通過。
- [x] Judge + Docker：正確 C++ 與 Python A+B 解答皆取得 100 分與 Accepted。
- [x] Frontend：ESLint、TypeScript 與 Next.js production build 通過。
- [x] Browser：題目列表、題目詳情、未登入 Submit 提示與無水平溢位均通過。
- [x] 正式 Supabase + Docker：Secret 可讀取 2 組共 10 筆隱藏測資，C++／Python 第一筆皆 accepted 且輸出相符。
- [x] 真實登入 Submission：使用者完成 C++／Python 驗收，資料庫端確認 A+B 有 C++ 2 筆、Python 1 筆正式紀錄。
- [ ] 跨帳號 RLS：等待日後使用第二個測試帳號驗收。

## 需要使用者手動操作的事項

- [x] 2026-08-23 使用目前公開設定做唯讀檢查：`problems` 回傳 404，確認 migration 尚未套用。
- [x] 到 Supabase SQL Editor 執行本階段新增的 migration。
- [x] 後端 `backend/.env` 已存在有效的 Supabase Secret 設定；驗證過程未顯示金鑰內容。
- [x] migration 與後端秘密設定完成後，已用真實登入帳號完成 C++ 與 Python Submit 驗收。

## 安全原則

- Secret／service role key 只能存在後端，永遠不能使用 `NEXT_PUBLIC_` 名稱。
- 隱藏測資不會包含在前端題目 API、錯誤訊息或 Judge 回應。
- 使用者不能直接新增或修改自己的分數；Submission 由可信任後端建立。
- Judge 使用既有 Docker 隔離、輸出限制、時間限制、rate limit 與等待佇列。
