// =============================================
// events.js — 事件資料
//
// 遊戲的故事：動物村要選村長，開票所的志工都很認真想幫忙，
// 可是有一點迷糊，偶爾會搞錯。玩家的任務是「提醒」他們，
// 讓大家順利選出村長。（教學卡的語氣：說明正確做法，不責備志工）
//
// 每一筆就是一種事件。想新增事件，照下面的格式加一筆就好。
//
// 欄位說明：
//   id       事件代號（英文，不能跟別的事件重複）
//   name     事件名稱（顯示在規則頁、結束頁）
//   targets  點擊目標：場景裡物件的 id，可以放好幾個，
//            出事時會隨機挑一個「現在沒事」的物件
//   visual   出事時物件要換成的外觀名稱，
//            對應 index.html 裡該物件的 <g data-show="外觀名稱">
//   isTrap   是不是陷阱（true = 看起來怪但其實沒問題，點了反而扣愛心）
//   weight   出現機率的比重（預設 1）。數字越大越常出現：
//            2 是 1 的兩倍、0.5 是一半、0 就完全不出現。
//            只跟「同一類」比：違規事件之間比、陷阱事件之間比。
//            （陷阱整體出現多少，由 config.js 的 trapRatio 決定）
//   alone    （可省略）true = 這個事件出現時，畫面上不會有其他事件
//            （例如停電整個畫面變暗，同時有別的事會看不清楚）
//   atStart  （可省略）true = 不會隨機出現，只在開場檢查封條時出現一次
//            （機率在 config.js 的 intro.sealBrokenChance）
//   sound    （可省略）出事時播放的音效名稱（sound.js 的 SOUNDS），例如關門聲
//   hint     （可省略）出事前先用大字顯示的提示，例如「不知為何停電了⋯」
//   hintSeconds （有 hint 才要寫）提示顯示幾秒後，事件才真的出現
//   card     教學卡文字（陷阱的話就是點了之後跳出的說明）
//   basis    依據：一個陣列，每一項是 { text: 顯示的文字, url: 連結 }，
//            可以用下面的 manual()、electionLaw()、criminalLaw() 來寫
//   stage    在第幾階段加入（目前只是記錄用）
//
// 場景裡可以當目標的物件 id：
//   door（門）、window-left / window-right（窗戶）、board（記票黑板）、
//   owl（貓頭鷹）、bear（熊，包含手上的選票和對話框）、rabbit（兔子）、
//   ballot-box（票匭）、piles（整票區）、squirrel（松鼠）、
//   spare（用餘票袋，浣熊也算在這裡）、corner（角落，躲著的浣熊）、
//   shadow（停電時的黑影）、aud-1 ～ aud-5（參觀民眾）
//
// 「手冊」指的是：中選會《115 年地方公職人員選舉及全國性公民投票
//  投開票所工作人員手冊》。
// ⚠️ 上線前：教學卡文字要再對照「最新版」的手冊和選罷法確認一次。
// =============================================

// ---------- 依據的連結 ----------

// 中選會《115 年地方公職人員選舉及全國性公民投票投開票所工作人員手冊》（PDF）
const MANUAL_URL = 'https://training-quiz.cec.gov.tw/115%20%E5%B9%B4%E5%9C%B0%E6%96%B9%E5%85%AC%E8%81%B7%E4%BA%BA%E5%93%A1%E9%81%B8%E8%88%89%E5%8F%8A%E5%85%A8%E5%9C%8B%E6%80%A7%E5%85%AC%E6%B0%91%E6%8A%95%E7%A5%A8%E6%8A%95%E9%96%8B%E7%A5%A8%E6%89%80%E5%B7%A5%E4%BD%9C%E4%BA%BA%E5%93%A1%E6%89%8B%E5%86%8A.pdf';

// 手冊的某一段。page 是 PDF 的第幾頁（不是手冊上印的頁碼），點連結會直接跳到那一頁
function manual(section, page) {
  return { text: `手冊（${section}）`, url: `${MANUAL_URL}#page=${page}` };
}

