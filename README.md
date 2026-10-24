# 風雲再起 · Windcloud Client

適用 Windows 與 macOS 的 MUD 桌面客戶端，提供 ANSI 終端、Alias、Trigger、變數、擷取分頁及計時器。預設透過風雲再起官方網站使用的 `wss://windcloud.muds.me/websocket/`（443／UTF-8）連線，也支援 Telnet／Big5。無地圖功能。

本專案為獨立開發的預覽版，不是 Zugg Software 的官方產品，不包含 zMUD 程式碼、圖示或遊戲伺服器。

> **v0.3.5 新增計時器：** 最多三組，支援單次／循環與具名啟停。操作方式見 [指令與計時器使用說明](docs/commands.md)，詳細相容範圍見 [相容性文件](docs/compatibility.md)。

## v0.3.8.1 更新內容

新增角色時可選擇「開啟新視窗」或「目前視窗新增角色分頁」。每個角色的連線、規則、變數與計時器仍獨立保存，切換分頁不會中斷連線；同名擷取紀錄繼續共用並去重。操作見 [使用說明](docs/commands.md)。

## 下載與安裝

本次版本：**[0.3.8.1（預覽版）](https://github.com/eofnight/Windcloud/releases/tag/v0.3.8.1)**。

| 平台 | 安裝檔 | 免安裝 ZIP |
| --- | --- | --- |
| Windows x64 | [下載 .exe](https://github.com/eofnight/Windcloud/releases/download/v0.3.8.1/Windcloud.Client.Setup.0.3.8.1.exe) | — |
| macOS Apple Silicon | [下載 .dmg](https://github.com/eofnight/Windcloud/releases/download/v0.3.8.1/Windcloud.Client-0.3.8.1-arm64.dmg) | [下載 .zip](https://github.com/eofnight/Windcloud/releases/download/v0.3.8.1/Windcloud.Client-0.3.8.1-arm64.zip) |
| macOS Intel | [下載 .dmg](https://github.com/eofnight/Windcloud/releases/download/v0.3.8.1/Windcloud.Client-0.3.8.1-x64.dmg) | [下載 .zip](https://github.com/eofnight/Windcloud/releases/download/v0.3.8.1/Windcloud.Client-0.3.8.1-x64.zip) |

Windows 執行 `.exe`；macOS 開啟 `.dmg`，將 App 複製到「應用程式」，或解壓縮 `.zip`。安裝版不需要 Node.js 或 pnpm。檔案核對碼見 [SHA256SUMS.txt](https://github.com/eofnight/Windcloud/releases/download/v0.3.8.1/SHA256SUMS.txt)，其他版本見 [Releases](https://github.com/eofnight/Windcloud/releases)。

### macOS 首次開啟

0.3.4 起已修正本機簽章，App 與解壓後的 ZIP 通過嚴格簽章驗證。採用 ad-hoc 本機簽章及 Hardened Runtime，未經 Apple 公證；0.3.3 及更早版本請更新。

1. 下載適合處理器的版本，安裝到「應用程式」。
2. 如遭未公證提示阻擋，嘗試開啟後到「系統設定 → 隱私權與安全性」，若出現「強制打開」，確認來源後授權此 App。
3. 若仍顯示「已損毀」且沒有授權入口，請停止並回報版本與畫面；不要關閉整台 Mac 的安全檢查。

避免將 `.app` 放在 iCloud 等同步資料夾，以免同步附加的 Finder 資料破壞簽章。參考 [Apple 開啟 App 說明](https://support.apple.com/zh-tw/102445)。

## 快速開始

1. 按「連線」進入遊戲。需要同時登入其他角色時，按「新增角色」，選擇「開啟新視窗」或「目前視窗新增角色分頁」，建立具名角色設定或選取既有設定，再於角色畫面按「連線」登入。各角色設定獨立保存；已開啟的角色會切換到所在視窗與分頁。預設使用 WSS；其他主機、Telnet 與編碼可在「設定 → 連線設定」修改。
2. 在底部輸入帳號與遊戲指令；輸入密碼前勾選「密碼」。辨識到密碼提示時，也會自動遮蔽下一次輸入。
3. 上方 Alias、觸發、變數、擷取、計時器可開啟規則面板；再次點選、按 ✕ 或 Escape 隱藏。
4. 設定會自動儲存，也可匯出／匯入 JSON，另支援部分 zMUD 文字腳本與舊版 `.mud` 匯入。匯入後會斷線、暫停觸發器並停止計時器，請檢查規則後再使用。

一般指令送出後留在輸入框並全選，可按 Enter 重送。↑／↓ 選取本次指令歷史，Tab 展開完整 Alias 名稱，Esc 清空輸入，Page Up／Page Down 捲動目前分頁。編輯規則與中文組字期間保留原有按鍵行為。

## 使用說明

Alias、Trigger、變數、等待、計時器與擷取分頁的設定方式及指令範例，請見 [指令與計時器使用說明](docs/commands.md)。支援語法與限制另見 [相容性文件](docs/compatibility.md)。

計時器最多三組，支援單次或循環模式；可在連線工具列的「擷取」旁開啟規則面板。此功能自 0.3.5 提供。

## 顯示、更新與資料

「設定 → 色彩與顯示」可調整前景／背景、ANSI 16 色、回顯顏色、字體大小（11–24）與固定欄數（80–240，預設 120）。色彩即時預覽，儲存才保存，取消還原；支援粗體轉亮色、256 色與 RGB 真彩色。

終端內附 Noto Sans Mono CJK TC 等寬字型，ASCII 一格、中文與框線符號兩格。每次收到 LF／CRLF 恢復預設色彩，封包切分與自動折行不重設；縮窄視窗或開關面板時以橫向捲動維持固定欄寬。

App 啟動及每六小時檢查公開 GitHub Releases，也可在設定中手動檢查。更新只提醒並開啟下載頁，不會自動安裝、重啟，或傳送遊戲帳號與規則。

設定存在 Electron 使用者資料目錄的 `settings.json`：macOS 通常為 `~/Library/Application Support/windcloud-client/`，Windows 通常為 `%APPDATA%/windcloud-client/`。

密碼輸入不解析腳本、不回顯、不加入歷史或本機輸入紀錄，也不保存帳號密碼；自行寫進規則的密碼仍會進入設定與匯出檔。伺服器自行回送的文字仍正常顯示。Telnet 未加密，WSS 使用 TLS。介面沒有 Node.js 權限，TCP 與檔案操作透過受限 IPC。

## 開發、測試與打包

需要 **Node.js 24** 與 **pnpm 11.25.0**。

熱修版公開版號為 `0.3.8.1`；套件使用符合 SemVer 的 `0.3.8+1`，安裝檔名稱與更新檢查對應至公開版號。

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

打包輸出在 `release/`。建置 CI 測試並產生 Windows x64、macOS arm64／x64 artifacts；main 上以 `Release:` 開頭的發布提交，會在三個平台建置成功後執行發布流程，一般提交及本機測試不會自動發布。公開發行前仍須評估 Windows 簽章與 Apple Developer ID／公證；未宣稱所有實機均已驗證。

多角色整合驗證：以全新的 `WINDCLOUD_TEST_PROFILE` 目錄啟動 `pnpm start --remote-debugging-port=9223 --inspect=9230`，再執行 `node scripts/verify-role-tabs.mjs`。此測試會建立測試角色及本機連線，並在結束時關閉 App。

核心模組：`src/engine.js` 處理腳本與規則，`src/timers.js` 管理計時排程，`src/connection.js` 與 `src/telnet.js` 處理連線，`src/main.cjs` 負責設定及 IPC，`src/renderer.js` 提供介面。測試在 `test/`。

授權：本專案 MIT；各相依套件與字型保留各自授權。
