# Code Tutor 部署技術總覽

更新日期：2026-08-29

## 1. 這份文件的用途

這份文件用白話說明 Code Tutor 部署時使用的網站架構、程式語言、資料儲存方式、帳號系統、編譯器、AI、網路、安全、測試與維運工具。

最重要的結論是：

- Hostinger VPS 負責「執行網站、API、評測服務與 Docker 編譯器」。
- Supabase 負責「永久保存帳號、專案、檔案、題目、測資及提交紀錄」。
- 使用者的瀏覽器會暫存「尚未儲存的草稿與畫面狀態」。
- Groq 負責目前的 AI Tutor 與題目英文翻譯。
- GitHub 負責保存程式碼與執行 Linux 自動測試，不是網站資料庫。

## 2. 整體架構

```text
使用者的瀏覽器
  |
  | HTTPS 443
  v
Hostinger VPS（Debian 13）
  |
  +-- Nginx：網站唯一公開入口
  |     |
  |     +-- 一般網頁 ----------> Next.js / React（127.0.0.1:3000）
  |     +-- API、WebSocket ----> FastAPI（127.0.0.1:8000）
  |
  +-- Judge Worker（127.0.0.1:8010，只供 FastAPI 使用）
  |     |
  |     +-- Docker Engine
  |           |
  |           +-- C++20 / Python 3 隔離編譯容器
  |
  +-- systemd：讓以上服務開機自動啟動並在失敗時重啟

外部雲端服務
  +-- Supabase：帳號、PostgreSQL 資料庫、RLS 權限
  +-- Groq：AI Tutor 與題目翻譯 API
  +-- GitHub：程式碼版本與 Linux CI
```

## 3. 技術總表

| 分類 | 使用技術 | 負責的工作 |
|---|---|---|
| VPS | Hostinger VPS | 提供長時間運作的遠端主機 |
| 作業系統 | Debian GNU/Linux 13 | 執行網站服務、Docker、Nginx 與系統工具 |
| 網頁入口 | Nginx | 接收網域請求，轉送到前端或 API |
| HTTPS | Let's Encrypt／Certbot | 加密瀏覽器與 VPS 之間的資料 |
| 前端 | Next.js 16、React 19 | 顯示首頁、檔案、題目、編輯器、設定與 AI Tutor |
| 前端語言 | TypeScript 5 | 提早檢查前端資料型別與程式錯誤 |
| 樣式 | Tailwind CSS 4 | 處理深色、淺色、尺寸與版面配置 |
| 程式編輯器 | Monaco Editor | 提供接近 VS Code 的程式碼編輯體驗 |
| 後端 | Python、FastAPI | 處理編譯、登入驗證、AI、管理員與 Judge API |
| 正式後端伺服器 | Uvicorn | 讓 FastAPI 可以接收 HTTP 與 WebSocket 請求 |
| 永久資料庫 | Supabase PostgreSQL | 保存帳號以外的網站永久資料 |
| 帳號系統 | Supabase Auth | 註冊、Email 驗證、登入、Session 與使用者 UUID |
| 資料權限 | Supabase Row Level Security | 限制每位使用者只能操作自己的資料 |
| 編譯隔離 | Docker Engine | 避免使用者程式直接在 VPS 主機執行 |
| C++ | GCC 13.4、C++20 | 編譯與執行 C++ 程式 |
| Python | Python 3 | 檢查並執行 Python 程式 |
| AI | Groq API | AI Tutor、錯誤說明、提示及題目翻譯 |
| AI Key 加密 | Fernet／Python cryptography | 加密使用者儲存的 Groq API Key |
| 常駐服務 | systemd | 開機啟動、失敗重啟與服務日誌 |
| 防火牆 | Hostinger Firewall、Debian UFW／nftables | 只允許 SSH、HTTP 與 HTTPS 進入 VPS |
| 程式碼版本 | Git、GitHub | 保存網站程式碼及部署版本 |
| 自動測試 | GitHub Actions | 在 Ubuntu 檢查前端、後端與 Docker 編譯器 |
| 套件管理 | npm、pip、Python venv | 安裝固定的前端與後端套件 |

## 4. 前端使用的技術

### Next.js 16

Next.js 是網站前端的主要框架，負責產生網頁、頁面路由與正式 production build。部署後由 `npm run start` 在 VPS 的 `127.0.0.1:3000` 執行，不直接開放給 Internet。

### React 19

React 把頁面拆成可以重複使用的元件，例如導覽列、檔案列表、程式編輯器、Console、AI Tutor 和設定頁。

### TypeScript 5

