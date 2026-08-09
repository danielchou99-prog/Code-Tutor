# Code Tutor Online Compiler 建立計畫

- 文件狀態：本機 MVP 驗收完成
- 最後更新：2026-08-09
- 目前階段：準備公開測試版保護計畫
- 第一版語言：C++20

## 一、計畫目標

讓使用者可以在 Code Tutor 的 Monaco Editor 撰寫 C++，輸入測試資料後按下 **Run**，再於網頁上看到程式輸出、編譯錯誤、執行錯誤或逾時結果。

使用者提交的程式不直接在網站主機上執行，而是在受限制、可於執行後移除的 Docker 容器中編譯與執行。這是第一版的安全隔離層；公開上線前還需要加入流量限制、工作佇列與獨立 Runner。

## 二、範圍

### 第一版包含

- 單一 `main.cpp`
- C++20 編譯
- 標準輸入 `stdin`
- 標準輸出與錯誤輸出
- 編譯錯誤、執行錯誤與逾時狀態
- CPU、記憶體、程序數、輸出大小與執行時間限制
- 無網路、唯讀根檔案系統與非 root 使用者
- 前端、FastAPI 與 Docker Compiler 的完整串接

### 第一版暫不包含

- 多檔案或資料夾專案
- 使用者帳號與雲端程式碼保存
- 測驗判題與隱藏測資
- 多種程式語言
- AI 錯誤解說
- 大量使用者同時執行

這些功能會在單檔編譯流程穩定後另外建立計畫。

## 三、目前進度

- [x] 建立 Next.js 工作區頁面
- [x] 安裝並顯示 Monaco Editor
- [x] 加入程式碼自動儲存與 `Ctrl+S`
- [x] 建立標準輸入與輸出介面
- [x] 前端 Run 按鈕串接 `POST /api/run`
- [x] 建立 FastAPI backend
- [x] 建立 `GET /health` 與 `POST /api/run`
- [x] 定義成功、編譯錯誤、執行錯誤與逾時回應格式
- [x] 建立 Compiler Dockerfile
- [x] 在 Runner 程式中加入基本 Docker 安全與資源限制
- [x] 完成後端自動測試（目前 14 項通過，包含 6 項真實 Docker 測試）
- [x] 安裝並啟動 Docker Desktop
  - [x] 使用官方每位使用者模式安裝 Docker Desktop 4.85.0
  - [x] 完成首次啟動並讓 Docker Engine 正常運作
- [x] 建立本機 Compiler image
- [x] 完成真實 C++ API 端對端測試
- [ ] 加入公開服務需要的佇列、流量限制與監控
- [ ] 部署到獨立 Linux Runner

## 四、詳細計畫

### 階段 1：準備 Docker 執行環境（已完成）

#### 計畫

- [x] 確認 Windows 已啟用虛擬化功能。
- [x] 安裝 Docker Desktop，使用 WSL 2 backend。
- [x] 啟動 Docker Desktop。
- [x] 執行 `docker version` 與 `docker info`，確認 Docker Client 和 Server 都可使用。

#### 簡易說明

Docker Desktop 是這台 Windows 電腦執行 Linux 容器的工具。後端程式已經會呼叫 Docker，但目前電腦沒有可用的 Docker 服務，因此 API 只能安全地回覆「編譯器不可用」。完成這一步後，網站才真的有地方可以執行 C++。

#### 完成標準

- `docker info` 成功回傳 Server 資訊。
- `GET /health` 不再因 Docker 未啟動而失敗。

### 階段 2：建立固定的 C++ Compiler Image（已完成）

#### 計畫

- [x] 檢查 `compiler/Dockerfile` 的 GCC 版本與 Runner 非 root 使用者設定。
- [x] 執行 `docker build -t code-tutor-compiler:local compiler`。
- [x] 確認本機存在 `code-tutor-compiler:local` image。
- [x] 用真實 C++ 輸入輸出程式測試 image 中的 `g++`。

#### 簡易說明

Image 可以想成編譯環境的固定範本。它會保存 Linux、GCC 和必要設定，確保每次執行使用相同版本，不會出現開發電腦可以編譯、部署主機卻不能編譯的問題。

#### 完成標準

- Image 可以成功建立。
- Image 內可以用 C++20 編譯並執行 Hello World。

### 階段 3：驗證安全限制（已完成）

#### 計畫

