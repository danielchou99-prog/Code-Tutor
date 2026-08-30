# Code Tutor VPS 正式部署計畫

## 目標

將 Code Tutor 部署到 Hostinger VPS，使用 Ubuntu Container OS，讓其他裝置能透過正式網域與 HTTPS 使用網站，同時保留目前的 Next.js 前端、FastAPI API、Supabase 帳號與資料庫，以及 Docker 隔離編譯功能。

## 已確認的部署環境

- [x] VPS 供應商：Hostinger。
- [x] Container OS：Ubuntu。
- [ ] Ubuntu 詳細版本：待確認；若 Hostinger 可選，優先使用 Ubuntu 24.04 LTS 64 位元。
- [ ] Hostinger VPS 方案與 CPU、RAM、磁碟容量：待確認。
- [ ] VPS 公開 IP：待確認。
- [ ] SSH 使用者名稱與連接埠：待確認。
- [ ] 正式網域：待確認。

簡易說明：Hostinger 提供實際執行網站的 VPS，Ubuntu 是 VPS 裡面的 Linux 作業系統。Supabase 仍然維持雲端服務，不會搬進 Hostinger；Next.js、FastAPI、Judge Worker、Nginx 與 Docker 編譯器會安裝在這台 Hostinger VPS。

## 目前狀態

- [x] 已確認前端使用 Next.js，可用 `npm run build` 與 `npm run start` 執行正式版本。
- [x] 已確認後端使用 FastAPI，正式環境需啟動 Web API 與私人 Judge Worker。
- [x] 已有 Docker 編譯器映像設定，可支援 C++20 與 Python 3。
- [x] Supabase 已負責帳號、題目、檔案、測資與提交紀錄。
- [x] 已有 Judge Worker 的安全邊界設計文件。
- [ ] 完成尚未套用的 Supabase migration，並再次驗收題目管理功能。
- [x] 已選定 Hostinger VPS 與 Ubuntu Container OS。
- [ ] 取得 Hostinger VPS 公開 IP、SSH 登入資料、實際規格與網域。
- [x] 已完成 Linux 相容性盤點，正式環境不依賴 Docker Desktop 或 Windows 路徑。
- [x] 已建立 Linux 正式部署設定與操作手冊。
- [ ] 在實際 Ubuntu VPS 完成首次部署與外部驗收。

## Linux 穩定性改良

- [x] 將編譯器不可用訊息改成同時適用 Linux Docker Engine 與 Windows Docker Desktop。
- [x] 讓正式前端預設使用同網域 API，不依賴固定的 `:8000` 公開埠。
- [x] 提供 Linux 專用、無秘密資料的前後端環境變數範本。
- [x] 提供 Nginx 反向代理設定，包含 HTTPS 後的 WebSocket 支援。
- [x] 提供 Next.js、FastAPI、Judge Worker 的 systemd 服務。
- [x] 提供可重複執行的 Linux 部署與健康檢查腳本。
- [x] 提供 Ubuntu 首次安裝與正式更新操作手冊。
- [x] 新增 Ubuntu GitHub Actions，持續驗證 Linux build、後端測試與 Docker 編譯器。
- [x] 通過前端 lint、正式 build、Linux Bash 語法與完整後端 Docker 測試。

簡易說明：這一階段先讓程式與部署檔都能直接放進 Linux，不把 Windows 路徑、Docker Desktop 或開發用公開埠帶進正式環境。真正的 HTTPS 憑證與服務啟動仍必須等 VPS 和網域存在後驗收。

## 建議正式架構

```text
使用者瀏覽器
      |
      | HTTPS（443）
      v
Nginx 反向代理
      |-- 網頁請求 ----------> Next.js（127.0.0.1:3000）
      |-- /api 與 WebSocket -> FastAPI（127.0.0.1:8000）
                                  |
                                  | 私人 token
                                  v
                           Judge Worker（127.0.0.1:8010）
                                  |
                                  v
                           Docker 編譯器容器

Next.js / FastAPI / Judge Worker <----HTTPS----> Supabase
FastAPI --------------------------HTTPS--------> Groq
```

簡易說明：外部使用者只會接觸 Nginx。3000、8000、8010 埠都只允許 VPS 自己存取；其中 8010 是最敏感的編譯服務，不對 Internet 開放。

## VPS 建議規格

