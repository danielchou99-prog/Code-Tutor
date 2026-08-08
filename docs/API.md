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

Docker Compiler 不可用時回傳 HTTP 503。輸入格式錯誤或超過大小限制時回傳 HTTP 422。

## AI Tutor（尚未實作）

- `POST /api/ai/analyze`
- `POST /api/ai/explain-error`
- `POST /api/ai/hint`

## History（尚未實作）

- `GET /api/submissions`
- `GET /api/submissions/{id}`
