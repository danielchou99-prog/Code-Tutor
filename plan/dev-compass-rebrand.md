# Dev Compass 品牌改名計畫

## 目標

將網站對使用者顯示的品牌名稱由 **Code Tutor** 改成 **Dev Compass**，同步更新首頁、導覽列、登入與設定相關文字、網頁標題及說明。預定正式網域為 `dev-compass.com`，但只有在確認網域控制權且 DNS 指向本 VPS 後才會套用部署設定。

## 目前狀態

- [x] 完成網站品牌文字與首頁的唯讀盤點。
- [x] 查詢 `dev-compass.com` 的 DNS 與 `.com` 註冊局 RDAP 資料。
- [ ] 確認使用者是否擁有並能管理 `dev-compass.com`。
- [x] 將使用者介面品牌改為 Dev Compass。
- [x] 更新首頁的品牌標題、說明與示範輸出。
- [x] 執行前端 lint 與 production build；目前 `package.json` 沒有額外 test script。
- [ ] 網域確認後更新正式部署設定、DNS、HTTPS 與 Supabase Redirect URL。

## 執行步驟

### 1. 區分公開品牌與內部技術名稱

- 公開品牌：導覽列、首頁、登入畫面、設定畫面、網頁 metadata 改成 Dev Compass。
- 內部技術名稱：暫時保留 `CODE_TUTOR_*` 環境變數、`code-tutor` Linux 帳號、systemd service、Docker image、資料路徑與 localStorage key。

簡易說明：使用者看到的名字可以安全改掉；內部名稱若同時更動，會擴大部署風險，而且不影響網站顯示 Dev Compass。

### 2. 修改首頁與全站品牌文字

- 將中英文首頁歡迎文字改成 Dev Compass。
- 將首頁程式碼示範與輸出改成 `Hello, Dev Compass!`。
- 修改左上角品牌按鈕、網頁標題與描述。
- 修改登入、密碼更新、設定與提交提示中直接顯示的舊品牌名稱。

簡易說明：這些是使用者直接看得到的地方，必須一起修改才不會出現新舊名稱混用。

### 3. 驗證

- 搜尋前端仍可見的 `Code Tutor` 文字。
- 執行 ESLint、TypeScript/Next.js production build 與既有測試。
- 確認首頁、語言切換與導覽列仍能正常顯示。

簡易說明：自動檢查可以找出漏改文字及改名造成的程式錯誤。

### 4. 正式網域

- 確認 `dev-compass.com` 位於使用者的網域管理帳號中。
- 將根網域 A record 指向 `72.62.254.246`，並處理 `www` 是否使用。
- DNS 生效後才更新 Nginx、後端 allowed origin、Supabase URL Configuration 與 Certbot HTTPS。

簡易說明：網站名稱不等於網域所有權。網域目前指向其他 IP，不能直接改成本網站使用。

## 驗收方式

- [x] 導覽列、首頁、登入與設定介面只顯示 Dev Compass。
- [x] 瀏覽器分頁標題與描述使用 Dev Compass。
- [x] 中文與英文介面都沒有殘留的公開 Code Tutor 品牌文字。
- [x] 首頁示範輸出為 `Hello, Dev Compass!`。
- [x] lint 與 production build 全部通過；專案目前沒有額外 test script。
- [ ] DNS 最終解析到 `72.62.254.246`，HTTPS 憑證有效。

## 需要使用者手動操作

- 登入網域註冊商或 Hostinger，確認是否能管理 `dev-compass.com` 的 DNS。
- 若不擁有此網域，必須購買另一個可用網域；不要只用大小寫變化，因為網域不分大小寫。
- 網域確認後，在 Supabase Authentication → URL Configuration 更新 Site URL 與 Redirect URL。

## 實際驗證紀錄（2026-08-30）

- `npm.cmd run lint`：通過。
- `npm.cmd run build`：Next.js 16.3 編譯、TypeScript、page data 與 6 個頁面產生全部通過。
- production build 產物可以找到 Dev Compass，找不到公開的 Code Tutor 舊品牌字樣。
- VPS 已同步到 commit `231dc78` 並重新執行 lint 與 production build；正式產物中有 23 個檔案包含 Dev Compass，舊品牌檔案為 0，服務仍維持未啟動。
- `dev-compass.com` 的 RDAP 狀態為已註冊，DNS 目前指向 `91.134.91.131`，不是本專案 VPS `72.62.254.246`；在確認控制權前不修改 Nginx 或 HTTPS。
