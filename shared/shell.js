(function () {
  "use strict";

  var BASE = "/mini-arcade";
  var GAMES = [
    { id: "big-fish", name: "大鱼吃小鱼", blurb: "开场即玩，吃掉小鱼" },
    { id: "gold-miner", name: "黄金矿工", blurb: "十五关钩矿" },
    { id: "snake", name: "贪吃蛇", blurb: "霓虹蛇越吃越长" },
    { id: "tetris", name: "俄罗斯方块", blurb: "消行冲关" },
    { id: "2048", name: "2048", blurb: "滑动合并数字" },
    { id: "gomoku", name: "五子棋", blurb: "15×15 五子连珠" },
    { id: "xiangqi", name: "中国象棋", blurb: "楚河汉界" },
    { id: "reversi", name: "黑白棋", blurb: "翻转夹击" },
    { id: "ludo", name: "飞行棋", blurb: "掷骰起飞" },
    { id: "tower-bloxx", name: "盖大楼", blurb: "摇摆叠楼冲高" }
  ];

  var gameId = document.body.getAttribute("data-game") || "";
  var current = null;
  for (var i = 0; i < GAMES.length; i++) {
    if (GAMES[i].id === gameId) current = GAMES[i];
  }

  var root = document.getElementById("arcade-root");
  var frame = document.getElementById("arcade-frame");
  var menuOpen = false;
  var hiddenHold = false;

  function hrefFor(id) {
    return BASE + "/games/" + id + "/";
  }

  var bar = document.createElement("header");
  bar.className = "arcade-bar";
  var home = document.createElement("a");
  home.className = "brand-link";
  home.href = BASE + "/";
  home.innerHTML = '<span class="brand-mark" aria-hidden="true"></span><span>合集</span>';
  var now = document.createElement("div");
  now.className = "now-playing";
  now.innerHTML = current
    ? "<strong>" + current.name + "</strong>"
    : "<strong>小游戏合集</strong>";
  var menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "menu-btn";
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-controls", "arcade-menu");
  menuBtn.textContent = "换游戏";
  bar.appendChild(home);
  bar.appendChild(now);
  bar.appendChild(menuBtn);
  root.appendChild(bar);

  var backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "arcade-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-label", "关闭游戏列表");
  var menu = document.createElement("nav");
  menu.id = "arcade-menu";
  menu.className = "arcade-menu";
  menu.hidden = true;
  menu.setAttribute("aria-label", "选择游戏");
  GAMES.forEach(function (game) {
    var link = document.createElement("a");
    link.className = "menu-link";
    link.href = hrefFor(game.id);
    if (game.id === gameId) link.setAttribute("aria-current", "page");
    link.innerHTML = "<b>" + game.name + "</b><span>" + game.blurb + "</span>";
    menu.appendChild(link);
  });
  document.body.appendChild(backdrop);
  document.body.appendChild(menu);

  var catalog = document.getElementById("arcade-catalog");
  if (catalog) {
    catalog.innerHTML =
      '<div class="catalog-intro"><h1>小游戏合集</h1><p>点开哪一款，才加载哪一款。刷新、收藏和浏览器后退都停在当前游戏。</p></div>';
    var grid = document.createElement("div");
    grid.className = "catalog-grid";
    GAMES.forEach(function (game) {
      var card = document.createElement("a");
      card.className = "game-card";
      card.href = hrefFor(game.id);
      card.style.setProperty("--hue", hueFor(game.id));
      card.innerHTML = "<b>" + game.name + "</b><span>" + game.blurb + "</span>";
      grid.appendChild(card);
    });
    catalog.appendChild(grid);
  }

  function hueFor(id) {
    if (id === "big-fish") return "200";
    if (id === "gold-miner") return "42";
    if (id === "snake") return "155";
    if (id === "tetris") return "265";
    if (id === "2048") return "330";
    if (id === "gomoku") return "25";
    if (id === "xiangqi") return "12";
    if (id === "reversi") return "168";
    if (id === "ludo") return "280";
    if (id === "tower-bloxx") return "210";
    return "200";
  }

  function post(action) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: "arcade", action: action }, location.origin);
  }

  function measureBar() {
    document.documentElement.style.setProperty("--bar-h", bar.offsetHeight + "px");
  }

  function syncViewport() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--vvh", Math.round(h) + "px");
    measureBar();
  }

  function setMenu(open) {
    menuOpen = !!open;
    menu.hidden = !menuOpen;
    backdrop.hidden = !menuOpen;
    menuBtn.setAttribute("aria-expanded", menuOpen ? "true" : "false");
    if (menuOpen) post("suspend");
    else if (!hiddenHold) {
      post("resume");
      focusGame();
    }
  }

  function focusGame() {
    if (!frame) return;
    try { frame.focus(); } catch (err) {}
  }

  menuBtn.addEventListener("click", function () { setMenu(!menuOpen); });
  backdrop.addEventListener("click", function () { setMenu(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && menuOpen) {
      setMenu(false);
      event.preventDefault();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      hiddenHold = true;
      post("suspend");
    } else {
      hiddenHold = false;
      if (!menuOpen) post("resume");
    }
  });
  window.addEventListener("pagehide", function () { post("suspend"); });

  if (frame) {
    frame.addEventListener("load", function () {
      focusGame();
      if (menuOpen || document.hidden) post("suspend");
    });
    window.addEventListener("keydown", function (event) {
      if (!frame.contentWindow) return;
      if (menuOpen) return;
      var target = event.target;
      if (target && target.closest && target.closest(".arcade-bar, .arcade-menu")) return;
      if (document.activeElement === frame) return;
      var tag = target && target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      try {
        frame.contentWindow.dispatchEvent(new KeyboardEvent(event.type, {
          key: event.key,
          code: event.code,
          bubbles: true,
          cancelable: true
        }));
      } catch (err) {}
      if (event.type === "keydown" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(event.code) !== -1) {
        event.preventDefault();
      }
    }, true);
    window.addEventListener("keyup", function (event) {
      if (!frame.contentWindow || menuOpen) return;
      if (document.activeElement === frame) return;
      try {
        frame.contentWindow.dispatchEvent(new KeyboardEvent("keyup", {
          key: event.key,
          code: event.code,
          bubbles: true,
          cancelable: true
        }));
      } catch (err) {}
    }, true);
  }

  syncViewport();
  window.addEventListener("resize", syncViewport);
  window.addEventListener("orientationchange", function () { setTimeout(syncViewport, 60); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewport);
    window.visualViewport.addEventListener("scroll", syncViewport);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(BASE + "/sw.js?v=7", { scope: BASE + "/" }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () {
      // The first document loads before the worker controls it, so its files
      // were not cached. One reload brings this page and the open game into the cache.
      if (navigator.serviceWorker.controller) return;
      if (sessionStorage.getItem("arcade-controlled")) return;
      sessionStorage.setItem("arcade-controlled", "1");
      location.reload();
    }).catch(function () {});
  }
})();
