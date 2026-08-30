# Code Tutor VPS Judge Worker 部署

## 目的

正式環境把公開 FastAPI 與執行陌生程式碼的 Judge Worker 分開。公開 API 只負責登入、限流和排隊；Worker 只在私人網路監聽，持有 Supabase server key，並透過 Docker 執行程式。

## 建議配置

- Web API：`127.0.0.1:8000`，由 Nginx 反向代理。
- Judge Worker：私人位址或同機 `127.0.0.1:8010`，不可直接開放 Internet。
- 前端只連 Web API，絕對不連 Worker。
- Web 與 Worker 使用至少 32 bytes 的隨機 `CODE_TUTOR_JUDGE_WORKER_TOKEN`。
- Docker socket 只允許 Worker 所在的系統帳號使用；Web API 帳號不得加入 docker 群組。

## 手動步驟

1. 在 Debian 13 安裝或確認 Docker Engine、Python 3.13、Nginx 與 Git。
   - 意義：Docker 隔離使用者程式，Nginx 提供 HTTPS，Python 執行兩個後端服務。
2. 建立 `code-tutor-web` 與 `code-tutor-worker` 兩個無登入權限的系統帳號。
   - 意義：即使其中一個服務出問題，也不會直接取得另一個服務的權限。
3. 用 `openssl rand -hex 32` 產生 Worker token，放入兩個服務的伺服器環境變數；不要放進 Git 或前端變數。
4. Worker 設定 Supabase URL、server key、Docker image 與並行數；Web 設定 `CODE_TUTOR_JUDGE_WORKER_URL=http://127.0.0.1:8010` 和相同 token。
5. 建立編譯器映像：`docker build -t code-tutor-compiler:local compiler`。
6. 啟動 Worker：`uvicorn app.worker_main:worker_app --host 127.0.0.1 --port 8010 --workers 1`。
7. 啟動 Web API：`uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1`。目前限流與執行佇列位於記憶體內，正式初期只使用一個 process，避免每個 process 各自計算限制。
8. 先檢查 Worker `/health`，再從網站送一個 Accepted、TLE、MLE、OLE 的測試提交。

## systemd 安全重點

- 設定 `Restart=on-failure`、`RestartSec=3`、`NoNewPrivileges=true`、`PrivateTmp=true`。
- Web 與 Worker 的 EnvironmentFile 權限設為 `600`。
- 目前 Hostinger VPS 只有 1 vCPU，Worker 的 `CODE_TUTOR_MAX_CONCURRENT_RUNS` 從 `1` 開始；升級 CPU 並觀察 CPU/RAM 後才能提高。
- Nginx 不得代理 `/internal/` 或 Worker 的 8010 埠。
- 防火牆只開 22、80、443；8010 不對外開放。

## 健康、日誌與失敗行為

- `/health` 回報 Worker 與 Docker 是否可用。
- Worker 每筆完成工作會寫入 JSON 事件，包括題號、狀態與總耗時，不寫 source code、測資或 token。
- Web 排隊已有限制；Worker 也有獨立並行與候補上限。
- Worker 無回應、回傳格式錯誤或 token 不符時，Web 回傳 503，不把工作改判為 Wrong Answer。
- 提交最終仍由 Worker 寫入資料庫；失敗工作不會留下假的 Accepted 紀錄。

## 上線前驗收

- 從外網無法連到 8010。
- 錯誤 token 得到 401。
- Docker 停止時 `/health` 顯示 compiler unavailable，提交得到安全的 503。
- 同時超過並行與候補上限時，新工作會快速得到 503。
- 日誌與所有 API 回應均不含隱藏 input、expected output、Generator、Reference source 或金鑰。
