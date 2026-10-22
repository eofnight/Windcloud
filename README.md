# 風雲再起 · Windcloud Client

適用 Windows 與 macOS 的 MUD 桌面客戶端。預設透過 `wss://windcloud.muds.me/websocket/`（443／UTF-8）連線風雲再起，另支援 Telnet／Big5，並提供 ANSI 顯示，提供依 zMUD 官方文件實作的 Trigger／Alias 常用子集。無地圖功能。

這是獨立開發的預覽版，不是 Zugg Software 的官方產品；不包含 zMUD 程式碼、圖示或遊戲伺服器程式。

## 下載與安裝

目前版本：**[0.3.2（預覽版）](https://github.com/eofnight/Windcloud/releases/tag/v0.3.2)**。三個平台均已通過 GitHub Actions 自動測試及打包，安裝檔可直接下載，不需登入 GitHub。

| 作業系統 | 安裝檔 | 免安裝 ZIP |
| --- | --- | --- |
| Windows x64 | [下載 .exe](https://github.com/eofnight/Windcloud/releases/download/v0.3.2/Windcloud.Client.Setup.0.3.2.exe) | — |
| macOS Apple Silicon（M 系列） | [下載 .dmg](https://github.com/eofnight/Windcloud/releases/download/v0.3.2/Windcloud.Client-0.3.2-arm64.dmg) | [下載 .zip](https://github.com/eofnight/Windcloud/releases/download/v0.3.2/Windcloud.Client-0.3.2-arm64-mac.zip) |
| macOS Intel | [下載 .dmg](https://github.com/eofnight/Windcloud/releases/download/v0.3.2/Windcloud.Client-0.3.2.dmg) | [下載 .zip](https://github.com/eofnight/Windcloud/releases/download/v0.3.2/Windcloud.Client-0.3.2-mac.zip) |

Windows 執行 `.exe` 安裝；macOS 開啟 `.dmg` 並將 App 拖至「應用程式」資料夾，或解壓縮 `.zip` 取得 App。使用安裝版不需要安裝 Node.js 或 pnpm。

此為尚未簽章／公證的預覽版。檔案核對碼：[SHA256SUMS.txt](https://github.com/eofnight/Windcloud/releases/download/v0.3.2/SHA256SUMS.txt)。其他版本請見 [Releases](https://github.com/eofnight/Windcloud/releases)。

## 開發與執行

需要 Node.js 24 與 pnpm 11.25.0。安裝 pnpm 後：

```sh
pnpm install
node node_modules/electron/install.js
pnpm test
pnpm start
```

如果 pnpm 尚未自動下載 Electron，第二行會補齊官方執行檔。

## 操作

1. 預設直接使用風雲再起原網站的 `wss://windcloud.muds.me/websocket/`（443／UTF-8），不再等待 Telnet。舊版風雲設定首次載入時會轉成 WSS，保留原有 Alias／Trigger。若需要其他模式，可在上方「設定 → 連線設定」修改。
   自動轉接僅適用於風雲再起已知主機的 8000 入口，自訂主機／其他 port 不會轉接到另一個遊戲。
2. 在底部輸入帳號、遊戲指令；輸入密碼前勾選「密碼模式」。伺服器發出可辨識的密碼提示時，也會自動遮蔽下一次輸入。Telnet ECHO 協商本身不視為密碼提示，以免遊戲正常操作被誤判。
3. 點選上方 Alias、觸發、變數、擷取，開啟右側浮動規則面板；再點同一項或 ✕／Escape 可隱藏。在面板內新增 Alias、Trigger、變數、擷取規則，或直接輸入下方的指令。一般指令會顯示於主終端；送出後留在輸入框並全選，開始打字即取代舊指令，按 Enter 可重送。
4. Trigger 可設定為完整行或無換行提示，並選擇英文大小寫敏感度。
5. 「暫停觸發器」停止所有自動觸發；Alias 仍可手動執行。
6. 輸入 `#cap【系統】連線精靈： system`，即可建立 `system` 分頁，將含有該文字的完整伺服器文字行另存到分頁；主終端保留原訊息。
7. ↑／↓ 選取本次工作階段的指令歷史，Tab 可將整個 Alias 名稱展開至輸入框；Esc 清空輸入框，Page Up／Page Down 捲動遊戲或擷取分頁的歷史訊息。編輯規則及中文輸入組字時保留原有按鍵行為。
8. 設定自動儲存，可匯出／匯入 JSON。匯入後斷線且暫停 Trigger，檢查規則後再恢復。

密碼模式內容不經腳本解析、不加入指令歷史、不產生本機輸入紀錄。程式不儲存帳號或密碼；如果自行把密碼寫入規則，該規則仍會進入設定檔及匯出檔。Telnet 本身為未加密連線；WSS 使用 TLS 加密。

## 語法範例

```text
#ALIAS kk {kill %1;kick %1}
kk rabbit

#VAR container waterskin
#ALIAS dr {drink @container}
#TRIGGER {You are thirsty} {dr} survival
#T- survival
#T+ survival

#TRIGGER {^You get (%d) coins} {split %1} autosplit
#TRIGGER {^氣血：(%d)} {#VAR hp %1;#IF (@hp < 100) {drink potion}}

#ALIAS tellto {tell %1 %-2}
tellto bob hello world

#MATH hp {@hp+10}
#SHOW @hp
```

觸發文字必須依遊戲實際輸出設定，上述氣血範例並非已確認的遊戲格式。

直接輸入的普通遊戲指令預設不展開 `@變數`；Alias／Trigger 的內容會在執行時展開。分號只在括號、引號外分隔指令。`#ALIAS` 定義不預先展開內文變數。支援常用 `#IF` 及 `#MATH`，不使用 JavaScript eval。

`#WA`／`#WAIT` 可在手動指令、Alias 及 Trigger 執行內容中等待，時間單位為毫秒：

```text
#wa 1000;pp
look;#wa 1000;pp;score
#TRIGGER {準備完成} {#wa 1000;pp}
#ALIAS delayed {#wa 1000;pp}
```

第一行等一秒後執行 `pp`；第二行先執行 `look`，等一秒後依序執行 `pp`、`score`。`;` 代表連續指令，括號或引號內的分號不會拆開。等待不會卡住畫面或手動輸入，巢狀 Alias／`#IF` 也會先等完內部指令才接續外層。

依舊版 zMUD 官方規則，同時只有一組等待佇列，新的 `#WA` 會取代舊等待及其剩餘指令。省略時間（`#WA;pp`）則等下一筆伺服器文字行或提示再執行。時間須為 0–2147483647 的整數毫秒；斷線、暫停觸發器或重新載入規則會取消等待。等待中的指令不會保存至設定檔。

完整範圍與官方依據見 [相容性文件](docs/compatibility.md)。這不是完整 zMUD 4.62 模擬器，舊腳本應先離線檢查，不保證全部直接執行。

## 觸發回顯與群組開關

`#TRIGGER`、`#TRI`、`#TR` 均可建立觸發器（不分大小寫）。觸發器實際送出的遊戲指令會以「觸發 ›」逐條顯示在終端，包含 Alias 展開及等待完成後的指令；密碼提示期間的自動回應不回顯。

```text
#tri {準備完成} {#wa 1000;pp} combat
#tr- combat
#tri+ combat
#trigger- combat
#trigger+ combat
```

`#TR+`／`#TRI+`／`#TRIGGER+` 開啟指定群組的觸發器，對應的 `-` 寫法關閉觸發器；不影響同群組的 Alias 或擷取規則。關閉群組也會取消該群組等待中的觸發指令。群組設定會保存，個別停用的規則仍維持停用。原有 `#T+`／`#T-` 則同時控制 Alias、觸發及擷取。

## 版本更新提醒

App 啟動後及每六小時會檢查公開的 GitHub Releases（包含預覽版），有較新版本時顯示提醒，點「前往下載」開啟該版本頁面。也可從「設定 → 檢查更新」手動檢查；網路中斷不影響遊戲連線。此功能只提醒及開啟下載頁，不會自動安裝或重啟 App。更新檢查不傳送遊戲帳號、規則或連線紀錄。

0.3.2 以前的版本尚無此功能，需先手動安裝 0.3.3 或更新版本。

## 精簡介面、ANSI 色彩與固定欄寬

「設定 → 色彩與顯示」可自訂終端前景／背景、ANSI 16 色、指令回顯與本機提示顏色，並切換經典或柔和色盤。顏色即時預覽，按儲存才保存，取消會還原；也可設定 ANSI 粗體是否轉為亮色。NOR（`ESC[m`／`ESC[0m`）回到自訂的一般文字與背景。伺服器指定的 256 色／RGB 真彩色保留原值。

每次收到換行（LF 或 CRLF）會恢復預設前景色、背景色與字體效果；同一行內仍依 ANSI 色碼顯示。只有視窗自動折行或封包切分時不會重設。本機指令回顯／提示結束後也回到預設色；跨封包的 ANSI 控制序列會完整組合。

終端使用專案內附 Noto Sans Mono CJK TC 等寬字型，ASCII 佔一格，中文與框線符號（如 ╭─│┼◎）佔兩格；字寬依字型實際度量產生，不依賴作業系統的字型替代。關閉 xterm 單格框線重畫，並調整字型行高，避免線段斷開。終端預設固定 120 欄。開關規則面板不改變終端欄數，縮窄視窗時改為橫向捲動，避免已顯示的文字表格反覆折行。可在色彩與顯示內調整字體大小（11–24）及欄數（80–240）；伺服器原始文字超過設定欄數仍可能折行。

## 擷取分頁（本客戶端擴充）

```text
#cap【系統】連線精靈： system
#CAP {【系統】連線精靈：} system
#CAP {含有 空白的文字} {系統 訊息}
#UNCAP {【系統】連線精靈：} system
```

前兩行相同：以逐字包含比對，不把觸發文字當正規表示式。符合的整行（去除 ANSI 控制碼）會追加至指定分頁，同一行在同一分頁只記錄一次；不同分頁各自收錄。不執行伺服器訊息中的任何命令，也不從主終端移除原文。

`#CAP` 列出擷取規則；`#UNCAP {文字} {分頁}` 移除指定規則，省略分頁則移除該文字的所有擷取規則。亦可從右側「擷取」新增、編輯、停用或刪除。暫停觸發器時，擷取也暫停。

上方分頁名稱會顯示未讀筆數。切換分頁後，「匯出紀錄」匯出目前分頁，「清除畫面」清除目前分頁的內容。擷取規則會保存；擷取紀錄僅保留本次程式開啟期間，每分頁最多 5000 行／100 萬字元，關閉前可匯出。刪除規則不會刪掉已收集的分頁紀錄。

密碼輸入不回顯、不保留在輸入框、不加入指令歷史或本機指令紀錄。伺服器若自行回送任何文字，仍按正常伺服器輸出顯示。

## 從 DMG 開啟與連線逾時

從 DMG 直接開啟 App，不會把 TCP 連線變成不同的伺服器；設定保存在使用者資料目錄，不寫入唯讀 DMG。可以將 App 複製到「應用程式」以便日常啟動。

預設已使用「網頁 WSS／443」。若手動切換到 Telnet 後 8000 逾時，可回到設定選用網頁 WSS。錯誤與切換訊息會列出實際嘗試的協定及位址，不代表程式一定有錯，也不能單憑逾時判定是伺服器停機、網路路徑或防火牆中的哪一項。

## 打包與 GitHub

```sh
pnpm pack  # 產生本機平台的應用程式目錄
pnpm dist  # 產生本機平台的安裝檔
```

輸出在 `release/`。GitHub Actions 會測試並建置 Windows x64、macOS Apple Silicon 與 Intel 版本，結果在 Actions 的 artifacts 下載；目前不自動發布 Release。

專案已獨立初始化 Git，可以建立自己的遠端 repository 後推送此資料夾。不要推送上一層工作目錄。

公開發佈前可配置 Windows 簽章、Apple Developer 簽章及 notarization。預設產物沒有配置發行者簽章，尚未宣稱通過 Windows 或所有 Mac 機型的實機驗證。

## 資料與架構

- `src/engine.js`：Alias、Trigger、群組、變數與命令分派。
- `src/parser.js`、`src/pattern.js`、`src/expression.js`：分隔、比對與運算。
- `src/telnet.js`：串流 Telnet、NAWS、終端類型與去除 ANSI 後的觸發文字。
- `src/connection.js`：TCP／WSS 與風雲再起入口自動切換。
- `src/main.cjs`：Big5／UTF-8 串流解碼、設定保存與受限 IPC。
- `src/renderer.js`：xterm.js 顯示與規則編輯。
- `test/`：官方範例及封包分割回歸測試。

設定位於 Electron 的使用者資料目錄內 `settings.json`。macOS 通常在 `~/Library/Application Support/windcloud-client/`，Windows 通常在 `%APPDATA%/windcloud-client/`。

介面不具備 Node.js 權限；TCP 與檔案操作經 preload 白名單 IPC 存取。伺服器文字交由終端元件顯示，規則文字以 textContent 呈現。

授權：本專案 MIT；各相依套件保留其各自授權。

## 不封裝的字圖預覽

```sh
node scripts/preview.mjs
```

開啟終端印出的本機網址，按連線即可查看公開歡迎字圖測試資料。這個預覽使用正式前端原始碼與字型，不會連上遊戲，也不讀取玩家設定。要實際操作桌面版原始碼可用 `pnpm start`，不必打包。

實際公開字圖保存在 `test/fixtures/windcloud-banner.txt`，上下八行皆應為 84 格。字寬資料可用 `python3 scripts/generate-unicode-widths.py` 重新產生；字型授權在 `src/fonts/OFL.txt`。
