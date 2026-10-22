# Code Tutor 訪客檔案工作區計畫

- 文件狀態：程式與自動檢查完成，等待真實 Supabase 帳號驗收與 push 前唯讀確認
- 最後更新：2026-10-22
- 前置條件：檔案管理、Project 多檔案與 Supabase Auth 已完成

## 一、目標

目前「檔案」頁面在未登入時只顯示「請先登入」的提示卡，完全不能使用。本計畫改成：

- 新使用者（訪客）不用登入，就能在「檔案」頁直接開啟編輯器、撰寫程式、新增檔案並執行。
- 只有在按下 **Save**（或 Ctrl+S）要把程式保存到帳號時，才要求登入。
- 登入後，訪客寫的內容自動變成帳號中的新 Project，不會遺失。

簡易說明：先讓人試用，需要「存起來」才請他登入；已登入使用者的流程完全不變。

## 二、目前狀態

- [x] 確認 `FilesView` 在沒有 `user` 時只渲染登入提示（`FileHome` 內的 `signInForFiles`）。
- [x] 確認編輯器的檔案讀寫全部直接呼叫 Supabase（`listProjectFiles`、`saveProjectFileContent` 等）。
- [x] 確認後端 `/api/run` 與 Interactive Console 不要求登入，訪客可以執行程式。
- [x] 確認程式草稿本來就會存到瀏覽器 localStorage，重新整理不會消失。
- [x] 訪客工作區、儲存時要求登入與登入後匯入已實作。
- [ ] 自動檢查與唯讀確認尚未完成。

## 三、設計決定

1. **訪客工作區存在瀏覽器**：localStorage 的 `code-tutor:guest-workspace`，內容為語言與檔案清單。不上傳任何資料到伺服器。
2. **檔案存取抽成 store**：編輯器不再直接呼叫 Supabase，改透過「Supabase store」或「訪客 store」。登入使用者行為不變。
3. **訪客不顯示未儲存警告**：內容已即時保留在本機，離開頁面不會遺失；狀態列顯示「訪客草稿」。
4. **Save 才登入**：訪客按 Save / Ctrl+S 會開啟頁首的登入面板，並記下「登入後要儲存」。
5. **登入後自動匯入**：偵測到登入且有待儲存標記，就建立一個新 Project 並寫入所有檔案，成功後清除訪客工作區並開啟該 Project；失敗則保留本機內容並顯示錯誤。

## 四、執行步驟與簡易說明

### 1. 檔案存取 store

- [x] 在 `file-items.ts` 新增 `ProjectFileStore` 型別、`supabaseProjectFileStore` 與 `guestProjectFileStore`。
- [x] 訪客 store 將檔案放在 localStorage，並沿用既有檔名驗證與 50 個檔案上限。

簡易說明：同一套編輯器可以同時服務「雲端 Project」與「本機訪客工作區」。

### 2. 編輯器改用 store

- [x] `CodeEditorPanel` 依 `project.guest` 選擇 store。
- [x] 訪客模式：不回報 dirty、切換分頁不彈未儲存警告、狀態列顯示訪客草稿。
- [x] 訪客按 Save / Ctrl+S 時呼叫「要求登入」而不是寫入 Supabase。

簡易說明：新增、開啟、關閉、刪除、Run 對訪客都可用；只有 Save 會被攔下來。

### 3. 檔案頁與側邊欄

- [x] `FilesView` 在未登入時顯示訪客工作區（含說明橫幅與語言切換）。
- [x] `HistoryPanel` 的「返回檔案」在訪客模式改成「登入以管理我的檔案」。
- [x] 新增 `code-tutor:request-sign-in` 事件，`AccountControl` 收到後開啟登入面板。

簡易說明：訪客看到的是可以直接寫的編輯器；想用資料夾與標籤管理檔案時才登入。

### 4. 登入後匯入

- [x] 登入後依待儲存標記建立 Project、寫入檔案、開啟該 Project。
- [x] 匯入失敗時保留本機內容並顯示錯誤。

簡易說明：訪客寫了一半、按 Save、登入後，就直接在自己的帳號裡看到同樣的程式。

### 5. 文字與文件

- [x] 在 `language-context.tsx` 新增中英文字串。
- [x] 更新本計畫書與 `plan/README.md`。
- [x] 舊的 `browser-validation.mjs` 的 `files-guest` 檢查仍在斷言「請先登入」卡片，已改為驗證新行為，並修正已過期的導覽按鈕選取器（導覽現在是連結）。

## 五、驗收方式

1. 未登入開啟 `/files`，直接看到編輯器與預設 `main.cpp`（或 `main.py`），不再出現「請先登入」卡片。
2. 訪客可新增 / 關閉 / 刪除檔案、輸入程式並按 Run 取得結果；重新整理後內容仍在。
3. 訪客按 Save 或 Ctrl+S 會開啟登入面板，且不會寫入任何 Supabase 資料。
4. 登入後自動建立新 Project，包含訪客所有檔案與內容，並直接開啟。
5. 已登入使用者的檔案頁、Project 儲存與未儲存警告與修改前一致。
6. 登出後回到訪客工作區；訪客工作區只在本機，不含任何帳號資料。

## 六、自動檢查與唯讀確認（push 前必須完成）

「唯讀確認」指只讀取、不修改檔案的檢查，全部通過並記錄於下方後才能 push：

- [x] `git status` / `git diff` 逐項檢視變更，確認只有預期檔案。
- [x] Frontend ESLint 通過。
- [x] Frontend TypeScript（`tsc --noEmit`）通過。
- [x] Frontend production build 通過。
- [x] 以瀏覽器（Playwright）在未登入狀態確認訪客流程：能編輯、Run 不被擋、Save 開啟登入面板。
- [x] Backend pytest 照常通過（本次不改後端）。

驗收記錄（2026-10-22）：

- 變更檔案共 9 個修改、3 個新增（含本計畫書），`git diff` 逐項檢視後只有預期內容，後端沒有任何變更。
- `eslint` 無警告；`tsc --noEmit` 無錯誤（需先執行 `next typegen` 產生 `LayoutProps`，與本次修改無關）；`npm run build` 成功。
- 瀏覽器（Playwright，未登入、Supabase 未設定）全部通過：直接顯示編輯器且沒有登入卡片、新增 `helper.cpp`、Run 不需登入並送出 `main.cpp` 與 `helper.cpp`、Save 開啟登入面板並記下待儲存標記、重新整理後檔案仍在、離開頁面沒有未儲存警告、刪除只移除指定檔案、切換 Python 後只剩 `main.py`。
- 既有 `browser-validation.mjs files-guest` 改為驗證新行為並通過。
- Backend pytest 通過（需要 Docker 的項目依環境略過）。
- 沙箱擋住 Monaco 的 CDN，因此編輯器本體顯示 Loading…，打字輸入未在瀏覽器中實測；程式內容存取走的是同一個 store 並由上述流程覆蓋。
- 「登入後匯入」需要真實 Supabase，尚未實測，列在下方手動驗收。

## 七、需要使用者手動操作

- [ ] 用真實 Supabase 帳號驗收「訪客 → Save → 登入 → 自動匯入 Project」。
- [ ] 本次不需要執行新的 Supabase migration。

## 八、本階段不包含

- 訪客的資料夾、標籤與多個 Project（需要登入）。
- 訪客內容同步到其他裝置。
- AI Tutor 對訪客的開放（仍依既有登入規則）。
