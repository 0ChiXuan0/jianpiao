# 監票大作戰（第二階段）

手機優先的反應速度小遊戲：動物村要選村長，開票所的志工有點迷糊，看到他們搞錯就用最快的速度點一下提醒他們。
規格請看 [SPEC.md](SPEC.md)。

目前完成：第一階段 MVP＋第二階段（15 個事件、先了解規則頁、音效、背景音樂）＋開場宣布／檢查封條、結束展示空票匭、核對投開票報告表。排行榜不做了。

## 檔案結構

```
index.html      首頁／先了解規則／遊戲／結束頁＋整個開票所的 SVG 場景
css/style.css   版面、配色、動畫（抖動提醒、動物的呼吸和小動作）
js/config.js    難度、計分、候選人 ← 調難度改這裡
js/events.js    事件資料          ← 加事件、調事件出現頻率改這裡
js/sound.js     音效和背景音樂（用瀏覽器內建功能合成，沒有音檔、沒有版權問題）
js/scene.js     場景外觀、背景開票動畫、開場／結束、大字公告、規則頁截圖
js/game.js      遊戲迴圈、產生事件、點擊判定、計分、愛心、報告表票數
js/ui.js        切換畫面、規則頁、HUD、聲音開關、提示視窗、核對票數、結束頁
js/track.js     匿名統計（Umami）：記錄事件的小工具
img/share.png   分享預覽圖（原始檔 share.svg）
tools/          做圖用的小工具（網站本身用不到）
```

---

## 1. 怎麼打開測試

### 在電腦上

在 Finder 裡**直接雙擊 `index.html`** 就能玩（Chrome、Safari、Edge 都可以），不需要安裝任何東西。

用手機尺寸預覽（建議 390×844）：

- **Chrome**：按 `Cmd + Option + I` 打開開發者工具，再按 `Cmd + Shift + M` 切到手機模式，上方選「iPhone 12 Pro」或自己輸入 390 × 844。
- **Safari**：選單「開發」→「進入響應式設計模式」（沒有「開發」選單的話，先到「設定 → 進階」勾選「顯示網頁開發者功能」）。

改完程式後，在瀏覽器按 `Cmd + R` 重新整理就會看到新版本。如果看起來沒變，按 `Cmd + Shift + R` 強制重新整理（瀏覽器有時會用舊的暫存檔）。

> 想看所有事件的說明和截圖：首頁按「先了解規則」。

### 在手機上

手機和電腦要連**同一個 Wi-Fi**。

1. 打開「終端機」，切到遊戲資料夾：
   ```bash
   cd ~/Documents/監票遊戲
   ```
2. 開一個本機伺服器（Mac 內建 Python，不用另外安裝）：
   ```bash
   python3 -m http.server 8000
   ```
   第一次執行時，macOS 可能會問「終端機」能不能存取「文件」資料夾，或防火牆要不要允許連入，都按允許。
3. 查電腦的區域網路 IP：
   ```bash
   ipconfig getifaddr en0
   ```
   會顯示像 `192.168.1.23` 這樣的數字。
4. 用手機瀏覽器打開 `http://192.168.1.23:8000`（換成你查到的 IP）。
5. 測完回到終端機按 `Ctrl + C` 關掉伺服器。

> 小提醒：iPhone 的 Safari 不支援震動回饋，Android 才會震動。iPhone 開了靜音模式時，iOS 16.4 以上會照常播放（程式有設定），更舊的版本要關掉靜音模式才聽得到。

---

## 2. 想調整難度

全部在 **`js/config.js`**，改數字 → 存檔 → 重新整理。

