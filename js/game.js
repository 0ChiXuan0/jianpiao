// =============================================
// game.js — 遊戲主程式
//
// 負責「規則」：
//   - 遊戲迴圈（每一格畫面更新一次）
//   - 什麼時候產生事件、事件什麼時候過期
//   - 判斷玩家點到什麼：提醒成功、點到其實沒問題的事（陷阱）、還是亂點
//   - 計分、combo、愛心
//   - 開場（領票人數、檢查封條）、結束（展示空票匭、核對投開票報告表）
//
// 時間的算法：
//   用 performance.now()（瀏覽器提供的精準計時器，單位毫秒）。
//   暫停的時候時間要「停住」，所以用 Game.now() 扣掉暫停的時間。
// =============================================

const Game = {
  s: null, // 這一局的狀態（state），每次開始新的一局都會重建

  // 網頁載入時呼叫一次
  init() {
    Scene.setup();
    const svg = document.getElementById('scene');
    // pointerdown：手指一碰到就觸發，比 click 更快
    svg.addEventListener('pointerdown', Game.onTap);
    // 防止長按跳出選單
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    // 切到別的 App 或分頁時自動暫停
    document.addEventListener('visibilitychange', Game.onVisibilityChange);
  },

  // 開始新的一局。mode：哪個版本（'easy' 簡單版、'real' 真實世界版，見 config.js 的 modes）
  start(mode) {
    const speed = CONFIG.modes[mode].speed; //       起始速度的倍率
    const candidates = Game.shuffle(CANDIDATES); // 每局隨機分配號次
    const count = Game.makeVoteCount(); //          這一局最後報告表上的票數
    Scene.reset(candidates);
    Scene.speed = speed; //                         背景唱票的速度也跟著這個版本
    Scene.startIntro(count.voters);

    const now = performance.now();
    Game.s = {
      mode, //             這局是哪個版本
      speed, //            這個版本的起始速度倍率
      running: true, //    遊戲進行中
      paused: false, //    暫停中（看提示卡、切到別的 App）
      pausedAt: 0, //      這次暫停是什麼時候開始的
      pausedTotal: 0, //   總共暫停了多久（毫秒）
      startedAt: now, //   開場說完才開始算時間（難度、撐了幾秒），到時候會重設
      endedAt: 0,
      introRunning: true, // 開場宣布中（這時候不會隨機出事件）
      sealBroken: Math.random() < CONFIG.intro.sealBrokenChance, // 這局開場檢查時，封條是不是破的
      sealResult: 'ok', // 統計用：封條沒破 'ok'、有提醒到 'reminded'、沒提醒到 'missed'
      nextMilestone: 0, // 統計用：下一個要記錄的「撐過幾秒」是 PROGRESS_SECONDS 的第幾個
      lastFrame: now,

      hearts: CONFIG.maxHearts,
      score: 0,
      combo: 0,
      maxCombo: 0,

      spawnInterval: CONFIG.spawnInterval.start / speed, // 現在的事件產生間隔（秒）；簡單版一開始比較久
      nextSpawnAt: Infinity, // 下一個事件最早什麼時候出現（開場說完才排）
      nextEvent: null, //    已經抽好、等著出現的下一個事件
      active: [], //         正在發生的事件
      cooldownUntil: {}, //  每個物件要等到什麼時候才能再出事

      reactionTimes: [], //  每次成功制止的反應時間（毫秒）
      missed: {}, //         漏掉的事件，例如 { 'window-closed': { event, count: 2 } }
      trapsHit: {}, //       點錯的陷阱

      voteCount: count, //   最後報告表上的票數（makeVoteCount 做的）
      voteCheck: null, //    玩家核對票數的結果：{ correct: 對不對, points: 加減幾分 }
    };

    UI.updateHud(Game.s);
    UI.showScreen('game');
    Sound.play('start');
    const s = Game.s;
    requestAnimationFrame(() => Game.loop(s));
  },

  // 遊戲時間（毫秒）：不含暫停的時間
  now() {
    const s = Game.s;
    // 暫停中的話，時間就停在按下暫停的那一刻
    const realTime = s.paused ? s.pausedAt : performance.now();
    return realTime - s.pausedTotal;
  },

  // ---------- 遊戲迴圈 ----------

  loop(s) {
    // 這一局已經結束（或已經開了新的一局），就停止這個迴圈
    if (s !== Game.s || !s.running) return;

    const now = Game.now();
    if (!s.paused) {
      Scene.update(now - s.lastFrame);
      Game.checkIntro(now);
      Game.checkProgress(now);
      Game.checkExpired(now);
      if (s.running) Game.trySpawn(now);
    }
    s.lastFrame = now;
    requestAnimationFrame(() => Game.loop(s));
  },

  // ---------- 開場 ----------

  // 開場宣布中：檢查封條的那一刻，決定好封條是破的話就讓它出事；
  // 開場說完了，才開始算遊戲時間、排第一個隨機事件
  checkIntro(now) {
    const s = Game.s;
    if (!s.introRunning) return;

    if (s.sealBroken && Scene.atSealCheck()) {
      s.sealBroken = false; // 只出現這一次
      const seal = EVENTS.find((event) => event.id === 'seal-broken');
      Game.spawnEvent(seal, 'ballot-box', now, 0);
    }

    if (!Scene.intro) {
      s.introRunning = false;
      s.startedAt = now;
      s.nextSpawnAt = now + CONFIG.firstEventDelay * 1000;
      Track.event('seal-check', { result: s.sealResult });
    }
  },

  // 統計：撐過這幾秒時各記錄一次
  PROGRESS_SECONDS: [30, 60, 90, 120, 180],

  checkProgress(now) {
    const s = Game.s;
    if (s.introRunning) return;
    const target = Game.PROGRESS_SECONDS[s.nextMilestone];
    if (target !== undefined && now - s.startedAt >= target * 1000) {
      Track.event('game-progress', { seconds: target, mode: s.mode });
      s.nextMilestone += 1;
    }
  },

  // ---------- 難度曲線（數值都在 config.js） ----------

  // 第 seconds 秒時，事件的存活時間（秒）
  lifetimeAt(seconds) {
    const c = CONFIG.lifetime;
    const start = c.start / Game.s.speed; //              簡單版一開始等比較久
    const times = Math.floor(seconds / c.everySeconds); // 已經縮短過幾次
    return Math.max(c.min, start * Math.pow(c.multiplier, times));
  },

  // 第 seconds 秒時，同時最多幾個事件
  maxActiveAt(seconds) {
    let count = 1;
    for (const rule of CONFIG.maxActive) {
      if (seconds >= rule.fromSecond) count = rule.count;
    }
    return count;
  },

  // 第 seconds 秒時，產生陷阱事件的機率（0～1）
  trapRatioAt(seconds) {
    const c = CONFIG.trapRatio;
    if (seconds < c.startSecond) return 0;
    const steps = Math.floor((seconds - c.startSecond) / c.stepEverySeconds);
    return Math.min(c.max, c.start + steps * c.step);
  },

  // 連擊 combo 次時的分數倍率：第 1 次 ×1.0、第 2 次 ×1.1……最多 ×2.0
  multiplierFor(combo) {
    if (combo <= 1) return 1;
    const c = CONFIG.score;
    return Math.min(c.comboMaxMultiplier, 1 + c.comboStep * (combo - 1));
  },

  // ---------- 產生事件 ----------

  trySpawn(now) {
    const s = Game.s;
    if (s.introRunning) return; //      開場還在宣布
    if (now < s.nextSpawnAt) return; // 時間還沒到

    const seconds = (now - s.startedAt) / 1000; // 這局玩了幾秒
    if (s.active.length >= Game.maxActiveAt(seconds)) return; // 同時的事件已經滿了

    // 先決定下一個是什麼事件（照 events.js 的 weight 抽）
    if (!s.nextEvent) s.nextEvent = Game.chooseEvent(seconds);

    // 這個事件的物件都在忙（或冷卻中）的話，就等它有空，不改抽別的事件。
    // 不然有兩扇窗戶的「窗戶被關」會一直被拿來補位，出現次數會變得特別多。
    const freeTargets = Game.freeTargets(s.nextEvent, now);
    if (freeTargets.length === 0) return;

    Game.spawnEvent(s.nextEvent, Game.pick(freeTargets), now, seconds);
    s.nextEvent = null;

    // 排定下一個事件的時間，然後把間隔縮短一點
    s.nextSpawnAt = now + s.spawnInterval * 1000;
    s.spawnInterval = Math.max(
      CONFIG.spawnInterval.min,
      s.spawnInterval * CONFIG.spawnInterval.multiplier,
    );
  },

  // 抽下一個事件：先決定是陷阱還是違規，再從那一類裡照 weight 抽
  // （atStart 的事件只在開場出現，不會被抽到）
  chooseEvent(seconds) {
    const pool = EVENTS.filter((event) => !event.atStart);
    const wantTrap = Math.random() < Game.trapRatioAt(seconds);
    const choices = pool.filter((event) => !!event.isTrap === wantTrap);
    if (choices.length === 0) return Game.pickWeighted(pool); // 那一類一個事件都沒有的話
    return Game.pickWeighted(choices);
  },

  // 把事件放到場景上
  // （有些事件不會馬上看到：停電要先提示，熊唱錯要等熊唱票那一步。
  //  還沒看到之前不算時間，見 checkExpired）
  spawnEvent(event, targetId, now, seconds) {
    Game.s.active.push({
      event,
      targetId,
      spawnedAt: now,
      lifetime: Game.lifetimeAt(seconds), // 秒
    });
    Scene.showEvent(targetId, event.visual, event);
    if (event.sound) Sound.play(event.sound); // 例如關門聲
  },

  // 這個事件的目標裡，現在可以出事的物件
  freeTargets(event, now) {
    const s = Game.s;
    // alone 的事件（例如停電）：要等畫面上沒有別的事件才出現，出現時也不讓別的事件出來
    if (event.alone && s.active.length > 0) return [];
    if (s.active.some((item) => item.event.alone)) return [];

    return event.targets.filter((id) => {
      // 這個物件（或跟它同一組的物件）正在出事，就不行
      const busy = s.active.some((item) => item.targetId === id || Scene.areLinked(item.targetId, id));
      // 這個物件剛結束事件，還在冷卻中，也不行
      const coolingDown = now < (s.cooldownUntil[id] || 0);
      return !busy && !coolingDown;
    });
  },

  // 把事件從「正在發生」的清單拿掉
  removeActive(item, now) {
    const s = Game.s;
    s.active = s.active.filter((other) => other !== item);
    s.cooldownUntil[item.targetId] = now + CONFIG.targetCooldown * 1000;
  },

  // ---------- 事件過期 ----------

  checkExpired(now) {
    const s = Game.s;
    // 用 slice() 複製一份清單來跑，因為迴圈裡會把事件移除
    for (const item of s.active.slice()) {
      if (!s.running) return;
      // 還沒出現（在等開票順序，或停電還在提示）：從真的出現那一刻才開始算時間
      if (!Scene.isVisible(item.targetId)) {
        item.spawnedAt = now;
        continue;
      }
      const timeLeft = item.lifetime * 1000 - (now - item.spawnedAt); // 還剩幾毫秒

      if (timeLeft > 0) {
        // 快過期了：開始抖動提醒（只做一次）。
        // 陷阱也會抖，不然「有抖 = 一定要點」，陷阱就騙不到人了
        if (!item.warned && timeLeft <= CONFIG.warnSeconds * 1000) {
          item.warned = true;
          Scene.warnEvent(item.targetId);
        }
        continue;
      }

      // 時間到了
      const center = Scene.targetCenter(item.targetId); // 要在物件變回原樣前先算好位置
      Game.removeActive(item, now);
      Scene.clearEvent(item.targetId, 'expired');

      // 陷阱沒被點：時間到就安靜消失，不加分也不扣分
      if (item.event.isTrap) continue;

      // 違規事件漏掉了：扣 1 顆愛心、combo 歸零
      s.hearts -= 1;
      s.combo = 0;
      Game.record(s.missed, item.event);
      if (item.event.atStart) s.sealResult = 'missed';
      Scene.floatText(center.x, center.y, '沒注意到⋯', 'bad');
      Sound.play('miss');
      Game.vibrate([60, 40, 60]);
      UI.updateHud(s, 'hurt');
      if (s.hearts <= 0) Game.endGame();
    }
  },

  // ---------- 玩家點擊 ----------

  onTap(e) {
    const s = Game.s;
    if (!s || !s.running || s.paused) return;
    e.preventDefault();

    const now = Game.now();
    // 從被點到的元素往上找，看它屬於哪個物件（class="obj"）
    const obj = e.target.closest('.obj');
    // 還沒出現的事件不算（例如熊還沒唱錯就先點熊，算亂點）
    const item = obj ? s.active.find((a) => a.targetId === obj.id && Scene.isVisible(a.targetId)) : null;

    if (!item) {
      Game.misclick(e); //            點到沒事的地方
    } else if (item.event.isTrap) {
      Game.hitTrap(item, now); //     點到陷阱
    } else {
      Game.stopEvent(item, now); //   提醒成功
    }
  },

  // 提醒成功
  stopEvent(item, now) {
    if (item.event.atStart) Game.s.sealResult = 'reminded'; // 統計用
    const s = Game.s;
    const c = CONFIG.score;

    // 速度加分：max(0, 100 × (1 - 反應時間 / 事件存活時間))
    const reaction = now - item.spawnedAt;
    const speedBonus = Math.max(0, c.speedBonusMax * (1 - reaction / (item.lifetime * 1000)));

    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const points = Math.round((c.base + speedBonus) * Game.multiplierFor(s.combo));
    s.score += points;
    s.reactionTimes.push(reaction);

    const center = Scene.targetCenter(item.targetId); // 要在物件變回原樣前先算好位置
    Game.removeActive(item, now);
    Scene.clearEvent(item.targetId, 'stopped');
    Scene.floatText(center.x, center.y, '提醒！+' + points, 'good');
    Sound.play('stop');
    Game.vibrate(25);
    UI.updateHud(s);
  },

  // 點到陷阱（其實沒問題）：扣 1 顆愛心，暫停並跳出說明
  hitTrap(item, now) {
    const s = Game.s;
    Game.removeActive(item, now);
    Scene.clearEvent(item.targetId, 'trap');
    s.hearts -= 1;
    s.combo = 0;
    Game.record(s.trapsHit, item.event);
    Sound.play('trap');
    Game.vibrate([60, 40, 60]);
    UI.updateHud(s, 'hurt');

    Game.pause();
    const gameOver = s.hearts <= 0;
    UI.showModal(
      {
        title: '這個沒問題喔',
        body: item.event.card,
        basis: item.event.basis, // [{ text, url }]，提示視窗會做成連結
        button: gameOver ? '看結果' : '知道了，繼續看開票',
      },
      () => {
        Game.resume();
        if (gameOver) Game.endGame();
      },
    );
  },

  // 亂點：扣分（不低於 0）、combo 歸零、畫面晃一下
  misclick(e) {
    const s = Game.s;
    const penalty = CONFIG.score.misclickPenalty;
    s.score = Math.max(0, s.score - penalty);
    s.combo = 0;
    const point = Scene.toScenePoint(e.clientX, e.clientY);
    Scene.floatText(point.x, point.y, '-' + penalty, 'bad');
    Scene.shake();
    Sound.play('misclick');
    Game.vibrate(40);
    UI.updateHud(s);
  },

  // ---------- 暫停 ----------

  pause() {
    const s = Game.s;
    if (s.paused) return;
    s.paused = true;
    s.pausedAt = performance.now();
  },

  resume() {
    const s = Game.s;
    if (!s.paused) return;
    s.pausedTotal += performance.now() - s.pausedAt;
    s.paused = false;
  },

  onVisibilityChange() {
    const s = Game.s;
    if (!document.hidden || !s || !s.running || s.paused) return;
    Game.pause();
    UI.showModal(
      { title: '暫停中', body: '開票先暫停一下，準備好再繼續。', button: '繼續看開票' },
      () => Game.resume(),
    );
  },

  // ---------- 結束 ----------

  // 愛心用完：票都開完了 → 兔子展示空票匭 → 報告表貼出來，玩家核對完才到結束頁
  endGame() {
    const s = Game.s;
    s.running = false;
    s.endedAt = Game.now();
    Track.event('game-over', {
      mode: s.mode,
      seconds: Math.round((s.endedAt - s.startedAt) / 1000),
      score: s.score,
      maxCombo: s.maxCombo,
      missed: Object.keys(s.missed).join(',') || 'none', //    沒提醒到的事件 id
      traps: Object.keys(s.trapsHit).join(',') || 'none', //   點了的陷阱 id
    });
    Sound.play('gameover');

    // 還沒結束的事件都收起來
    for (const item of s.active) Scene.clearEvent(item.targetId, 'expired');
    s.active = [];
    Scene.endCounting();

    // 一步一步來（Game.s === s：玩家沒有中途開新的一局才繼續）
    const later = (ms, step) => setTimeout(() => {
      if (Game.s === s) step();
    }, ms);
    later(1500, () => Scene.showEmptyBox());
    later(3800, () => Scene.showBanner('報告表貼出來了，一起核對吧！'));
    later(5000, () => UI.showVoteCheck(s.voteCount));
  },

  // ---------- 核對票數 ----------

  // 做出這一局投開票報告表上的票數（數字都是 10 的倍數，比較好加）：
  //   voters    領票人數（開場宣布的）
  //   votes     每位候選人實際的票數；invalid 實際的無效票數；unvoted 已領未投票數
  //   announced 報告表上寫的 [1號, 2號, 3號, 無效, 已領未投]（算錯的話，其中一個數字會差 10）
  //   isWrong   報告表是不是算錯了
  // 對得起來的時候：有效票＋無效票＋已領未投票＝領票人數
  makeVoteCount() {
    const c = CONFIG.voteCheck;
    const unit = c.unit;

    // 領票人數：minVoters～maxVoters 之間，unit 的倍數。先用「幾份」來算，最後再 × unit
    const minParts = c.minVoters / unit;
    const maxParts = c.maxVoters / unit;
    const voterParts = minParts + Game.randomInt(maxParts - minParts + 1);
    const invalidParts = 1 + Game.randomInt(c.maxInvalid / unit); // 無效票 1～幾份
    const unvotedParts = Game.randomInt(c.maxUnvoted / unit + 1); // 已領未投 0～幾份

    // 剩下的分給三位候選人：每人先拿 1 份，再一份一份隨機分
    const parts = [1, 1, 1];
    for (let left = voterParts - invalidParts - unvotedParts - 3; left > 0; left--) {
      parts[Game.randomInt(3)] += 1;
    }

    const votes = parts.map((n) => n * unit);
    const invalid = invalidParts * unit;
    const unvoted = unvotedParts * unit;

    // 報告表上的數字：先照抄，算錯的話挑一個數字 +unit 或 -unit
    const announced = votes.concat(invalid, unvoted);
    const isWrong = Math.random() < c.wrongChance;
    if (isWrong) {
      const i = Game.randomInt(announced.length);
      const change = announced[i] > unit && Math.random() < 0.5 ? -unit : unit; // 不要變成 0 或負的
      announced[i] += change;
    }

    return { voters: voterParts * unit, votes, invalid, unvoted, announced, isWrong };
  },

  // 玩家按下「對得起來」（saidWrong = false）或「對不起來」（saidWrong = true）
  answerVoteCheck(saidWrong) {
    const s = Game.s;
    const c = CONFIG.voteCheck;
    const correct = saidWrong === s.voteCount.isWrong;
    const points = correct ? c.rightBonus : -c.wrongPenalty;
    s.score = Math.max(0, s.score + points);
    s.voteCheck = { correct, points };
    Track.event('vote-check', { correct, reportWrong: s.voteCount.isWrong });
    Sound.play(correct ? 'stop' : 'trap');
    return s.voteCheck;
  },

  // 整理結束頁要顯示的資料
  buildResult() {
    const s = Game.s;
    const times = s.reactionTimes;
    const total = times.reduce((sum, t) => sum + t, 0);
    return {
      mode: s.mode, // 這局是哪個版本
      score: s.score,
      avgReaction: times.length > 0 ? total / times.length : null, // 毫秒
      fastest: times.length > 0 ? Math.min(...times) : null, //     毫秒
      maxCombo: s.maxCombo,
      seconds: (s.endedAt - s.startedAt) / 1000,
      missed: Object.values(s.missed),
      traps: Object.values(s.trapsHit),
      voteCheck: s.voteCheck,
    };
  },

  // ---------- 小工具 ----------

  // 記錄某個事件發生了幾次（漏掉 / 點錯陷阱用）
  record(list, event) {
    if (!list[event.id]) list[event.id] = { event, count: 0 };
    list[event.id].count += 1;
  },

  // 打亂陣列順序（不改到原本的陣列）
  shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },

  // 0 到 n-1 之間的隨機整數
  randomInt(n) {
    return Math.floor(Math.random() * n);
  },

  // 從陣列裡隨機挑一個
  pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  },

  // 照 weight 隨機挑一個：weight 2 被抽到的機會是 weight 1 的兩倍，沒寫 weight 就當作 1
  pickWeighted(list) {
    const total = list.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    let roll = Math.random() * total;
    for (const item of list) {
      roll -= item.weight ?? 1;
      if (roll < 0) return item;
    }
    return list[list.length - 1];
  },

  // 手機震動（不支援的瀏覽器就略過）
  vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  },
};
