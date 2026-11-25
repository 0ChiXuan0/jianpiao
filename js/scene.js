// =============================================
// scene.js — 開票所場景
//
// 負責「畫面上看得到的東西」：
//   - 開場（主任管理員宣布開始開票、領票人數、檢查封條）和結束（展示空票匭）
//   - 背景開票動畫（兔子拿票 → 熊拿到票 → 舉票 → 唱票 → 貓頭鷹覆誦、畫正字 → 熊把票交給松鼠 → 松鼠放票）
//   - 動物隨機的小動作（眨眼、歪頭、跳一下……）
//   - 事件發生 / 快過期 / 結束時，切換物件的外觀
//   - 黑板上的正字、整票區的票堆
//   - 飄字特效（+分數、沒注意到）、畫面上方的大字公告
//   - 「先了解規則」頁面用的事件截圖
//
// 場景的圖都畫在 index.html 的 <svg id="scene"> 裡。
// =============================================

// 用 JavaScript 建立 SVG 元素時需要的「命名空間」
const SVG_NS = 'http://www.w3.org/2000/svg';

const Scene = {
  el: {}, //              常用的 SVG 元素（setup 時找好存起來）
  candidates: [], //      這一局的候選人（陣列順序 = 號次，第 0 個是 1 號）
  tally: [0, 0, 0, 0], // 計票紙上每一欄畫了幾筆（1 號、2 號、3 號、無效票）
  piles: [0, 0, 0], //    整票區每一疊有幾張
  invalidPile: 3, //      廢票堆有幾張
  wrongPile: null, //     「票放錯堆」事件：{ pile: 哪一疊, shows: 最上面那張其實是誰的票 }
  eventVisuals: {}, //    每個出事物件現在的外觀，例如 { bear: 'wrong-call' }
  timed: {}, //           等著在對的步驟發生的事件，例如 { bear: { visual, armed, shown, called } }
  frozen: new Set(), //   讓背景開票動畫暫停的事件（存物件 id）
  cycle: { step: 0, time: 0, ballot: 0, invalid: false, wrongColumn: 0 },
  idleTimer: 0, //        距離下一個隨機小動作還有幾毫秒
  intro: null, //         開場宣布中：{ time: 過了幾毫秒, line: 說到第幾句, lines: 要說的話, doneAt: 什麼時候說完 }
  pendingReveal: null, // 先出提示、等一下才出現的事件（停電）：{ targetId, visual, ms: 還要等幾毫秒 }

  // 背景開票動畫的步驟，duration 單位是毫秒（1000 = 1 秒）
  STEPS: [
    { name: 'take', duration: 700 }, //   兔子從票匭拿票
    { name: 'pass', duration: 400 }, //   票傳給熊
    { name: 'hold', duration: 500 }, //   熊拿到票，先拿在胸前（還沒舉、還沒唱）
    { name: 'raise', duration: 500 }, //  熊把票舉高，正面給參觀席看（還沒唱）
    { name: 'call', duration: 1000 }, //  票舉著，熊開始唱票
    { name: 'tally', duration: 900 }, //  熊的票還舉著；貓頭鷹跟著覆誦一次，同時畫一筆正字
    { name: 'give', duration: 400 }, //   熊把票交給松鼠（手冊：唱完票交給整票員）
    { name: 'pile', duration: 500 }, //   松鼠把票放到對應的那一疊
  ],

  // 傳遞中的選票會經過的位置（SVG 座標）
  POINTS: {
    box: { x: 200, y: 312 }, //       票匭投票口
    bear: { x: 66, y: 292 }, //       熊的手
    squirrel: { x: 78, y: 498 }, //   松鼠的手
  },

  // 計票紙的格子：每欄 2 小欄（左邊界 x）、3 列（上邊界 y）。第 4 欄是無效票
  SHEET_CELLS: [[121, 141.5], [165, 188.5], [212, 235.5], [259, 282.5]],
  SHEET_ROWS: [149, 173, 197],
  INVALID_COLUMN: 3,
  BALLOT_COLUMNS: [45.3, 72, 98.7], // 選票上三欄的中心 x
  PILE_CENTERS: [125, 190, 255], //      三疊票的中心 x

  // 「正」字的 5 筆，用 0～1 的比例表示（0,0 是左上角，1,1 是右下角）
  ZHENG_STROKES: [
    [0.1, 0.1, 0.9, 0.1], //    第 1 筆：上面的橫
    [0.5, 0.1, 0.5, 0.9], //    第 2 筆：中間的直
    [0.5, 0.5, 0.85, 0.5], //   第 3 筆：中間右邊的短橫
    [0.18, 0.45, 0.18, 0.9], // 第 4 筆：左下的短直
    [0.0, 0.9, 1.0, 0.9], //    第 5 筆：最下面的長橫
  ],

  // 這幾組物件共用同一個角色或同一段動畫，同時只能有一個出事
  LINKED: [
    ['bear', 'board'], //   「正字畫錯」也要用到熊的對話框
    ['spare', 'corner'], // 搗蛋的浣熊只有一隻
  ],

  // 這些外觀出現時，背景開票動畫要暫停（大家停下來），對話框也先藏起來
  PAUSE_VISUALS: ['sneak'],

  // 跟開票順序連在一起的事件：不會突然冒出來，要等背景開票動畫走到對的那一步才發生。
  //   arm  在哪一步「準備」（例如熊拿到票時，就把廢票畫好）
  //   show 在哪一步「出錯」（玩家從這時候開始才點得到）
  // 開票順序：兔子拿票 → 熊拿到票 → 舉票 → 唱票 → 貓頭鷹覆誦＋畫正字 → 熊交給松鼠 → 松鼠放票
  TIMED_VISUALS: {
    stacked: { arm: 'take', show: 'take' }, //          兔子拿票時，一次抱了一疊
    lowered: { arm: 'hold', show: 'raise' }, //         熊該舉票的時候沒舉，拿在胸前就唱
    'wrong-call': { arm: 'hold', show: 'call' }, //     熊唱票時唱錯號次
    invalid: { arm: 'hold', show: 'call' }, //          熊拿到的是廢票，唱票時照樣唱某號一票
    'line-stamp': { arm: 'hold', show: 'call' }, //     陷阱：壓線但有效的票，正常唱
    'tally-wrong': { arm: 'tally', show: 'tally' }, //  貓頭鷹覆誦時，正字畫錯欄
    'wrong-pile': { arm: 'pile', show: 'pile' }, //     松鼠放票時，放錯堆
  },

  // 開場最後一句說完、封條也沒問題後，「開始唱票！」要顯示多久（毫秒）
  INTRO_END_MS: 800,

  // 「先了解規則」頁的截圖：每個物件要截哪一塊（SVG 座標：x y 寬 高，都是 3:2）
  SNAP_VIEWS: {
    door: '-10 50 300 200',
    'window-left': '60 0 270 180',
    'window-right': '120 0 270 180',
    board: '100 100 290 193',
    bear: '0 180 300 200',
    rabbit: '180 200 210 140',
    'ballot-box': '120 270 150 100',
    piles: '90 425 300 200',
    corner: '40 520 180 120',
    spare: '195 495 195 130',
    shadow: '120 220 240 160',
    'aud-3': '120 595 180 120',
  },

  // 廢票的種類（參考中選會的無效票圖例），「廢票被當有效票唱」事件會隨機挑一種
  INVALID_KINDS: [
    'blank', //    完全沒圈
    'double', //   圈了兩個人以上
    'between', //  圈在兩欄正中間，看不出圈給誰
    'crossed', //  圈了又塗改
    'marked', //   簽名、蓋自己的章、按指印、畫符號
    'triangle', // 不是用選委會的圈選章（自己畫的三角形）
    'fake', //     不是選委會發的票（像影印的：灰色的紙、候選人也是灰的、沒有紅色關防）
    'torn', //     票被撕破，票面不完整
    'smudge', //   票面髒掉，看不出圈給誰
  ],
  // 「簽名、蓋章、按指印、畫符號」這一種，再隨機挑一個記號
  MARKS: ['sign', 'seal', 'print', 'check'],

  // 每隻動物會隨機做的小動作（對應 style.css 的 act-xxx）
  IDLE_ACTIONS: {
    bear: ['blink', 'tilt', 'hop'],
    rabbit: ['blink', 'ear', 'hop', 'tilt'],
    owl: ['blink', 'tilt', 'hop'],
    squirrel: ['blink', 'hop', 'tilt'],
    'aud-1': ['tilt', 'hop', 'look'],
    'aud-2': ['tilt', 'hop', 'look'],
    'aud-3': ['tilt', 'hop', 'look'],
    'aud-4': ['tilt', 'hop', 'look'],
    'aud-5': ['tilt', 'hop', 'look'],
    spare: ['blink', 'tilt'],
    corner: ['blink', 'tilt'],
  },
  // 每個小動作多長（毫秒），要跟 style.css 的動畫時間一樣
  ACTION_MS: { blink: 250, tilt: 900, hop: 450, look: 1200, ear: 500 },
  // 只有出事時才看得到的動物（浣熊），沒出現時就不用做動作
  EVENT_ONLY_ANIMALS: ['spare', 'corner'],

  // 網頁載入時呼叫一次：把常用的元素找好
  setup() {
    const byId = (id) => document.getElementById(id);
    Scene.el = {
      svg: byId('scene'),
      wrap: byId('scene-wrap'),
      bear: byId('bear'),
      rabbit: byId('rabbit'),
      owl: byId('owl'),
      squirrelHop: byId('squirrel-hop'),
      bubble: byId('bubble'),
      bubbleText: byId('bubble-text'),
      owlBubble: byId('owl-bubble'),
      owlBubbleText: byId('owl-bubble-text'),
      banner: byId('banner'),
      bannerWho: byId('banner-who'),
      bannerText: byId('banner-text'),
      // 熊手上的選票，和廢票的各種記號
      ballotPaper: byId('ballot-paper'),
      ballotBg: byId('ballot-bg'),
      ballotGrid: byId('ballot-grid'),
      ballotOfficial: byId('ballot-official'),
      stamp: byId('ballot-stamp'),
      stamp2: byId('ballot-stamp-2'),
      cross: byId('ballot-cross'),
      triangle: byId('ballot-triangle'),
      tear: byId('ballot-tear'),
      smudge: byId('ballot-smudge'),
      marks: {
        sign: byId('ballot-sign'),
        seal: byId('ballot-seal'),
        print: byId('ballot-print'),
        check: byId('ballot-check'),
      },
      pen: byId('tally-pen'),
      flyer: byId('flyer'),
      fx: byId('fx'),
    };

    // 每隻動物的呼吸速度和開始時間都隨機，看起來才不會整齊劃一
    document.querySelectorAll('#scene .bob').forEach((bob) => {
      bob.style.setProperty('--breath', (1.8 + Math.random() * 1.4).toFixed(2) + 's');
      bob.style.setProperty('--breath-delay', (-Math.random() * 3).toFixed(2) + 's');
    });
  },

  // 每一局開始時呼叫：把場景恢復成乾淨的狀態
  reset(candidates) {
    const el = Scene.el;
    Scene.candidates = candidates;
    Scene.tally = [0, 0, 0, 0];
    Scene.piles = [0, 0, 0];
    Scene.invalidPile = 3;
    Scene.wrongPile = null;
    Scene.eventVisuals = {};
    Scene.timed = {};
    Scene.frozen.clear();

    // 把這一局的候選人號次填到選票、黑板、票堆上
    candidates.forEach((candidate, i) => {
      const label = `${i + 1} ${candidate.emoji}`;
      document.getElementById('ballot-emoji-' + i).textContent = candidate.emoji;
      document.getElementById('board-head-' + i).textContent = i + 1;
      document.getElementById('board-emoji-' + i).textContent = candidate.emoji;
      document.getElementById('pile-label-' + i).textContent = label;
      Scene.drawTally(i);
      Scene.drawPile(i);
    });
    Scene.drawTally(Scene.INVALID_COLUMN);
    Scene.drawInvalidPile();
    el.pen.style.display = 'none';

    // 所有物件回到平常的外觀，拿掉抖動和小動作
    document.querySelectorAll('#scene .obj').forEach((obj) => {
      obj.classList.remove('has-event', 'warn');
      for (const action in Scene.ACTION_MS) obj.classList.remove('act-' + action);
      obj.removeAttribute('data-acting');
      Scene.setVariant(obj, Scene.defaultVariant(obj));
    });
    Scene.hideBubble();
    Scene.hideOwlBubble();
    Scene.hideFlyer();
    el.svg.classList.remove('hush');
    el.wrap.classList.remove('flashing');
    el.rabbit.style.display = '';
    el.fx.replaceChildren();
    Scene.hideBanner();

    // 背景動畫回到第一步，但要等開場宣布完（startIntro）才開始動
    Scene.cycle = { step: 0, time: 0, ballot: 0, invalid: false, wrongColumn: 0 };
    Scene.intro = null;
    Scene.pendingReveal = null;
  },

  // ---------- 開場和結束 ----------

  // 開場：主任管理員宣布開始開票、宣布領票人數，再檢查票匭的封條和鎖。
  // 每句話顯示 CONFIG.intro.lineSeconds 秒；全部說完、封條也沒問題，背景開票動畫才開始
  startIntro(voters) {
    Scene.intro = {
      time: 0,
      line: -1,
      lines: ['現在開始開票！', `領票人數 ${voters} 人`, '先檢查票匭的封條和鎖⋯'],
      doneAt: null,
    };
    Scene.frozen.add('intro');
  },

  // 開場進行中：時間到了就換下一句，全部說完就開始開票
  updateIntro(dt) {
    const intro = Scene.intro;
    intro.time += dt;
    const lineMs = CONFIG.intro.lineSeconds * 1000;

    // 換到下一句
    const line = Math.min(Math.floor(intro.time / lineMs), intro.lines.length - 1);
    if (intro.doneAt === null && line !== intro.line) {
      intro.line = line;
      Scene.showBanner(intro.lines[line]);
    }

    // 三句都說完了，而且票匭沒有出事（封條破了要先等玩家提醒）→ 開始唱票
    const boxBusy = Scene.eventVisuals['ballot-box'] !== undefined;
    if (intro.doneAt === null && intro.time >= lineMs * intro.lines.length && !boxBusy) {
      intro.doneAt = intro.time;
      Scene.showBanner('好，開始唱票！');
    }

    if (intro.doneAt !== null && intro.time >= intro.doneAt + Scene.INTRO_END_MS) {
      Scene.intro = null;
      Scene.hideBanner();
      Scene.frozen.delete('intro');
      Scene.enterStep('take'); // 開始背景開票動畫
    }
  },

  // 現在是不是開場「檢查封條」的那一刻（game.js 會在這時候決定封條有沒有破）
  atSealCheck() {
    const intro = Scene.intro;
    return intro !== null && intro.doneAt === null && intro.line === intro.lines.length - 1;
  },

  // 遊戲結束：票都開完了，大家停下來
  endCounting() {
    const el = Scene.el;
    Scene.intro = null;
    Scene.pendingReveal = null;
    Scene.frozen.add('end');
    Scene.hideFlyer();
    Scene.hideBubble();
    Scene.hideOwlBubble();
    el.pen.style.display = 'none';
    Scene.setVariant(el.bear, 'idle');
    Scene.setVariant(el.owl, 'idle');
    Scene.setVariant(el.rabbit, 'idle');
    el.svg.classList.remove('hush');
    Scene.showBanner('票都開完了！');
  },

  // 最後一步：兔子在票匭後面把票匭抬起來，開口轉向參觀席，給大家看裡面空了
  showEmptyBox() {
    Scene.setVariant(document.getElementById('ballot-box'), 'show-empty');
    Scene.el.rabbit.style.display = 'none'; // 兔子跑到票匭後面了
    Scene.showBanner('票匭空了，給大家看看！', '檢票員');
  },

  // ---------- 畫面上方的大字公告 ----------

  // who：誰說的（預設是主任管理員）
  showBanner(text, who = '主任管理員') {
    Scene.el.bannerWho.textContent = who;
    Scene.el.bannerText.textContent = text;
    Scene.el.banner.hidden = false;
  },

  hideBanner() {
    Scene.el.banner.hidden = true;
  },

  // 遊戲迴圈每一格都會呼叫，dt = 距離上一格過了幾毫秒
  update(dt) {
    dt = Math.min(dt, 100); // 最多算 0.1 秒，避免卡頓後一次跳太多
    Scene.updateIdle(dt);
    if (Scene.intro) Scene.updateIntro(dt);
    if (Scene.pendingReveal) Scene.updateReveal(dt);

    // 有事件讓開票暫停中（例如熊沒把票舉高），背景動畫先停住
    if (Scene.frozen.size > 0) return;

    const cycle = Scene.cycle;
    cycle.time += dt;
    if (cycle.time >= Scene.STEPS[cycle.step].duration) {
      cycle.time = 0;
      cycle.step = (cycle.step + 1) % Scene.STEPS.length;
      Scene.enterStep(Scene.STEPS[cycle.step].name);
    }
  },

  // 進入背景動畫的某一步
  enterStep(name) {
    const el = Scene.el;
    const cycle = Scene.cycle;

    // 有事件在等這一步：準備好；如果就是這一步出錯，換成出錯的樣子，這一步的正常動作就不做了
    for (const targetId in Scene.timed) {
      const timed = Scene.timed[targetId];
      const when = Scene.TIMED_VISUALS[timed.visual];
      if (timed.shown) continue;
      // 被認定是廢票的那一張，後面的步驟先不出別的錯（兔子拿新票時就沒關係了）
      if (name === when.arm && !(cycle.invalid && name !== 'take')) timed.armed = true;
      if (timed.armed && name === when.show) {
        Scene.revealTimed(targetId);
        return;
      }
    }

    if (name === 'take') {
      cycle.ballot = Scene.randomInt(3); // 這張票投給誰（0 = 1 號）
      cycle.invalid = false;
      Scene.setPose(el.rabbit, 'reach');
      el.squirrelHop.removeAttribute('transform');
      el.pen.style.display = 'none'; // 麥克筆先收起來，等真的要畫這一票才出現
      Scene.hideFlyer();
    } else if (name === 'pass') {
      Scene.setPose(el.rabbit, 'idle');
      Scene.fly(Scene.POINTS.box, Scene.POINTS.bear);
    } else if (name === 'hold') {
      // 拿到票：先拿在胸前。這時候還不會唱，
      // 所以「票拿在胸前就唱」（沒把票舉高事件）會跟平常不一樣
      Scene.hideFlyer();
      Scene.drawBallot({ stamps: [cycle.ballot] });
      Scene.setVariant(el.bear, 'chest');
      // 熊等一下要出錯的話，現在就決定好票上圈誰、要唱成誰（廢票也在這時候畫好）
      if (Scene.timed.bear && Scene.timed.bear.armed) Scene.prepareBearBallot(Scene.timed.bear);
    } else if (name === 'raise') {
      // 把票舉高給大家看，再等一下才唱
      Scene.setVariant(el.bear, 'raise');
    } else if (name === 'call') {
      // 票已經舉高了，開始唱票
      Scene.showBubble(Scene.callText(cycle.ballot));
    } else if (name === 'tally') {
      // 熊的票還舉著；貓頭鷹跟著覆誦一次（廢票就說「無效票 1 票」），同時畫一筆
      Scene.hideBubble();
      Scene.showOwlBubble(cycle.invalid ? '無效票 1 票' : Scene.callText(cycle.ballot));
      Scene.setPose(el.owl, 'write');
      Scene.addTally(cycle.invalid ? Scene.INVALID_COLUMN : cycle.ballot);
    } else if (name === 'give') {
      // 熊把唱完的票交給松鼠（整票員）
      Scene.setVariant(el.bear, 'idle');
      Scene.hideOwlBubble();
      Scene.setPose(el.owl, 'idle');
      Scene.fly(Scene.POINTS.bear, Scene.POINTS.squirrel);
    } else if (name === 'pile') {
      Scene.hideFlyer();
      el.squirrelHop.setAttribute('transform', 'translate(0,-8)'); // 松鼠跳一下
      if (cycle.invalid) {
        Scene.invalidPile += 1; // 被認定是廢票，放到廢票堆
        Scene.drawInvalidPile();
      } else {
        Scene.addToPile(cycle.ballot);
      }
    }
  },

  // 背景開票動畫的某一步是第幾個
  stepIndex(name) {
    return Scene.STEPS.findIndex((step) => step.name === name);
  },

  // ---------- 事件的外觀 ----------

  // 事件發生：把目標物件換成「出事版」外觀。
  // event（可省略）是 events.js 裡的那一筆：有 hint 的話，先顯示提示、過 hintSeconds 秒才真的出現
  // instant = true：不等開票順序，馬上出現（規則頁截圖用）
  showEvent(targetId, visual, event, instant = false) {
    const obj = document.getElementById(targetId);
    Scene.eventVisuals[targetId] = visual;

    // 跟開票順序連在一起的事件：先記下來，等開票走到對的那一步才出現（enterStep 會處理）
    if (Scene.TIMED_VISUALS[visual]) {
      Scene.timed[targetId] = { visual, armed: false, shown: false, called: 0 };
      if (instant) Scene.revealTimedNow(targetId);
      return;
    }

    obj.classList.add('has-event');
    if (event && event.hint) {
      // 先換成「提示版」外觀（例如停電：只有畫面變暗），大字寫出發生什麼事
      Scene.setVariant(obj, visual + '-hint');
      Scene.showBanner(event.hint, '突發狀況');
      Scene.pendingReveal = { targetId, visual, ms: event.hintSeconds * 1000 };
      if (Scene.PAUSE_VISUALS.includes(visual)) {
        Scene.freeze(targetId);
        Scene.el.svg.classList.add('hush');
      }
    } else {
      Scene.setVariant(obj, visual);
      if (Scene.PAUSE_VISUALS.includes(visual)) {
        Scene.freeze(targetId);
        Scene.el.svg.classList.add('hush'); // 對話框先藏起來
      }
      // 閃光燈：整個畫面跟著一閃一閃（注意力在畫面中間的人也看得到）
      if (visual === 'flash') Scene.el.wrap.classList.add('flashing');
    }
  },

  // 提示顯示夠久了：事件真的出現（例如停電後，黑影才靠近票匭）
  updateReveal(dt) {
    const reveal = Scene.pendingReveal;
    reveal.ms -= dt;
    if (reveal.ms > 0) return;
    Scene.pendingReveal = null;
    Scene.hideBanner();
    Scene.setVariant(document.getElementById(reveal.targetId), reveal.visual);
  },

  // 這個物件的事件現在看得到、點得到嗎？
  // （還在等開票順序，或停電還在提示階段，就還沒出現）
  isVisible(targetId) {
    const timed = Scene.timed[targetId];
    if (timed && !timed.shown) return false;
    if (Scene.pendingReveal && Scene.pendingReveal.targetId === targetId) return false;
    return true;
  },

  // 事件快過期：開始輕輕抖動提醒
  warnEvent(targetId) {
    document.getElementById(targetId).classList.add('warn');
  },

  // 事件結束（result：'stopped' 被制止、'expired' 時間到、'trap' 點到陷阱）
  clearEvent(targetId, result) {
    const obj = document.getElementById(targetId);
    const visual = Scene.eventVisuals[targetId];
    delete Scene.eventVisuals[targetId];
    obj.classList.remove('has-event', 'warn');

    const timed = Scene.timed[targetId];
    delete Scene.timed[targetId];
    if (timed && !timed.shown) {
      // 還沒輪到它出錯就結束了（例如遊戲結束）：什麼都不用改回來
    } else if (targetId === 'bear') {
      Scene.endBearEvent(visual, result);
    } else if (visual === 'tally-wrong') {
      Scene.endTallyWrong();
    } else if (visual === 'wrong-pile') {
      Scene.endWrongPile();
    } else if (visual === 'stacked') {
      // 兔子把那一疊放回去，重新一張一張拿
      Scene.setVariant(obj, Scene.defaultVariant(obj));
      Scene.frozen.delete(targetId);
      Scene.cycle.time = 0;
      Scene.enterStep('take');
    } else {
      Scene.setVariant(obj, Scene.defaultVariant(obj));
      if (Scene.PAUSE_VISUALS.includes(visual)) Scene.el.svg.classList.remove('hush');
      // 沒有別人在開閃光燈了，畫面就不再閃
      if (visual === 'flash' && !Object.values(Scene.eventVisuals).includes('flash')) {
        Scene.el.wrap.classList.remove('flashing');
      }
    }
    // 還在「提示」階段就結束的話，提示也收起來
    if (Scene.pendingReveal && Scene.pendingReveal.targetId === targetId) {
      Scene.pendingReveal = null;
      Scene.hideBanner();
    }
    Scene.frozen.delete(targetId); // 如果是它讓動畫暫停的，現在可以繼續了
  },

  // a 和 b 是不是同一組（同時只能有一個出事）
  areLinked(a, b) {
    return Scene.LINKED.some((group) => group.includes(a) && group.includes(b));
  },

  // 讓背景開票動畫暫停
  freeze(targetId) {
    Scene.frozen.add(targetId);
    Scene.hideFlyer();
    Scene.setPose(Scene.el.rabbit, 'idle');
    Scene.el.squirrelHop.removeAttribute('transform');
  },

  // 開票走到對的那一步：事件真的出現（has-event 之後玩家才點得到）
  revealTimed(targetId) {
    const el = Scene.el;
    const cycle = Scene.cycle;
    const timed = Scene.timed[targetId];
    timed.shown = true;
    document.getElementById(targetId).classList.add('has-event');
    Scene.freeze(targetId); // 出錯的那一刻，大家停下來
    cycle.time = 0;

    if (targetId === 'bear') {
      // 熊唱出來了（沒舉票就唱、唱錯號次、把廢票唱成某號一票、壓線的有效票）
      Scene.hideOwlBubble();
      Scene.showBubble(Scene.callText(timed.called));
    } else if (timed.visual === 'tally-wrong') {
      // 熊唱完、票還舉著；貓頭鷹覆誦 A，這一筆卻畫在 B 欄（麥克筆停在 B 欄）
      cycle.wrongColumn = (cycle.ballot + 1 + Scene.randomInt(2)) % 3;
      Scene.hideBubble();
      Scene.showOwlBubble(Scene.callText(cycle.ballot));
      Scene.setPose(el.owl, 'write');
      Scene.addTally(cycle.wrongColumn);
    } else if (timed.visual === 'wrong-pile') {
      // 松鼠把熊交過來的票，放到別人那一疊上
      const pile = (cycle.ballot + 1 + Scene.randomInt(2)) % 3;
      Scene.hideFlyer();
      el.squirrelHop.setAttribute('transform', 'translate(0,-8)');
      Scene.wrongPile = { pile, shows: cycle.ballot };
      Scene.addToPile(pile);
    } else if (timed.visual === 'stacked') {
      // 兔子沒有一張一張拿，一次抱了一疊
      Scene.setVariant(el.rabbit, 'stacked');
    }
  },

  // 規則頁截圖用：不等開票順序，直接擺成出錯的樣子
  revealTimedNow(targetId) {
    const el = Scene.el;
    const cycle = Scene.cycle;
    const timed = Scene.timed[targetId];
    cycle.ballot = Scene.randomInt(3);
    cycle.invalid = false;
    if (targetId === 'bear') {
      // 截圖只有一張，用「圈兩人以上」：不用懂規定也看得出是廢票
      if (timed.visual === 'invalid') timed.kind = 'double';
      Scene.prepareBearBallot(timed);
      Scene.setVariant(el.bear, timed.visual === 'lowered' ? 'chest' : 'raise');
    } else if (timed.visual === 'tally-wrong') {
      Scene.drawBallot({ stamps: [cycle.ballot] });
      Scene.setVariant(el.bear, 'raise');
    }
    Scene.revealTimed(targetId);
  },

  // 熊拿到票時：決定票上圈誰、熊等一下會唱成誰，把票畫好
  prepareBearBallot(timed) {
    const real = Scene.cycle.ballot; //                       票上真正圈的
    const other = (real + 1 + Scene.randomInt(2)) % 3; //     另一位候選人
    timed.called = real; //                                   熊嘴巴唱的

    if (timed.visual === 'wrong-call') {
      // 唱錯號次：票上圈的是一個人，嘴巴唱的是另一個人
      Scene.drawBallot({ stamps: [real] });
      timed.called = other;
    } else if (timed.visual === 'invalid') {
      // 廢票被當有效票唱：隨機一種廢票，熊照樣唱「某號一票」
      // 平常隨機挑一種；規則頁的截圖會指定一種一眼就看得出來的（timed.kind）
      Scene.drawInvalidBallot(timed.kind || Scene.pick(Scene.INVALID_KINDS), real, other);
    } else if (timed.visual === 'line-stamp') {
      // 陷阱：圈在格線上，但看得出投給誰，所以是有效票
      Scene.drawBallot({ stamps: [real], onLine: true });
    } else {
      // 沒把票舉高：票本身沒問題
      Scene.drawBallot({ stamps: [real] });
    }
  },

  // 熊的事件結束：票舉高、用正確的方式重新唱一次，接著貓頭鷹覆誦
  endBearEvent(visual, result) {
    const cycle = Scene.cycle;
    cycle.step = Scene.stepIndex('call');
    cycle.time = 0;
    Scene.setVariant(Scene.el.bear, 'raise');
    let text = Scene.callText(cycle.ballot);
    if (result === 'stopped' && visual === 'wrong-call') {
      text = '更正：' + text;
    }
    if (result === 'stopped' && visual === 'invalid') {
      text = '啊，這張是廢票！';
      cycle.invalid = true; // 不畫正字，放到廢票堆
    }
    Scene.showBubble(text);
  },

  // 正字畫錯結束：擦掉畫錯的那一筆，畫到正確的欄位
  endTallyWrong() {
    const cycle = Scene.cycle;
    Scene.tally[cycle.wrongColumn] -= 1;
    Scene.drawTally(cycle.wrongColumn);
    Scene.addTally(cycle.ballot);
    cycle.time = 0; // 貓頭鷹再覆誦一下，接著熊把票交給松鼠
  },

  // 票放錯堆結束：把那張票拿到正確的那一疊
  endWrongPile() {
    const { pile, shows } = Scene.wrongPile;
    Scene.wrongPile = null;
    Scene.piles[pile] = Math.max(0, Scene.piles[pile] - 1);
    Scene.drawPile(pile);
    Scene.addToPile(shows);
    Scene.cycle.time = 0;
  },

  // ---------- 切換外觀 ----------

  // 在 root 裡面，只顯示 data-show 含有 value 的部分，其他藏起來
  // 例如 <g data-show="raise"> 只有 value 是 'raise' 時才會顯示
  setVariant(root, value) {
    root.querySelectorAll('[data-show]').forEach((part) => {
      const names = part.getAttribute('data-show').split(' ');
      part.style.display = names.includes(value) ? '' : 'none';
    });
  },

  // 背景動畫換姿勢用：角色正在出事的話，維持出事的樣子，不要換
  setPose(obj, pose) {
    if (obj.classList.contains('has-event')) return;
    Scene.setVariant(obj, pose);
  },

  // 物件平常的外觀（寫在 index.html 的 data-default，沒寫就是 normal）
  defaultVariant(obj) {
    return obj.getAttribute('data-default') || 'normal';
  },

  // ---------- 選票、對話框 ----------

  // 畫熊手上的選票（每次都先全部恢復成一般的選票，再加上要的記號）
  // options 可以有：
  //   stamps    圈在哪幾欄（0 = 1 號那一欄），空陣列 = 空白票
  //   onLine    章印壓在格線上，但大部分還在那一欄（陷阱：其實是有效票）
  //   between   章印圈在第 between 欄和下一欄的正中間，看不出圈給誰
  //   crossed   第一個章印被打叉塗改
  //   triangle  第一個章印換成自己畫的三角形
  //   mark      'sign' 簽名、'seal' 蓋章、'print' 指印、'check' 打勾
  //   fake      不是選委會發的票（像影印的：灰色的紙、候選人是灰的、沒有紅色關防）
  //   torn      票被撕破（右上角不見了）
  //   smudge    票面髒掉，蓋住第一個章印
  drawBallot(options) {
    const el = Scene.el;
    const o = { stamps: [], onLine: false, between: null, mark: null, ...options };
    const first = o.stamps[0];
    const markCol = first === undefined ? 1 : (first + 1) % 3; // 記號蓋在沒圈的那一欄

    // 第一個章印：一般 / 圈在兩欄中間 / 換成三角形
    if (o.between !== null) {
      Scene.placeAt(el.stamp, (Scene.BALLOT_COLUMNS[o.between] + Scene.BALLOT_COLUMNS[o.between + 1]) / 2);
    } else if (o.triangle) {
      Scene.placeStamp(el.stamp, undefined);
      Scene.placeStamp(el.triangle, first);
    } else {
      Scene.placeStamp(el.stamp, first, o.onLine);
    }
    if (!o.triangle) el.triangle.style.display = 'none';
    Scene.placeStamp(el.stamp2, o.stamps[1]);

    // 塗改的叉、髒污都蓋在第一個章印上
    Scene.placeStamp(el.cross, o.crossed ? first : undefined);
    Scene.placeStamp(el.smudge, o.smudge ? first : undefined);

    // 簽名、蓋章、指印、打勾（簽名的位置是固定的，其他的蓋在沒圈的那一欄）
    for (const name in el.marks) {
      const markEl = el.marks[name];
      if (name === 'sign') markEl.style.display = o.mark === 'sign' ? '' : 'none';
      else Scene.placeStamp(markEl, o.mark === name ? markCol : undefined);
    }

    // 不是選委會發的票：白紙、灰色格線、沒有紅色關防
    el.ballotBg.setAttribute('fill', o.fake ? '#E2E2E8' : '#F9B8CF');
    el.ballotGrid.setAttribute('stroke', o.fake ? '#8E8E9C' : '#D86F95');
    el.ballotOfficial.style.display = o.fake ? 'none' : '';
    el.ballotPaper.classList.toggle('copy', !!o.fake); // 候選人的圖也變灰（style.css 的 .copy）

    // 撕破：用 mask 切掉右上角，再畫上鋸齒邊
    if (o.torn) el.ballotPaper.setAttribute('mask', 'url(#tear-mask)');
    else el.ballotPaper.removeAttribute('mask');
    el.tear.style.display = o.torn ? '' : 'none';
  },

  // 畫一種廢票。real：熊會唱的那一號；other：另一位候選人
  drawInvalidBallot(kind, real, other) {
    if (kind === 'blank') Scene.drawBallot({ stamps: [] });
    if (kind === 'double') Scene.drawBallot({ stamps: [real, other] });
    if (kind === 'between') Scene.drawBallot({ stamps: [real], between: Math.min(real, 1) });
    if (kind === 'crossed') Scene.drawBallot({ stamps: [other, real], crossed: true });
    if (kind === 'marked') Scene.drawBallot({ stamps: [real], mark: Scene.pick(Scene.MARKS) });
    if (kind === 'triangle') Scene.drawBallot({ stamps: [real], triangle: true });
    if (kind === 'fake') Scene.drawBallot({ stamps: [real], fake: true });
    if (kind === 'torn') Scene.drawBallot({ stamps: [real], torn: true });
    if (kind === 'smudge') Scene.drawBallot({ stamps: [real], smudge: true });
  },

  // 把一個章印（或記號）放到第 col 欄下方的空白處；col 是 undefined 就藏起來
  placeStamp(stampEl, col, onLine = false) {
    if (col === undefined) {
      stampEl.style.display = 'none';
      return;
    }
    let x = Scene.BALLOT_COLUMNS[col];
    // 壓線：往右移 10（最右邊那欄往左移），章印會壓到格線，但大部分還在原本那一欄
    if (onLine) x += col === 2 ? -10 : 10;
    Scene.placeAt(stampEl, x);
  },

  // 把章印（或記號）放到選票上 x 的位置（高度固定在蓋章的空白處）
  placeAt(stampEl, x) {
    stampEl.setAttribute('transform', `translate(${x}, 253)`);
    stampEl.style.display = '';
  },

  // 唱票的文字，例如「2 號 🐶 柴犬 一票」
  callText(index) {
    const candidate = Scene.candidates[index];
    return `${index + 1} 號 ${candidate.emoji} ${candidate.name} 一票`;
  },

  showBubble(text) {
    Scene.el.bubbleText.textContent = text;
    Scene.el.bubble.style.display = '';
  },

  hideBubble() {
    Scene.el.bubble.style.display = 'none';
  },

  // 貓頭鷹覆誦的對話框
  showOwlBubble(text) {
    Scene.el.owlBubbleText.textContent = text;
    Scene.el.owlBubble.style.display = '';
  },

  hideOwlBubble() {
    Scene.el.owlBubble.style.display = 'none';
  },

  // ---------- 計票紙上的正字 ----------

  // 在計票紙第 col 欄多畫一筆，麥克筆停在這最新的一筆旁邊
  addTally(col) {
    Scene.tally[col] += 1;
    const end = Scene.drawTally(col);
    Scene.el.pen.setAttribute('transform', `translate(${end.x}, ${end.y})`);
    Scene.el.pen.style.display = '';
  },

  // 依照票數重畫第 col 欄的正字，回傳最後一筆的終點
  drawTally(col) {
    const group = document.getElementById('tally-' + col);
    group.replaceChildren();
    // 一欄有 6 格（6 個正字 = 30 票），寫滿了就像換一張新紙，從頭畫
    const count = Scene.tally[col];
    const shown = count === 0 ? 0 : ((count - 1) % 30) + 1;
    let end = null;
    for (let i = 0; i < shown; i++) {
      end = Scene.drawStroke(group, col, i);
    }
    return end;
  },

  // 畫第 col 欄的第 i 筆（0 開始），回傳這一筆的終點
  drawStroke(group, col, i) {
    const cell = Math.floor(i / 5); //  第幾格（0～5，先由上往下填左小欄，再填右小欄）
    const stroke = i % 5; //            這個正字的第幾筆（0～4）
    const size = 17;
    const left = Scene.SHEET_CELLS[col][Math.floor(cell / 3)] + 2.5;
    const top = Scene.SHEET_ROWS[cell % 3];
    const [x1, y1, x2, y2] = Scene.ZHENG_STROKES[stroke];

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', left + x1 * size);
    line.setAttribute('y1', top + y1 * size);
    line.setAttribute('x2', left + x2 * size);
    line.setAttribute('y2', top + y2 * size);
    line.setAttribute('class', 'marker');
    group.appendChild(line);
    return { x: left + x2 * size, y: top + y2 * size };
  },

  // ---------- 整票區 ----------

  addToPile(index) {
    Scene.piles[index] += 1;
    Scene.drawPile(index);
  },

  // 依照張數調整票堆高度（每張 2 單位高，最多畫到 24 張那麼高），
  // 並把「最上面那張票」放到票堆頂端
  drawPile(index) {
    const height = 4 + Math.min(Scene.piles[index], 24) * 2;
    const top = 520 - height; // 票堆底部固定在桌面 y=520
    const rect = document.getElementById('pile-' + index);
    rect.setAttribute('y', top);
    rect.setAttribute('height', height);

    // 最上面那張：正常時是這一疊的候選人；放錯堆時是別人的，而且歪歪的
    const isWrong = Scene.wrongPile !== null && Scene.wrongPile.pile === index;
    const shows = isWrong ? Scene.wrongPile.shows : index;
    const card = document.getElementById('pile-top-' + index);
    card.setAttribute('transform', `translate(${Scene.PILE_CENTERS[index]}, ${top}) rotate(${isWrong ? -12 : 0})`);
    card.style.display = Scene.piles[index] > 0 || isWrong ? '' : 'none';
    document.getElementById('pile-top-emoji-' + index).textContent = Scene.candidates[shows].emoji;
  },

  drawInvalidPile() {
    const height = 4 + Math.min(Scene.invalidPile, 24) * 2;
    const rect = document.getElementById('pile-invalid');
    rect.setAttribute('y', 520 - height);
    rect.setAttribute('height', height);
  },

  // ---------- 傳遞中的選票 ----------

  // 讓小選票從 from 飛到 to
  fly(from, to) {
    const flyer = Scene.el.flyer;
    flyer.style.transition = 'none';
    flyer.style.transform = `translate(${from.x}px, ${from.y}px)`;
    flyer.style.display = '';
    flyer.getBoundingClientRect(); // 讓瀏覽器先把票放到起點，下一步的移動才會有動畫
    flyer.style.transition = '';
    flyer.style.transform = `translate(${to.x}px, ${to.y}px)`;
  },

  hideFlyer() {
    Scene.el.flyer.style.display = 'none';
  },

  // ---------- 動物的隨機小動作 ----------

  // 每隔一小段隨機時間，挑一隻動物做一個小動作
  updateIdle(dt) {
    Scene.idleTimer -= dt;
    if (Scene.idleTimer > 0) return;
    Scene.idleTimer = 250 + Math.random() * 700; // 下一次：0.25～0.95 秒後

    const id = Scene.pick(Object.keys(Scene.IDLE_ACTIONS));
    const obj = document.getElementById(id);
    if (Scene.EVENT_ONLY_ANIMALS.includes(id) && !obj.classList.contains('has-event')) return;
    Scene.playAction(obj, Scene.pick(Scene.IDLE_ACTIONS[id]));
  },

  // 讓 obj 做一個小動作（加上 act-xxx class，做完再拿掉）
  playAction(obj, action) {
    if (obj.getAttribute('data-acting')) return; // 正在做別的動作，先不打斷
    obj.setAttribute('data-acting', action);
    obj.classList.add('act-' + action);
    setTimeout(() => {
      obj.classList.remove('act-' + action);
      obj.removeAttribute('data-acting');
    }, Scene.ACTION_MS[action]);
  },

  // ---------- 「先了解規則」頁的截圖 ----------

  // 把場景擺成某個事件發生的樣子，複製一份 SVG、只留下那個物件附近，再把場景恢復原狀。
  // （規則頁是從首頁打開的，這時候沒有在玩，所以可以借用場景）
  snapshot(event) {
    const targetId = event.targets[Math.floor(event.targets.length / 2)]; // 有好幾個目標的，挑中間那個
    Scene.reset(CANDIDATES);
    // 先放一些票、畫一些正字，畫面才不會空空的
    Scene.piles = [6, 4, 5];
    Scene.tally = [6, 4, 5, 1];
    for (let i = 0; i < 4; i++) Scene.drawTally(i);
    for (let i = 0; i < 3; i++) Scene.drawPile(i);
    // 不傳 event：有提示的事件（停電）直接畫出真正的樣子；instant：不等開票順序
    Scene.showEvent(targetId, event.visual, null, true);

    const copy = Scene.el.svg.cloneNode(true);
    // 複製出來的圖不能有重複的 id，也不給螢幕閱讀器念
    copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    copy.removeAttribute('id');
    copy.removeAttribute('aria-label');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('viewBox', Scene.SNAP_VIEWS[targetId]);
    copy.classList.add('snap');

    Scene.clearEvent(targetId, 'expired');
    Scene.reset(CANDIDATES);
    return copy;
  },

  // ---------- 首頁的熊 ----------

  // 複製遊戲裡的熊（只留上半身和手上的選票），放進 container。
  // 回傳 { setPose }：換姿勢；換成 'raise' 時，章會蓋在跟上次不同的候選人
  makeHomeBear(container) {
    const bear = Scene.el.bear.cloneNode(true);
    const stamp = bear.querySelector('#ballot-stamp');
    bear.querySelector('#bubble').remove(); // 不要對話框
    bear.querySelector('.hit').remove(); //   不能點
    bear.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    bear.removeAttribute('id');
    bear.classList.remove('obj');

    // 外面包一層：跟場景一樣的深色粗外框
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('stroke', '#4A3B52');
    group.setAttribute('stroke-width', '3');
    group.setAttribute('stroke-linejoin', 'round');
    group.setAttribute('stroke-linecap', 'round');
    group.appendChild(bear);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '2 186 128 196'); // 從舉起的票到熊的肚子
    svg.setAttribute('class', 'scene-svg home-bear-svg');
    svg.appendChild(group);
    container.appendChild(svg);

    let column = 0;
    return {
      setPose(pose) {
        if (pose === 'raise') {
          column = (column + 1 + Scene.randomInt(2)) % 3; // 換一個候選人
          Scene.placeStamp(stamp, column);
        }
        Scene.setVariant(bear, pose);
      },
    };
  },

  // ---------- 特效、工具 ----------

  // 物件的中心點（用透明點擊區來算；物件要是看得到的狀態）
  targetCenter(id) {
    const box = document.getElementById(id).querySelector('.hit').getBBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  },

  // 把螢幕上的點擊位置，換算成 SVG 裡的座標
  toScenePoint(clientX, clientY) {
    const svg = Scene.el.svg;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  },

  // 在 (x, y) 顯示會往上飄、慢慢消失的文字。kind：'good' 或 'bad'
  floatText(x, y, text, kind) {
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', Math.min(320, Math.max(70, x))); // 不要太靠邊，免得字被切掉
    label.setAttribute('y', Math.max(30, y));
    label.setAttribute('class', 'float float-' + kind);
    label.textContent = text;
    Scene.el.fx.appendChild(label);
    setTimeout(() => label.remove(), 1000);
  },

  // 畫面輕微晃動
  shake() {
    const wrap = Scene.el.wrap;
    wrap.classList.remove('shake');
    void wrap.offsetWidth; // 讓瀏覽器重新開始動畫
    wrap.classList.add('shake');
  },

  // 0 到 n-1 之間的隨機整數
  randomInt(n) {
    return Math.floor(Math.random() * n);
  },

  // 從陣列裡隨機挑一個
  pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  },
};