- 供應商：Hostinger VPS。
- Container OS：Ubuntu；詳細版本待確認，建議 Ubuntu 24.04 LTS 64 位元。
- 最低測試規格：2 vCPU、4 GB RAM、40 GB SSD。
- 建議正式起步：4 vCPU、8 GB RAM、80 GB SSD。
- 必須支援硬體虛擬化及 Docker Engine。
- 建議先限制同時執行 2 份程式；實際流量增加後再調整。

簡易說明：一般網站本身不太吃資源，但使用者編譯 C++、執行 Python 與 Judge 測資會同時占用 CPU、記憶體和磁碟，所以不能只用最小型網頁主機。

## 執行步驟

### 階段 0：部署前整理

- [ ] 套用所有必要的 Supabase migrations。
- [x] 執行前端 lint、TypeScript、正式 build。
- [x] 執行後端單元測試與 Docker 整合測試。
- [x] 確認 Git 中沒有 `.env`、Supabase Secret key、正式 Groq key 或 AI 加密金鑰。
- [x] 建立可辨識的本機 Git commit `28925ed`，作為部署版本基礎。

簡易說明：正式部署前先固定一個已通過測試的版本。如果部署失敗，可以退回這個版本，不必在 VPS 上臨時修改程式。

### 階段 1：準備 VPS

- [ ] 在 Hostinger hPanel 確認 VPS 狀態、Ubuntu 版本、公開 IP 與資源規格。
- [ ] 從本機透過 SSH 登入 Hostinger VPS，先做唯讀環境檢查。
- [ ] 建立非 root 的部署帳號並設定 SSH key。
- [ ] 更新系統套件。
- [ ] 安裝 Git、Nginx、Node.js、Python 3、venv 與 Docker Engine。
- [ ] 同時檢查 Hostinger 防火牆與 Ubuntu UFW，只開放 SSH、HTTP 80、HTTPS 443。
- [ ] 啟用系統安全更新及基本登入防護。

簡易說明：Hostinger VPS 是一台長時間連上網路的 Linux 電腦。hPanel 負責 VPS 外層管理，Ubuntu 則負責網站內部服務；兩邊的防火牆都要確認，避免 3000、8000、8010 意外對外開放。

### 階段 2：取得程式與建立執行環境

- [ ] 從 GitHub clone Code-Tutor 到固定目錄，例如 `/srv/code-tutor`。
- [ ] 在 `frontend/` 安裝鎖定版本的 npm 套件。
- [ ] 在 `backend/` 建立 Python venv 並安裝 requirements。
- [ ] 執行 `docker build -t code-tutor-compiler:local compiler`。
- [ ] 建立專用的環境變數檔並限制為只有服務帳號可讀。

簡易說明：GitHub 保存程式碼，VPS 則建立真正用來執行它的 Node、Python 與 Docker 環境。

### 階段 3：正式環境變數

- [ ] 前端設定正式 `NEXT_PUBLIC_API_URL`、Supabase URL 與 publishable key。
- [ ] 後端設定正式網站來源、Supabase URL、publishable key 與 server-only secret key。
- [ ] 設定管理員 UUID、AI encryption key、AI model 與執行限制。
- [ ] 產生至少 32 bytes 的隨機 Judge Worker token，Web API 與 Worker 使用同一值。
- [ ] Web API 設定 `CODE_TUTOR_JUDGE_WORKER_URL=http://127.0.0.1:8010`。

簡易說明：環境變數把「不同伺服器會改變的資料」和程式碼分開。Secret key、Worker token 與 AI encryption key 絕對不能放進前端或 GitHub。

### 階段 4：建立常駐服務

- [ ] 建立 Next.js systemd service，綁定 `127.0.0.1:3000`。
- [ ] 建立 FastAPI systemd service，綁定 `127.0.0.1:8000`。
- [ ] 建立 Judge Worker systemd service，綁定 `127.0.0.1:8010`，先使用 1 個 worker。
- [ ] 設定服務自動重啟、開機啟動與集中日誌。
- [ ] 驗證三個本機服務的 health 與啟動狀態。

簡易說明：systemd 會在 VPS 重新開機後自動啟動網站，程式意外停止時也能重新啟動。

### 階段 5：網域、Nginx 與 HTTPS

- [ ] 將網域 A/AAAA 紀錄指向 VPS 公開 IP。
- [ ] 設定 Nginx：一般頁面轉到 3000，`/api/` 及 WebSocket 轉到 8000。
- [ ] 設定請求大小、連線逾時、安全標頭與 WebSocket Upgrade。
- [ ] 使用 Let's Encrypt 申請 HTTPS 憑證並測試自動續期。
- [ ] 確認外部無法直接連線 3000、8000、8010。