- [x] 驗證容器沒有外部網路介面。
- [x] 驗證根檔案系統為唯讀，只能在指定暫存位置寫入。
- [x] 驗證容器使用非 root 使用者（UID 65534）。
- [x] 驗證 CPU、記憶體與程序數限制有效。
- [x] 驗證無限迴圈會被 timeout 中止。
- [x] 驗證大量輸出會被截斷，不會占滿後端記憶體。
- [x] 驗證執行結束後不留下容器與使用者原始碼。

#### 簡易說明

使用者輸入的程式不能被當成可信任內容。這一步會故意測試危險或失控的程式，確定它最多只能影響自己的臨時容器，不能一直占用電腦資源，也不能讀寫網站的重要檔案。

#### 完成標準

- 每個限制都有自動測試或可重複的測試紀錄。
- 測試結束後沒有殘留的執行容器或程式碼。

### 階段 4：完成前後端端對端測試（已完成）

#### 計畫

- [x] 啟動 FastAPI backend。
- [x] 啟動 Next.js frontend。
- [x] 在網站測試正常程式與標準輸入。
- [x] 測試語法錯誤並顯示編譯訊息。
- [x] 測試執行錯誤。
- [x] 測試無限迴圈與逾時顯示。
- [x] 測試後端或 Compiler 無法連線時的提示。
- [x] 檢查手機和桌面版輸出區域是否仍可操作。

#### 簡易說明

前面的測試只確認各個零件能工作，這一步則模擬真正使用者：在網頁輸入程式、按 Run，再檢查畫面是否顯示正確結果。這能找出前端、後端與 Docker 單獨正常，但接在一起卻失敗的問題。

#### 完成標準

- 正常、編譯錯誤、執行錯誤與逾時四種主要情況都能在網頁正確顯示。
- 錯誤情況不會造成前端卡住或後端中斷。

### 階段 5：加入公開測試版保護

#### 計畫

- [ ] 在 API 加入每位使用者或 IP 的執行頻率限制。
- [ ] 建立工作佇列，限制同時執行的容器數量。
- [ ] 加入排隊中、執行中與取消狀態。
- [ ] 記錄執行時間、結果、資源使用量與錯誤，但不記錄敏感資料。
- [ ] 設定來源網域、HTTPS、請求大小限制與必要安全標頭。
- [ ] 加入服務健康檢查及異常告警。

#### 簡易說明

本機一次只有你使用，公開網站可能同時收到很多次 Run。如果每個請求都立刻建立容器，伺服器很容易過載。佇列會讓工作依序執行，流量限制則避免單一使用者連續大量送出程式。

#### 完成標準

- 超過限制的請求會得到清楚且可預期的回應。
- 同時執行數不會超過設定值。
- 發生失敗時可以從紀錄判斷問題位置。

### 階段 6：部署獨立 Compiler Runner

#### 計畫

- [ ] 準備獨立 Linux 主機或 VM 作為 Runner。
- [ ] Compiler Runner 不與資料庫及主要網站部署在同一個安全範圍。
- [ ] 只開放 backend 呼叫 Runner 所需的最小網路權限。
- [ ] 設定容器 image 更新與回復方式。
- [ ] 設定磁碟、容器與暫存檔清理規則。
- [ ] 重新執行所有安全及端對端測試。

#### 簡易說明

即使 Docker 已提供隔離，也不應讓陌生程式和網站資料庫待在完全相同的主機環境。獨立 Runner 就像專門處理危險工作的房間；即使編譯服務出問題，也比較不容易影響帳號、網站或資料庫。

#### 完成標準

- 正式網站只能透過受控介面提交執行工作。
- Runner 無法直接存取不需要的正式環境資料。
- 部署後所有測試仍通過。

### 階段 7：視使用量強化隔離與擴充語言

#### 計畫

- [ ] 根據公開測試結果評估 Docker 搭配 nsjail／isolate。
- [ ] 若有大量陌生使用者，評估 Firecracker microVM。
- [ ] 建立 Compiler Adapter，讓不同語言共用統一 API 回應。
- [ ] 每新增一種語言，建立獨立 image、限制設定與測試案例。

#### 簡易說明

Docker 是第一層保護，不代表永遠只需要 Docker。當網站規模和風險提高時，可以增加更嚴格的沙箱或 microVM。多語言也不能只是安裝另一個編譯器，每種語言都要重新確認安全限制和錯誤格式。

