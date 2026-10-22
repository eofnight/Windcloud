# zMUD 語法相容範圍

本專案依官方文件自行實作，不是 zMUD 完整重製。4.42+ 語言說明、舊版 Help 與 5.x 文件交叉參考；引用 5.x 並不表示所有行為已在 4.62 二進位程式逐項比對。

## 官方來源

- [Alias 基本操作、參數、尾隨參數](https://www.zuggsoft.com/zmud/help/ALIAS.htm)
- [Alias 範例、延遲參數展開](https://www.zuggsoft.com/zmud/help/ALIAS_ex.htm)
- [Trigger、Class 與擷取參數](https://www.zuggsoft.com/zmud/help5/Intr0003.htm)
- [Trigger 完整行與 Prompt 時機](https://www.zuggsoft.com/zmud/help55/TRIGGER.htm)
- [Pattern Matching](https://www.zuggsoft.com/zmud/help5/Pattern_.htm)
- [4.42+ Programming Language：解析與展開模式](https://www.zuggsoft.com/page.php?file=zmud%2Fprog.htm)
- [WAIT：毫秒等待與單一等待佇列](https://www.zuggsoft.com/zmud/help/WAIT.htm)
- [IF](https://www.zuggsoft.com/zmud/help5/IF.htm)
- [Expressions](https://www.zuggsoft.com/zmud/help5/Expressi.htm)
- [Advanced Triggers：萬用字元與指令分隔符](https://www.zuggsoft.com/library/book2/triggers.htm)

## 已實作

| 功能 | 範圍 |
|---|---|
| Alias | `#ALIAS`／`#AL`、列出／查詢、參數 `%1`–`%99`、`%-1` 剩餘參數、未使用參數附加、Alias 串接 |
| Trigger | `#TRIGGER`／`#TR`／`#ACTION`／`#AC`、擷取至 `%1`–`%9`、line／prompt、英文大小寫選項 |
| Pattern | `*`、`?`、`%d`、`%w`、`%a`、`%s`、`%x`、`^`、`$`、`~`、固定字串選項 `{a|b}`、`&nn` |
| 變數 | `#VAR`／`#VARIABLE`／`#VA`、`@name`、`@{name}`、執行時展開、`@@`／`%%` 一層延遲 |
| 群組 | 定義的第三參數、`#T+ name`、`#T- name`；群組同時影響 Alias 與 Trigger |
| 條件及運算 | `#IF (expression) {true} {false}`、`#MATH`、`#VAR n [expression]` |
| 運算子 | `+ - * / \`、`= != <> > < >= <=`、`and or xor & | !`、括號；除法截斷小數 |
| 等待 | `#WA [毫秒]`／`#WAIT [毫秒]`；省略時間等下一行／提示；新的等待取代舊等待；巢狀 Alias／IF 維持先後順序 |
| 其他 | `#SHOW`／`#SAY` 僅本機輸出、`#SEND {文字}` 送至伺服器、`#UNALIAS`、`#UNTRIGGER`、`#UNVAR` |

`%w` 依舊版文件比對英文字母，不代表任何 Unicode 單字。中文以明確文字或 `*` 擷取。

## 本客戶端擴充

`#CAP {觸發文字} {分頁名稱}` 建立逐字包含比對的擷取規則，亦接受 `#cap【系統】連線精靈： system` 的緊接寫法。這是依使用需求新增的功能，不宣稱與 zMUD 官方同名命令相容。只比對完整的伺服器文字行，去除 ANSI 後將整行複製到指定分頁；原訊息保留。可用 `#UNCAP` 移除規則。

一般手動輸入會在主終端回顯（Alias 顯示輸入的別名，並非額外重複顯示展開後的每個指令）。送出後保留並全選內容；密碼模式清空且不回顯。

舊版 JSON 設定可直接載入，缺少的 `captures` 預設為空陣列。

## 明確限制與差異

- 不支援二進位 `.mud` 設定匯入；目前保存與匯入格式為本專案 JSON。
- 未支援 `[range]`、`{^string}`、巢狀擷取、跨行／狀態式 Trigger、動態建立 Trigger 的複雜求值模式。
- 相鄰無界萬用字元會拒絕，避免不明確且耗時的比對；Pattern 最長 1024 字元，單行觸發文字上限 16384 字元。
- 僅支援固定文字選項 `{a|b}`，選項內不能再放萬用字元。
- 沒有完整函數系統、清單／陣列、`#LOOP`、`#ALARM`、`#COLOR`、`#GAG`、`#CLASS` 階層、快捷鍵編輯、VBScript、外部程式執行。
- 引號中變數不展開；尚未完整支援 `<...>` 強制展開、遞迴函數求值、字元自訂、`a=b` 變數賦值模式與特殊 Alias（atconnect 等）。
- 參數展開後不重新按分號切割；避免伺服器擷取內容或使用者參數變成額外指令。這是刻意限制，不宣稱與所有 zMUD 邊界行為相同。
- 等待採非阻塞計時；暫停、斷線及成功重新載入規則會取消等待。等待上限為 2147483647 毫秒；省略時間以引擎收到下一筆完整行／提示為準，不是原始網路封包。
- 單次最多 200 個執行步驟、遞迴最多 24 層；超過後停止並報錯，已送出的指令無法回收。
- Prompt 以 160 ms 無新資料判定，與歷史 zMUD 封包／Prompt 判斷不保證完全一致；同一內容在更新前只觸發一次。
- 預設網頁 WSS，進階連線設定仍可選 Telnet 或自動切換。風雲再起 Telnet 用 Big5，原網頁 WSS 用 UTF-8；兩種方式共用相同 Trigger／Alias 引擎。WSS 依原客戶端以文字 frame 送遊戲指令、二進位 frame 處理 Telnet 協商。
- Telnet 支援 TTYPE、NAWS、ECHO、SGA、EOR；明確拒絕 MCCP、GMCP、MXP 等未支援選項。無地圖、狀態資料或聊天分流解析。
- 顯示使用終端元件，Trigger 以去除 ANSI 的文字比對；複雜游標重寫畫面不等於重新觸發完整畫面。
- 匯入規則不會自動執行。先檢查設定再連線、恢復觸發器。

## 驗證方式

`pnpm test` 使用官方文件中的 Alias、Trigger、延遲參數、變數及條件範例，加上串流 Telnet／ANSI 與每個 Big5 封包切點測試。這些是可重複的回歸測試，不代替與 zMUD 4.62 實機的完整差異測試。

## 顯示回歸驗證

使用與介面同版本的 xterm headless 檢查 NOR、粗體、背景與 RGB 色彩；每次 LF／CRLF 換行與本機回顯後重設色彩及字體效果，同一行跨封包保留樣式，並驗證跨封包的重設序列。固定欄數防止視窗寬度變動造成重新折行，已依使用者提供的 App／Web 截圖修正歡迎字圖：使用 Noto Sans Mono CJK TC 的全形符號寬度，關閉 xterm 單格框線替換，並調整行高使直線接合。測試資料中八行均為 84 格；不宣稱尚未提供的所有遊戲表格都已逐一驗證。
