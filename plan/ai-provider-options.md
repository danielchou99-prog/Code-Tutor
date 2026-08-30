# AI Tutor 模型供應商替代方案

## 目標

評估將 AI Tutor 從只支援 Groq，擴充為可選 OpenAI API、Anthropic API、Gemini API 或其他相容供應商；Cursor 僅在官方提供適合網站後端使用的公開 API 與授權時才列入。

## 目前判斷

- ChatGPT 網站訂閱與 OpenAI API 是不同的使用方式；網站後端應串接 OpenAI API，不能直接借用使用者的 ChatGPT 登入狀態。
- Claude 應透過 Anthropic API 串接，也需要獨立 API 金鑰與用量計費／額度。
- Cursor 主要是程式開發工具，不能先假設 Cursor 訂閱可當成 Code Tutor 的模型 API。
- Gemini Developer API 有一般開發者 Free tier，但免費層提交內容可能被用於改善 Google 產品，不能直接拿來處理需要保密的程式碼。
- Groq、OpenAI、Anthropic、Gemini 都可設計成 Provider Adapter，讓使用者自行選擇與保存各自金鑰。

## 免費額度比較（2026-08-24 官方資料）

- **Groq：目前最適合 Code Tutor 免費起步。** Free Plan 對部分適合程式工作的模型提供每分鐘 30 次、每日 1,000 次請求；實際模型與額度仍以帳號 Limits 頁為準。
- **Gemini：也有真正的 Free tier。** 支援模型的輸入與輸出 token 可免費，但精確速率依模型、專案與 AI Studio 顯示為準，而且免費層資料處理條件較不適合私密程式碼。
- **OpenAI：主要程式／推理模型的 API Free tier 目前不支援。** ChatGPT 免費版或訂閱額度不能轉給網站 API 使用。
- **Anthropic：一般 Claude API 採預付 usage credits。** 除特定研究計畫外，不應把它視為固定免費 API。
- **Cursor：Hobby 是編輯器／Agent 的有限免費方案，不是提供 Code Tutor 多人共用的免費推論 API 額度。**

## 後續計畫

- [x] 重新查證 OpenAI、Anthropic 與 Cursor 最新官方 API、模型、計費方式及產品用途。
  - OpenAI：ChatGPT 訂閱與 API 分開計費，網站後端應串接 OpenAI API，不是直接使用 ChatGPT 網頁帳號。
  - Anthropic：Claude.ai 訂閱與 Anthropic API 分開計費，網站後端可串接 Messages API。
  - Cursor：官方定位是程式編輯器／Coding Agent；雖有 CLI 與 API key，但不是適合讓 Code Tutor 當一般多人 AI 推論後端的首選，應直接串接模型供應商 API。
- [ ] 將目前 Groq 專用資料結構改成多 Provider 連線。
- [ ] 建立 OpenAI Responses API adapter。
- [ ] 建立 Anthropic Messages API adapter。
- [ ] 在 Settings 提供 Provider、模型與金鑰選擇。
- [ ] 針對程式分析、錯誤解釋與提示建立相同測試題，比較品質、速度與成本。

## 需要使用者手動操作的事項

- 真正串接時需選擇願意使用的供應商，並建立對應 API 帳號或由網站方統一負擔費用。
- API 金鑰只能輸入網站的安全設定頁，不可貼到聊天或提交到 Git。
