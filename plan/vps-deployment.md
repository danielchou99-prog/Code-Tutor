# Code Tutor VPS 正式部署計畫

## 目標

將 Code Tutor 部署到 Hostinger VPS，使用 Debian 13 作業系統，讓其他裝置能透過正式網域與 HTTPS 使用網站，同時保留目前的 Next.js 前端、FastAPI API、Supabase 帳號與資料庫，以及 Docker 隔離編譯功能。

## 已確認的部署環境

- [x] VPS 供應商：Hostinger。
- [x] VPS 作業系統：Debian GNU/Linux 13.6（trixie）x86_64，由使用者選定。
- [x] Hostinger VPS 規格：1 vCPU、4 GB RAM、50 GB 磁碟。
- [x] VPS 公開 IP：`72.62.254.246`。
- [x] 初始 SSH：`root@72.62.254.246:22`；正式部署前改用非 root 帳號與專用 SSH key。
- [ ] 正式網域：待確認。

簡易說明：Hostinger 提供實際執行網站的 VPS，Debian 13 是 VPS 裡面的 Linux 作業系統。Supabase 仍然維持雲端服務，不會搬進 Hostinger；Next.js、FastAPI、Judge Worker、Nginx 與 Docker 編譯器會安裝在這台 Hostinger VPS。

## 目前狀態

- [x] 已確認前端使用 Next.js，可用 `npm run build` 與 `npm run start` 執行正式版本。
- [x] 已確認後端使用 FastAPI，正式環境需啟動 Web API 與私人 Judge Worker。
- [x] 已有 Docker 編譯器映像設定，可支援 C++20 與 Python 3。
- [x] Supabase 已負責帳號、題目、檔案、測資與提交紀錄。
- [x] 已有 Judge Worker 的安全邊界設計文件。
- [ ] 完成尚未套用的 Supabase migration，並再次驗收題目管理功能。
- [x] 已選定 Hostinger VPS 與 Debian 13。
- [x] 已取得 Hostinger VPS 公開 IP、初始 SSH 登入方式與實際規格；正式網域仍待確認。
- [x] 已完成 Linux 相容性盤點，正式環境不依賴 Docker Desktop 或 Windows 路徑。
- [x] 已建立 Linux 正式部署設定與操作手冊。
- [ ] 在實際 Debian 13 VPS 完成首次部署與外部驗收。

## Linux 穩定性改良

- [x] 將編譯器不可用訊息改成同時適用 Linux Docker Engine 與 Windows Docker Desktop。
- [x] 讓正式前端預設使用同網域 API，不依賴固定的 `:8000` 公開埠。
- [x] 提供 Linux 專用、無秘密資料的前後端環境變數範本。
- [x] 提供 Nginx 反向代理設定，包含 HTTPS 後的 WebSocket 支援。
- [x] 提供 Next.js、FastAPI、Judge Worker 的 systemd 服務。
- [x] 提供可重複執行的 Linux 部署與健康檢查腳本。
- [x] 將操作手冊調整並驗證為 Debian 13 首次安裝與正式更新流程。
- [x] 新增 Ubuntu GitHub Actions，持續驗證 Linux build、後端測試與 Docker 編譯器。
- [x] 通過前端 lint、正式 build、Linux Bash 語法與完整後端 Docker 測試。
- [x] 修正首次 Ubuntu CI 的後端測試失敗，並加入不洩漏秘密的公開錯誤 annotation；提交 `17e853c` 已在 GitHub Actions 通過。

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
- VPS 作業系統：Debian GNU/Linux 13.6（trixie）x86_64。
- 實際起步規格：1 vCPU、4 GB RAM、50 GB 磁碟；適合部署驗證與少量使用者。
- 最低測試規格：2 vCPU、4 GB RAM、40 GB SSD。
- 建議正式起步：4 vCPU、8 GB RAM、80 GB SSD。
- 必須支援硬體虛擬化及 Docker Engine。
- 目前 1 vCPU 先限制同時執行 1 份程式；實際流量增加後再升級 VPS 與調整 worker 數量。

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

