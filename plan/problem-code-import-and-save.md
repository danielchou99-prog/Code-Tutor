# 題目程式碼匯入與儲存計畫

## 目標

讓題目詳情的 Constraints 與 Tests and scoring 使用同一份資料，並讓使用者可將本機程式碼匯入題目編輯器、保留未儲存草稿，以及明確按下 Save 後將每道題目、每種語言的程式碼保存到自己的 Supabase 帳號。

## 目前狀態

- [x] 題目已有整體限制與分組計分資料。
- [x] Constraints 已與 Tests and scoring 共用各分組的條件、測資數與配分元件。
- [x] 題目編輯器已可依目前語言匯入本機 `.cpp`／`.py`。
- [x] 題目程式碼已有獨立 Save、本機未儲存草稿與 Supabase 跨裝置保存資料層。
- [x] 正式題庫 migration 與 Judge 程式已建立，等待真實 Supabase 設定。

## 執行步驟

- [x] 1. 統一 Constraints 與 Tests and scoring 的資料來源。
  - 簡易說明：兩區都從 `problem.testGroups` 顯示相同條件、測資數與占分，未來修改題目時不會只改到其中一處。
- [x] 2. 建立 `problem_code_drafts` Supabase migration。
  - 簡易說明：每位使用者、每道題目、每種程式語言各保存一份程式碼；RLS 只允許本人讀寫。
- [x] 3. 建立題目程式碼儲存資料層。
  - 簡易說明：登入後 Save 寫入 Supabase；migration 未套用、未登入或網路失敗時顯示清楚訊息，不偽裝成雲端儲存成功。
- [x] 4. 加入 Import code。
  - 簡易說明：C++20 只接受 `.cpp`，Python 3 只接受 `.py`；檢查副檔名、空檔與 64 KiB 上限，再載入目前編輯器。
- [x] 5. 加入明確 Save、已儲存／未儲存狀態。
  - 簡易說明：程式碼修改後顯示未儲存，只有按 Save 才寫入 Supabase；不開啟自動雲端儲存。
- [x] 6. 保留本機未儲存草稿與覆寫確認。
  - 簡易說明：重新整理仍可回到尚未 Save 的內容；Import 或 Reset 將覆蓋目前修改時，先使用網站風格對話框確認。
- [x] 7. 完成 lint、TypeScript、build 與瀏覽器驗收。
  - 簡易說明：確認中英文、C++／Python、匯入錯誤、Save 狀態與窄畫面都正常。

## 驗收方式

- [x] Constraints 與 Tests and scoring 顯示完全相同的分組條件、測資數與配分。
- [x] C++ 僅接受 `.cpp`，Python 僅接受 `.py`，兩種語言共用已通過型別檢查的匯入流程。
- [x] 不符合目前語言的副檔名、空檔或過大檔案會被拒絕。
- [x] 修改或匯入程式碼後顯示 Unsaved；未登入按 Save 不會偽裝成功。
- [x] 重新整理仍保留本機未儲存草稿，不會偷偷寫入 Supabase。
- [x] 使用者已在登入狀態完成 C++／Python Save 與重新開啟驗收。
- [ ] 不同帳號無法讀取或修改彼此的題目程式碼。

## 本輪自動檢查結果

- [x] `npm.cmd run lint`
- [x] `npx.cmd tsc --noEmit`
- [x] `npm.cmd run build`
- [x] 題目詳情瀏覽器驗收：Constraints／Tests and scoring、語言選單、Input 預設頁與工具列。
- [x] 匯入與草稿瀏覽器驗收：真實 `.cpp` 匯入、重新整理復原、訪客 Save 說明、Reset 覆寫確認。
- [x] 驗收截圖：`plan/evidence/problem-code-import-save.png`、`plan/evidence/problem-code-tools.png`。
- [x] 修正程式語言下拉選單遭編輯器內容裁切或遮住；選項中心點的最上層元素已由瀏覽器驗證為選單本身。
- [x] 選單修正驗收截圖：`plan/evidence/problem-language-menu.png`。

## 需要使用者手動操作的事項

- [x] 2026-08-23 使用目前公開設定做唯讀檢查：`problem_code_drafts` 回傳 404，確認 migration 尚未套用。
- [x] 已在 Supabase SQL Editor 執行正式題庫與 `problem_code_drafts` migrations；公開請求對程式碼草稿回傳 401，符合僅限登入者的設計。
- [x] migration 完成後，已以登入帳號分別 Save C++ 與 Python 程式碼並完成畫面驗收。
