# Code Tutor 新專案預設 Hello world! 計畫

- 文件狀態：程式與自動檢查完成，等待 push 與部署後人工驗收
- 最後更新：2026-10-22
- 前置條件：檔案管理與訪客檔案工作區（`guest-file-workspace.md`）已完成

## 一、目標

所有新建立的專案，包含未登入的訪客工作區，預設的 `main.cpp` 或 `main.py` 一律是會輸出 `Hello world!` 的程式。目前預設是「讀入 n 個數字並加總」的範例，需要輸入資料才有意義，對初學者不直覺。

簡易說明：新專案一打開，按 Run 就能看到 `Hello world!`，不用先準備輸入。

## 二、目前狀態

- [x] 確認預設程式碼只定義在 `frontend/src/lib/file-items.ts` 的 `defaultCppCode` 與 `defaultPythonCode`。
- [x] 確認一般專案由 `createFileItem` 把預設內容寫入 `file_items.content`，資料庫觸發器再複製成 `main.cpp` 或 `main.py`，因此只改前端常數即可，不需要 migration。
- [x] 確認訪客工作區（建立、切換語言）與訪客登入後匯入都沿用同一組常數。
- [x] 預設程式碼已改為 Hello world!。

## 三、範圍

- 會改：新建 C++ 專案、新建 Python 專案、訪客工作區（首次建立與切換語言）。
- 不改：既有專案的內容（已儲存的程式不會被覆蓋）、既有的訪客草稿、題目頁的程式碼樣板、Run 輸入框預設的 `5 / 1 2 3 4 5`（Hello world! 不讀輸入，所以不影響結果）。

## 四、執行步驟與簡易說明

1. [x] 將 `defaultCppCode` 改為輸出 `Hello world!` 的 C++ 程式，`defaultPythonCode` 改為 `print("Hello world!")`。
   簡易說明：只換範例內容，其他流程不動。
2. [x] 確認沒有其他位置寫死舊範例。
3. [x] 更新本計畫書與 `plan/README.md`。

## 五、驗收方式

1. 新建 C++ 專案，`main.cpp` 內容是 Hello world! 程式。
2. 新建 Python 專案，`main.py` 內容是 `print("Hello world!")`。
3. 訪客首次開啟 `/files`，以及在側邊欄切換語言後，預設內容都是 Hello world!。
4. 既有專案與既有訪客草稿內容不變。
5. 執行該程式，輸出為 `Hello world!`。

## 六、自動檢查與唯讀確認（push 前必須完成）

- [x] `git status` / `git diff` 逐項檢視，確認只有預期檔案。
- [x] Frontend ESLint、TypeScript、production build 通過。
- [x] 取出實際的預設程式碼並執行 Python 版（本機沒有 g++，C++ 版未實際編譯）。

驗收記錄（2026-10-22）：

- 變更檔案：`frontend/src/lib/file-items.ts`（兩個常數）、本計畫書與 `plan/README.md`；全專案搜尋確認已無舊範例殘留。
- `eslint`、`tsc --noEmit`、`npm run build` 全部通過。
- 取出實際常數內容執行：Python 版輸出 `Hello world!`，結束碼 0。
- 本機沒有 g++，C++ 版未實際編譯，內容為標準的 `cout << "Hello world!"`，需在部署後以 Run 確認。

## 七、需要使用者手動操作

- [ ] 部署後新建一個 C++ 與一個 Python 專案，按 Run 確認輸出。
- [ ] 不需要執行新的 Supabase migration。

## 八、本階段不包含

- 修改既有專案內容。
- 修改題目頁樣板或 AI Tutor 範例。
