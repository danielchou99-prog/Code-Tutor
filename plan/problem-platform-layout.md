# 解題平台版面製作計畫

## 目標

依照 `Code_Tutor_解題網站開發計畫書.md`，先在現有 Code Tutor 風格中完成可操作、可切換語言且可在不同螢幕使用的題庫與解題頁面。

本階段專注在前端版面與操作流程；題目資料庫、隱藏測資、正式 Judge、Submission 紀錄與分數儲存會在後續階段串接。

## 目前狀態

- [x] 已有 Problems 導覽入口與基礎搜尋、標籤篩選。
- [x] 已有 Monaco Editor、Compiler API 與 AI Tutor 元件可沿用。
- [ ] 題目卡片尚未能開啟完整題目。
- [ ] 尚未有題目／Editor／Result 三區解題版面。
- [ ] 尚未清楚區分 Run 與 Submit。
- [ ] AI Tutor 在解題頁尚未改成預設收合的浮動按鈕。

## 執行步驟

- [x] 1. 讀取原始計畫書並界定本階段範圍。
  - 簡易說明：先把「看得到、點得到的畫面」完成，正式評分系統留到下一階段。
- [x] 2. 整理前端示範題目資料。
  - 簡易說明：每題包含標題、難度、標籤、題目描述、輸入、輸出、範例、限制與時間／記憶體限制。
- [x] 3. 重做 Problem List。
  - 簡易說明：加入搜尋、難度、標籤、狀態篩選，以及清楚的題目表格／行動版卡片。
- [x] 4. 建立 Problem Detail 解題工作區。
  - 簡易說明：桌面版顯示題目、程式碼、結果三欄；小螢幕則改為上下排列，避免內容被壓得太小。
- [x] 5. 加入可調整寬度的分隔線。
  - 簡易說明：使用者可依閱讀、寫程式或除錯需求改變三區寬度。
- [x] 6. 整合現有 Compiler 的 Run 操作。
  - 簡易說明：Run 使用自訂 Input 呼叫現有 API，不產生正式作答紀錄。
- [x] 7. 建立 Submit 與 Judge Result 的版面狀態。
  - 簡易說明：本階段只提供清楚入口與「尚未串接 Judge」提示，不偽造 Accepted 或分數。
- [x] 8. 將 AI Tutor 改為右下角收合按鈕。
  - 簡易說明：需要時才展開，避免長期占用題目與程式碼空間。
- [x] 9. 執行 lint、TypeScript 與正式 build 檢查。
  - 簡易說明：確認程式碼格式、型別與正式建置都能通過。

## 驗收方式

- [x] 可以從 Problems 搜尋、篩選並開啟任一題目。
- [x] 題目詳情完整顯示題目、輸入、輸出、範例、限制、Time Limit 與 Memory Limit。
- [x] 桌面版清楚顯示題目、Editor、Result 三區，且可以拖曳調整寬度。
- [x] 手機或平板不會因三欄排列而無法閱讀。
- [x] Run 與 Submit 的用途及視覺層級清楚不同。
- [x] Run 可以使用目前 Compiler API；Submit 尚未接 Judge 時會如實提示。
- [x] AI Tutor 預設只顯示右下角按鈕，點擊後才展開。
- [x] 繁體中文與英文介面皆可正常顯示。

## 需要使用者手動操作的事項

- 本階段不需要執行 Supabase migration。
- 若要實際測試 Run，需要 FastAPI 後端與 Docker Compiler 正常啟動。
- 完成後請在桌面與手機寬度各驗收一次 Problems 與 Problem Detail。

## 後續階段

版面驗收後，下一步是建立 `problems`、`tags`、`test_cases`、`submissions` 等資料表，並將目前的前端示範資料替換成 Supabase 資料。

## 執行結果

- 已建立 4 題具完整欄位的前端示範題目。
- Problem List 支援文字、`#標籤`、難度與狀態的複合篩選。
- Problem Detail 已完成三欄桌面版、上下排列行動版與可拖曳分隔線。
- Run 已呼叫現有 Compiler API，並明確註明自訂測試成功不等於正式 Accepted。
- Submit 目前只顯示下一階段串接提示，不建立假 Submission 或假分數。
- AI Tutor 預設收合為右下角 56 × 56 按鈕。
- `npm run lint`、`tsc --noEmit` 與 `npm run build` 均通過。
- 瀏覽器驗收：1440 × 900 與 390 × 844 均無水平溢出；證據位於 `plan/evidence/problem-platform/`。
