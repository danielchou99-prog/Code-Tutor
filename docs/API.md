# Code Tutor API

本機開發網址：`http://localhost:8000`

啟動 Backend 後可開啟 `http://localhost:8000/docs` 查看 FastAPI 產生的互動式 API 文件。

## Health

### `GET /health`

確認 API 與 Docker Compiler 是否可用。

```json
{
  "status": "ok",
  "compiler_available": false
}
```

`compiler_available` 為 `false` 時，代表 Docker 尚未安裝、未啟動，或 Compiler image 尚未建立。

## Compiler

### `POST /api/run`

接收單一 C++ 程式與標準輸入。

Request：

```json
{
  "code": "#include <iostream>\nint main() { std::cout << 42; }",
  "stdin": "",
  "language": "cpp"
}
```

限制：

- `code`：1–65,536 個字元
- `stdin`：最多 16,384 個字元
- `language`：MVP 僅接受 `cpp`

Response：

```json
{
  "status": "accepted",
  "stdout": "42",
  "stderr": "",
  "exit_code": 0,
  "duration_ms": 120,
  "truncated": false
}
```

`status` 可能為：

- `accepted`
- `compile_error`
- `runtime_error`
- `timeout`
- `service_unavailable`
- `rate_limited`
- `server_busy`

Docker Compiler 不可用時回傳 HTTP 503。輸入格式錯誤或超過大小限制時回傳 HTTP 422。

### `WS /api/run/interactive`

建立一個 Interactive Console session。瀏覽器和 Backend 保持 WebSocket 雙向連線，讓仍在執行的 C++ 程式持續接收 stdin 並串流 stdout／stderr。

Client 開始訊息：

```json
{
  "type": "start",
  "code": "#include <iostream>\nint main() { int n; std::cin >> n; }",
  "language": "cpp"
}
```

Client 輸入與停止訊息：

```json
{ "type": "input", "data": "42\n" }
```

```json
{ "type": "stop" }
```

Server 狀態與輸出訊息：

```json
{ "type": "status", "status": "running" }
```

```json
{ "type": "output", "stream": "stdout", "data": "Number? " }
```

狀態包含 `compiling`、`running`、`accepted`、`compile_error`、`runtime_error` 與 `timeout`。錯誤使用 `type: "error"`，並附上 `status` 和 `message`。

Interactive session 沿用 HTTP Run 的 rate limit、最大並行數、Docker 無網路、唯讀根目錄、非 root、CPU、記憶體、程序數與輸出限制。預設 session 最長 60 秒，WebSocket 關閉或使用者 Stop 後會強制清理容器。

## AI Tutor（規劃中）

- 規劃入口：`POST /api/ai/chat`
- 需先完成使用者帳號、Provider 連線與每人用量限制。

## History（尚未實作）

- `GET /api/submissions`
- `GET /api/submissions/{id}`
