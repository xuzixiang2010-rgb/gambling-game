/* ============================================================
 * mahjong.js —— 川麻 · 四人血战到底（独立娱乐模式，不消耗生命）
 * 规则要点：
 *  - 仅用 万/筒/条 共 108 张（无风箭花）
 *  - 开局「定缺」：每家选一门花色，必须先打光该门，且胡牌时手上不能有缺门牌
 *  - 只「碰/杠/胡」，不能「吃」
 *  - 自摸 / 点炮 / 抢杠 / 一炮多响；杠有刮风下雨
 *  - 血战到底：有人胡牌后继续，直到剩一家或牌摸完
 *  - 三家对手由 AI 自动出牌；玩家自己控制摸牌与出牌
 * ============================================================ */
(function () {
  "use strict";

  const SUIT_CH = ["万", "筒", "条"];
  const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const SEAT_NAME = ["我", "下家", "对家", "上家"];
  const suitOf = (t) => Math.floor(t / 9);
  const rankOf = (t) => (t % 9) + 1;
  const tIdx = (s, r) => s * 9 + (r - 1);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const beep = (fn) => { try { if (window.SoundFX && SoundFX[fn]) SoundFX[fn](); } catch (e) {} };
  const MJ = (key, vars) => (window.I18N ? I18N.mj(key, vars) : key);
  const suitName = (i) => (window.I18N ? I18N.mjSuit(i) : SUIT_CH[i]);
  const rankName = (i) => (window.I18N ? I18N.mjRank(i) : CN[i]);
  const seatName = (i) => (window.I18N ? I18N.mjSeat(i) : SEAT_NAME[i]);
  const fanName = (name) => (window.I18N ? I18N.mjFan(name) : name);
  const byName = (type) => (window.I18N ? I18N.mjBy(type) : ({ selfDraw: "自摸", robKong: "抢杠", discard: "点炮" }[type]));

  let G = null;

  /* ============================================================
   * 胡牌判定
   * ============================================================ */
  function counts27(hand) { const c = new Array(27).fill(0); for (const t of hand) c[t]++; return c; }

  function canSets(c, need) {
    let i = 0; while (i < 27 && c[i] === 0) i++;
    if (i === 27) return need === 0;
    if (need === 0) return false;
    let ok = false;
    if (c[i] >= 3) { c[i] -= 3; ok = canSets(c, need - 1); c[i] += 3; if (ok) return true; }
    if (i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; ok = canSets(c, need - 1); c[i]++; c[i + 1]++; c[i + 2]++;
      if (ok) return true;
    }
    return false;
  }
  function isStdWin(c, need) {
    for (let i = 0; i < 27; i++) if (c[i] >= 2) { c[i] -= 2; const ok = canSets(c, need); c[i] += 2; if (ok) return true; }
    return false;
  }
  function isSevenPairs(c) { let tot = 0; for (const x of c) { if (x % 2 !== 0) return false; tot += x; } return tot === 14; }
  function tripletsOnly(c, need) {
    let i = 0; while (i < 27 && c[i] === 0) i++;
    if (i === 27) return need === 0;
    if (need === 0) return false;
    if (c[i] >= 3) { c[i] -= 3; const ok = tripletsOnly(c, need - 1); c[i] += 3; return ok; }
    return false;
  }
  function isAllTriplets(c, need) {
    for (let i = 0; i < 27; i++) if (c[i] >= 2) { c[i] -= 2; const ok = tripletsOnly(c, need); c[i] += 2; if (ok) return true; }
    return false;
  }
  // p.hand 已包含将要胡的那张；que 缺门校验
  function canHuCounts(c, melds, que) {
    for (let r = 0; r < 9; r++) if (c[que * 9 + r] > 0) return false; // 不能含缺门
    const need = 4 - melds.length;
    if (melds.length === 0 && isSevenPairs(c)) return true;
    return isStdWin(c, need);
  }
  function selfWin(p) { return canHuCounts(counts27(p.hand), p.melds, p.que); }
  function winWith(p, tile) { const c = counts27(p.hand); c[tile]++; return canHuCounts(c, p.melds, p.que); }
  function queTilesInHand(p) { return p.hand.filter((t) => suitOf(t) === p.que).length; }

  /* ============================================================
   * 番型 & 算分
   * ============================================================ */
  function allTiles(p, winTile) {
    const arr = p.hand.slice(); if (winTile != null) arr.push(winTile);
    for (const m of p.melds) for (let k = 0; k < (m.type === "peng" ? 3 : 4); k++) arr.push(m.tile);
    return arr;
  }
  function computeScore(p, winTile, ctx) {
    const c = counts27(p.hand); if (winTile != null) c[winTile]++;
    const need = 4 - p.melds.length;
    const names = []; let fan = 0;
    const seven = p.melds.length === 0 && isSevenPairs(c);
    const longSeven = seven && c.some((x) => x === 4);
    // 清一色
    const all = allTiles(p, winTile);
    const suits = new Set(all.map(suitOf));
    const qing = suits.size === 1;
    // 碰碰胡
    const pengpeng = !seven && p.melds.every((m) => m.type !== "chi") && isAllTriplets(c.slice(), need);
    if (ctx.selfDraw) { fan += 1; names.push("自摸"); }
    if (longSeven) { fan += 3; names.push("龙七对"); }
    else if (seven) { fan += 2; names.push("七对"); }
    if (pengpeng) { fan += 1; names.push("碰碰胡"); }
    if (qing) { fan += 2; names.push("清一色"); }
    if (ctx.gangFlower) { fan += 1; names.push(ctx.selfDraw ? "杠上开花" : "杠上炮"); }
    if (ctx.robKong) { fan += 1; names.push("抢杠胡"); }
    if (ctx.haiDi) { fan += 1; names.push(ctx.selfDraw ? "海底捞月" : "海底炮"); }
    // 根：任意一种牌出现 4 张（含杠）
    const cntAll = new Array(27).fill(0); for (const t of all) cntAll[t]++;
    let gen = 0; for (const x of cntAll) if (x === 4) gen++;
    if (gen > 0) { fan += gen; names.push("根x" + gen); }
    if (names.length === 0) names.push("平胡");
    fan = Math.min(fan, 8);
    const points = 1 << fan;
    return { points, names, fan };
  }

  /* ============================================================
   * 牌面渲染
   * ============================================================ */
  function faceHTML(tile) {
    const s = suitOf(tile), r = rankOf(tile);
    if (s === 0) return `<span class="wan-n">${CN[r]}</span><span class="wan-w">萬</span>`;
    const cls = s === 1 ? "dot" : "bam";
    let pips = ""; for (let i = 0; i < r; i++) pips += `<i class="${cls}"></i>`;
    return `<span class="pipbox c${r} ${s === 1 ? "tong" : "tiao"}">${pips}</span>`;
  }
  function tileHTML(tile, opts = {}) {
    const size = opts.size || "";
    if (opts.back) return `<div class="mtile back ${size}"></div>`;
    const extra = (opts.cls || "");
    const data = opts.idx != null ? ` data-disc="1"` : "";
    return `<div class="mtile ${size} ${extra}"${data}>${faceHTML(tile)}</div>`;
  }
  function meldHTML(m, size) {
    const n = m.type === "peng" ? 3 : 4;
    let s = `<div class="meld">`;
    for (let i = 0; i < n; i++) {
      const hidden = m.type === "angang" && (i === 0 || i === 3);
      s += hidden ? `<div class="mtile ${size} back"></div>` : tileHTML(m.tile, { size });
    }
    return s + `</div>`;
  }

  /* ============================================================
   * 渲染整个桌面
   * ============================================================ */
  function render() {
    const app = $("mjApp"); if (!app) return;
    const me = G.players[0];
    // 手牌排序（仅显示用）
    const myHand = me.hand.slice().sort((a, b) => a - b);

    // 顶部栏
    let html = `<div class="mj-bar">
      <span class="mj-logo">${MJ("logo")}</span>
      <span>${MJ("wallLeft", { n: G.wall.length })}</span>
      <span class="spacer"></span>
      <button id="mjRestart">${MJ("restart")}</button>
      <button id="mjExit">${MJ("back")}</button>
    </div>`;

    html += `<div class="mj-table">`;

    // 三家对手
    for (const seat of [2, 3, 1]) {
      const p = G.players[seat];
      const cls = seat === 2 ? "seat-top" : seat === 3 ? "seat-left" : "seat-right";
      const side = seat === 2; // 横向
      const handWrap = side ? "hand-row" : "hand-col";
      const meldWrap = side ? "meld-row" : "meld-col";
      let backs = "";
      for (let i = 0; i < p.hand.length; i++) backs += `<div class="mtile sm back"></div>`;
      let melds = ""; for (const m of p.melds) melds += meldHTML(m, "sm");
      html += `<div class="seat ${cls}${G.turn === seat && !G.over ? " turn" : ""}${p.finished ? " win" : ""}">
        <span class="arm">✋</span>
        <span class="name">${seatName(seat)}${seat === G.dealer ? MJ("dealer") : ""} <span class="q">${p.que != null ? MJ("quePrefix") + suitName(p.que) : ""}</span> <span class="sc">${p.score}</span>${p.finished ? MJ("winMark") : ""}</span>
        <div class="${meldWrap}">${melds}</div>
        <div class="${handWrap}">${backs}</div>
      </div>`;
    }

    // 中央：弃牌河 + 牌池
    const discZone = (seat) => {
      const p = G.players[seat];
      let d = "";
      p.discards.forEach((t, i) => {
        const last = G.lastDiscard && G.lastDiscard.by === seat && i === p.discards.length - 1 && !G.lastDiscard.taken;
        d += `<div class="mtile sm${last ? " last" : ""}">${faceHTML(t)}</div>`;
      });
      return d;
    };
    html += `<div class="mj-center">
      <div class="disc disc-top">${discZone(2)}</div>
      <div class="disc disc-left">${discZone(3)}</div>
      <div class="mj-pool"><span class="num">${G.wall.length}</span><span class="lbl">${MJ("pool")}</span></div>
      <div class="disc disc-right">${discZone(1)}</div>
      <div class="disc disc-bottom">${discZone(0)}</div>
    </div>`;

    // 我的座位
    const legal = G.askData && G.askData.legal ? G.askData.legal : null;
    let myMelds = ""; for (const m of me.melds) myMelds += meldHTML(m, "");
    let myTiles = "";
    myHand.forEach((t) => {
      let cls = "";
      if (legal) cls = legal.has(t) ? "legal" : "dim";
      if (G.justDrew != null && t === G.justDrew && G._drewFlag) { cls += " drawn"; }
      myTiles += `<div class="mtile big ${cls}" data-tile="${t}">${faceHTML(t)}</div>`;
    });
    html += `<div class="seat seat-bottom${G.turn === 0 && !G.over ? " turn" : ""}${me.finished ? " win" : ""}">
      <span class="arm">✋</span>
      <span class="name">${seatName(0)}${G.dealer === 0 ? MJ("dealer") : ""} <span class="q">${me.que != null ? MJ("quePrefix") + suitName(me.que) : ""}</span> <span class="sc">${me.score}</span>${me.finished ? MJ("winMark") : ""}</span>
      <div class="meld-row">${myMelds}</div>
      <div class="hand-row hand0">${myTiles}</div>
    </div>`;

    html += `</div>`; // table

    // 操作区
    html += `<div class="mj-controls"><div class="mj-status">${G.status || ""}</div><div class="mj-buttons" id="mjButtons"></div></div>`;

    app.innerHTML = html;

    // 按钮区
    const bzone = $("mjButtons");
    if (G.buttons) for (const b of G.buttons) {
      const el = document.createElement("button");
      el.className = "mj-btn " + (b.cls || "");
      el.textContent = b.label;
      el.onclick = () => b.onClick();
      bzone.appendChild(el);
    }
    // 可点击的手牌（出牌）
    if (legal) {
      app.querySelectorAll(".hand0 .mtile.legal").forEach((el) => {
        el.onclick = () => { const t = +el.dataset.tile; if (G.onTileClick) G.onTileClick(t); };
      });
    }
    $("mjRestart").onclick = () => startMahjong();
    $("mjExit").onclick = () => exitMahjong();

    // 伸手动画
    if (G.anim) {
      const seat = G.anim.seat;
      const map = { 0: "reach-b", 1: "reach-r", 2: "reach-t", 3: "reach-l" };
      const seatEl = app.querySelector(seat === 0 ? ".seat-bottom .arm" : seat === 1 ? ".seat-right .arm" : seat === 2 ? ".seat-top .arm" : ".seat-left .arm");
      if (seatEl) { void seatEl.offsetWidth; seatEl.classList.add(map[seat]); }
    }
  }

  /* ============================================================
   * 动作（含动画）
   * ============================================================ */
  async function reach(seat) { G.anim = { seat }; render(); await sleep(620); G.anim = null; }

  function drawFromWall(replacement) {
    if (G.wall.length === 0) return null;
    return replacement ? G.wall.pop() : G.wall.shift();
  }

  /* ============================================================
   * 人机输入
   * ============================================================ */
  function ask() { return new Promise((res) => { G.resolver = res; }); }
  function answer(v) { const r = G.resolver; G.resolver = null; G.buttons = null; G.askData = null; G.onTileClick = null; if (r) r(v); }

  /* ============================================================
   * 定缺
   * ============================================================ */
  function aiChooseQue(p) {
    const cnt = [0, 0, 0]; for (const t of p.hand) cnt[suitOf(t)]++;
    let best = 0; for (let s = 1; s < 3; s++) if (cnt[s] < cnt[best]) best = s; // 张数最少的一门
    return best;
  }
  async function quePhase() {
    for (const p of G.players) if (p.isAI) p.que = aiChooseQue(p);
    // 玩家定缺弹层
    const cnt = [0, 0, 0]; for (const t of G.players[0].hand) cnt[suitOf(t)]++;
    G.status = MJ("chooseQueStatus");
    render();
    showQueModal(cnt);
    const que = await ask();
    G.players[0].que = que;
    closeModal();
    G.players.forEach(updateQueDone);
    G.status = MJ("queSet", { suit: suitName(que) });
    render();
    await sleep(500);
  }
  function showQueModal(cnt) {
    const app = $("mjApp");
    const m = document.createElement("div");
    m.className = "mj-modal"; m.id = "mjModal";
    m.innerHTML = `<div class="box"><h3>${MJ("queTitle")}</h3>
      <p>${MJ("queHelp")}</p>
      <div class="mj-que-opts">
        <button class="q" data-s="0">${suitName(0)}<small>${MJ("countTiles", { n: cnt[0] })}</small></button>
        <button class="q" data-s="1">${suitName(1)}<small>${MJ("countTiles", { n: cnt[1] })}</small></button>
        <button class="q" data-s="2">${suitName(2)}<small>${MJ("countTiles", { n: cnt[2] })}</small></button>
      </div></div>`;
    app.appendChild(m);
    m.querySelectorAll(".q").forEach((b) => (b.onclick = () => answer(+b.dataset.s)));
  }
  function closeModal() { const m = $("mjModal"); if (m) m.remove(); }
  function updateQueDone(p) { p.queDone = !p.hand.some((t) => suitOf(t) === p.que); }

  /* ============================================================
   * AI 出牌 / 决策
   * ============================================================ */
  function aiDiscard(p) {
    updateQueDone(p);
    if (!p.queDone) {
      const ques = p.hand.filter((t) => suitOf(t) === p.que);
      return ques[Math.floor(Math.random() * ques.length)];
    }
    const c = counts27(p.hand);
    const distinct = [...new Set(p.hand)];
    let worst = distinct[0], worstScore = Infinity;
    for (const t of distinct) {
      const s = suitOf(t), r = rankOf(t);
      let score = (c[t] - 1) * 4; // 对子/刻子很有用
      const left = s * 9, right = s * 9 + 8;
      if (t - 1 >= left) score += c[t - 1] * 2;
      if (t + 1 <= right) score += c[t + 1] * 2;
      if (t - 2 >= left) score += c[t - 2];
      if (t + 2 <= right) score += c[t + 2];
      if (r === 1 || r === 9) score -= 1; // 幺九略差
      if (score < worstScore) { worstScore = score; worst = t; }
    }
    return worst;
  }
  function aiWantPeng(p) { updateQueDone(p); return p.queDone && (p.melds.length > 0 ? Math.random() < 0.78 : Math.random() < 0.42); }
  function aiWantGangDiscard(p) { updateQueDone(p); return p.queDone && Math.random() < 0.7; }

  /* ============================================================
   * 自摸阶段（含暗杠 / 补杠 / 自摸胡）
   * ============================================================ */
  function selfOptions(p) {
    const opts = { win: false, angang: [], bugang: [] };
    if (!p.queDone) return opts; // 没打完缺，不能胡/杠
    opts.win = selfWin(p);
    const c = counts27(p.hand);
    for (let t = 0; t < 27; t++) if (c[t] === 4 && suitOf(t) !== p.que) opts.angang.push(t);
    for (const m of p.melds) if (m.type === "peng" && p.hand.includes(m.tile) && suitOf(m.tile) !== p.que) opts.bugang.push(m.tile);
    return opts;
  }
  function doAngang(p, tile) {
    for (let k = 0; k < 4; k++) p.hand.splice(p.hand.indexOf(tile), 1);
    p.melds.push({ type: "angang", tile });
    // 刮风：暗杠其他未胡家各赔 2
    payGang(p, 2);
  }
  function doBugang(p, tile) {
    p.hand.splice(p.hand.indexOf(tile), 1);
    const m = p.melds.find((mm) => mm.type === "peng" && mm.tile === tile);
    m.type = "bugang";
    payGang(p, 1); // 弯杠各赔 1
  }
  function payGang(ganger, amt) {
    for (const q of G.players) if (q !== ganger && !q.finished) { q.score -= amt; ganger.score += amt; }
  }

  // 处理某家「摸牌后」的全过程，返回 {type:'win'} 或 {type:'discard', tile} 或 {type:'flow'}
  async function selfPhase(seat, gangChain) {
    const p = G.players[seat];
    while (true) {
      updateQueDone(p);
      const opts = selfOptions(p);
      if (p.isAI) {
        if (opts.win) { await recordWin(seat, { selfDraw: true, gangFlower: gangChain, haiDi: G.wall.length === 0 }); return { type: "win" }; }
        if (opts.angang.length && Math.random() < 0.85) {
          doAngang(p, opts.angang[0]); beep("diceLand");
          const rep = drawFromWall(true); if (rep == null) return { type: "flow" };
          p.hand.push(rep); gangChain = true; continue;
        }
        if (opts.bugang.length && Math.random() < 0.8) {
          const tile = opts.bugang[0];
          const robbed = await robKongWindow(seat, tile);
          if (robbed) return { type: "robbed" };
          doBugang(p, tile); beep("diceLand");
          const rep = drawFromWall(true); if (rep == null) return { type: "flow" };
          p.hand.push(rep); gangChain = true; continue;
        }
        await sleep(450);
        return { type: "discard", tile: aiDiscard(p) };
      } else {
        // 玩家：高亮可出的牌 + 显示 胡/杠 按钮
        const legal = legalDiscards(p);
        G.askData = { legal };
        G.buttons = [];
        if (opts.win) G.buttons.push({ label: MJ("selfHu"), cls: "hu", onClick: () => answer({ type: "win" }) });
        for (const t of opts.angang) G.buttons.push({ label: MJ("anGang", { tile: tileText(t) }), cls: "gang", onClick: () => answer({ type: "angang", tile: t }) });
        for (const t of opts.bugang) G.buttons.push({ label: MJ("buGang", { tile: tileText(t) }), cls: "gang", onClick: () => answer({ type: "bugang", tile: t }) });
        G.status = p.queDone ? MJ("yourTurn") : MJ("discardVoid", { suit: suitName(p.que) });
        G.onTileClick = (t) => { if (legal.has(t)) answer({ type: "discard", tile: t }); };
        render();
        const r = await ask();
        if (!G.running) return { type: "flow" };
        if (r.type === "win") { await recordWin(seat, { selfDraw: true, gangFlower: gangChain, haiDi: G.wall.length === 0 }); return { type: "win" }; }
        if (r.type === "angang") {
          doAngang(p, r.tile); beep("diceLand");
          const rep = drawFromWall(true); if (rep == null) return { type: "flow" };
          p.hand.push(rep); G.justDrew = rep; G._drewFlag = true; gangChain = true; continue;
        }
        if (r.type === "bugang") {
          const robbed = await robKongWindow(seat, r.tile);
          if (robbed) return { type: "robbed" };
          doBugang(p, r.tile); beep("diceLand");
          const rep = drawFromWall(true); if (rep == null) return { type: "flow" };
          p.hand.push(rep); G.justDrew = rep; G._drewFlag = true; gangChain = true; continue;
        }
        return { type: "discard", tile: r.tile };
      }
    }
  }
  function tileText(t) { return rankName(rankOf(t)) + suitName(suitOf(t)); }
  function legalDiscards(p) {
    updateQueDone(p);
    if (!p.queDone) return new Set(p.hand.filter((t) => suitOf(t) === p.que));
    return new Set(p.hand);
  }

  /* ============================================================
   * 抢杠窗口
   * ============================================================ */
  async function robKongWindow(gangerSeat, tile) {
    const winners = [];
    for (const p of G.players) if (p !== G.players[gangerSeat] && !p.finished && p.queDone && winWith(p, tile)) {
      if (p.isAI) winners.push(p.seat);
      else {
        G.buttons = [
          { label: MJ("robKong"), cls: "hu", onClick: () => answer(true) },
          { label: MJ("pass"), cls: "ghost", onClick: () => answer(false) },
        ];
        G.status = MJ("canRob", { seat: seatName(gangerSeat), tile: tileText(tile) });
        render();
        const yes = await ask(); if (yes) winners.push(0);
      }
    }
    if (winners.length === 0) return false;
    for (const ws of winners) await recordWin(ws, { robKong: true, winTile: tile, from: gangerSeat });
    return true;
  }

  /* ============================================================
   * 弃牌后：其他家的 胡 / 碰 / 杠 抢叫
   * ============================================================ */
  async function resolveClaims(discarder, tile) {
    // 1) 胡（点炮，可一炮多响）
    const winners = [];
    for (let off = 1; off <= 3; off++) {
      const seat = (discarder + off) % 4; const p = G.players[seat];
      if (p.finished || !p.queDone) continue;
      if (winWith(p, tile)) {
        if (p.isAI) winners.push(seat);
        else {
          G.buttons = [
            { label: MJ("claimHu"), cls: "hu", onClick: () => answer(true) },
            { label: MJ("pass"), cls: "ghost", onClick: () => answer(false) },
          ];
          G.status = MJ("canHuDiscard", { seat: seatName(discarder), tile: tileText(tile) });
          render();
          const yes = await ask(); if (yes) winners.push(seat);
        }
      }
    }
    if (winners.length > 0) {
      if (G.lastDiscard) G.lastDiscard.taken = true;
      for (const ws of winners) await recordWin(ws, { from: discarder, winTile: tile, haiDi: G.wall.length === 0 });
      return { type: "win" };
    }
    // 2) 碰 / 杠（按座位顺序，杠优先于碰；只可能一家成立）
    for (let off = 1; off <= 3; off++) {
      const seat = (discarder + off) % 4; const p = G.players[seat];
      if (p.finished || !p.queDone || suitOf(tile) === p.que) continue;
      const c = counts27(p.hand);
      const canGang = c[tile] >= 3, canPeng = c[tile] >= 2;
      if (!canPeng && !canGang) continue;
      if (p.isAI) {
        if (canGang && aiWantGangDiscard(p)) { await doMingGang(seat, discarder, tile); return { type: "gang", seat }; }
        if (canPeng && aiWantPeng(p)) { doPeng(seat, discarder, tile); await afterMeldAnim(seat); return { type: "peng", seat }; }
      } else {
        G.buttons = [];
        if (canGang) G.buttons.push({ label: MJ("gang"), cls: "gang", onClick: () => answer("gang") });
        if (canPeng) G.buttons.push({ label: MJ("peng"), cls: "peng", onClick: () => answer("peng") });
        G.buttons.push({ label: MJ("pass"), cls: "ghost", onClick: () => answer("pass") });
        G.status = MJ("claimDiscard", { seat: seatName(discarder), tile: tileText(tile) });
        render();
        const act = await ask();
        if (act === "gang") { await doMingGang(seat, discarder, tile); return { type: "gang", seat }; }
        if (act === "peng") { doPeng(seat, discarder, tile); await afterMeldAnim(seat); return { type: "peng", seat }; }
        // pass → 继续看下一家
      }
    }
    return { type: "pass" };
  }
  function takeDiscardTile(discarder) {
    const p = G.players[discarder];
    p.discards.pop(); // 被吃走，从牌河移除
    if (G.lastDiscard) G.lastDiscard.taken = true;
  }
  function doPeng(seat, discarder, tile) {
    const p = G.players[seat];
    for (let k = 0; k < 2; k++) p.hand.splice(p.hand.indexOf(tile), 1);
    p.melds.push({ type: "peng", tile, from: discarder });
    takeDiscardTile(discarder);
    beep("diceLand");
  }
  async function doMingGang(seat, discarder, tile) {
    const p = G.players[seat];
    for (let k = 0; k < 3; k++) p.hand.splice(p.hand.indexOf(tile), 1);
    p.melds.push({ type: "gang", tile, from: discarder });
    takeDiscardTile(discarder);
    // 直杠：点杠者赔 2
    const d = G.players[discarder]; if (!d.finished) { d.score -= 2; p.score += 2; }
    beep("diceLand");
    await afterMeldAnim(seat);
  }
  async function afterMeldAnim(seat) { await reach(seat); }

  /* ============================================================
   * 记录胡牌
   * ============================================================ */
  async function recordWin(seat, ctx) {
    const p = G.players[seat];
    const winTile = ctx.winTile != null ? ctx.winTile : null;
    if (ctx.selfDraw && winTile == null) {
      // 自摸：手里已含摸到的牌，最后一张当作 winTile 仅用于番型（已在 hand 内）
    } else if (winTile != null) {
      p.hand.push(winTile); // 把点炮/抢杠的牌纳入手牌组成
    }
    const sc = computeScore(p, ctx.selfDraw ? null : null, { selfDraw: !!ctx.selfDraw, gangFlower: !!ctx.gangFlower, robKong: !!ctx.robKong, haiDi: !!ctx.haiDi });
    const byTxt = ctx.selfDraw ? byName("selfDraw") : (ctx.robKong ? byName("robKong") : byName("discard"));
    p.finished = true; p.win = { ...ctx, ...sc, by: byTxt };
    // 结算
    if (ctx.selfDraw) {
      let payers = 0;
      for (const q of G.players) if (q !== p && !q.finished) { q.score -= sc.points; payers++; }
      p.score += sc.points * payers;
    } else {
      const from = G.players[ctx.from];
      if (!from.finished) from.score -= sc.points;
      p.score += sc.points;
    }
    G.results.push({ seat, names: sc.names, points: ctx.selfDraw ? sc.points + "/家" : sc.points, by: byTxt });
    G.status = MJ("wonStatus", { seat: seatName(seat), names: sc.names.map(fanName).join("·"), points: sc.points });
    beep("win");
    render();
    await sleep(1100);
  }

  /* ============================================================
   * 主流程
   * ============================================================ */
  function aliveCount() { return G.players.filter((p) => !p.finished).length; }
  function nextSeat(s) { let n = (s + 1) % 4; let guard = 0; while (G.players[n].finished && guard < 4) { n = (n + 1) % 4; guard++; } return n; }

  async function playLoop() {
    let turn = G.dealer;
    let mustDraw = true;
    let replacement = false;
    while (G.running) {
      if (aliveCount() <= 1 || G.wall.length === 0) break;
      const p = G.players[turn];
      if (p.finished) { turn = nextSeat(turn); mustDraw = true; continue; }
      G.turn = turn;

      if (mustDraw) {
        // 摸牌（玩家需点「摸牌」）
        if (!p.isAI && !replacement) {
          G.buttons = [{ label: MJ("drawBtn"), cls: "", onClick: () => answer(true) }];
          G.askData = null; G.onTileClick = null;
          G.status = MJ("drawPrompt");
          render();
          await ask();
          if (!G.running) return;
        }
        await reach(turn);
        const wasReplacement = replacement;
        const drawn = drawFromWall(replacement); replacement = false;
        if (drawn == null) break;
        p.hand.push(drawn);
        G.justDrew = drawn; G._drewFlag = true;
        beep("diceLand");
        render();
        await sleep(p.isAI ? 350 : 150);
        G._drewFlag = false;

        const res = await selfPhase(turn, wasReplacement);
        if (!G.running) return;
        if (res.type === "win") { turn = nextSeat(turn); mustDraw = true; continue; }
        if (res.type === "robbed") { turn = nextSeat(turn); mustDraw = true; continue; }
        if (res.type === "flow") break;
        // discard
        await doDiscard(turn, res.tile);
      } else {
        // 碰后：直接出牌（不摸）
        let tile;
        if (p.isAI) { await sleep(420); tile = aiDiscard(p); }
        else {
          const legal = legalDiscards(p);
          G.askData = { legal }; G.buttons = null;
          G.status = p.queDone ? MJ("afterPeng") : MJ("discardVoid", { suit: suitName(p.que) });
          G.onTileClick = (t) => { if (legal.has(t)) answer(t); };
          render();
          tile = await ask();
          if (!G.running) return;
        }
        await doDiscard(turn, tile);
      }

      // 弃牌后抢叫
      const claim = await resolveClaims(turn, G.lastDiscard.tile);
      if (!G.running) return;
      if (claim.type === "win") {
        if (aliveCount() <= 1) break;
        turn = nextSeat(turn); mustDraw = true; replacement = false;
      } else if (claim.type === "peng") {
        turn = claim.seat; mustDraw = false; replacement = false;
      } else if (claim.type === "gang") {
        turn = claim.seat; mustDraw = true; replacement = true;
      } else {
        turn = nextSeat(turn); mustDraw = true; replacement = false;
      }
    }
    endGame();
  }

  async function doDiscard(seat, tile) {
    const p = G.players[seat];
    p.hand.splice(p.hand.indexOf(tile), 1);
    p.discards.push(tile);
    updateQueDone(p);
    G.lastDiscard = { tile, by: seat, taken: false };
    G.justDrew = null; G._drewFlag = false;
    await reach(seat);
    beep("diceLand");
    render();
    await sleep(260);
  }

  /* ============================================================
   * 结束 & 结算
   * ============================================================ */
  function endGame() {
    G.over = true; G.turn = -1;
    render();
    const reason = G.wall.length === 0 && aliveCount() > 1 ? MJ("drawEnd") : MJ("battleEnd");
    showResultModal(reason);
  }
  function showResultModal(reason) {
    const app = $("mjApp");
    const m = document.createElement("div");
    m.className = "mj-modal"; m.id = "mjModal";
    let rows = "";
    const order = G.players.slice().sort((a, b) => b.score - a.score);
    for (const p of order) {
      const w = p.win;
      const types = w ? `${w.by}·${w.names.map(fanName).join("·")}` : (p.finished ? MJ("alreadyWon") : MJ("notWon"));
      rows += `<div class="r"><span class="nm">${seatName(p.seat)}${p.seat === G.dealer ? MJ("dealer") : ""}</span>
        <span class="types">${types}</span>
        <span class="pt ${p.score >= 0 ? "plus" : "minus"}">${p.score >= 0 ? "+" : ""}${p.score}</span></div>`;
    }
    m.innerHTML = `<div class="box"><h3>🀄 ${reason}</h3>
      <div class="mj-result-list">${rows}</div>
      <div class="mj-buttons">
        <button class="mj-btn" id="mjAgain">${MJ("again")}</button>
        <button class="mj-btn ghost" id="mjBack">${MJ("home")}</button>
      </div></div>`;
    app.appendChild(m);
    $("mjAgain").onclick = () => startMahjong();
    $("mjBack").onclick = () => exitMahjong();
  }

  /* ============================================================
   * 启动 / 退出
   * ============================================================ */
  function buildWall() {
    const w = [];
    for (let t = 0; t < 27; t++) for (let k = 0; k < 4; k++) w.push(t);
    for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; }
    return w;
  }
  function startMahjong() {
    closeModal();
    const wall = buildWall();
    const players = [0, 1, 2, 3].map((seat) => ({
      seat, isAI: seat !== 0, hand: [], melds: [], discards: [],
      que: null, queDone: false, finished: false, score: 0, win: null,
    }));
    for (let i = 0; i < 13; i++) for (const p of players) p.hand.push(wall.shift());
    G = {
      wall, players, dealer: Math.floor(Math.random() * 4), turn: -1,
      lastDiscard: null, over: false, running: true, results: [],
      status: "", buttons: null, askData: null, resolver: null, onTileClick: null,
      anim: null, justDrew: null, _drewFlag: false,
    };
    render();
    runGame();
  }
  async function runGame() {
    await quePhase();
    if (!G.running) return;
    G.status = MJ("dealerFirst", { seat: seatName(G.dealer) });
    await playLoop();
  }
  function exitMahjong() {
    if (G) G.running = false;
    closeModal();
    if (window.switchScreen) switchScreen("intro");
  }

  /* ============================================================
   * 入口
   * ============================================================ */
  function enter() {
    try { if (window.SoundFX) { SoundFX.init(); SoundFX.resume(); } } catch (e) {}
    if (window.State) window.State.paused = true; // 暂停赌局倒计时
    if (window.switchScreen) switchScreen("mahjong");
    startMahjong();
  }
  document.addEventListener("DOMContentLoaded", () => {
    const btn = $("mjEntryBtn");
    if (btn) btn.onclick = enter;
    if (window.I18N) {
      I18N.onChange(() => {
        if (G && $("mahjong") && $("mahjong").classList.contains("active")) render();
      });
    }
  });
  window.startMahjong = startMahjong;
})();