| 想調整的 | 改哪個 | 目前的值 |
|---|---|---|
| 一開始有幾顆愛心 | `maxHearts` | 5 |
| 第一個事件多久出現 | `firstEventDelay` | 1.5 秒 |
| 事件多久出一個 | `spawnInterval.start` | 8.0 秒 |
| 變快的速度 | `spawnInterval.multiplier` | 每出一個 ×0.8 |
| 最快多久出一個 | `spawnInterval.min` | 0.7 秒 |
| 事件多久沒點算漏掉 | `lifetime.start` | 6.0 秒 |
| 存活時間縮短的速度 | `lifetime.multiplier`、`lifetime.everySeconds` | 每 10 秒 ×0.93 |
| 最短存活時間 | `lifetime.min` | 1.4 秒 |
| 同時最多幾個事件 | `maxActive` | 1 → 50 秒後 2 → 100 秒後 3 |
| 陷阱比例 | `trapRatio` | 20 秒後 15%，每 10 秒 +1%，最高 25% |
| 快過期前幾秒開始抖動提醒 | `warnSeconds` | 1.0 秒 |
| 同一物件出事的冷卻時間 | `targetCooldown` | 2.0 秒 |
| 成功提醒的基本分 | `score.base` | 100 |
| 速度加分上限 | `score.speedBonusMax` | 100 |
| 連擊倍率 | `score.comboStep`、`score.comboMaxMultiplier` | 每次 +0.1，最高 ×2.0 |
| 亂點扣分 | `score.misclickPenalty` | 30 |
| 開場每句話顯示多久 | `intro.lineSeconds` | 1.3 秒（共 3 句） |
| 開場封條是破的機率 | `intro.sealBrokenChance` | 0.4 |
| 領票人數範圍 | `voteCheck.minVoters`、`voteCheck.maxVoters` | 100～200（都是 `voteCheck.unit` = 10 的倍數） |
| 已領未投票最多幾張 | `voteCheck.maxUnvoted` | 10 |
| 報告表算錯的機率 | `voteCheck.wrongChance` | 0.5 |
| 核對票數判斷對／錯 | `voteCheck.rightBonus`、`voteCheck.wrongPenalty` | +200／-300 |

**想讓遊戲簡單一點**：`spawnInterval.start` 調大（例如 10.0）、`spawnInterval.multiplier` 調大（例如 0.9，變快得慢一點）、`lifetime.start` 調大（例如 7.0）、`lifetime.min` 調大（例如 2.0）、`warnSeconds` 調大（提早抖動提醒）。

### 想讓某個事件多出現或少出現

改 **`js/events.js`** 裡那個事件的 `weight`（預設 1）：

- `weight: 2` → 出現機會是其他事件的兩倍
- `weight: 0.5` → 只有一半
- `weight: 0` → 完全不出現（暫時關掉某個事件很方便）

`weight` 只跟同一類比（違規事件之間、陷阱事件之間）。陷阱整體出現多少是 `config.js` 的 `trapRatio` 決定的。

遊戲會先照 `weight` 抽好下一個事件，如果它的物件正在出事或冷卻中，就**等它有空**，不會改抽別的。所以實際出現的比例會很接近 `weight` 的比例。

### 想改音效或背景音樂

在 **`js/sound.js`**：

- 音效在 `SOUNDS`。每個音效由幾個「音」組成，`freq` 是音高（數字越大越高）、`at` 是第幾秒開始、`len` 是長度；`type: 'noise'` 是沙沙的雜音（關門、快門）。
- 想讓某個事件出現時發出聲音：在 `events.js` 那個事件加 `sound: '音效名稱'`。
- 背景音樂在 `MUSIC`：`melody` 是旋律（60 = 中央 Do，每 +1 升半音，`null` 是休息），`bass` 是低音，`beat` 是速度（數字越小越快）。

---

## 3. 想新增事件

### 情況 A：物件已經有這個外觀

只要在 **`js/events.js`** 的 `EVENTS` 陣列加一筆，格式：

```js
{
  id: '事件代號',
  name: '事件名稱',
  targets: ['window-left', 'window-right'], // 可以點的物件
  visual: 'closed',                          // index.html 裡已經畫好的外觀
  isTrap: false,
  weight: 1,
  card: '教學卡文字',
  basis: [manual('手冊的段落名稱', PDF 第幾頁), electionLaw(條號)], // 依據，會自動變成連結
  stage: 3,
},
```

`basis` 的寫法（`js/events.js` 最上面有這三個小工具）：

- `manual('唱票管理員職務', 48)`：手冊，48 是 **PDF 的第幾頁**（手冊上印的頁碼 ＋4），點連結會直接跳到那一頁
- `electionLaw(57, '當眾唱名開票')`：選罷法第 57 條（全國法規資料庫），第二個字串寫這一條跟事件有關的是哪一部分
- `criminalLaw(146, '妨害投票正確')`：刑法第 146 條

其他可以加的欄位（都可省略）：

- `alone: true`：出現時畫面上不會有其他事件（像停電）
- `sound: 'door'`：出現時播放音效
- `hint: '提示文字'`＋`hintSeconds: 1.5`：先用大字顯示提示，過幾秒事件才真的出現（像停電）
- `atStart: true`：不隨機出現，只在開場出現（目前只有封條破了，寫在 `game.js` 的 `checkIntro()`）

規則頁會自動多一張卡片和截圖。截圖要截哪一塊，寫在 `js/scene.js` 的 `SNAP_VIEWS`（新的可點物件要記得加）。

### 情況 B：物件需要新的外觀

