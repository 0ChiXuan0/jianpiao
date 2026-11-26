// =============================================
// ui.js — 介面
//
// 負責：切換畫面（首頁 / 先了解規則 / 遊戲 / 結束頁）、更新 HUD、
//       提示視窗、核對投開票報告表、結束頁的成績和教學卡
// =============================================

const UI = {
  el: {}, // 常用的 HTML 元素

  // 網頁載入時呼叫一次
  init() {
    const byId = (id) => document.getElementById(id);
    UI.el = {
      screens: {
        home: byId('screen-home'),
        rules: byId('screen-rules'),
        game: byId('screen-game'),
        end: byId('screen-end'),
      },
      hearts: byId('hud-hearts'),
      score: byId('hud-score'),
      combo: byId('hud-combo'),
      mul: byId('hud-mul'),
      modal: byId('modal'),
      modalTitle: byId('modal-title'),
      modalBody: byId('modal-body'),
      modalBasis: byId('modal-basis'),
      modalBtn: byId('modal-btn'),
      endScore: byId('end-score'),
      endAvg: byId('end-avg'),
      endFast: byId('end-fast'),
      endCombo: byId('end-combo'),
      endTime: byId('end-time'),
      endCheck: byId('end-check'),
      check: byId('check'),
      checkRows: byId('check-rows'),
      checkVoters: byId('check-voters'),
      checkAsk: byId('check-ask'),
      checkOk: byId('check-ok'),
      checkWrong: byId('check-wrong'),
      checkAnswer: byId('check-answer'),
      checkVerdict: byId('check-verdict'),
      checkMath: byId('check-math'),
      checkCard: byId('check-card'),
      checkBasis: byId('check-basis'),
      checkNext: byId('check-next'),
      endMissed: byId('end-missed'),
      endTrapsBlock: byId('end-traps-block'),
      endTraps: byId('end-traps'),
    };

    // 規則頁最下方也放「投票日，一起去看開票！」紫色區塊：直接複製結果頁那一份，
    // 這樣文案只要改 index.html 結果頁的那一段，兩頁都會跟著變
    byId('rules-callout').replaceWith(document.querySelector('#screen-end .callout').cloneNode(true));

    UI.el.rulesViolations = byId('rules-violations');
    UI.el.rulesTraps = byId('rules-traps');
    UI.el.soundButtons = [byId('btn-sound'), byId('btn-sound-home')];

    // 首頁：直接開始玩，或先了解規則
    byId('btn-start').addEventListener('click', () => UI.startGame('home'));
    byId('btn-rules').addEventListener('click', () => UI.showRules());
    byId('btn-rules-back').addEventListener('click', () => UI.showScreen('home'));
    byId('btn-rules-start').addEventListener('click', () => UI.startGame('rules'));
    byId('btn-again').addEventListener('click', () => {
      Track.event('play-again');
      UI.startGame('again');
    });
    byId('btn-home').addEventListener('click', () => {
      Track.event('go-home');
      UI.showScreen('home');
    });

    // 統計：點了哪個外部連結（另開分頁的連結都算），在哪個畫面點的
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[target="_blank"]');
      if (!link) return;
      const text = link.textContent.replace('（另開新分頁）', '').trim();
      Track.event('link-click', { link: text, screen: UI.currentScreen() });
    });

    // 統計：關掉網頁或切到別的 App 時，記下當時在哪個畫面（遊戲中的話玩到第幾秒）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      const data = { screen: UI.currentScreen() };
      if (Game.s && Game.s.running && !Game.s.introRunning) {
        data.seconds = Math.round((Game.now() - Game.s.startedAt) / 1000);
      }
      Track.event('leave', data);
    });

    // 核對票數的三個按鈕
    UI.el.checkOk.addEventListener('click', () => UI.answerVoteCheck(false));
    UI.el.checkWrong.addEventListener('click', () => UI.answerVoteCheck(true));
    UI.el.checkNext.addEventListener('click', () => UI.showEnd(Game.buildResult()));

    // 聲音開關（首頁和遊戲中各一個；音效和背景音樂一起開關）
    for (const button of UI.el.soundButtons) {
      button.addEventListener('click', () => {
        Sound.toggle();
        UI.refreshSoundButtons();
        Track.event(Sound.on ? 'sound-on' : 'sound-off', { screen: UI.currentScreen() });
      });
    }
    UI.refreshSoundButtons();
  },

  // 開始一局。from：從哪裡開始的（'home' 首頁、'rules' 規則頁、'again' 再玩一次），統計用
  startGame(from) {
    Sound.unlock(); // 瀏覽器規定要按過按鈕才能有聲音
    UI.gamesPlayed += 1;
    Track.event('game-start', { from, game: UI.gamesPlayed });
    Game.start();
  },

  gamesPlayed: 0, // 這次打開網頁後玩了幾局（統計用）

  // 現在顯示的是哪個畫面：'home'、'rules'、'game'、'end'（統計用）
  currentScreen() {
    for (const name in UI.el.screens) {
      if (!UI.el.screens[name].hidden) return name;
    }
    return 'unknown';
  },

  // 首頁的熊：用遊戲裡的熊，一直重複「拿到票 → 舉票」（要在 Scene.setup 之後呼叫）
  startHomeBear() {
    const bear = Scene.makeHomeBear(document.getElementById('home-bear'));
    const poses = [
      { pose: 'idle', ms: 600 }, //  手放著
      { pose: 'chest', ms: 500 }, // 拿到票
      { pose: 'raise', ms: 1700 }, // 舉票（每次章蓋在不同的候選人）
    ];
    let i = 0;
    const next = () => {
      const step = poses[i];
      // 不在首頁的時候不用換姿勢（計時照跑，回到首頁就接著動）
      if (!UI.el.screens.home.hidden) bear.setPose(step.pose);
      i = (i + 1) % poses.length;
      setTimeout(next, step.ms);
    };
    next();
  },

  // 更新聲音按鈕上的圖示和文字（🔊 開、🔇 關）
  refreshSoundButtons() {
    const [hudButton, homeButton] = UI.el.soundButtons;
    hudButton.textContent = Sound.on ? '🔊' : '🔇';
    hudButton.setAttribute('aria-label', Sound.on ? '聲音：開' : '聲音：關');
    homeButton.textContent = Sound.on ? '🔊 聲音：開' : '🔇 聲音：關';
    // 首頁的對話框提示：聲音還關著才顯示
    document.getElementById('sound-hint').hidden = Sound.on;
  },

  // 另開分頁的小圖示（方框＋往右上的箭頭）
  EXTERNAL_ICON:
    '<svg class="ext-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2h5v5M14 2L7 9M12 10v4H2V4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  // 做一個另開分頁的連結：文字＋小圖示（螢幕閱讀器會念「另開新分頁」）
  makeLink(text, url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    // 最後兩個字和圖示綁在一起（nowrap），圖示才不會自己掉到下一行
    const tail = document.createElement('span');
    tail.className = 'nowrap';
    tail.textContent = text.slice(-2);
    tail.insertAdjacentHTML('beforeend', UI.EXTERNAL_ICON + '<span class="sr-only">（另開新分頁）</span>');
    link.append(text.slice(0, -2), tail);
    return link;
  },

  // 把「依據：」和每個出處的連結放進 el。basis 是 [{ text, url }, ...]
  fillBasis(el, basis) {
    el.replaceChildren('依據：');
    basis.forEach((source, i) => {
      if (i > 0) el.append('；');
      el.append(UI.makeLink(source.text, source.url));
    });
  },

  // ---------- 先了解規則 ----------

  // 列出所有事件的教學卡，每張附上遊戲裡的截圖（第一次打開時才做）
  showRules() {
    Track.event('rules-open');
    const el = UI.el;
    if (el.rulesViolations.children.length === 0) {
      for (const event of EVENTS) {
        const card = UI.makeCard(event, event.atStart ? '開票前' : null);
        (event.isTrap ? el.rulesTraps : el.rulesViolations).appendChild(card);
      }
    }
    UI.showScreen('rules');
  },

  // 只顯示指定的畫面：'home'、'rules'、'game' 或 'end'
  showScreen(name) {
    for (const key in UI.el.screens) {
      UI.el.screens[key].hidden = key !== name;
    }
    UI.el.screens[name].scrollTop = 0;
    UI.el.modal.hidden = true;
    UI.el.check.hidden = true;
  },

  // 更新上方的愛心、分數、連擊。effect 傳 'hurt' 會讓愛心跳一下
  updateHud(s, effect) {
    const el = UI.el;

    // 愛心：剩下的是實心，扣掉的是空心（形狀不同，不只靠顏色分辨）
    const heart = 'M12 21 C5 15 2 11.5 2 8 a5 5 0 0 1 10 -1.5 a5 5 0 0 1 10 1.5 c0 3.5 -3 7 -10 13 z';
    let html = '';
    for (let i = 0; i < CONFIG.maxHearts; i++) {
      const kind = i < s.hearts ? 'heart' : 'heart lost';
      html += `<svg class="${kind}" viewBox="0 0 24 24" aria-hidden="true"><path d="${heart}"/></svg>`;
    }
    el.hearts.innerHTML = html;
    el.hearts.setAttribute('aria-label', `愛心剩 ${s.hearts} 顆`);

    el.score.textContent = s.score;
    el.combo.textContent = s.combo;
    el.mul.textContent = '×' + Game.multiplierFor(s.combo).toFixed(1);

    if (effect === 'hurt') {
      el.hearts.classList.remove('hurt');
      void el.hearts.offsetWidth; // 讓動畫可以重新播放
      el.hearts.classList.add('hurt');
    }
  },

  // 顯示提示視窗，按下按鈕後關閉並執行 onClose
  // options：{ title, body, basis（可省略，[{ text, url }]）, button }
  showModal(options, onClose) {
    const el = UI.el;
    el.modalTitle.textContent = options.title;
    el.modalBody.textContent = options.body;
    if (options.basis) UI.fillBasis(el.modalBasis, options.basis);
    el.modalBasis.hidden = !options.basis;
    el.modalBtn.textContent = options.button;
    el.modalBtn.onclick = () => {
      el.modal.hidden = true;
      onClose();
    };
    el.modal.hidden = false;

    // 剛跳出來的 0.4 秒內先不能按，避免手指還在螢幕上就誤按
    el.modalBtn.disabled = true;
    setTimeout(() => {
      el.modalBtn.disabled = false;
    }, 400);
  },

  // ---------- 核對票數 ----------

  // 開票結束：列出貼在門口的投開票報告表，問玩家對不對得起來
  showVoteCheck(count) {
    const el = UI.el;
    UI.voteCount = count;

    // 報告表的每一行：1 號～3 號、無效票、已領未投票
    el.checkRows.replaceChildren();
    const names = Scene.candidates.map((c, i) => `${i + 1} 號 ${c.emoji} ${c.name}`);
    names.push('無效票', '已領未投票');
    names.forEach((name, i) => {
      const row = document.createElement('tr');
      const label = document.createElement('td');
      label.textContent = name;
      const number = document.createElement('td');
      number.textContent = `${count.announced[i]} 張`;
      row.append(label, number);
      el.checkRows.appendChild(row);
    });
    el.checkVoters.textContent = count.voters;

    el.checkAsk.hidden = false;
    el.checkAnswer.hidden = true;
    el.check.hidden = false;
    Scene.hideBanner();

    // 剛跳出來的 0.4 秒內先不能按，避免手指還在螢幕上就誤按
    el.checkOk.disabled = true;
    el.checkWrong.disabled = true;
    setTimeout(() => {
      el.checkOk.disabled = false;
      el.checkWrong.disabled = false;
    }, 400);
  },

  // 玩家選好了：告訴他對不對，並說明怎麼算
  answerVoteCheck(saidWrong) {
    const el = UI.el;
    const count = UI.voteCount;
    const result = Game.answerVoteCheck(saidWrong);
    UI.updateHud(Game.s); // 分數有加減，上方的分數也更新

    // 用符號＋文字表示對錯（不只靠顏色）
    el.checkVerdict.textContent = result.correct
      ? `判斷正確！+${result.points}`
      : `判斷錯了 ${result.points}`;

    // 把報告表上的數字加起來給玩家看
    const [a, b, c, invalid, unvoted] = count.announced;
    const total = a + b + c + invalid + unvoted;
    const sum = `${a} + ${b} + ${c} + 無效 ${invalid} + 已領未投 ${unvoted} = ${total}`;
    el.checkMath.textContent = count.isWrong
      ? `${sum}，但領票人數是 ${count.voters}，差了 ${Math.abs(total - count.voters)} 張！`
      : `${sum}，跟領票人數 ${count.voters} 一樣。`;

    el.checkCard.textContent = count.isWrong
      ? '數字對不起來，代表有地方數錯了。這時候要請工作人員重新點算，找出哪裡算錯。'
      : '核對方法：有效票＋無效票＝投票數；投票數＋已領未投票＝領票人數。';
    UI.fillBasis(el.checkBasis, [
      manual('填具投開票報告表', 45),
      manual('過去案例：票數不符應重新點算', 137),
    ]);

    el.checkAsk.hidden = true;
    el.checkAnswer.hidden = false;
  },

  // 顯示結束頁
  showEnd(result) {
    Track.event('end-view');
    const el = UI.el;
    el.endScore.textContent = result.score;
    el.endAvg.textContent = UI.formatSeconds(result.avgReaction);
    el.endFast.textContent = UI.formatSeconds(result.fastest);
    el.endCombo.textContent = result.maxCombo;
    el.endTime.textContent = `這次陪動物村開票 ${Math.round(result.seconds)} 秒`;
    const check = result.voteCheck;
    el.endCheck.hidden = !check;
    if (check) {
      el.endCheck.textContent = check.correct
        ? `核對票數：判斷正確 +${check.points}`
        : `核對票數：判斷錯了 ${check.points}`;
    }

    // 漏掉的事件
    el.endMissed.replaceChildren();
    if (result.missed.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '每件事都提醒到了，太厲害了！';
      el.endMissed.appendChild(empty);
    } else {
      for (const item of result.missed) {
        el.endMissed.appendChild(UI.makeCard(item.event, `沒提醒到 ${item.count} 次`));
      }
    }

    // 點錯的陷阱（沒有的話整塊藏起來）
    el.endTraps.replaceChildren();
    el.endTrapsBlock.hidden = result.traps.length === 0;
    for (const item of result.traps) {
      el.endTraps.appendChild(UI.makeCard(item.event, `點了 ${item.count} 次`));
    }

    UI.showScreen('end');
  },

  // 做一張教學卡：遊戲截圖、名稱＋小標籤（可以是 null）、教學卡文字、依據
  // （規則頁和結果頁都用這個，所以兩邊的卡片長得一樣）
  makeCard(event, badgeText) {
    const card = document.createElement('article');
    card.className = event.isTrap ? 'card card-trap' : 'card';

    const title = document.createElement('h3');
    title.textContent = event.name;
    if (badgeText) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = badgeText;
      title.appendChild(badge);
    }

    const text = document.createElement('p');
    text.textContent = event.card;

    const basis = document.createElement('p');
    basis.className = 'basis';
    UI.fillBasis(basis, event.basis);

    card.append(Scene.snapshot(event), title, text, basis);
    return card;
  },

  // 毫秒 → 「0.85 秒」；沒有資料就顯示「—」
  formatSeconds(ms) {
    if (ms === null) return '—';
    return (ms / 1000).toFixed(2) + ' 秒';
  },
};

// ===== 程式從這裡開始：網頁載入後，準備好音效、介面和遊戲 =====
Sound.init();
UI.init();
Game.init();
UI.startHomeBear();
