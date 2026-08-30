# Code Tutor Ubuntu VPS 部署操作手冊

本文件搭配 [`plan/vps-deployment.md`](../plan/vps-deployment.md) 使用。指令以 Ubuntu 24.04 LTS 為準；第一次部署先不要把 3000、8000、8010 對外開放。

## 1. 部署前必須準備

- 一台 64 位元 Ubuntu 24.04 VPS。
- VPS 公開 IP、可使用 `sudo` 的 SSH 帳號與 SSH key。
- 一個網域，例如 `code.example.com`。
- 已完成 migrations 的 Supabase 專案。
- GitHub 上可部署的 Code Tutor 版本。

VPS 建議至少 4 vCPU、8 GB RAM。若只有 2 vCPU、4 GB RAM，請維持 `CODE_TUTOR_MAX_CONCURRENT_RUNS=2`，並先小規模測試。

## 2. 安裝系統套件

先登入 VPS：

```bash
ssh YOUR_SSH_USER@YOUR_VPS_IP
```

更新系統並安裝基礎工具：

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git nginx python3 python3-venv python3-pip curl ca-certificates ufw
```

按照 Docker 官方 Ubuntu 文件安裝 Docker Engine，不使用 Docker Desktop：

- <https://docs.docker.com/engine/install/ubuntu/>

安裝 Node.js 20.9 以上版本，建議 Node.js 22 LTS。完成後驗證：

```bash
node --version
npm --version
docker --version
python3 --version
```

## 3. 建立服務帳號與程式目錄

```bash
sudo useradd --system --create-home --home-dir /home/code-tutor --shell /bin/bash code-tutor
sudo usermod -aG docker code-tutor
sudo install -d -o code-tutor -g code-tutor -m 0750 /srv/code-tutor
```

注意：可以存取 Docker socket 的帳號具有很高權限。因此網站 API 必須只綁定 `127.0.0.1`，而且不能讓使用者控制 Docker 指令或映像名稱。

下載程式：

```bash
sudo -u code-tutor git clone https://github.com/danielchou99-prog/Code-Tutor.git /srv/code-tutor
```

如果 GitHub repository 尚未包含最新本機修改，必須先在開發電腦完成 commit 與 push，VPS 才能取得相同版本。

## 4. 建立正式環境變數

```bash
sudo install -d -o root -g code-tutor -m 0750 /etc/code-tutor
sudo cp /srv/code-tutor/deploy/env/frontend.production.example /etc/code-tutor/frontend.env
sudo cp /srv/code-tutor/deploy/env/backend.production.example /etc/code-tutor/backend.env
sudo chown root:code-tutor /etc/code-tutor/frontend.env /etc/code-tutor/backend.env
sudo chmod 0640 /etc/code-tutor/frontend.env /etc/code-tutor/backend.env
```

使用 `sudoedit` 修改內容：

```bash
sudoedit /etc/code-tutor/frontend.env
sudoedit /etc/code-tutor/backend.env
```

重要規則：

- `frontend.env` 只能放 `NEXT_PUBLIC_` 開頭的公開資料。
- 同網域部署時，`NEXT_PUBLIC_API_URL=` 保持空白即可。
- `backend.env` 的 Supabase secret、Worker token 和 AI encryption key 不可放進 GitHub。
- `CODE_TUTOR_ALLOWED_ORIGINS` 填完整 HTTPS origin，例如 `https://code.example.com`，結尾不要 `/`。
- Worker URL 固定使用 `http://127.0.0.1:8010`，不可填公開網址。

產生 Worker token：

```bash
openssl rand -hex 32
```

產生 AI Fernet key：

```bash
cd /srv/code-tutor/backend
python3 scripts/generate_ai_encryption_key.py
```

將結果直接填入伺服器的 `backend.env`，不要貼到聊天、截圖或 GitHub。

## 5. 建置 Linux 正式版本

部署腳本會安裝前端套件、執行 lint/build、建立 Python venv、安裝後端套件，最後建立編譯器 Docker image：

```bash
sudo -u code-tutor bash /srv/code-tutor/deploy/scripts/deploy.sh
```

完成後驗證 image：

```bash
sudo -u code-tutor docker image inspect code-tutor-compiler:local >/dev/null
```

## 6. 安裝 systemd 服務

```bash
sudo cp /srv/code-tutor/deploy/systemd/code-tutor-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable code-tutor-frontend code-tutor-api code-tutor-worker
sudo systemctl start code-tutor-worker code-tutor-api code-tutor-frontend
```

查看狀態：

```bash
sudo systemctl status code-tutor-frontend --no-pager
sudo systemctl status code-tutor-api --no-pager
sudo systemctl status code-tutor-worker --no-pager
bash /srv/code-tutor/deploy/scripts/health-check.sh
```

API 與 Worker 使用 `/var/lib/code-tutor` 建立暫存原始碼。這個路徑對主機 Docker daemon 可見；不可自行把兩個服務改成 `PrivateTmp=true`。

## 7. 設定 Nginx

先複製範本並把 `YOUR_DOMAIN` 換成真正網域：

```bash
sudo cp /srv/code-tutor/deploy/nginx/code-tutor.conf /etc/nginx/sites-available/code-tutor
sudoedit /etc/nginx/sites-available/code-tutor
sudo ln -s /etc/nginx/sites-available/code-tutor /etc/nginx/sites-enabled/code-tutor
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

如果預設站台不存在，`sudo rm` 會失敗；這時不要改用更強制的刪除指令，只要確認 `sites-enabled` 內容後繼續即可。

Nginx 功能分工：

- `/` 轉給 Next.js 3000。
- `/api/` 轉給 FastAPI 8000。
- `/api/run/interactive` 額外保留 WebSocket Upgrade。
- 8010 永遠不經 Nginx 對外提供。

## 8. DNS 與 HTTPS

在網域服務商新增 A record：

```text
code.example.com -> YOUR_VPS_IP
```

DNS 生效後，使用 Certbot 的 Nginx 流程申請 Let's Encrypt 憑證。完成後執行：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

## 9. 防火牆

先確認目前 SSH 服務使用的埠，再開啟防火牆。標準 22 埠範例：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

防火牆不應出現 3000、8000、8010 的公開規則。

## 10. Supabase 正式網址

到 Supabase Dashboard → Authentication → URL Configuration：

- Site URL：`https://YOUR_DOMAIN`
- Redirect URL：`https://YOUR_DOMAIN/auth/confirm`
- 若仍需本機開發，保留 `http://localhost:3000/auth/confirm`。

## 11. 首次完整驗收

依序測試：

1. 首頁與靜態資源可透過 HTTPS 開啟。
2. 註冊、驗證信、登入、登出。
3. 檔案、資料夾、專案與重新整理後狀態。
4. C++、Python 的 Text 與 Interactive Console。
5. 題目 Run、Submit、隱藏測資及分數。
6. Groq 連線、AI Tutor 與題目翻譯。
7. `sudo reboot` 後服務自動恢復。

如果服務失敗，先查看日誌，不要反覆重裝：

```bash
sudo journalctl -u code-tutor-frontend -n 100 --no-pager
sudo journalctl -u code-tutor-api -n 100 --no-pager
sudo journalctl -u code-tutor-worker -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

## 12. 日後更新

先把新版本推到 GitHub，再於 VPS 執行：

```bash
cd /srv/code-tutor
sudo -u code-tutor git pull --ff-only
sudo -u code-tutor bash deploy/scripts/deploy.sh --restart
```

更新資料庫前要先閱讀 migration；資料庫 migration 不會由部署腳本自動執行，避免誤改正式資料。