TypeScript 在 JavaScript 上加入型別檢查。例如 API 回傳的題目、檔案或 Judge 結果格式錯誤時，可以在建置階段提早發現。

### Tailwind CSS 4

Tailwind 負責顏色、間距、尺寸、響應式版面、深色與淺色主題。它只處理畫面，不保存使用者資料。

### Monaco Editor

Monaco Editor 是 VS Code 編輯器核心所使用的網頁編輯器技術。Code Tutor 用它提供 C++、Python 語法上色、游標與捲動等編輯功能。

### Supabase JavaScript／SSR 套件

前端透過 `@supabase/supabase-js` 和 `@supabase/ssr` 使用 Supabase 登入狀態與資料庫。瀏覽器只能拿到 publishable key；server-only secret 絕對不會放入前端。

## 5. 後端使用的技術

### Python 與 FastAPI

FastAPI 是網站的 API 中心，主要處理：

- 驗證 Supabase 登入身分。
- 執行 C++／Python 程式。
- 建立 Interactive Console WebSocket。
- 連線 Groq AI Tutor。
- 儲存及驗證使用者的 Groq Key。
- 題目管理、翻譯與隱藏測資生成。
- 將 Submit 工作送到私人 Judge Worker。

### Uvicorn

Uvicorn 是實際承接網路請求的伺服器。正式環境中 FastAPI 綁定 `127.0.0.1:8000`，只能由同一台 VPS 的 Nginx 連入。

目前 API 使用一個 Uvicorn process，因為限流與執行佇列仍保存在單一 process 的記憶體中。如果未來使用多個 API process 或多台 VPS，需要先加入 Redis 等共用狀態服務。

### 其他 Python 套件

| 套件 | 用途 |
|---|---|
| PyJWT、cryptography | 驗證登入 token、加密 AI Key |
| httpx | 以 HTTPS 呼叫 Supabase 與 Groq |
| truststore | 使用作業系統可信任憑證驗證 HTTPS |
| python-dotenv | 本機開發時讀取 `.env` |
| Pydantic（由 FastAPI 使用） | 驗證 API 收到和回傳的資料格式 |

## 6. 資料到底存在哪裡

### 6.1 Supabase PostgreSQL：永久資料

Supabase 使用 PostgreSQL 關聯式資料庫。正式使用者資料主要存在這裡，因此更換 VPS 時不會自動遺失；但仍要有 Supabase 備份策略。

| 資料表 | 保存內容 |
|---|---|
| `auth.users` | Supabase 管理的帳號、Email 與使用者 UUID |
| `file_items` | 使用者的資料夾、專案名稱、階層、標籤與專案語言 |
| `project_files` | 每個專案內的 C++／Python 程式檔名稱與內容 |
| `ai_connections` | 經 Fernet 加密後的 Groq API Key 及末四碼 |
| `ai_usage` | 每位使用者每日 AI 請求與 token 使用統計 |
| `problems` | 題名、敘述、輸入輸出格式、限制、難度與初始程式碼 |
| `problem_tags` | 題目標籤的代號及中英文名稱 |
| `problem_tag_links` | 題目和標籤之間的關聯 |
| `problem_samples` | 公開的範例輸入、輸出與說明 |
| `problem_test_groups` | 基本、邊界等計分子題組與分數比例 |
| `problem_test_cases` | 不公開的 Judge 輸入與正確輸出 |
| `submissions` | 使用者提交的程式、狀態、分數、時間與記憶體資訊 |
| `problem_code_drafts` | 使用者主動儲存的每題 C++／Python 解題程式 |
| `problem_generation_versions` | Server-only Generator、Reference Solution 與 Validator 版本 |
| `problem_generation_batches` | 自動生成測資的批次、狀態及品質報告 |
| `problem_generation_batch_cases` | 尚待套用的生成測資及其 seed、hash、策略資訊 |

目前沒有使用 Supabase Storage 物件儲存服務；程式碼和題目內容直接存入 PostgreSQL 的文字或 JSONB 欄位。

### 6.2 瀏覽器 localStorage：暫存與畫面狀態

瀏覽器會在目前裝置暫存：

- 目前所在的首頁、檔案、題目或設定頁。
- 目前開啟的專案、檔案和題目。
- 尚未按 Save 的專案程式草稿。
- 尚未同步雲端的題目程式草稿。
- 語言、主題、字體、版面及執行設定。
- 管理員輸入題目時尚未儲存的表單內容。

localStorage 不是可靠的永久備份。清除瀏覽器資料、換裝置或使用無痕模式時，這些本機草稿可能不存在；按下 Save 後的重要內容才會寫入 Supabase。

