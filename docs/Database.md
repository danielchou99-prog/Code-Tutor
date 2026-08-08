# Database 規劃

預定使用 PostgreSQL。正式實作前仍需補上關聯、索引、刪除策略與 migration 工具。

## User

- `id`
- `username`
- `email`
- `password_hash`
- `created_at`

## Submission

- `id`
- `user_id`
- `code`
- `language`
- `status`
- `output`
- `error`
- `created_at`

## ErrorLog

- `id`
- `submission_id`
- `error_type`
- `message`
- `created_at`

## AIMemory

- `id`
- `user_id`
- `problem_pattern`
- `frequency`
- `summary`
- `updated_at`

## 安全要求

- 不儲存明文密碼。
- AI API 金鑰不得寫入資料庫或提交到 Git。
- 使用者只能存取自己的 Submission 與 Memory。
