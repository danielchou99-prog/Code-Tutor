# Code Tutor 設計文件

## 產品定位

Code Tutor 是一個結合線上 IDE、C++ 編譯器與 AI 教學助理的程式學習平台。

核心流程：

```text
撰寫程式 -> 編譯或執行 -> 查看結果 -> AI 分析 -> 修改程式
```

## 第一版使用者

- 程式初學者
- 高中生與 APCS 學生
- C++ 學習者

## Coding Workspace

第一版介面分成四個主要區域：

1. History：顯示最近的執行紀錄。
2. Editor：使用 Monaco Editor 編輯 `main.cpp`。
3. AI Tutor：提供 Analyze、Explain Error 與 Hint。
4. Output：顯示標準輸出、錯誤訊息與執行狀態。

## 設計原則

- 介面接近開發工具，但保持初學者容易理解。
- AI 優先協助理解問題，不直接取代學習者完成答案。
- 第一版只支援單一 `main.cpp`，降低實作複雜度。
- Compiler、AI 與資料庫透過後端 API 存取，不從瀏覽器直接連線。