1. **在 `index.html` 畫出「出事版」**：找到那個物件（例如 `<g id="door" class="obj">`），在 `<g class="wob">` 裡面加一組新的外觀：
   ```html
   <g data-show="新外觀名稱">
     <!-- 這裡畫出事的樣子 -->
   </g>
   ```
   程式一次只會顯示一個 `data-show`：平常顯示 `normal`（或物件上 `data-default` 寫的那個），出事時顯示事件的 `visual`。
   可以參考門的 `data-show="closed"`、票匭的 `data-show="seal-broken"` 怎麼畫。
2. **在 `js/events.js` 加一筆**，`targets` 寫物件 id、`visual` 寫新外觀名稱。

### 情況 C：要加新的可點物件

在 `index.html` 的 SVG 裡加一個群組，照這個格式：

```html
<g id="新物件的id" class="obj">
  <g class="wob">                       <!-- 快過期時會抖動提醒的部分 -->
    <g data-show="normal">…平常的樣子…</g>
    <g data-show="出事外觀">…出事的樣子…</g>
  </g>
  <rect class="hit" x="…" y="…" width="…" height="…"/>  <!-- 透明點擊區，至少 48×48 -->
</g>
```

再到 `events.js` 把 `targets` 設成這個 id。

- 平常看不到、只有出事時才出現的物件（像角落的浣熊 `corner`、停電的黑影 `shadow`），點擊區也要包在出事外觀的 `data-show` 裡，平常才不會擋到別的物件。
- 如果是動物，把身體包在 `<g class="bob">` 裡就會呼吸；眼睛包在 `<g class="eyes">` 裡就會眨眼。再到 `js/scene.js` 的 `IDLE_ACTIONS` 加上它會做哪些小動作。

### 需要寫程式的特殊事件

大部分事件只要「換外觀」，不用寫程式。但下面這些跟背景開票動畫連在一起，寫在 **`js/scene.js`**：

| 事件 | 處理的地方 |
|---|---|
| 照開票順序發生的事件（兔子疊票、熊的事件、正字畫錯、票放錯堆） | `TIMED_VISUALS` 清單、`enterStep()`、`revealTimed()` |
| 熊的事件（沒舉高、唱錯、廢票照唱、壓線陷阱） | `prepareBearBallot()`、`endBearEvent()` |
| 正字畫錯、票放錯堆結束時改回來 | `endTallyWrong()`、`endWrongPile()` |
| 停電（大家停下來） | `PAUSE_VISUALS` 清單 |
| 停電的「先提示、再出現」 | `showEvent()`、`updateReveal()` |
| 閃光燈讓整個畫面閃 | `showEvent()`、`clearEvent()`，CSS 的 `.flashing` |
| 廢票的種類 | `INVALID_KINDS` 清單、`drawInvalidBallot()` |
| 開場宣布、檢查封條 | `startIntro()`、`updateIntro()`、`atSealCheck()`，`js/game.js` 的 `checkIntro()` |
| 結束：展示空票匭 | `endCounting()`、`showEmptyBox()`，`js/game.js` 的 `endGame()` |
| 最後核對報告表 | `js/game.js` 的 `makeVoteCount()`、`answerVoteCheck()`，`js/ui.js` 的 `showVoteCheck()` |
| 規則頁的截圖 | `snapshot()`、`SNAP_VIEWS` |
| 不能同時出事的物件（例如熊和黑板） | `LINKED` 清單 |

---

## 4. 想直接改文案

| 想改的文字 | 檔案 | 找什麼 |
|---|---|---|
| 事件名稱、教學卡、依據、停電提示 | `js/events.js` | `name`、`card`、`basis`、`hint` |
| 首頁、規則頁的標題和說明、結果頁的呼籲和參考連結、核對畫面的固定文字 | `index.html` | 直接搜尋那段文字 |
| 主任管理員的大字公告（開場、票開完了）、兔子展示空票匭 | `js/scene.js` | `startIntro`、`endCounting`、`showEmptyBox` |
| 唱票的對話框（「2 號 🐶 柴犬 一票」「更正：」「啊，這張是廢票！」「無效票 1 票」） | `js/scene.js` | `callText`、`endBearEvent`、`enterStep` |
| 飄字（提醒！、沒注意到⋯）、點錯時的說明視窗、暫停視窗、報告表貼出來的公告 | `js/game.js` | `floatText`、`showModal`、`showBanner` |
| 核對票數的答案說明、結果頁的「沒提醒到 N 次」等小標籤 | `js/ui.js` | `answerVoteCheck`、`showEnd` |

不確定在哪裡的話：在編輯器裡按 `Cmd + Shift + F`，搜尋畫面上看到的那幾個字。

---

## 5. 網站

