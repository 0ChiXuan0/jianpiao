// =============================================
// sound.js — 音效
//
// 用瀏覽器內建的 Web Audio API 即時「合成」音效和背景音樂，
// 不需要任何音效檔、也不用安裝套件，所以沒有版權問題（旋律是自己寫的）。
// 可以關掉，預設開啟，開關設定會記在這台裝置的瀏覽器裡（localStorage）。
// =============================================

const Sound = {
  ctx: null, //  瀏覽器的音訊引擎（第一次按按鈕時才建立）
  on: true, //   音效開或關
  musicWanted: false, // 遊戲是不是想要播背景音樂（聲音關掉時記著，打開再繼續）
  musicTimer: null, //   排音符用的計時器
  musicStep: 0, //       現在排到旋律的第幾個音
  musicNext: 0, //       下一個音要在什麼時間響（音訊引擎的秒數）

  // 每種音效由幾個「音」組成：
  //   freq 音高（Hz，數字越大越高）、at 第幾秒開始、len 長度（秒）
  //   type 音色：'triangle' 柔和、'square' 像電子遊戲、'sine' 很純、'sawtooth' 比較刺
  //          'noise' 沙沙的雜音（關門、快門用），freq 是雜音的高低（越小越悶）
  //   slideTo（可省略）結束時滑到的音高
  SOUNDS: {
    // 成功制止：叮咚（往上）
    stop: [
      { freq: 784, at: 0, len: 0.08 },
      { freq: 1175, at: 0.07, len: 0.14 },
    ],
    // 漏掉：低沉的「噗──」
    miss: [{ freq: 220, at: 0, len: 0.3, type: 'square', slideTo: 130, volume: 0.06 }],
    // 亂點：短短的「咚」
    misclick: [{ freq: 160, at: 0, len: 0.09, type: 'sine', volume: 0.2 }],
    // 點到陷阱：往下的三個音
    trap: [
      { freq: 523, at: 0, len: 0.1 },
      { freq: 392, at: 0.1, len: 0.1 },
      { freq: 262, at: 0.2, len: 0.22 },
    ],
    // 開始：往上的三個音
    start: [
      { freq: 523, at: 0, len: 0.09 },
      { freq: 659, at: 0.09, len: 0.09 },
      { freq: 784, at: 0.18, len: 0.16 },
    ],
    // 關門：「砰」一聲悶響，再「喀」一下
    door: [
      { type: 'noise', freq: 500, at: 0, len: 0.14, volume: 0.35 },
      { type: 'sine', freq: 120, at: 0, len: 0.2, slideTo: 55, volume: 0.3 },
      { type: 'noise', freq: 2500, at: 0.16, len: 0.04, volume: 0.15 },
    ],
    // 相機快門：「喀嚓」
    shutter: [
      { type: 'noise', freq: 3500, at: 0, len: 0.03, volume: 0.25 },
      { type: 'noise', freq: 2500, at: 0.08, len: 0.05, volume: 0.2 },
    ],
    // 停電：電器關掉的「嗚──」
    powerdown: [{ type: 'sawtooth', freq: 440, at: 0, len: 0.6, slideTo: 50, volume: 0.06 }],
    // 結束：慢慢往下
    gameover: [
      { freq: 392, at: 0, len: 0.16 },
      { freq: 330, at: 0.16, len: 0.16 },
      { freq: 262, at: 0.32, len: 0.16 },
      { freq: 196, at: 0.48, len: 0.4 },
    ],
  },

  // 網頁載入時：讀取上次的開關設定
  init() {
    try {
      Sound.on = localStorage.getItem('soundOn') !== 'off';
    } catch (e) {
      Sound.on = true; // 無痕模式等情況讀不到，就用預設值
    }
    // 切到別的 App 或分頁時，聲音（包含背景音樂）先停，回來再繼續
    document.addEventListener('visibilitychange', () => {
      if (!Sound.ctx) return;
      if (document.hidden) Sound.ctx.suspend();
      else Sound.ctx.resume();
    });
  },

  // 瀏覽器規定：要使用者按過按鈕後才能發出聲音。所以在按「開始」時呼叫這個
  unlock() {
    if (!Sound.ctx) {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return; // 很舊的瀏覽器不支援，就安靜地玩
      Sound.ctx = new AudioEngine();
    }
    if (Sound.ctx.state === 'suspended') Sound.ctx.resume();
  },

  // 切換開關，回傳切換後的狀態
  toggle() {
    Sound.on = !Sound.on;
    try {
      localStorage.setItem('soundOn', Sound.on ? 'on' : 'off');
    } catch (e) {
      // 存不了就算了，這次還是有效
    }
    if (Sound.on) {
      Sound.unlock();
      if (Sound.musicWanted) Sound.playMusic(); // 遊戲中重新打開：音樂接著播
    } else {
      Sound.haltMusic();
    }
    return Sound.on;
  },

  // 播放一種音效，例如 Sound.play('stop')
  play(name) {
    if (!Sound.on || !Sound.ctx) return;
    for (const note of Sound.SOUNDS[name]) {
      if (note.type === 'noise') Sound.noise(note);
      else Sound.tone(note);
    }
  },

  // 一段沙沙的雜音（隨機數字），用 lowpass 濾波器讓它變悶一點
  noise({ freq, at, len, volume = 0.15 }) {
    const ctx = Sound.ctx;
    const start = ctx.currentTime + at;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); // 濾波器：只讓 freq 以下的聲音通過
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
  },

  // ---------- 背景音樂 ----------
  // 自己寫的一小段輕快旋律（4 小節，一直重複）。
  // 數字是音高（MIDI 編號：60 = 中央 Do，每 +1 升半音），null 是休息

  MUSIC: {
    beat: 0.27, // 每個八分音符幾秒（數字越小越快）
    melody: [
      72, 76, 79, 76, 77, 76, 74, null, // Do Mi Sol Mi Fa Mi Re
      72, 69, 72, 76, 74, 72, 69, null, // Do La Do Mi Re Do La
      69, 72, 77, 76, 74, 72, 74, 76, //   La Do Fa Mi Re Do Re Mi
      79, null, 77, 74, 71, 74, 72, null, // Sol Fa Re Si Re Do
    ],
    // 每小節的低音（每拍一個音，一小節 4 拍）
    bass: [
      48, 55, 48, 55, // C 和弦
      45, 52, 45, 52, // Am 和弦
      41, 48, 41, 48, // F 和弦
      43, 50, 43, 50, // G 和弦
    ],
  },

  // 遊戲開始時呼叫：想要播音樂（聲音關著就先記著）
  startMusic() {
    Sound.musicWanted = true;
    Sound.playMusic();
  },

  // 遊戲結束時呼叫：不要音樂了
  stopMusic() {
    Sound.musicWanted = false;
    Sound.haltMusic();
  },

  playMusic() {
    if (!Sound.on || !Sound.ctx || Sound.musicTimer) return;
    Sound.musicStep = 0;
    Sound.musicNext = Sound.ctx.currentTime + 0.1;
    // 每 0.1 秒檢查一次，把接下來 0.3 秒內要響的音先排好（這樣節奏才會穩）
    Sound.musicTimer = setInterval(Sound.scheduleMusic, 100);
  },

  haltMusic() {
    clearInterval(Sound.musicTimer);
    Sound.musicTimer = null;
  },

  scheduleMusic() {
    const ctx = Sound.ctx;
    const music = Sound.MUSIC;
    // 落後太多（例如手機卡了一下），就從現在重新接上，不要一次補一大堆音
    if (Sound.musicNext < ctx.currentTime) Sound.musicNext = ctx.currentTime + 0.05;
    while (Sound.musicNext < ctx.currentTime + 0.3) {
      const step = Sound.musicStep;
      const at = Sound.musicNext - ctx.currentTime;
      const note = music.melody[step];
      if (note !== null) {
        Sound.tone({ freq: Sound.midiToFreq(note), at, len: music.beat * 0.9, volume: 0.04 });
      }
      // 低音每 2 個八分音符（一拍）響一次
      if (step % 2 === 0) {
        const bass = music.bass[step / 2];
        Sound.tone({ freq: Sound.midiToFreq(bass), at, len: music.beat * 1.8, type: 'sine', volume: 0.07 });
      }
      Sound.musicNext += music.beat;
      Sound.musicStep = (step + 1) % music.melody.length;
    }
  },

  // MIDI 音高編號 → 頻率（Hz）。69 是 La（440 Hz）
  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  },

  // 發出一個音
  tone({ freq, at, len, type = 'triangle', slideTo, volume = 0.15 }) {
    const ctx = Sound.ctx;
    const start = ctx.currentTime + at;
    const end = start + len;

    const osc = ctx.createOscillator(); // 發聲器
    const gain = ctx.createGain(); //      音量控制
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);

    // 音量：很快變大，再慢慢變小（避免「啪」的雜音）
    gain.gain.setValueAtTime(0.0001, Math.max(start, ctx.currentTime));
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  },
};
