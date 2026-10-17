# 架構重構：讓常見修改只動 1–2 個檔案

依據 `Code_Tutor_OOP_交接與修改指南.md`，對照實際程式（2026-10-17）整理。

## 目標

- 計分、狀態、Supabase 連線、API 路由、前端 API 呼叫各自只有一個來源，修改時只動 1–2 個檔案。
- 每階段獨立完成並驗證，行為不變（純重構），不新增功能。
- 不為尚未存在的需求做抽象（例如多語言 Runner；目前 `CompilerService` 已有 `language` 參數）。

## 目前狀態

已做對：

- 後端已有 Protocol：`JudgeStore`、`CompilerService`、`JudgeWorker`、`GenerationStore`、`AiBlueprintProvider`。
- 判題可由 `LocalJudgeWorker` / `RemoteJudgeWorker` 切換。
- Docker 隔離執行與隱藏測資安全測試已存在。

主要問題（證據）：

1. 計分散落：「個別測資計分」一個需求改 20 個檔；`score_*` 出現在 14 個檔案；`JudgeService.submit()` 約 120 行混合執行、比對、計分、狀態；前端寫死 `/ 100`、`score === 100`。
2. `backend/app/main.py` 1073 行、20 個路由、約 20 個 dependency 函式；`submit_problem` 內含限流／排隊／錯誤對照。
3. `_headers` / `_request` 在 `judge.py`、`problem_admin.py`、`ai_connections.py` 重複三份。
4. `AdminProblem` 與 `JudgeProblem` 兩套模型、兩份資料庫讀取；`problem_admin.py` 651 行混合資料模型與存取。
5. `normalize_output` 定義在 `judge.py`，卻被 `test_generation.py`、`ai_test_generation.py` 引用。
6. `JudgeStatus` 在 `models.py` 與 `judge-api.ts` 各一份；Interactive 狀態推導在 `main.py:1044` 與 `compiler.py:533` 平行存在。
7. 前端四個 API 檔案各自 `getSession()` + `Authorization`。
8. 大檔案：`code-editor-panel.tsx` 771、`problem-admin-settings.tsx` 694、`problem-solver-page.tsx` 609 行；i18n 同時有 `t()` 與 `zh ? :`；前端 API 型別手抄後端模型。

## 前置條件

- [ ] 目前未提交的「個別測資計分」與「登入錯誤訊息」先 commit 或確認，避免與重構差異混在一起。
- [ ] 每階段開始前跑一次後端 pytest 與前端 tsc／eslint，確認基準為綠燈。

## 執行步驟

### 階段 1：計分單一來源

- [x] 新增 `backend/app/scoring.py`：`normalize_output`、`ScoreCalculator`（輸入各測資判定，輸出群組結果、總分、最終狀態）。
  - 說明：判題與測資生成共用同一份比對與計分規則。
- [x] `JudgeService.submit()` 改為只產生逐筆測資判定，再呼叫 `ScoreCalculator`。
- [x] `ai_test_generation.py`、`scripts/verify_judge_setup.py` 改由 `scoring` 匯入 `normalize_output`（`test_generation.py` 原本就未使用它）。
- [x] `SubmitResponse` 加入 `max_score`；前端 `problem-solver-page.tsx`、`problems-page.tsx` 改用後端值，不再寫死 100。
- [x] 新增 `tests/test_scoring.py`：全過、全錯、部分通過、零分、滿分、致命錯誤後群組 `not_run`、分數總和異常。
- 驗收：`test_judge.py`、`test_hidden_data_security.py` 不改斷言即通過；改計分規則只需動 `scoring.py` 與其測試。
- 完成紀錄（2026-10-17）：pytest（略過 Docker 整合測試）全數通過，`test_judge.py` 未修改斷言；前端 `tsc --noEmit`、eslint 通過。
- 前端 `score === 100` 判斷（`problems-page.tsx`、`problem-repository.ts`）改為只看 `status === "accepted"`，因全部通過即滿分；總分顯示改用 `result.max_score`。
- [ ] 尚待：Docker 整合測試（`test_judge_docker_integration.py`）與瀏覽器提交一題的畫面驗收（需使用者操作）。

### 階段 2：拆分 `main.py`

- [x] 建立 `backend/app/routers/`：`admin.py`、`ai.py`、`run.py`、`judge.py`（`APIRouter`）。
- [x] 把「排隊閘門」抽成 `execution.py` 的 `execution_slot()`，`/api/run`、submit、兩個管理端測資生成共用（限流與各路由的錯誤對照維持在各自 router）。
- [x] 服務建立與 dependency 函式移到 `container.py`；`main.py` 只組裝 app、CORS、router。
- [x] Interactive 的最終狀態推導抽成 `interactive.py` 的 `final_interactive_status()`。（註：它與 `compiler.py` 的一般執行狀態規則不同，所以只是搬移，並未合併。）
- 驗收：`test_api.py`、`test_interactive.py` 不改即通過；`main.py` 約 50–100 行；OpenAPI 路徑清單前後一致。
- 完成紀錄（2026-10-17）：`main.py` 1073 → 45 行；新增 `dependencies.py`、`container.py`、`execution.py`、`routers/{system,admin,ai,run,judge}.py`。`main.py` 重新匯出原 dependency 函式，所有既有測試未修改即通過；新舊 `app.openapi()` 完全相同（15 個路徑）；新增 `tests/test_execution_slot.py`。
- [x] Docker 驗證（Docker Desktop 29.6.2）：`test_docker_integration.py`、`test_judge_docker_integration.py` 共 21 項通過；以真實 Docker 驗證 `/health`、`/api/run`，並以 WebSocket 互動式 Python（input → output → accepted），新舊 `main.py` 事件序列完全相同。