#### 完成標準

- 是否升級隔離方式有測試數據和風險評估支持。
- 新語言不會降低原本 C++ Runner 的安全性與穩定性。

## 五、整體簡易說明

Online Compiler 可以想成餐廳的點餐流程：

1. 使用者在前端寫程式，像是填寫點單。
2. FastAPI 檢查內容大小並接收工作，像是櫃台確認訂單。
3. 工作進入佇列，避免廚房同時收到太多訂單。
4. Docker 為這次執行準備一個臨時且受限制的工作空間。
5. GCC 先編譯，再執行程式。
6. 後端把結果整理成固定格式交給前端。
7. 前端顯示輸出或錯誤，臨時工作空間隨後被移除。

第一版先完成一位使用者能穩定執行單一 C++ 檔案；確認安全與錯誤處理後，再處理多人排隊、部署、多檔案、測驗和其他語言。

## 六、API 結果規格

前端不直接理解 Docker 或 GCC 的內部狀態，只處理後端統一提供的結果：

- `success`：編譯與執行成功。
- `compile_error`：C++ 無法完成編譯。
- `runtime_error`：編譯成功，但執行時發生錯誤。
- `timeout`：程式超過允許時間。
- `service_unavailable`：Docker 或 Compiler Runner 無法使用，由 HTTP 狀態和錯誤訊息表示。

統一格式可以讓未來替換 Docker Runner 或增加其他語言時，不必重寫整個前端。

## 七、整體驗收清單

- [x] 使用者可以執行會讀取標準輸入的 C++20 程式。
- [x] 正常輸出正確顯示，並保留合理的換行格式。
- [x] 語法錯誤能顯示容易閱讀的編譯訊息。
- [x] 執行錯誤不會讓 backend 中斷。
- [x] 無限迴圈會在限制時間內停止。
- [x] 記憶體炸彈、fork bomb 與大量輸出受到限制。
- [x] 使用者程式不能使用網路或讀取主機檔案。
- [x] 每次執行後會清除容器和暫存程式碼。
- [x] 自動測試、frontend lint 與 production build 全部通過。
- [ ] 公開部署前完成 rate limit、佇列、監控與獨立 Runner。

## 八、需要使用者手動操作

目前預計只有下列動作需要使用者協助：

1. 同意並完成 Docker Desktop 安裝程序。
2. 如果安裝程式要求，重新啟動 Windows。
3. 第一次開啟 Docker Desktop 時，接受使用條款並等待引擎啟動。
4. 未來部署時，選擇雲端服務、方案與付款方式。
5. 涉及網域、GitHub 或雲端帳號登入及授權時，由使用者親自確認。

其餘可由開發工具完成的檔案建立、程式修改、指令執行和測試，原則上直接執行並回報結果。

## 九、主要風險與處理方式

| 風險 | 處理方式 |
|---|---|
| 使用者程式占滿資源 | 限制 CPU、記憶體、程序數、時間與輸出大小 |
| 使用者程式接觸主機 | 無網路、唯讀檔案系統、非 root、移除額外權限 |
| 大量 Run 請求造成過載 | rate limit、工作佇列與最大並行數 |
| Docker 服務中斷 | health check、清楚的 503 回應、監控與告警 |
| 容器隔離仍有不足 | 獨立 Runner，之後評估 nsjail、isolate 或 microVM |
| 計畫與程式進度不同步 | 每次實作前後更新本文件的狀態與核取方塊 |

## 十、下一步

本機 Online Compiler MVP 已完成驗收。下一個實際動作是在 `plan/` 建立公開測試版保護的獨立計畫書，設計 API rate limit、最大同時執行數、工作佇列、執行狀態與監控，再依計畫逐項實作。

## 十一、執行紀錄

### 2026-08-08

