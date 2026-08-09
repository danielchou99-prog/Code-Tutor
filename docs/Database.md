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

## FileItem（已提供 migration）

- `id`：資料夾或專案的 UUID。
- `user_id`：擁有者，連到 Supabase `auth.users`。
- `parent_id`：上層資料夾；根目錄為空值。
- `kind`：`folder` 或 `project`。
- `name`：顯示名稱，同一層不得重複。
- `tags`：不包含 `#` 的文字陣列，最多 8 個標籤。
- `language`：第一版專案固定為 `cpp`。
- `content`：專案的 `main.cpp`，上限 256 KiB；資料夾為空值。
- `created_at`、`updated_at`

Migration：`supabase/migrations/202608090001_file_items.sql`

已啟用 Row Level Security，登入使用者只能對 `user_id = auth.uid()` 的資料執行讀取、新增、修改與刪除。父資料夾也必須屬於同一位使用者。

## 安全要求

- 不儲存明文密碼。
- AI API 金鑰不得寫入資料庫或提交到 Git。
- 使用者只能存取自己的 Submission 與 Memory。