### 6.3 Hostinger VPS 磁碟：程式與執行環境

VPS 主要保存：

- `/srv/code-tutor`：從 GitHub 取得的網站程式碼。
- `frontend/.next`：Next.js 正式 build 結果。
- `backend/.venv`：Python 套件環境。
- Docker compiler image：C++／Python 編譯環境。
- `/etc/code-tutor`：正式環境變數與 server-only secrets。
- `/var/lib/code-tutor`：編譯時短暫存在的原始碼與輸入檔。
- systemd、Nginx 與作業系統日誌。

使用者的永久專案不以普通檔案形式放在 VPS。編譯暫存目錄只為執行程式而建立，完成後應刪除，不可當成備份。

### 6.4 GitHub：網站原始碼

GitHub repository 保存網站程式、migration、部署範本和文件。以下內容不可推到 GitHub：

- `.env` 與正式環境變數檔。
- Supabase server-only secret。
- Groq API Key。
- AI Fernet encryption key。
- Judge Worker token。
- SSH 私鑰。

## 7. 帳號與權限

### Supabase Auth

Supabase Auth 負責註冊、Email 驗證、登入與 Session。登入後瀏覽器取得短效 token；FastAPI 會使用 Supabase JWKS 驗證 token 是否真的由該 Supabase 專案簽發。

### Row Level Security（RLS）

RLS 是資料庫內建的最後一道資料隔離：

- 使用者只能讀寫自己的資料夾、專案、檔案、AI 連線、草稿與提交紀錄。
- 匿名或一般使用者只能讀取已發布的公開題目資料。
- 隱藏測資、Generator、Reference Solution 與生成批次不提供瀏覽器讀取權限。
- 管理員操作由 FastAPI 驗證登入 UUID，再使用 server-only 權限完成。

## 8. 編譯器與 Judge

### Docker Engine

VPS 使用 Linux Docker Engine，不需要 Docker Desktop。每次執行使用者程式時，FastAPI 或 Judge Worker 會建立短暫容器。

容器使用的主要保護包括：

- 禁止網路連線。
- 限制 CPU、記憶體、process 數量、執行時間與輸出大小。
- 唯讀 root filesystem。
- 移除 Linux capabilities。
- 啟用 `no-new-privileges`。
- 使用非 root UID 執行程式。
- 只讀掛載使用者原始碼。
- 執行完畢後使用 `--rm` 移除容器。

### Compiler image

`compiler/Dockerfile` 以 GCC 13.4 Bookworm image 為基礎，加入 Python 3 與 GNU `time`：

- C++ 使用 `g++` 與 `-std=c++20`。
- Python 使用 `python3`。
- `time` 用來取得 Judge peak memory。

### Judge Worker

Judge Worker 是獨立 FastAPI 應用，只綁定 `127.0.0.1:8010`。一般瀏覽器不能直接連線；Web API 必須帶相同的長隨機 Worker token 才能提交評測工作。

Worker 會讀取 Supabase 中不公開的測資、執行程式、比對輸出並保存可信任的結果。回傳給前端的內容不包含隱藏輸入、正確輸出、Generator 或 Reference Solution。

## 9. AI 系統

目前 AI provider 是 Groq，不是 ChatGPT、Claude 或 Cursor。

流程如下：

1. 使用者在設定頁輸入自己的 Groq API Key。
2. FastAPI 先向 Groq 驗證 Key。
3. FastAPI 使用 `CODE_TUTOR_AI_ENCRYPTION_KEY` 透過 Fernet 加密。
4. Supabase 的 `ai_connections` 只保存密文與末四碼。
5. 使用 AI Tutor 或翻譯時，FastAPI 在伺服器記憶體中短暫解密並呼叫 Groq。
6. 完整 Key 不會再次顯示在前端。

目前預設模型由 `CODE_TUTOR_AI_MODEL` 設定。更換模型不需要修改資料庫，但必須確認 Groq 帳號可以使用該模型。

## 10. 網路與 HTTPS

| 埠 | 服務 | 是否公開 |
|---|---|---|
| 22 或自訂 SSH 埠 | VPS 管理 | 只供管理者使用 |
| 80 | Nginx HTTP | 公開，之後轉向 HTTPS |
| 443 | Nginx HTTPS | 公開網站入口 |
| 3000 | Next.js | 不公開，只綁定 127.0.0.1 |
| 8000 | FastAPI | 不公開，只綁定 127.0.0.1 |
| 8010 | Judge Worker | 不公開，只綁定 127.0.0.1 |

