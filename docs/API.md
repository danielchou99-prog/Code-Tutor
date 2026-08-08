# API 規劃

本文件先記錄 MVP 預定介面；實作 FastAPI 時再補上完整 request、response 與錯誤格式。

## Compiler

### `POST /api/run`

接收 C++ 原始碼與標準輸入，回傳編譯及執行結果。

## AI Tutor

### `POST /api/ai/analyze`

分析程式碼與執行結果。

### `POST /api/ai/explain-error`

用適合學習者的方式解釋錯誤訊息。

### `POST /api/ai/hint`

依提示層級提供漸進式協助。

## History

### `GET /api/submissions`

取得目前使用者的近期執行紀錄。

### `GET /api/submissions/{id}`

取得單次執行的程式碼、結果與 AI 分析。
