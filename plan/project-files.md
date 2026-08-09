# Code Tutor 專案多檔案計畫

- 文件狀態：程式與自動檢查完成，等待 Supabase migration 與真實帳號驗收
- 最後更新：2026-08-09
- 前置條件：Supabase `file_items` 已建立，專案編輯器與手動儲存已完成

## 一、目標

將目前「每個 Project 只有一個 `main.cpp`」改成「每個 Project 可擁有多個檔案」。編輯器上方使用檔案分頁，提供新增、開啟、關閉與刪除按鈕。

關閉只關閉編輯分頁，不刪除資料；刪除才會永久移除檔案。任何可能丟失未儲存內容的動作都必須先顯示網站風格警告。

## 二、目前狀態

- [x] Project 資料存在 `file_items`，程式內容目前存於 Project 的單一 `content` 欄位。
- [x] 編輯器只有固定的 `main.cpp` 標籤。
- [x] 目前已支援手動 Save、Ctrl+S、本機草稿與離開前警告。
- [x] 原本尚無獨立的 Project 檔案資料表與多分頁狀態，本計畫已完成程式建置。

## 三、執行步驟與簡易說明

### 1. 建立 Project 檔案資料表

- [x] 新增 `project_files` migration，包含檔名、內容、Project、擁有者與更新時間。
- [x] 套用 RLS，使用者只能存取自己 Project 中的檔案。
- [x] 限制同一 Project 不可有重複檔名、單檔大小與檔案數量。
- [x] 自動把既有 Project 的 `content` 搬入對應的 `main.cpp`。
- [x] 新 Project 建立時自動產生 `main.cpp`。
- [x] 檔案變更時同步更新 Project 的最近更新時間。

簡易說明：Project 保留名稱、資料夾與標籤；真正的程式檔改放在 `project_files`。migration 會保留舊內容，不要求使用者重新建立 Project。

### 2. 建立前端資料操作

- [x] 加入列出、新增、讀取、儲存與刪除 Project 檔案的函式。
- [x] 檔名限制為 `.cpp`、`.h` 或 `.hpp`，並阻止 `/`、`\\` 與重複名稱。
- [x] 將草稿依 Project 與檔案分開保存，避免不同分頁互相覆蓋。

簡易說明：每個檔案有自己的資料庫 ID、正式內容與本機未儲存草稿。

### 3. 建立檔案分頁與按鈕

- [x] 在目前 `main.cpp` 位置顯示所有已開啟檔案分頁。
- [x] 加入新增檔案 `+` 按鈕與網站風格輸入視窗。
- [x] 加入開啟既有檔案的選單。
- [x] 每個分頁加入關閉 `×`；關閉不刪除檔案。
- [x] 加入刪除按鈕與網站風格確認視窗。
- [x] 切換分頁時載入對應內容，Save、Ctrl+S、Clear、Run 與 AI Tutor 都改用目前檔案。

簡易說明：分頁類似一般程式編輯器。關閉後可從開啟選單找回，刪除後才會從 Supabase 消失。

### 4. 未儲存內容保護

- [x] 切換、關閉或刪除目前未儲存檔案時顯示警告。
- [x] 離開 Project、登出或切換頁面時，只要目前檔案未儲存就維持既有警告。
- [x] 重新整理後恢復原 Project、原檔案與其本機草稿。

簡易說明：網站不會偷偷自動儲存，但瀏覽器草稿仍能避免意外重新整理造成內容消失。

### 5. 測試與文件

- [x] 執行 Frontend ESLint、TypeScript 與 production build。
- [x] 執行既有 Backend pytest（42 項通過、9 項依環境略過），確認編譯器與 AI Tutor 未受影響。
- [ ] 更新計畫狀態並完成真實 Supabase 人工驗收。

簡易說明：migration 尚未執行前，畫面會顯示明確提示；執行後再以真實帳號測試多檔案生命週期。

## 四、驗收方式

1. 既有 Project 第一次開啟時仍看得到原本的 `main.cpp` 內容。
2. 可以新增第二個 `.cpp` 或標頭檔，儲存後重新整理仍存在。
3. 關閉分頁不刪除檔案，能從檔案選單再次開啟。
4. 刪除會顯示確認視窗，確認後重新整理也不再出現。
5. 未儲存時切換、關閉、刪除、離開或重新整理都有保護。
6. Run 與 AI Tutor 使用目前分頁的程式內容。
7. 另一個登入帳號無法讀取或修改不屬於自己的檔案。

