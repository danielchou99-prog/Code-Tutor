# 頁面獨立網址（/home、/files、/problems、/quiz、/settings）

## 目標

讓首頁、檔案、題目、測驗、設定各自有獨立網址（例如 `xxx.com/home`、`xxx.com/settings`），可以分享連結、加書籤，並能使用瀏覽器的上一頁／下一頁。

## 目前狀態

- 整個網站只有 `/`；`frontend/src/components/app-shell.tsx` 用 `useState(activeSection)` 切換頁面，並把目前頁面存在 `localStorage`。
- `site-header.tsx` 的導覽是 `<button>`，不是連結。
- 登入相關頁面 `/auth/confirm`、`/auth/update-password` 已是獨立路由，各自包 Provider。
- 開啟中的專案與選中的題目只存在 `localStorage`，不在網址。

## 範圍與決定

- 本次只做第一層頁面：`/home`、`/files`、`/problems`、`/quiz`、`/settings`。
- `/` 導向 `/home`。
- 專案與單題的獨立網址（`/files/[projectId]`、`/problems/[id]`）不在本次範圍，之後另開計畫。開啟中的專案與選中的題目維持現有 `localStorage` 行為。

## 路由設計

| 網址 | 內容 |
| --- | --- |
| `/` | 導向 `/home` |
| `/home` | 首頁 |
| `/files` | 檔案管理；開啟專案後顯示編輯器（沿用原行為） |
| `/problems` | 題庫與解題 |
| `/quiz` | 測驗（即將推出） |
| `/settings` | 設定 |

使用 route group `app/(site)/`：`layout.tsx` 只負責套用共用 Provider 與外框，各頁面只放自己的內容。

## 執行步驟

- [x] 閱讀 `node_modules/next/dist/docs/` 的 layouts、linking、redirect 文件（本版 Next.js 為 16，可能與舊知識不同）。
  - 說明：`frontend/AGENTS.md` 要求。已讀 linking-and-navigating、redirects、use-selected-layout-segment。
- [x] 新增 `lib/routes.ts`：區段與網址的對照。
- [x] 新增 `components/app-providers.tsx`（Language、Settings、Auth）與 `components/site-frame.tsx`（主題外框、導覽列、未儲存程式碼警告、離頁捲動位置記憶）。
  - 說明：把 `AppContent` 中與「哪一頁」無關的部分搬到共用外框。
- [x] 以 `SiteFrame` 提供的 `setUnsavedChanges` / `protectUnsavedCode` 取代原本在 `AppContent` 中攔截切頁與登出的作法；導覽列連結點擊時若有未儲存程式碼，先顯示確認視窗。
  - 說明：改成真正的路由後，離開頁面不再由單一元件統一控制，必須另外攔截。
- [x] `site-header.tsx` 導覽改用 `<Link>`，目前頁面由網址判斷（`usePathname`）。
- [x] 建立 `app/(site)/{home,files,problems,quiz,settings}/page.tsx`；`FileHome`／`ProjectWorkspace` 的開啟專案狀態移到 `files-view.tsx`。
- [x] 保留「在題目頁再點一次『題目』回到題庫列表」的行為。
- [x] `app/page.tsx` 改為 `redirect("/home")`；刪除 `app-shell.tsx` 與不再使用的 `active-section` localStorage。
- [x] 更新 `plan/網站架構，使用技術與物件導向.md` 中對 `app-shell.tsx` 的描述。
- 補充：`HomePage` 改為自己用 `useRouter` 導向，不再接收 `onSelect`；`/quiz` 在導覽列仍為「即將推出」不可點，但直接輸入網址可看到說明頁。

## 驗收方式

1. `tsc --noEmit`、`eslint`、`next build` 通過，build 輸出列出 `/home`、`/files`、`/problems`、`/quiz`、`/settings`。
2. 啟動後 `/` 回 307 導向 `/home`；五個網址直接開啟都能顯示對應頁面。
3. 導覽列點擊會改變網址；上一頁／下一頁可用；目前頁面的標示正確。
4. 編輯器有未儲存修改時，點導覽列、首頁 Logo、登出都會出現「尚有未儲存的修改」；取消則留在原頁，確認則離開並清除草稿。
5. 重新整理後仍在同一網址；已開啟的專案重新整理後仍會還原。
6. 登入、登出、忘記密碼流程不受影響。

## 需要使用者手動操作

- [x] 用瀏覽器實際點過各頁、在編輯器輸入程式碼後點離開頁面，確認警告行為。
- [ ] 正式部署時（nginx）確認 `/home`、`/settings` 等路徑都轉給 Next.js，而不是 404。

## 驗證紀錄（2026-10-17）

- [x] `tsc --noEmit`、`eslint src`、`next build` 通過；build 路由列出 `/home`、`/files`、`/problems`、`/quiz`、`/settings`。
- [x] `next start` 實測：`/` → 307 `/home`；五個網址皆 200；不存在路徑 404；導覽為真實 `<a href>`。
- [x] Edge（CDP）實測：點導覽列改變網址並正確標示目前頁面；瀏覽器上一頁／下一頁正常；點 Logo 回 `/home`；直接開啟與重新整理 `/settings` 正常；首頁按鈕可導向 `/problems`；在題目頁再點「題目」會清除已選題目。
- [x] nginx 設定 `location /` 本來就轉給 Next.js，不需調整。
- [x] 使用者手動測試：編輯器有未儲存修改時，點導覽列／Logo／登出會出現警告（首次測試只有重新整理有警告，原因是 `protectUnsavedCode` 與傳給編輯器的 `onDirtyChange` 每次渲染都換新函式，使編輯器的 effect 重跑並把「未儲存」狀態清掉；改為穩定函式後通過）。