簡易說明：網域是網站地址；Nginx 是對外接待入口；HTTPS 會加密登入資料、程式碼與 API 流量。

### 階段 6：Supabase 正式網址

- [ ] 在 Supabase Authentication 的 Site URL 設為正式 HTTPS 網址。
- [ ] 加入正式登入與 Email 驗證 Redirect URL。
- [ ] 保留需要的本機開發 Redirect URL，避免日後無法本機測試。
- [ ] 以新測試帳號完成註冊、Email 驗證、登入與登出。

簡易說明：Supabase 必須知道驗證完成後可以安全返回哪些網址，否則登入信會回到 localhost 或被拒絕。

### 階段 7：正式驗收

- [ ] 首頁、檔案、題目、設定與語言切換正常。
- [ ] 註冊、驗證、登入、登出與頁面狀態保留正常。
- [ ] 建立資料夾、專案、C++/Python 檔案、標籤與拖曳正常。
- [ ] C++ 與 Python 的 Text、Interactive Console、Run 正常。
- [ ] 題目 Submit、隱藏測資、分數、錯誤狀態與提交紀錄正常。
- [ ] AI 金鑰連線、AI Tutor 與題目翻譯正常。
- [ ] 手機或另一台電腦可以透過 HTTPS 使用。
- [ ] 檢查 Nginx、Next.js、FastAPI、Worker 與 Docker 日誌沒有敏感資料。

簡易說明：不能只確認首頁能開啟；Code Tutor 最重要的是帳號、資料保存、編譯、評測與 AI 的完整串接。

### 階段 8：備份、監控與更新方式

- [ ] 設定服務 health check、CPU/RAM/磁碟及失敗通知。
- [ ] 確認 Supabase 的備份方案，另行備份部署設定但不把秘密放進 Git。
- [ ] 建立更新腳本：拉取指定版本、安裝、測試、build、重啟與 health check。
- [ ] 保留上一版 build 或 Git tag，更新失敗時可以回復。
- [ ] 設定 Docker image 與暫存容器的安全清理規則。

簡易說明：部署不是一次性工作。監控用來提早發現故障；備份與回復流程用來避免更新時弄壞正式網站。

## 驗收方式

1. 使用 VPS 本機測試 3000、8000 與 8010，確認服務之間可互通。
2. 使用外部裝置只透過 `https://你的網域` 操作完整流程。
3. 送出正常、編譯錯誤、執行錯誤、超時與記憶體超限程式，確認結果正確。
4. 重新啟動 VPS，確認三個服務與 Nginx 會自動恢復。
5. 模擬一次失敗更新並確認可退回上一個版本。

## 需要使用者手動操作的事項

- 在 Hostinger hPanel 確認 Ubuntu 詳細版本、VPS 規格、公開 IP、SSH 使用者名稱與連接埠。
- 在自己的電腦完成 Hostinger VPS 的 SSH 登入測試；不要提供密碼或 SSH 私鑰內容。
- 準備一個網域，並在 DNS 服務商設定指向 VPS 的紀錄。
- 在 Supabase Dashboard 套用 migrations，設定正式 Site URL 與 Redirect URL。
- 將 Supabase server-only secret 以安全方式放到 VPS；不要貼到公開對話、截圖或 GitHub。
- 第一次公開前，由使用者決定網站網域、管理員帳號及是否開放註冊。

## 已準備的部署檔案

- [x] `deploy/nginx/code-tutor.conf`
- [x] `deploy/systemd/code-tutor-frontend.service`
- [x] `deploy/systemd/code-tutor-api.service`
- [x] `deploy/systemd/code-tutor-worker.service`
- [x] `deploy/env/frontend.production.example`
- [x] `deploy/env/backend.production.example`
- [x] `deploy/scripts/deploy.sh`
- [x] `deploy/scripts/health-check.sh`
- [x] `docs/vps-deployment-runbook.md`
- [x] `.github/workflows/linux-ci.yml`
- [x] 建立網站部署技術總覽文件，說明資料儲存、服務分工、安全與部署工具。

## 本機驗證紀錄（2026-08-27）

- Frontend ESLint：通過。
- Next.js production build 與 TypeScript：通過。
- Backend 單元、API、Judge 及 Docker integration：`112 passed`。
- Linux compiler container 中執行 `bash -n`：兩份部署腳本皆通過。
- systemd 與 Nginx 範本必要欄位靜態檢查：通過。
- 尚待 VPS 驗證：Ubuntu 套件安裝、systemd 實際啟動、Nginx `nginx -t`、DNS、HTTPS 及外部裝置驗收。