## 五、需要使用者手動操作

- [ ] 在 Supabase SQL Editor 執行新 migration。
- [ ] 重新整理 Code Tutor，確認既有 `main.cpp`、新增、關閉、重新開啟、刪除與未儲存警告。

簡易說明：只有 Supabase 專案擁有者能執行 migration；程式碼、檔案與自動測試由開發工具處理。

## 六、本階段不包含

- Project 內的子資料夾。
- 重新命名檔案與拖曳排序。
- Git 版本控制與多人即時協作。

## 七、檔案導覽版面修正

- [x] 確認編輯器分頁左側重複顯示 Project 名稱與 `/`，且左側 Project Files 仍是說明文字。
- [x] 保留檔案分頁左側的 Project 名稱並移除其後方的 `/`。
- [x] Project Files 顯示目前 Project 的真實檔案清單。
- [x] 清單中的檔案可點擊開啟，並標示目前選取的檔案。
- [x] 重新執行 Frontend ESLint、TypeScript 與 production build。

簡易說明：依照指定保留分頁列中的 Project 名稱，只拿掉 `/`。Project Files 負責導覽真實檔案，不再顯示操作提示。

驗收方式：`main.cpp` 左側仍顯示 Project 名稱但不再有 `/`；新增第二個檔案後，左側清單立即出現，點擊可切換到該檔案。

需要使用者手動操作：重新整理 Project 頁，確認分頁位置、左側檔案清單與點擊切換。

## 八、多檔案共同編譯優化

- 文件狀態：程式與自動測試完成，等待瀏覽器人工驗收
- 最後更新：2026-08-09

### 目標

讓 Run 與 Interactive Console 不再只編譯目前分頁，而是將同一個 Project 的所有 `.cpp`、`.h`、`.hpp` 一起放入隔離容器。所有 `.cpp` 共同建置，標頭檔可由 `#include` 使用。

### 目前狀態

- [x] Project 已能建立、儲存、開啟與刪除多個檔案。
- [x] 已確認原本一般 Run 只傳送目前分頁內容，並完成多檔案傳送。
- [x] 已確認原本 Interactive Console 只傳送目前分頁內容，並完成多檔案傳送。
- [x] Backend request 與 Docker compiler 已接受並驗證多檔案。

### 執行步驟與簡易說明

1. [x] 擴充 Run 與 Interactive request，接受最多 50 個合法 C++ 專案檔案。
   簡易說明：只允許 `.cpp`、`.h`、`.hpp` 與安全檔名，避免路徑穿越或建立任意檔案。
2. [x] 前端執行前讀取 Project 全部檔案內容，並以目前分頁的最新草稿覆蓋該檔案。
   簡易說明：其他檔案使用 Supabase 或本機草稿內容；目前正在編輯但尚未 Save 的程式也能立即測試，不會偷偷寫回資料庫。
3. [x] Docker compiler 將每個檔案寫入暫存來源目錄，並共同編譯所有 `.cpp`。
   簡易說明：這和一般 C++ Project 的建置方式相同，標頭檔不單獨編譯，而是由 `.cpp` 引用。
4. [x] 更新輸出提示，使畫面顯示正在建置整個 Project。
   簡易說明：避免使用者誤以為只執行 `main.cpp`。
5. [x] 增加 Backend 測試，並執行 Frontend lint、TypeScript、production build 與 Backend pytest。
   簡易說明：確認單檔功能維持相容，多檔案與安全限制都有測試。

### 驗收方式

1. `main.cpp` 可以 `#include "helper.hpp"` 並呼叫另一個 `.cpp` 實作的函式。
2. 一般 Run 和 Interactive Console 都能成功執行多檔案程式。
3. 修改目前檔案但尚未 Save 時，Run 使用畫面上的最新內容，重新整理後仍維持原有草稿規則。
4. 非法檔名、重複檔名、超過 50 個檔案或沒有 `.cpp` 時會被拒絕。
5. 既有單一 `main.cpp` Project 仍能照常執行。

### 需要使用者手動操作

- [ ] 自動測試完成後，在瀏覽器建立 `main.cpp`、`helper.cpp`、`helper.hpp` 各一個，分別測試 Run 與 Interactive Console。

簡易說明：這次不需要執行新的 Supabase migration；只有最後的實際畫面驗收需要使用者操作。
