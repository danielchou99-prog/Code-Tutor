# Dev Compass Compiler V2 計畫

- 文件狀態：核心實作與本機非 Docker 驗證完成，等待 VPS Docker 驗證與部署核可
- 建立日期：2026-09-03
- 範圍：Docker Compiler、Judge、測試、VPS 執行參數與部署驗證

## 目標

將既有 C++20／Python 3 Docker 編譯器升級成適合正式題目評測的版本。同一次 Submit 只編譯一次，再依序執行全部隱藏測資，同時保留每題的時間、記憶體、輸出與安全限制。

## 目前狀態

- [x] VPS 已有可用的 `code-tutor-compiler:local` 映像。
- [x] C++20、Python 3、Text Input、Interactive Console 與 Judge Worker 已可運作。
- [x] 使用者程式在無網路、非 root、唯讀檔案系統的 Docker container 中執行。
- [x] 唯讀確認目前 Judge 會對每一筆隱藏測資重新編譯。
- [x] Submit 已改用單次批次編譯成果。
- [x] 批次執行已接受題目的時間與記憶體限制，並回報每筆 peak memory。

## 執行步驟

- [x] 1. 唯讀盤點現有 Compiler、Judge、API、Worker、Docker 與 VPS 狀態。
  - 簡易說明：先確認可沿用的功能，避免重做現有編譯器。
- [x] 2. 擴充批次編譯介面。
  - 簡易說明：讓多筆執行支援多檔案、題目時間限制、題目記憶體限制與 peak memory。
- [x] 3. 將 Judge 改為一次編譯、逐筆執行。
  - 簡易說明：把同一份答案編譯一次，再用相同執行檔處理全部隱藏測資。
- [x] 4. 完善錯誤分類與容器清理。
  - 簡易說明：區分 CE、RE、TLE、MLE、OLE，執行結束後不留下測試容器。
- [ ] 5. 補齊單元、Docker 與 Judge 整合測試。
  - 簡易說明：涵蓋 C++、Python、多檔案、錯誤、逾時、記憶體及大量測資。
- [x] 6. 執行前端、後端與正式建置回歸檢查。
  - 簡易說明：確認編譯器修改沒有破壞既有 Run、Console、題目與設定頁。
- [ ] 7. 部署前提供唯讀差異、測試結果與 VPS 狀態供使用者核可。
  - 簡易說明：未取得部署核可前，不修改 VPS。
- [ ] 8. 部署並驗證暫時 IP。
  - 簡易說明：重建映像、重啟服務，實際驗證 C++、Python、Run 與 Submit。

## 驗收方式

1. C++20 與 Python 3 的一般 Run 皆能輸出正確結果。
2. Judge 面對多筆隱藏測資時，同一份程式只編譯一次。
3. 多檔案 C++／Python 專案可以參與正式評測。
4. CE、RE、TLE、MLE、OLE 都會回傳正確狀態。
5. 題目設定的時間與記憶體限制確實套用到每筆測資。
6. 執行完成、失敗或逾時後沒有殘留的 Compiler container。
7. Frontend lint、TypeScript、production build 與完整 Backend 測試通過。
8. VPS Frontend、API、Worker、Docker health 與外部暫時 IP 驗證通過。

## 需要使用者手動操作

- 部署前核可唯讀檢查結果。
- 部署完成後，以真實帳號 Submit 一題並確認成績與作答紀錄。
- 若未來增加 Java、Rust 等語言，需另行確認語言版本與 VPS 資源需求。

## 2026-09-03 本機驗證紀錄

- Compiler、Judge、隱藏測資生成器目標測試：27 項通過。
- Backend 完整測試：101 項通過，24 項因本機未安裝可啟動的 Docker Desktop 而跳過。
- Frontend ESLint：通過。
- TypeScript `tsc --noEmit`：通過。
- Next.js production build：通過。
- Python compileall 與 `git diff --check`：通過。
- 新增的真實 Docker 測試涵蓋批次多檔案 C++、每題時間／記憶體限制、peak memory 與 Python TLE；等待在 VPS 上執行。
- 本輪 pytest 隔離暫存已安全清除，沒有刪除正式資料。
