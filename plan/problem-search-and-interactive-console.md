# Code Tutor 多標籤搜尋與 Interactive Console 計畫

- 文件狀態：本機 MVP 與 Console 介面微調完成
- 最後更新：2026-08-09
- 目前階段：自動與真實 Docker 驗收完成

## 一、目標

讓題目搜尋可以同時使用多個 `#標籤`，例如輸入 `#APCS中高級 #二分搜` 時只顯示同時符合兩個標籤的題目。專案卡片移除使用者指定的說明文字。程式頁的 Input 區增加 Batch Input 與 Interactive Console 選擇，並逐步建立真正可以在程式執行期間持續輸入、即時顯示輸出的連線。

## 二、目前狀態

- [x] 題目支援文字搜尋與單一標籤篩選。
- [x] Compiler 支援一次送入完整 stdin 後執行。
- [x] 標籤按鈕已支援一次選擇多個。
- [x] 搜尋欄已能把 `#` 開頭文字解析成多個標籤。
- [x] 已提供執行期間的雙向 Interactive Console。

## 三、階段一：多標籤搜尋

### 執行步驟

- [x] 將單一 `selectedTag` 改成多標籤集合。
- [x] 點擊標籤時個別加入或移除，不清除其他已選標籤。
- [x] `#全部` 清除所有標籤。
- [x] 搜尋文字中以 `#` 開頭的詞視為標籤，其餘文字仍做標題與說明搜尋。
- [x] 多個標籤採 AND 規則，題目必須同時包含全部標籤。
- [x] 中英文標籤都能正確解析。
- [x] 加入瀏覽器自動驗收。

### 簡易說明

`#` 像是告訴搜尋器「這不是一般文字，而是分類條件」。使用者可以同時要求程度與演算法，例如 `#APCS中高級 #二分搜`，比逐一切換有效率。

### 驗收方式

- 輸入或點選兩個標籤後，兩個標籤都保持選取。
- 顯示的題目同時符合全部選取標籤。
- 一般關鍵字和 `#標籤` 可以一起使用。

## 四、階段二：專案卡片簡化

### 執行步驟

- [x] 移除專案名稱下方的說明文字。
- [x] 保留專案名稱、語言圖示與更新時間。
- [x] 中英文畫面保持相同結構。

### 簡易說明

專案卡片只保留辨識與操作真正需要的資訊，減少重複說明造成的視覺干擾。

### 驗收方式

- 「目前的 main.cpp 與 Online Compiler」及英文對應文字不再出現。
- 專案卡片仍可開啟編輯器。

## 五、階段三：Interactive Console

### 執行步驟

- [x] Input 區增加 Batch Input／Interactive Console 選擇。
- [x] Batch Input 保留目前一次送出完整文字的功能。
- [x] 建立 WebSocket interactive run endpoint。
- [x] 每個 interactive session 使用獨立受限 Docker 容器。
- [x] 將使用者每一行輸入即時寫入程式 stdin，並串流 stdout／stderr。
- [x] 加入 Stop、最大連線時間、輸出上限、斷線清理、rate limit 與最大並行數。
- [x] Frontend 顯示連線、執行、結束與錯誤狀態。
- [x] 加入後端與瀏覽器測試。

### 簡易說明

Batch Input 是先把所有答案寫好再執行；Interactive Console 則像終端機，程式問一題，使用者輸入一次，再立即看到下一段輸出。它需要保持一條雙向連線，不能只改 textarea 外觀。

### 驗收方式

- 使用者可以在 Batch 與 Interactive 之間切換。
- Interactive 模式可執行會多次詢問輸入的 C++ 程式。
- 停止、逾時或關閉頁面後不留下 Docker 容器。
- 原本 Batch API 與安全限制仍通過。

## 六、需要使用者手動操作

本階段不需安裝新軟體。完成後請使用者在一般瀏覽器測試一個會先輸出提示、等待輸入、再輸出結果的 C++ 程式。

## 六之一、Console 介面微調

### 執行步驟

- [x] 將模式名稱固定為 `Text` 與 `Interactive Console`，不隨網站語言改變。
- [x] 將執行按鈕固定顯示 `Run`，不隨網站語言改變。
- [x] 移除 Interactive Console 底部獨立輸入列的分隔線與按鈕區。
- [x] 將輸入游標直接放進終端輸出區域，呈現 CMD 式互動。
- [x] 重新執行 ESLint、production build 與瀏覽器互動測試。

### 簡易說明

終端機的輸入和程式輸出應出現在同一個連續區域。使用者看到程式提示後，可以直接在下一個游標位置輸入，不需要額外佔用一列獨立輸入框。

### 驗收方式

- 切換繁體中文與英文時，`Text`、`Interactive Console`、`Run` 文字保持不變。
- Interactive Console 只有一個終端內容區，輸入游標位於輸出內容下方。
- 按 Enter 仍可把資料送進正在執行的 C++ 程式。

## 七、執行與驗收紀錄

- 中文搜尋輸入 `#APCS中高級 #二分搜` 後，兩個標籤同時選取並以 AND 規則留下 1 題。
- 英文搜尋輸入 `#APCSIntermediateAdvanced #BinarySearch` 也正確留下 1 題。
- 專案卡片已移除圈選的中英文說明文字，名稱、C++ 圖示與更新時間保留。
- 後端完整測試共 29 項通過，包含 9 項真實 Docker 測試。
- 真實 Interactive Docker 測試完成兩輪輸入：先輸入姓名，再輸入年齡，程序保持同一 session。
- Edge 瀏覽器從 Interactive Console 送入 `5 1 2 3 4 5`，即時收到結果 `15` 與成功狀態。
- Interactive 測試結束後沒有殘留 Docker 容器。
- 原本 Batch Input API 回歸測試仍成功輸出 `42`。
- Frontend ESLint 與 Next.js production build 通過。
- 畫面證據保存於 `plan/evidence/workspace-navigation/desktop-problems-multi-tag.png` 與 `desktop-interactive-console.png`。
- Console 介面微調後，`Text`、`Interactive Console`、`Run` 已固定為英文；輸入游標與輸出共用同一個終端區域。
- 微調後的真實瀏覽器測試再次送入 `5 1 2 3 4 5` 並收到 `15`，ESLint 與 production build 通過。