- 網址：https://0chixuan0.github.io/jianpiao/
- 程式碼：https://github.com/0ChiXuan0/jianpiao （GitHub Pages，從 `main` 分支的最上層發布）

改完程式想更新網站，在終端機依序執行：

```bash
cd ~/Documents/監票遊戲
git add -A
git commit -m "說明這次改了什麼"
git push
```

push 完大約 1 分鐘，網站就會更新（手機看不到新版的話，重新整理一下）。

### 分享預覽（貼連結時顯示的圖和標題）

- 設定在 `index.html` 最上面的 `og:` 那幾行（標題、說明、圖片網址）
- 圖片是 `img/share.png`（1200×630），原始檔是 `img/share.svg`。改了 SVG 之後，在終端機的遊戲資料夾裡執行：

```bash
swift tools/render-svg.swift img/share.svg img/share.png 1200 630
```

```bash
sips -z 630 1200 img/share.png
```

- Threads、LINE、FB 會把預覽存起來一段時間，改了圖之後不一定馬上看到新的。FB 可以用 [分享偵錯工具](https://developers.facebook.com/tools/debug/) 要它重新抓

---

## 6. 統計：多少人玩、玩到哪裡

用 [Umami Cloud](https://cloud.umami.is)（免費方案）做匿名統計：不使用 cookie、不收集姓名或聯絡資料，首頁最下面有一行說明。

- 報表：登入 https://cloud.umami.is 查看
- 程式：`index.html` 的 `<head>` 有一行 Umami 的程式碼（`data-website-id` 是網站代號，不是密碼，公開沒關係）；`js/track.js` 是記錄事件的小工具
- 只記錄正式網站（`data-domains`），在自己電腦上測試不會算進去，而是印在瀏覽器的 Console（Chrome 按 `Cmd + Option + J`）
- 瀏覽器有開「不要追蹤」、或裝了廣告阻擋器的人不會被記錄，所以數字會比實際少一些

記錄的事件：

| 事件 | 什麼時候 | 附帶資料 |
|---|---|---|
| （瀏覽，自動） | 打開網站 | 從哪裡點進來、裝置、國家／城市 |
| `sound-on`／`sound-off` | 按聲音開關 | `screen` 在哪個畫面 |
| `rules-open` | 進「先了解規則」 | — |
| `game-start` | 開始一局 | `from`：home／rules／again，`game`：這次打開網頁後的第幾局 |
| `seal-check` | 開場說完 | `result`：ok 封條沒破／reminded 有提醒到／missed 沒提醒到 |
| `game-progress` | 撐過 30、60、90、120、180 秒 | `seconds` |
| `game-over` | 愛心用完 | `seconds`、`score`、`maxCombo`、`missed` 沒提醒到的事件、`traps` 點了的陷阱 |
| `vote-check` | 核對報告表作答 | `correct` 對不對、`reportWrong` 報告表本身有沒有算錯 |
| `end-view` | 看到結果頁 | — |
| `play-again`／`go-home` | 結果頁的按鈕 | — |
| `link-click` | 點另開分頁的連結 | `link` 連結文字、`screen` |
| `leave` | 關掉網頁或切到別的 App | `screen`，遊戲中的話還有 `seconds` |

想看「每一步留下幾成人」：在 Umami 的「Reports → Funnel」新增漏斗，依序選 `game-start` → `game-progress` → `game-over` → `vote-check` → `end-view` → `link-click`。

想分開看從哪個管道來：分享時在網址後面加 `?utm_source=line`（或 fb、ig），Umami 的 UTM 報表會分開統計。

想加新的事件：在要記錄的地方加一行 `Track.event('事件名稱', { 附帶資料 })`。

---

## 上線前提醒

- [ ] 教學卡文字要再對照**最新版**的中選會投開票所工作人員手冊和選罷法確認一次（`js/events.js` 的 `card` 和 `basis`）。
- [ ] `door-closed` 的教學卡原本規格寫「同上。…」，因為結束頁會單獨顯示，已改成完整句子，請一併確認。
- [ ] 廢票的種類和 `invalid-called-valid` 的教學卡，要對照最新的中選會有效無效票認定圖例。
- [ ] 核對票數的說明（有效票＋無效票＋已領未投票＝領票人數，對不起來要重新點算，`js/ui.js` 的 `answerVoteCheck`）已對照 115 年手冊，正式上線時若有新版手冊再確認一次。
- [x] 選罷法第 57、64、65 條和刑法第 146 條：已用全國法規資料庫確認條文內容，教學卡的依據也直接連過去。
- [ ] 「看中選會教學影片」連結（`index.html`，YouTube 第 1550 秒開始）上線前點一次，確認影片還在。