### 階段 3：共用 Supabase REST 客戶端

- [x] 新增 `backend/app/supabase_rest.py`（`SupabaseRestClient`：headers、請求、逾時、錯誤對照）。
- [x] `judge.py`、`problem_admin.py` 的 store 改為組合使用；`problem_admin` 的「缺少 migration」說明移到 `_explain_database_rejection()` 作為回呼。
- 決定：`ai_connections.py` 不納入。它使用「使用者本人的 access token + publishable key」，授權模型與 server key 不同，硬合併會把兩種權限混在一起。
- 驗收：三個 store 的現有測試不改即通過；逾時／重試只改一個檔案。
- 完成紀錄（2026-10-17）：既有測試全數通過；`test_problem_admin.py` 有 4 處 monkeypatch 目標由 `app.problem_admin.secure_http_request` 改為 `app.supabase_rest.secure_http_request`（請求程式搬移的直接結果）；新增 `tests/test_supabase_rest.py`。

### 階段 4：統一題目模型

- [x] `problem_admin.py` 的 Pydantic 模型移到 `problem_models.py`（`problem_admin` 重新匯出，既有 import 不變）。新增 `DEFAULT_CASE_POINTS`，取代 judge／admin／test_generation 中 6 處寫死的預設分數 5。
- [x]（修訂）不合併 `JudgeProblem` 與 `AdminProblem` 的資料庫讀取。實際比對後兩者是不同用途的投影：判題端只讀已發布題目的測資，不查標籤與範例，缺題回 `ProblemNotFound`；管理端讀完整內容。硬合併會讓每次提交多出查詢並改變錯誤語意。共用部分改為共用模型與預設值，連線則已由階段 3 統一。
- 驗收：新增測資欄位只需改一個模型與一個 repository 方法；`test_problem_admin.py`、`test_judge.py` 通過。
- 完成紀錄（2026-10-17）：`problem_admin.py` 644 → 約 500 行，新增 `problem_models.py`（165 行）；既有測試未修改即通過。

### 階段 5：前端 API 與解題頁

- [x] 新增 `frontend/src/lib/api-client.ts`（`getAccessToken`、`bearerHeader`），ai-connection、ai-tutor、judge、problem-admin 四個 API 檔案改用。（各檔的逾時、錯誤類別與串流行為差異大，所以只共用「取 token + 授權標頭」，未硬包成單一 `authedFetch`。）
- [x] 新增 `judge-status.ts`：判題狀態文字單一來源（顏色與圖示仍在面板內，僅依 accepted／其他兩種）。
- [x] 解題頁拆出 `judge-result-panel.tsx`（`JudgeResultPanel`），內容原樣搬移；單行 JSX 尚未重排。
- 驗收：tsc、eslint、`next build` 通過；瀏覽器提交一題確認畫面一致。
- 完成紀錄（2026-10-17）：`tsc --noEmit`、eslint、`next build` 通過；解題頁 609 → 583 行。
- [ ] 尚待：瀏覽器提交一題確認結果面板顯示（需使用者操作）。

### 階段 6：型別與 i18n

- [x] 新增 `backend/scripts/export_openapi.py`、`frontend/scripts/generate-api-types.mjs`、`npm run gen:api`，由 FastAPI OpenAPI 產生 `frontend/src/lib/api-schema.ts`（`openapi-typescript@7.13.0`，devDependency）。`judge-api.ts` 的判題型別與 `problem-admin-api.ts` 的題目型別改為衍生自它；其餘手寫型別（AI 測資生成等）尚未遷移。
- [x] `zh ? :` 改為 `t()`：已完成，見 `plan/i18n-migration.md`（390 處介面文字遷移，內容語言選擇的 `zh ?` 刻意保留）。
- 驗收：後端欄位改名時前端 tsc 直接報錯。
- 完成紀錄（2026-10-17）：暫時把後端 `max_score` 改名後重新產生，前端 `tsc` 立即報錯（`judge-result-panel.tsx` 找不到 `max_score`），還原後恢復；後端全部測試 162 項（含 Docker）通過、0 略過；前端 eslint、`tsc`、`next build` 通過。
- 使用方式：修改後端請求／回應模型後，在 `frontend/` 執行 `npm run gen:api`，並提交更新後的 `api-schema.ts`。

## 改動範圍目標

| 需求 | 目標改動檔案 |
| --- | --- |
| 改計分規則 | `scoring.py` + 測試 |
| 新增判題狀態 | `models.py` + `judge-status.ts` |
| 改 Supabase 連線行為 | `supabase_rest.py` |
| 新增 API | 一個 router + 一個 service |
| 新增測資欄位 | `problem_models.py` + repository + migration |

## 風險與限制

- 純重構，每階段完成後單獨 commit，方便回復。
- 階段 1 會新增 `SubmitResponse.max_score`，與前端需同版部署。
- 階段 2 重構涉及 WebSocket 與佇列閘門，需要 Docker 整合測試（`test_docker_integration.py`）驗證。
- 本計畫依據部分檔案的閱讀；`compiler.py`、`problem-solver-page.tsx`、`problem-admin-settings.tsx` 在動手前需完整閱讀。

## 需要使用者手動操作

- [ ] 確認並 commit 目前未提交的修改。
- [ ] 確認個別測資計分 migration（`202609040001_individual_test_scoring.sql`）已在 Supabase 執行。
- [ ] 每階段完成後在瀏覽器提交一題做畫面驗收。
- [ ] 啟動 Docker Desktop 以執行整合測試。
