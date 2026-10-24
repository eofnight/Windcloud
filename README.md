# 風雲再起 · Windcloud Client

適用 Windows 與 macOS 的 MUD 桌面客戶端，提供 ANSI 終端、Alias、Trigger、變數、擷取分頁及計時器。預設透過風雲再起官方網站使用的 `wss://windcloud.muds.me/websocket/`（443／UTF-8）連線，也支援 Telnet／Big5。無地圖功能。

本專案為獨立開發的預覽版，不是 Zugg Software 的官方產品，不包含 zMUD 程式碼、圖示或遊戲伺服器。

> **分支待發布功能：計時器。** 下文的計時器功能尚未包含於已發布的 0.3.4 安裝檔；發布前仍需最終確認。其他功能的詳細相容範圍見 [相容性文件](docs/compatibility.md)。

## 下載與安裝

目前已發布版本：**[0.3.4（預覽版）](https://github.com/eofnight/Windcloud/releases/tag/v0.3.4)**。

| 平台 | 安裝檔 | 免安裝 ZIP |
| --- | --- | --- |
| Windows x64 | [下載 .exe](https://github.com/eofnight/Windcloud/releases/download/v0.3.4/Windcloud.Client.Setup.0.3.4.exe) | — |
| macOS Apple Silicon | [下載 .dmg](https://github.com/eofnight/Windcloud/releases/download/v0.3.4/Windcloud.Client-0.3.4-arm64.dmg) | [下載 .zip](https://github.com/eofnight/Windcloud/releases/download/v0.3.4/Windcloud.Client-0.3.4-arm64-mac.zip) |
| macOS Intel | [下載 .dmg](https://github.com/eofnight/Windcloud/releases/download/v0.3.4/Windcloud.Client-0.3.4.dmg) | [下載 .zip](https://github.com/eofnight/Windcloud/releases/download/v0.3.4/Windcloud.Client-0.3.4-mac.zip) |

Windows 執行 `.exe`；macOS 開啟 `.dmg`，將 App 複製到「應用程式」，或解壓縮 `.zip`。安裝版不需要 Node.js 或 pnpm。檔案核對碼見 [SHA256SUMS.txt](https://github.com/eofnight/Windcloud/releases/download/v0.3.4/SHA256SUMS.txt)，其他版本見 [Releases](https://github.com/eofnight/Windcloud/releases)。

### macOS 首次開啟

0.3.4 已修正本機簽章，App 與解壓後的 ZIP 通過嚴格簽章驗證。採用 ad-hoc 本機簽章及 Hardened Runtime，未經 Apple 公證；0.3.3 及更早版本請更新。

1. 下載適合處理器的版本，安裝到「應用程式」。
2. 如遭未公證提示阻擋，嘗試開啟後到「系統設定 → 隱私權與安全性」，若出現「強制打開」，確認來源後授權此 App。
3. 若仍顯示「已損毀」且沒有授權入口，請停止並回報版本與畫面；不要關閉整台 Mac 的安全檢查。

避免將 `.app` 放在 iCloud 等同步資料夾，以免同步附加的 Finder 資料破壞簽章。參考 [Apple 開啟 App 說明](https://support.apple.com/zh-tw/102445)。

## 快速開始

1. 按「連線」進入遊戲。預設使用 WSS；其他主機、Telnet 與編碼可在「設定 → 連線設定」修改。
2. 在底部輸入帳號與遊戲指令；輸入密碼前勾選「密碼」。辨識到密碼提示時，也會自動遮蔽下一次輸入。
3. 上方 Alias、觸發、變數、擷取可開啟規則面板；再次點選、按 ✕ 或 Escape 隱藏。
4. 設定會自動儲存，也可匯出／匯入 JSON。匯入後會斷線、暫停觸發器並停止計時器，請檢查規則後再使用。

一般指令送出後留在輸入框並全選，可按 Enter 重送。↑／↓ 選取本次指令歷史，Tab 展開完整 Alias 名稱，Esc 清空輸入，Page Up／Page Down 捲動目前分頁。編輯規則與中文組字期間保留原有按鍵行為。

舊版已知風雲主機的 8000 入口設定會轉為 WSS，保留規則；自訂主機不會自動轉到另一個遊戲。Telnet 8000 逾時時可改用 WSS，錯誤資訊會列出嘗試的協定與位址。

## Alias、Trigger 與變數

```text
#ALIAS kk {kill %1;kick %1}
kk rabbit
#VAR container waterskin
#ALIAS dr {drink @container}
#TRIGGER {You are thirsty} {dr} survival
#TRIGGER {^You get (%d) coins} {split %1} autosplit
#MATH hp {@hp+10}
#IF (@hp < 100) {drink potion}
```

觸發文字須依遊戲實際輸出設定。Trigger 可選完整行或無換行提示，並設定英文大小寫敏感度。觸發器送出的指令以「觸發 ›」回顯；密碼提示期間不回顯自動指令。

- `#TRIGGER`、`#TRI`、`#TR` 均可建立觸發器，不分英文大小寫。
- `#TR+ survival`／`#TR- survival` 只控制該群組觸發器；也支援 `#TRI+/-` 與 `#TRIGGER+/-`。
- `#T+ survival`／`#T- survival` 同時控制群組內 Alias、觸發與擷取。
- 「暫停觸發器」停止自動觸發及擷取，Alias 仍可手動使用；計時器另外控制。

普通遊戲指令不展開 `@變數`；Alias、Trigger 與計時器內容會在執行時展開。分號僅在括號與引號外分隔指令；Alias 定義不預先展開內文變數。條件與運算不使用 JavaScript eval。

## 等待指令

```text
#wa 1000;pp
look;#wa 1000;pp;score
#ALIAS delayed {#wa 1000;pp}
```

`#WA`／`#WAIT` 的單位為毫秒，接受 0–2147483647 的整數；省略時間（如 `#WA;pp`）則等下一筆伺服器文字行或提示。等待不會卡住畫面或手動輸入，巢狀 Alias／`#IF` 也會依序等待。

全程共用一組 WAIT 佇列，新的 `#WA` 會取代舊等待與其後續指令，包含手動、觸發器及計時器產生的等待。斷線或重新載入設定會取消等待；暫停觸發器會取消非計時器的等待。等待中的進度不保存。

## 計時器（待發布）

在「設定」勾選「顯示計時器」，按「新增計時器」設定：

| 欄位 | 說明 |
| --- | --- |
| 名稱 | 最多 40 字元，可用中文或空白；不可重複，不分英文大小寫 |
| 時間 | 1–2147483 的整數秒 |
| 模式 | 單次或循環，預設循環 |
| 執行指令 | 與觸發器相同的腳本語法，可串接指令、Alias、變數、條件及 WAIT |

最多保存三個計時器。新增或編輯後保持停止，連線後可按個別「啟動」，或在指令列操作：

```text
#ti+ 喝水
#ti- 喝水
#ti+ {補血 timer}
#ti- {補血 timer}
#ti+
#ti-
```

帶名稱時只操作該計時器；省略名稱則啟動／停止全部。重複啟動不重設倒數，停止後再啟動則從完整時間開始。畫面顯示剩餘秒數、模式與啟停狀態。

例如建立「喝水」、60 秒、循環，內容為 `dr;#wa 1000;score`，每次到期便執行 Alias `dr`，等一秒後執行 `score`。計時器沒有觸發比對產生的 `%1` 等擷取值，但呼叫 Alias 時仍可正常傳入參數。

- 顯示計時器預設關閉並記住選擇；隱藏面板不停止執行。
- 單次到期後停止；循環到期後重新計時，休眠或延遲後不補送錯過的多次指令。
- 斷線、關閉 App 或匯入設定後停止；重新連線或重開 App 都需要手動啟動，不續接舊倒數。
- 停止、編輯或刪除計時器也會取消它仍在等待中的指令；修改其他規則不重設無關計時器。
- 指令出錯時顯示名稱與原因並停止該計時器，其他計時器繼續。
- 計時器獨立於「暫停觸發器」；`#ti-` 可停止所有計時器。

## 擷取分頁

```text
#cap【系統】連線精靈： system
#CAP {含有 空白的文字} {系統 訊息}
#UNCAP {含有 空白的文字} {系統 訊息}
```

擷取使用逐字包含比對，不是正規表示式。符合的完整行去除 ANSI 後追加到分頁，主終端仍保留訊息；同一行在同一分頁只記錄一次。`#CAP` 列出規則，`#UNCAP {文字}` 移除該文字的全部擷取規則。

分頁顯示未讀筆數，可匯出紀錄或清除畫面。每分頁最多保存 5000 行／100 萬字元，紀錄只保留本次工作階段；刪除規則不會刪掉已有紀錄。擷取不執行伺服器文字中的命令。

## 顯示、更新與資料

「設定 → 色彩與顯示」可調整前景／背景、ANSI 16 色、回顯顏色、字體大小（11–24）與固定欄數（80–240，預設 120）。色彩即時預覽，儲存才保存，取消還原；支援粗體轉亮色、256 色與 RGB 真彩色。

終端內附 Noto Sans Mono CJK TC 等寬字型，ASCII 一格、中文與框線符號兩格。每次收到 LF／CRLF 恢復預設色彩，封包切分與自動折行不重設；縮窄視窗或開關面板時以橫向捲動維持固定欄寬。

App 啟動及每六小時檢查公開 GitHub Releases，也可在設定中手動檢查。更新只提醒並開啟下載頁，不會自動安裝、重啟，或傳送遊戲帳號與規則。

設定存在 Electron 使用者資料目錄的 `settings.json`：macOS 通常為 `~/Library/Application Support/windcloud-client/`，Windows 通常為 `%APPDATA%/windcloud-client/`。

密碼輸入不解析腳本、不回顯、不加入歷史或本機輸入紀錄，也不保存帳號密碼；自行寫進規則的密碼仍會進入設定與匯出檔。伺服器自行回送的文字仍正常顯示。Telnet 未加密，WSS 使用 TLS。介面沒有 Node.js 權限，TCP 與檔案操作透過受限 IPC。

## 開發、測試與打包

需要 **Node.js 24** 與 **pnpm 11.25.0**。

```sh
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm test
pnpm start
```

Electron 官方執行檔若未自動下載，第二行可補齊。Linux 雲端無螢幕環境另需虛擬螢幕及環境啟動指示；不代表支援 Linux 發行安裝檔。

```sh
node scripts/preview.mjs  # 離線字圖與介面預覽
pnpm pack                # 產生本機平台應用程式目錄
pnpm dist                # 產生本機平台安裝檔
```

預覽使用正式前端與字型，搭配模擬連線，不連遊戲、不讀取玩家設定。公開字圖測試資料在 `test/fixtures/windcloud-banner.txt`；字寬資料可用 `python3 scripts/generate-unicode-widths.py` 重建，字型授權見 `src/fonts/OFL.txt`。

打包輸出在 `release/`。建置 CI 測試並產生 Windows x64、macOS arm64／x64 artifacts；發布流程另行處理，不因本機測試而自動發布。公開發行前仍須評估 Windows 簽章與 Apple Developer ID／公證；未宣稱所有實機均已驗證。

核心模組：`src/engine.js` 處理腳本與規則，`src/timers.js` 管理計時排程，`src/connection.js` 與 `src/telnet.js` 處理連線，`src/main.cjs` 負責設定及 IPC，`src/renderer.js` 提供介面。測試在 `test/`。

授權：本專案 MIT；各相依套件與字型保留各自授權。