- [x] 在 Hostinger hPanel 與 VPS 確認 Debian 13.6、公開 IP、1 vCPU、4 GB RAM 與 50 GB 磁碟。
- [x] 從本機透過 SSH 登入 Hostinger VPS，完成第一輪唯讀環境檢查。
- [x] 將 Code Tutor 專用 SSH 公鑰加入 VPS，並確認 key 登入不會退回密碼。
- [x] 沿用 Hostinger 既有的 `debian` 非 root 帳號，確認專用 SSH key 與非互動 sudo 可用。
- [x] 更新 APT 套件索引並完成唯讀 upgrade 預演；目前 0 個可升級、0 個移除套件。
- [x] 確認 Git 2.47.3、Python 3.13.5 與 Docker Engine 29.7.2 已存在。
- [x] 安裝並驗證 Nginx、Node.js 22、Python venv、Certbot、Fail2ban 與其他必要套件。
- [x] 啟用 Debian UFW 基線；目前只允許 IPv4/IPv6 SSH 22，外部 80/443 仍封鎖。
- [ ] 檢查 Hostinger 外層防火牆；網站完成後只增加 HTTP 80 與 HTTPS 443，不開放 3000、8000、8010。
- [ ] 啟用系統安全更新及基本登入防護。
- [x] 建立 2 GiB Swap 並將 swappiness 設為 10，降低建置或編譯尖峰時被 OOM 終止的風險。

簡易說明：Hostinger VPS 是一台長時間連上網路的 Linux 電腦。hPanel 負責 VPS 外層管理，Debian 13 則負責網站內部服務；兩邊的防火牆都要確認，避免 3000、8000、8010 意外對外開放。

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

- 已在 Hostinger hPanel 與 SSH 確認 Debian 13.6、VPS 規格、公開 IP、root 初始登入與 22 埠。
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
- Backend 單元、API、Judge 及 Docker integration：`115 passed`。
- Linux compiler container 中執行 `bash -n`：兩份部署腳本皆通過。
- systemd 與 Nginx 範本必要欄位靜態檢查：通過。
- 尚待 VPS 驗證：Debian 套件安裝、systemd 實際啟動、Nginx `nginx -t`、DNS、HTTPS 及外部裝置驗收。

## Hostinger Debian 13 唯讀檢查紀錄（2026-08-30）

- Debian GNU/Linux 13.6（trixie），Linux 6.12，KVM，systemd 正常。
- 1 vCPU、3.8 GiB RAM、2 GiB Swap；根目錄 50 GB，建立 Swap 後仍有約 42 GB 可用。
- Nginx 已在主機監聽 80，但 UFW 對外只允許 SSH 22；外部實測 80/443 封鎖，3000、8000、8010 未監聽。
- Docker 29.7.2、Git 2.47.3、Python 3.13.5/venv、Node.js 22.23.2、npm 10.9.8、Nginx 1.26.3、Certbot 4.0.0 與 Fail2ban 1.1.0 已安裝。
- `systemctl --failed` 為 0；Code Tutor 專用 SSH 公鑰已加入 root 與 `debian`，日常部署改用 `debian`。
- `debian` 帳號的 `.ssh` 為 `700`、`authorized_keys` 為 `600`，公鑰只有一筆，非互動 sudo 驗證通過。
- 兩份部署 Bash 腳本已透過標準輸入在實際 Debian 13 執行 `bash -n`，語法檢查通過且未在 VPS 建立檔案。
- APT 套件索引更新成功；Debian、security、backports、Docker 與 Hostinger Monarx repository 正常，upgrade 預演為 0 個可升級或移除套件。
- UFW 已啟用並設為開機套用，預設拒絕 incoming、允許 outgoing，只加入 22/tcp；新的非 root SSH key 連線驗證成功。
- Node.js 官方 Linux x64 檔案以固定 SHA-256 驗證後安裝到 `/opt/node-v22.23.2-linux-x64`，正式 symlink 正常，已安全移除可重新下載的暫存壓縮檔。
- Nginx 設定語法與本機 HTTP 200、Fail2ban `pong`、Certbot timer、UFW 外部阻擋及 `systemctl --failed=0` 均驗證通過。
- `/swapfile` 為 root `600`、2 GiB，`swapfile.swap` active；`fstab` 只有一筆且 0 errors，live/persistent swappiness 均為 10，原始 `fstab` 已備份。

## GitHub Ubuntu CI 紀錄（2026-08-30）

- Release `6adaa88` 已安全 fast-forward push 到 GitHub `main`。
- Linux CI 的前端安裝、lint、build、Python 安裝、compiler image 與 Bash 語法檢查全部通過。
- 後端 pytest step 回傳 exit code 1；未登入的 GitHub API 不提供完整 job log，因此部署暫停。
- 已加入遮蔽敏感字串的 pytest failure annotation，成功取得實際失敗測試。
- 根因是 `test_writes_all_project_sources` 寫死 Windows `C:/project-sources`；正式 Linux 程式的 `chmod` 正確，但測試提供了不存在的路徑。
- 已將測試改為跨平台 `tmp_path`，並驗證 Linux 資料夾 `755` 與檔案 `644` 權限。
- 修正提交 `17e853c` 已推送至 GitHub `main`；Linux CI 執行 `33296500898` 的 `verify` 工作完成且結果為 `success`。