// 公職人員選舉罷免法第 n 條（全國法規資料庫）。note 寫這一條跟這個事件有關的是哪一部分
function electionLaw(n, note) {
  return { text: `選罷法第 ${n} 條（${note}）`, url: `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0020010&flno=${n}` };
}

// 刑法第 n 條（全國法規資料庫）
function criminalLaw(n, note) {
  return { text: `刑法第 ${n} 條（${note}）`, url: `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=C0000001&flno=${n}` };
}

const EVENTS = [
  // ----- 違規事件（要點） -----
  {
    id: 'window-closed',
    name: '窗戶被關起來',
    targets: ['window-left', 'window-right'],
    visual: 'closed',
    isTrap: false,
    weight: 0.5,
    sound: 'door',
    card: '開票是公開的，要讓大家都看得到。開票完畢以前，門窗都要開著喔！',
    basis: [manual('投票所及開票所之佈置', 11)],
    stage: 1,
  },
  {
    id: 'ballot-not-raised',
    name: '沒把票舉高',
    targets: ['bear'],
    visual: 'lowered', // 熊把票拿在胸前，背面朝外
    isTrap: false,
    weight: 1,
    card: '唱票時要把選票高高舉起、正面朝向參觀席，大家才看得到圈給誰。',
    basis: [manual('唱票管理員職務', 48)],
    stage: 1,
  },
  {
    id: 'wrong-call',
    name: '唱錯號次',
    targets: ['bear'], // 熊手上的選票、對話框都算在 bear 裡
    visual: 'wrong-call', // 票上蓋的號次和對話框唱的不一樣
    isTrap: false,
    weight: 1,
    card: '唱的號次要跟票上圈的一樣。看不清楚時，可以請唱票員再舉一次。',
    basis: [manual('唱票管理員職務', 48), electionLaw(57, '當眾唱名開票')],
    stage: 1,
  },
  {
    id: 'steal-blank',
    name: '浣熊偷拿空白票',
    targets: ['spare'],
    visual: 'steal', // 封條被撕開，浣熊抽出空白票
    isTrap: false,
    weight: 0.2,
    card: '沒用完的選票（用餘票）在投票結束後就清點、包封好了，開票時不能再拿出來。',
    basis: [manual('包封用餘票', 20), electionLaw(57, '用餘票要包封，不得開拆')],
    stage: 1,
  },

  // ----- 第二階段加入的違規事件 -----
  {
    id: 'door-closed',
    name: '門被關起來',
    targets: ['door'],
    visual: 'closed',
    isTrap: false,
    weight: 0.7,
    sound: 'door',
    card: '開票是公開的，要讓大家都看得到。開票完畢以前，門窗都要開著喔！',
    basis: [manual('投票所及開票所之佈置', 11)],
    stage: 2,
  },
  {
    id: 'stacked-ballots',
    name: '先疊成一疊才唱',
    targets: ['rabbit'],
    visual: 'stacked', // 兔子手上抱著一疊票
    isTrap: false,
    weight: 0.9,
    card: '檢票員要從票匭一張一張拿出來，馬上交給唱票員，不能先疊成一疊再唱。',
    basis: [manual('檢票管理員職務', 48)],
    stage: 2,
  },
  {
    id: 'invalid-called-valid',
    name: '廢票被當有效票唱',
    targets: ['bear'],
    visual: 'invalid', // 熊手上是廢票，卻照樣唱某號一票（廢票種類見 scene.js 的 INVALID_KINDS）
    isTrap: false,
    weight: 1,
    card: '遇到廢票要先停下來，請主任管理員和主任監察員當場認定，不能直接唱過去。廢票包括：完全沒圈、圈兩人以上、圈的位置看不出圈給誰、圈了又塗改、簽名蓋章按指印或寫字畫符號、沒用選委會的圈選工具、不是選委會發的票、票被撕破不完整、票面髒污看不出圈給誰。',
    basis: [electionLaw(64, '無效票的種類和認定'), manual('認定無效票要當場', 41), manual('無效票圖例', 85)],
    stage: 2,
  },
  {
    id: 'tally-wrong',
    name: '正字畫錯欄',
    targets: ['board'],
    visual: 'tally-wrong', // 貓頭鷹覆誦 A，最新的一筆正字（麥克筆停著的那筆）卻畫在 B 欄
    isTrap: false,
    weight: 1,
    card: '記票員每聽到一票，要跟著覆誦一次，再畫一筆在對的欄位。一個「正」字是 5 票。',
    basis: [manual('記票管理員職務', 49)],
    stage: 2,
  },
  {
    id: 'wrong-pile',
    name: '票放錯堆',
    targets: ['piles'],
    visual: 'wrong-pile', // 某一疊最上面那張，是別的候選人的票
    isTrap: false,
    weight: 1,
    card: '整票員要照候選人分好堆，每 100 張一疊，最後才好複算。',
    basis: [manual('整票計票管理員職務', 50)],
    stage: 2,
  },
  {
    id: 'secret-stamp',
    name: '浣熊偷拿章去蓋',
    targets: ['corner'],
    visual: 'secret-stamp', // 浣熊躲在角落拿圈選章蓋票
    isTrap: false,
    weight: 0.2,
    card: '開票時偷偷在票上蓋章，會讓開票結果不正確，要馬上請工作人員處理。',
    basis: [criminalLaw(146, '妨害投票正確')],
    stage: 2,
  },
  {
    id: 'seal-broken',
    name: '票匭封條破了',
    targets: ['ballot-box'],
    visual: 'seal-broken',
    isTrap: false,
    atStart: true, // 開票前才會檢查封條，所以只在開場出現一次
    card: '開票前，主任管理員和主任監察員要先確認票匭的封條和鎖都完好，才能打開。',
    basis: [manual('主任管理員職務：宣布開票', 40)],
    stage: 2,
  },
  {
    id: 'blackout-sneak',
    name: '停電有人靠近票匭',
    targets: ['shadow'],
    visual: 'sneak', // 畫面變暗，有黑影靠近票匭
    isTrap: false,
    weight: 0.1,
    alone: true,
    sound: 'powerdown',
    hint: '不知為何停電了⋯',
    hintSeconds: 1.5,
    card: '開票時停電，要馬上打開事先準備的照明。工作人員守在原位、顧好選票，不能離開。',
    basis: [manual('電燈失明開啟輔助照明設備', 40)],
    stage: 2,
  },
  {
    id: 'flash-photo',
    name: '用閃光燈拍照',
    targets: ['aud-1', 'aud-2', 'aud-3', 'aud-4', 'aud-5'],
    visual: 'flash', // 民眾的手機閃光，整個畫面也會跟著閃
    isTrap: false,
    weight: 1,
    sound: 'shutter',
    card: '開票時可以錄影、拍照，但不能開閃光燈或補光燈，也不能越過參觀席、擋住別人。',
    basis: [manual('民眾開票攝影應制止的行為', 41), electionLaw(65, '干擾開票可令其退出')],
    stage: 2,
  },

  // ----- 陷阱事件（其實沒問題，點了反而扣愛心） -----
  {
    id: 'trap-filming',
    name: '民眾在錄影',
    targets: ['aud-1', 'aud-2', 'aud-3', 'aud-4', 'aud-5'],
    visual: 'filming', // 民眾舉手機錄影（沒開閃光燈）
    isTrap: true,
    weight: 1,
    card: '這沒問題！開票時任何人都可以錄影、拍照，只要不開閃光燈、不越過參觀席就好。',
    basis: [manual('中選會 104 年第 470 次委員會議決議，收在附錄十五', 135)],
    stage: 1,
  },
  {
    id: 'trap-line-stamp',
    name: '圈在格線上被算有效',
    targets: ['bear'],
    visual: 'line-stamp', // 章印壓在格線上，但看得出投給誰，熊唱有效
    isTrap: true,
    weight: 1,
    card: '這是有效票！章印壓到格線，但還看得出圈給誰，就算有效。',
    basis: [manual('選舉票有效票圖例', 82)],
    stage: 2,
  },
];
