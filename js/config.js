// =============================================
// config.js — 遊戲設定（難度、計分、候選人）
//
// 想調整難度，改這個檔案的數字就好，
// 存檔後在瀏覽器按「重新整理」就會生效。
// 時間的單位都是「秒」。
// =============================================

const CONFIG = {
  // 一開始有幾顆愛心
  maxHearts: 5,

  // 開場：主任管理員每句話顯示幾秒（開始開票 → 領票人數 → 檢查封條）；
  // sealBrokenChance：檢查封條時，封條是破的機率（0.4 = 40%，整局只會在這時候出現一次）
  intro: {
    lineSeconds: 1.3,
    sealBrokenChance: 0.4,
  },

  // 開場說完、開始唱票後，第一個事件幾秒後出現
  firstEventDelay: 1.5,

  // 事件產生間隔：
  // 一開始每 8 秒出一個事件，每出一個就把間隔 ×0.8（越來越快），最快 0.7 秒
  spawnInterval: {
    start: 8.0,
    multiplier: 0.8,
    min: 0.7,
  },

  // 事件存活時間（這段時間內沒點到就算漏掉）：
  // 一開始 6 秒，每過 10 秒就 ×0.93（越來越短），最短 1.4 秒
  lifetime: {
    start: 6.0,
    multiplier: 0.93,
    everySeconds: 10,
    min: 1.4,
  },

  // 同時存在的事件數上限：
  // 遊戲進行到第 fromSecond 秒之後，上限變成 count 個
  maxActive: [
    { fromSecond: 0, count: 1 },
    { fromSecond: 50, count: 2 },
    { fromSecond: 100, count: 3 },
  ],

  // 陷阱事件比例（0.15 = 15%）：
  // 前 20 秒沒有陷阱；第 20 秒開始是 15%，之後每 10 秒 +1%，最高 25%
  trapRatio: {
    startSecond: 20,
    start: 0.15,
    stepEverySeconds: 10,
    step: 0.01,
    max: 0.25,
  },

  // 事件快過期前幾秒，出事的物件才開始輕輕抖動提醒（在這之前不會抖）
  warnSeconds: 1.0,

  // 同一個物件的事件結束後，要隔幾秒才能再出事
  // （讓玩家看得到物件變回正常，不會以為沒點到）
  targetCooldown: 2.0,

  // 計分
  score: {
    base: 100, //               成功制止的基本分
    speedBonusMax: 100, //      速度加分最多幾分（點得越快越多）
    comboStep: 0.1, //          每多連擊一次，倍率 +0.1
    comboMaxMultiplier: 2.0, // 倍率最高 ×2.0
    misclickPenalty: 30, //     亂點沒事的地方扣幾分
  },

  // 最後核對投開票報告表：有效票＋無效票＋已領未投票 要等於 開場宣布的領票人數
  voteCheck: {
    unit: 10, //         所有票數都是 10 的倍數，比較好加
    minVoters: 100, //   領票人數最少
    maxVoters: 200, //   領票人數最多
    maxInvalid: 20, //   無效票最多幾張（最少 1 個 unit）
    maxUnvoted: 10, //   已領未投票最多幾張（領了票、沒投進票匭的；最少 0）
    wrongChance: 0.5, // 最後宣布的票數「算錯」的機率（0.5 = 一半）
    rightBonus: 200, //  判斷對了加幾分
    wrongPenalty: 300, // 判斷錯了（沒發現對不起來，或其實對得起來卻說有問題）扣幾分
  },
};

// 候選人（全部是虛構的動物，不代表任何真實政黨或人物）
// 每一局開始時會打亂順序：排第一個的就是 1 號，第二個是 2 號……
const CANDIDATES = [
  { emoji: '🐱', name: '貓咪' },
  { emoji: '🐶', name: '柴犬' },
  { emoji: '🦜', name: '鸚鵡' },
];