- 已確認目前找不到 Docker 指令。
- 已確認 Windows 提供 `wsl.exe`，但 WSL 尚未安裝完成。
- 系統內建的 WSL 版本不支援 `wsl --install --no-distribution`。
- 已嘗試透過 UAC 啟用 `Microsoft-Windows-Subsystem-Linux` 與 `VirtualMachinePlatform`，但管理員授權被取消，因此系統功能沒有變更。
- 目前需要使用者以系統管理員身分啟用上述兩項 Windows 功能並重新啟動。完成後再繼續安裝 Docker Desktop。
- 已改採 Docker 官方建議的每位使用者安裝模式，減少全機設定與管理員權限需求。
- 第一個通用網址下載檔無有效 Authenticode 簽章，且與官方版本校驗值不符，因此未執行並已移除。
- 已從 Docker 官方固定版本網址下載 Docker Desktop 4.85.0（build 235549）；SHA-256 與官方公布的 `5417cedc1aeb16b488b8084025246b64a5e9da4d71388f324b107140dfe00699` 相符。
- Docker Desktop 4.85.0 已成功安裝至使用者目錄，Docker CLI 29.6.2 可使用。
- Docker Desktop 已開啟，但 Engine 尚未啟動；目前等待使用者完成首次使用條款或畫面上的 WSL 引導。
- 使用者已從工作管理員確認硬體虛擬化為「已啟用」，不需要修改 BIOS。
- 已成功啟用 `Microsoft-Windows-Subsystem-Linux` 與 `VirtualMachinePlatform`；Windows 回傳 `3010`，代表設定成功並等待重新啟動。
- 重新啟動後安裝並驗證 Microsoft WSL 2.7.11，Kernel 為 6.18.33.2，預設版本已設為 WSL 2。
- Docker Desktop 4.85.0 與 Docker Engine 29.6.2 已正常啟動；`docker-desktop` 發行版以 WSL 2 運作。
- 已從官方 `gcc:13.4-bookworm` 建立 `code-tutor-compiler:local` image。
- 真實 integration test 發現 Docker Runner 原本缺少 `-i`，造成標準輸入沒有傳入容器；已修正並新增回歸測試。
- 14 項後端測試全部通過，涵蓋正常輸入輸出、編譯錯誤、執行錯誤、逾時、實際隔離與輸出截斷。
- 隔離測試確認執行身分為 UID 65534、根目錄不可寫、沒有 `eth0`，且測試後沒有殘留 Compiler 容器。
- FastAPI `/health` 回傳 HTTP 200 與 `compiler_available: true`；`/api/run` 真實執行 C++ 並回傳 `stdout: "42\\n"`。
- Frontend lint 與 Next.js production build 通過；本機 frontend 已於 port 3000 啟動並回傳 HTTP 200。

### 2026-08-09

- 使用者已在瀏覽器完成正常輸入輸出、編譯錯誤、執行錯誤與無限迴圈逾時四種畫面驗收，結果皆正確。
- 已新增 cgroup 資源限制測試，從執行容器內確認 CPU quota 為 `50000/100000`（0.5 CPU）、記憶體上限為 `536870912` bytes（512 MB）、程序上限為 64。
- 已實際建立短生命週期子程序，確認 Docker 會在程序數達上限前拒絕額外 fork。
- 完整後端測試增加至 16 項且全部通過，測試完成後沒有殘留 Compiler 容器。
- 已使用 Microsoft Edge Headless 驗證 1440×1000、900×1000 與 390×844 三種 viewport；Run、Input、Output 均可見，整頁沒有水平溢位，AI Tutor 在窄畫面移至編輯器下方。
- 響應式驗收截圖保存於 `plan/evidence/online-compiler/`，並新增可重複執行的 `frontend/scripts/browser-validation.mjs`。
- Headless Edge 中 Monaco 持續停在 Loading 狀態，React Run 點擊事件未掛載，因此 Backend 斷線提示改由正常瀏覽器人工完成最後一步。
- 已暫停 FastAPI 讓使用者在正常瀏覽器按 Run；前端正確顯示 `Cannot reach the compiler API. Start the FastAPI backend on port 8000.`，畫面沒有卡住。
- 錯誤提示驗收後已重新啟動 FastAPI；`/health` 回傳 HTTP 200 與 `compiler_available: true`，真實 `/api/run` 再次成功輸出 `42`。
- 本機 Online Compiler MVP 的隔離、資源限制、API、正常／錯誤畫面與響應式版面驗收全部完成。
- [x] 修正本機前端依瀏覽器網址推算 API，造成使用不同 hostname 時無法連線的問題。
- 簡易說明：本機開發階段固定使用 `127.0.0.1:8000`，不開放私人網路或變更防火牆；正式部署時再改成公開的 HTTPS API 網址。
- 已重新啟動 Frontend 與 FastAPI；Frontend HTTP 200、`/health` 正常，真實 `/api/run` 回傳 `accepted` 並輸出 `42`。
