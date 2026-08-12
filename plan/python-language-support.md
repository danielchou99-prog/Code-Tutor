# Python 語言支援計畫

## 目標

- 讓使用者建立 Project 時可以選擇 `C++20` 或 `Python 3`。
- 語言選單沿用網站既有的下拉選單外觀與互動方式。
- Project 選定語言後，檔名規則、預設程式碼、編輯器語法、執行方式與 AI Tutor context 都使用相同語言。
- Python 與 C++ 都必須在既有 Docker 安全限制內執行。

## 目前狀態

- [x] 已確認 `file_items.language` 欄位存在，但資料庫限制目前只允許 `cpp`。
- [x] 已確認前端建立 Project、檔案驗證、Monaco 與執行 API 都寫死 C++。
- [x] 已確認 FastAPI 的請求模型、一般執行及 Interactive Console 都只支援 C++。
- [x] 已確認編譯器 Docker image 目前只包含 GCC。
- [x] Python 支援程式與本機執行環境已完成；Supabase migration 尚待使用者套用。

## 執行步驟與簡易說明

- [x] 1. 擴充共同語言型別與資料庫限制
  - 簡易說明：讓前後端與 Supabase 都能辨識 `cpp`、`python`，避免畫面選了 Python 卻無法儲存。
- [x] 2. 在建立 Project 視窗加入語言下拉選單
  - 簡易說明：使用者建立專案時就決定語言；Folder 不需要選語言。
- [x] 3. 依 Project 語言建立預設檔案與程式碼
  - 簡易說明：C++ 建立 `main.cpp`，Python 建立 `main.py`，並提供各自可立即執行的範例。
- [x] 4. 讓檔案管理與 Monaco Editor 依語言運作
  - 簡易說明：Python Project 只接受 `.py`，並啟用 Python 語法上色；C++ 維持 `.cpp/.h/.hpp`。
- [x] 5. 擴充一般執行與 Interactive Console API
  - 簡易說明：後端依 `language` 選擇 g++ 或 python3，同時沿用記憶體、CPU、網路、執行時間與輸出限制。
- [x] 6. 更新 AI Tutor 與介面文字
  - 簡易說明：AI Tutor 要知道目前是 Python 或 C++，畫面上的語言徽章和執行提示也要一致。
- [x] 7. 建立與執行測試
  - 簡易說明：檢查前端型別與建置，並測試 Python 正常輸出、stdin、語法錯誤、執行錯誤、逾時及 Interactive Console。

## 驗收方式

- [x] 建立 Project 時可從下拉選單選擇 C++20 或 Python 3（程式碼、型別與正式 build 已驗證；待使用者套用 migration 後進行帳號實測）。
- [x] Python Project 會產生 `main.py`，並使用 Python 徽章與 Monaco Python 語法模式。
- [x] Python 可執行 `print()`，可讀取 `input()`。
- [x] Python 語法錯誤會顯示為 `compile_error`，執行例外顯示為 `runtime_error`。
- [x] Python 無限迴圈會逾時停止，且不顯示內部 Bash 診斷訊息。
- [x] Python Interactive Console 可以接收輸入並回傳結果。
- [x] 原有 C++ 功能與測試仍正常。
- [x] `npm run lint`、TypeScript 檢查、正式 build 與後端測試全部通過。

## 需要使用者手動操作

- [ ] 將新增的 Supabase migration 貼到 Supabase SQL Editor 執行；未執行前，線上資料庫仍會拒絕 Python Project。
- [ ] 功能完成後，在瀏覽器各建立一個 C++ 與 Python Project，確認下拉選單與實際操作符合期望。

## 執行結果

- 狀態：程式開發與本機自動驗證完成，等待 Supabase migration 與瀏覽器帳號驗收。
- 新增 migration：`supabase/migrations/202608120001_python_projects.sql`。
- Docker image 已重建；包含 GCC 13.4 與 Python 3.11，兩種語言共用原有網路、CPU、記憶體、程序、唯讀檔案系統、逾時與輸出限制。
- 後端完整測試：66 passed。
- 前端：ESLint passed、TypeScript passed、Next.js production build passed。
- 實際本機 HTTP API smoke test：Python stdin 輸出 `42`、C++ 輸出 `42`，兩者皆為 `accepted`。
- FastAPI `http://127.0.0.1:8000` 與 Next.js `http://127.0.0.1:3000` 已重新啟動。