Nginx 負責把 `/` 轉給 Next.js，把 `/api/` 轉給 FastAPI，並為 Interactive Console 保留 WebSocket Upgrade。Let's Encrypt 憑證負責 HTTPS，Certbot 負責申請與續期。

## 11. Linux 服務管理

systemd 管理三個服務：

- `code-tutor-frontend.service`
- `code-tutor-api.service`
- `code-tutor-worker.service`

它負責開機自動啟動、程式失敗後重啟、服務帳號、環境變數、檔案權限與 journal 日誌。Nginx 另外由 Debian 套件提供的 Nginx service 管理。

API 和 Worker 使用 `/var/lib/code-tutor` 當暫存路徑。它不能改成 systemd `PrivateTmp=true`，因為主機 Docker daemon 必須看得到被掛載的原始碼路徑。

## 12. 部署與更新工具

### Git 與 GitHub

本機修改完成後先 commit、push 到 GitHub。VPS 使用 `git pull --ff-only` 取得確定的版本，避免在 VPS 上直接手動改程式。

### 部署腳本

`deploy/scripts/deploy.sh` 會：

1. 檢查必要工具和專案路徑。
2. 讀取正式前端環境變數。
3. 執行 `npm ci`、ESLint 和 Next.js build。
4. 建立 Python venv 並安裝 requirements。
5. 檢查 Python 程式是否可編譯。
6. 建立 Docker compiler image。
7. 經明確指定後才重新啟動服務。

### 健康檢查

`deploy/scripts/health-check.sh` 會確認：

- Next.js 可以回應。
- FastAPI 可以回應且能連上 Docker Engine。
- Judge Worker 可以回應且能連上 Docker Engine。

## 13. 測試與品質工具

- ESLint：檢查前端程式品質。
- TypeScript：檢查前端型別。
- `next build`：驗證正式前端可以建置。
- pytest：測試 FastAPI、帳號、AI、管理員、Judge 與測資生成。
- Docker integration tests：真的在隔離容器中編譯 C++、執行 Python 與 Judge。
- GitHub Actions：在 Ubuntu 24.04 runner 重複以上 Linux 測試。
- `nginx -t`：部署到 VPS 後驗證 Nginx 設定。
- `systemctl`／`journalctl`：檢查服務狀態與日誌。

## 14. 機密資料如何保存

| 機密資料 | 保存位置 | 不可以出現的位置 |
|---|---|---|
| Supabase server-only secret | VPS `/etc/code-tutor/backend.env` | 前端、GitHub、截圖、聊天 |
| AI Fernet encryption key | VPS backend environment | 前端、Supabase 公開欄位、GitHub |
| Judge Worker token | VPS backend environment | Nginx、瀏覽器、GitHub |
| 使用者 Groq API Key | Supabase `ai_connections.encrypted_key` | 明文資料庫、日誌、再次顯示於前端 |
| SSH 私鑰 | 管理者自己的電腦 | VPS 公開目錄、GitHub、聊天 |
| Supabase publishable key | 前端 environment | 可以出現在瀏覽器，但仍要搭配 RLS |

## 15. 備份範圍

需要分開備份：

1. Supabase：永久使用者資料、題目、測資、提交和 AI 密文。
2. GitHub：網站程式碼、migration、部署範本和文件。
3. VPS 安全設定：Nginx、systemd 與環境變數；含秘密的備份必須加密。
4. DNS 與 Supabase Auth URL：另外記錄正式設定，方便災難復原。

只備份 VPS 不等於備份資料庫；只備份 Supabase 也不包含 Nginx、systemd 與部署秘密。

## 16. 目前尚未使用的技術

以下技術目前不在正式架構內，不能在部署文件中當成已完成：

- Redis 或外部工作佇列。
- Kubernetes。
- CDN。
- Supabase Storage 檔案桶。
- ChatGPT、Claude 或 Cursor API。
- 多台 API 或多台 Judge Worker 的水平擴充。
- 自動執行正式 Supabase migrations 的部署工具。

目前採用單台 Hostinger VPS，讓架構保持容易理解；當使用者與編譯量增加後，再加入 Redis、獨立 Worker 主機或多台服務。

## 17. 相關文件

- [`plan/vps-deployment.md`](../plan/vps-deployment.md)：部署計畫與進度。
- [`docs/vps-deployment-runbook.md`](vps-deployment-runbook.md)：Debian 13 VPS 實際操作步驟。
- [`docs/vps-judge-worker.md`](vps-judge-worker.md)：Judge Worker 安全邊界。
- [`deploy/`](../deploy/)：Nginx、systemd、環境變數與部署腳本。
- [`supabase/migrations/`](../supabase/migrations/)：資料庫結構與 RLS 來源。
