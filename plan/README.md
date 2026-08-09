# Code Tutor 計畫文件

這個資料夾集中保存 Code Tutor 各項功能的計畫與進度，讓開發前先確認目的、執行順序和完成標準。

## 使用規則

1. 開始製作或修改網站內容前，先建立或更新對應的計畫書。
2. 計畫書必須同時提供技術計畫和容易理解的簡易說明。
3. 開發過程要更新完成狀態；完成後要記錄驗收結果。
4. 需要使用者安裝軟體、登入服務或操作管理介面時，要另外列在「需要手動操作」段落。
5. 新的大型功能建立獨立文件；小型修正更新最相關的既有文件。

## 文件格式

每份計畫書原則上包含：

- 文件狀態與最後更新日期
- 目標與範圍
- 目前進度
- 詳細計畫
- 簡易說明
- 驗收標準
- 需要手動操作的事項
- 風險與後續方向

## 現有計畫

- [Online Compiler 建立計畫](online-compiler.md)：C++ 線上編譯器、Docker 隔離環境、安全限制與上線準備。
- [公開測試版保護計畫](public-beta-protection.md)：Rate limit、最大並行數、工作佇列、Frontend 狀態與安全 LAN 存取。
- [檔案導覽與題目標籤計畫](workspace-navigation-and-problems.md)：置中導覽、檔案首頁、專案入口、題目搜尋與標籤篩選。
- [多標籤搜尋與 Interactive Console 計畫](problem-search-and-interactive-console.md)：`#` 多標籤解析、專案卡片簡化、Batch Input 與即時互動 Console。
- [免費 AI 與帳號管理計畫](ai-account-foundation.md)：Supabase Auth、使用者自備 Groq key、AI Tutor API 與安全保存方式。
