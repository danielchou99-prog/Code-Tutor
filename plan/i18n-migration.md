# 介面文字遷移：`zh ? "中文" : "English"` → `t("key")`

接續 `plan/architecture-refactor.md` 階段 6。

## 目標

介面文字只有一個來源（`frontend/src/lib/language-context.tsx` 的翻譯表）。改一句文字或新增一種語言，不必在各元件裡找 `zh ? :`。

## 目前狀態

- 前端同時有兩種做法：`t("key")` 與直接寫在元件裡的 `zh ? "中文" : "English"`。
- `zh ? :` 約 380 處：`problem-admin-settings.tsx` 87、`problem-solver-page.tsx` 46、`settings-page.tsx` 36、`code-editor-panel.tsx` 35、`problems-page.tsx` 21、`ai-tutor-panel.tsx` 10 等。
- 其中約 15 處含變數（例如 `找到 ${n} 題`），`t()` 目前不支援。
- `zh` 以 prop 一路傳給子元件。

## 做法

1. `t(key, vars?)` 支援 `{name}` 佔位符，用於含變數的字串。
2. 用 TypeScript 語法樹（不是正規表示式）找出 `zh ? "中" : "英"`／`language === "zh-Hant" ? ... : ...`，兩個分支皆為字串時轉成 `t("key")`：
   - key 由英文文字產生；中英文完全相同的字串共用同一個 key；與既有 key 同名但文字不同時加數字後綴。
   - 為所屬元件補上 `const { t } = useLanguage()`（已有 `useLanguage()` 就只在解構加上 `t`）。
3. 含變數的字串人工改成 `t("key", { n })`。
4. 移除遷移後不再使用的 `zh` prop 與變數。
5. 不遷移：`problem-data.ts` 等雙語「內容資料」（`{ zh, en }` 物件），它們是題目內容，不是介面文字。

## 執行步驟

- [x] 擴充 `t` 支援 `{name}` 佔位符。
- [x] 撰寫並執行語法樹轉換腳本（固定字串）。
- [x] 修正型別檢查報出的元件（缺少 `t`）。
- [x] 人工遷移含變數的字串。
- [x] 清理未使用的 `zh`。
- [x] 驗證。

## 驗收方式

1. `tsc --noEmit`、`eslint`、`next build` 通過。
2. 靜態比對：每個被替換字串的中文與英文都原樣出現在翻譯表（腳本內檢查）。
3. 中文／英文模式各載入主要頁面，沒有顯示 key 名稱或空白。
4. 全前端 `zh ?` 只剩非介面文字的用法。

## 需要使用者手動操作

- 用瀏覽器在中文與英文兩種語言下，各逛一次首頁、檔案、題目（含解題）、設定（含題目管理），確認文字沒有錯位。

## 完成紀錄（2026-10-17）

- `t(key, vars?)` 支援 `{name}` 佔位符。
- 以 TypeScript 語法樹轉換：固定字串 370 處（新增 327 個 key，其餘共用既有 key）、含變數字串 20 處（19 個新 key，如 `找到 {count} 題`）；另外手動處理難度標籤、判題狀態文字（`judge-status.ts` 改用翻譯 key，簽名改為 `judgeStatusLabel(status, t)`）與刪除檔案確認。
- 清理不再使用的 `zh` prop／變數 16 個元件、`language` 變數 4 處。
- 刻意保留的 `zh ?`（內容語言選擇，不是介面文字）：`textKey = zh ? "zh" : "en"`（取雙語題目內容）、`problem.title[zh ? ...]`、`strategy[zh ? ...]`、`section.zh/section.en`（設定分頁標題資料）、傳給 API 的 `language: zh ? "zh-Hant" : "en"`。`problem-data.ts` 等 `{ zh, en }` 內容資料也不動。
- 驗證：`tsc --noEmit`、`eslint src`（0 警告）、`next build` 通過；用 Edge 在中文／英文下擷取首頁、檔案、題目、測驗、設定（13 個分頁）、解題頁共 38 個畫面，比對遷移前後的正式版建置：37 個逐字相同，唯一差異是中文解題頁當時打開了不同的題目（資料載入時機）；固定同一題 `f995` 重測，中文版相同，英文版僅差編輯器程式碼是否已載入。
- 注意：開發模式（`next dev`）在無頭瀏覽器中沒有完成 hydration，不能用來驗證互動，需用正式版。
- [ ] 尚待使用者：實際操作介面切換語言，確認沒有顯示 key 名稱或 `{count}` 之類的佔位符。
