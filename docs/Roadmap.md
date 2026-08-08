# Code Tutor Roadmap

## Milestone 1：Frontend Workspace

- [x] 建立 Next.js 專案
- [x] 完成基本頁面
- [x] 完成 IDE 三欄版面
- [x] 加入 Monaco Editor
- [x] 加入瀏覽器自動儲存與 `Ctrl+S`
- [x] 完成 Output Panel 靜態介面
- [x] 完成 AI Tutor Panel 靜態介面

## Milestone 2：C++ Compiler

- [x] 建立 FastAPI backend
- [x] 定義 Run API
- [ ] 建立隔離的 Docker 編譯環境
- [x] 支援前端標準輸入與輸出介面
- [x] 實作 Compile Error、Runtime Error 與 Timeout 回應

## Milestone 3：AI Tutor

- [ ] 定義 AI API
- [ ] 實作 Analyze Code
- [ ] 實作 Explain Error
- [ ] 實作漸進式 Hint
- [ ] 加入錯誤處理與使用量限制

## Milestone 4：Account and Database

- [ ] 設計 PostgreSQL schema
- [ ] 實作 Register 與 Login
- [ ] 儲存 Submission 與 Code History
- [ ] 顯示 History

## Milestone 5：Learning Memory

- [ ] 分類常見錯誤
- [ ] 壓縮近期學習紀錄
- [ ] 將 Memory Context 加入 AI 分析
- [ ] 建立 Learning Summary

## Milestone 6：Release

- [ ] 測試主要使用流程
- [ ] 完善安全性與錯誤處理
- [ ] 部署 frontend、backend 與 database
- [ ] 製作 Demo 與作品集文件

## 目前任務

目前進行 Milestone 2。FastAPI 與前端 Run API 已完成，下一步是安裝 Docker Desktop、建立 Compiler image，並完成真實 C++ 執行測試。

## 後續：Project Mode

- [ ] 加入檔案總管與資料夾樹
- [ ] 建立、重新命名與刪除檔案／資料夾
- [ ] 支援多檔案分頁切換
- [ ] 儲存與還原使用者的專案結構
- [ ] 將多檔案專案交給 Compiler 編譯

第一版先維持單一 `main.cpp`。待 Monaco Editor、單檔執行流程與歷史紀錄穩定後，再升級成 Project Mode。
