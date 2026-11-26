// =============================================
// track.js — 匿名統計（Umami）
//
// 用來了解「多少人玩、玩到哪個環節」，例如：
//   有多少人按了開始、撐了幾秒、核對票數答對幾成、點了哪個連結。
// 不使用 cookie，也不收集姓名、帳號、聯絡方式。
//
// Umami 的程式碼寫在 index.html 的 <head>，設定了：
//   data-domains="0chixuan0.github.io" → 只有正式網站會記錄，在自己電腦上測試不會算進去
//   data-do-not-track="true"           → 瀏覽器有開「不要追蹤」的人不記錄
//
// 在自己電腦上（localhost）測試時，事件會印在瀏覽器的 Console，
// 方便確認有沒有在對的時機記錄（Chrome 按 Cmd + Option + J 打開 Console）。
// 統計報表請到 https://cloud.umami.is 登入查看。
// =============================================

const Track = {
  // 記錄一個事件。name：事件名稱；data（可省略）：附帶的資料，例如 { seconds: 30 }
  event(name, data) {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log('[統計]', name, data || ''); // 本機測試：只印出來，不會送出
    }
    try {
      // 被廣告阻擋器擋掉、或網路還沒載入 Umami 時，window.umami 會不存在，就什麼都不做
      if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(name, data);
      }
    } catch (e) {
      // 統計失敗不影響遊戲
    }
  },
};
