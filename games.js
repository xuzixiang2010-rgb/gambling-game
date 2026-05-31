/* ============================================================
 * games.js —— 所有赌局模块
 * 设计原则：引擎(engine.js)根据"隐藏胜率"预先决定 outcome
 *           (win/lose/draw)，每个游戏只负责把这个结果"演"出来。
 *           这就是真实赌场的运作方式——你看到的随机都是假的。
 * 每个游戏对象接口：
 *   id, name, short, unlockAtRound, risk
 *   setup(stage, ctx)  -> 渲染选择/界面，玩家就绪时调用 ctx.setReady(true)
 *   ready()            -> 是否可以开赌
 *   resolve(stage, r)  -> 按 r={outcome, nearMiss} 演出，返回 Promise
 * ============================================================ */

/* ---------- 通用工具 ---------- */
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SUITS = [
  { s: "♠", red: false }, { s: "♥", red: true },
  { s: "♦", red: true }, { s: "♣", red: false },
];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

// 各数字牌的传统点数排列(百分比坐标，参照真实扑克)
const PIP_LAYOUT = {
  "2": [[50, 16], [50, 84]],
  "3": [[50, 16], [50, 50], [50, 84]],
  "4": [[30, 16], [70, 16], [30, 84], [70, 84]],
  "5": [[30, 16], [70, 16], [50, 50], [30, 84], [70, 84]],
  "6": [[30, 16], [70, 16], [30, 50], [70, 50], [30, 84], [70, 84]],
  "7": [[30, 16], [70, 16], [50, 33], [30, 50], [70, 50], [30, 84], [70, 84]],
  "8": [[30, 16], [70, 16], [50, 33], [30, 50], [70, 50], [50, 67], [30, 84], [70, 84]],
  "9": [[30, 14], [70, 14], [30, 38], [70, 38], [50, 50], [30, 62], [70, 62], [30, 86], [70, 86]],
  "10": [[30, 14], [70, 14], [50, 26], [30, 38], [70, 38], [30, 62], [70, 62], [50, 74], [30, 86], [70, 86]],
};
const COURT = { J: "🤵", Q: "👸", K: "🤴" };

// 渲染一张“真实牌面”：双角标 + 中央点数/人物/A大花色
function cardEl(rank, suitObj, faceDown = false) {
  const d = document.createElement("div");
  d.className = "card" + (suitObj && suitObj.red ? " red" : "") + (faceDown ? " back" : "");
  if (faceDown) { d.textContent = "?"; return d; }
  const s = suitObj.s;
  let center;
  if (PIP_LAYOUT[rank]) {
    center = '<div class="pips">' + PIP_LAYOUT[rank]
      .map(([x, y]) => `<span class="pip-s${y > 50 ? " flip" : ""}" style="left:${x}%;top:${y}%">${s}</span>`)
      .join("") + "</div>";
  } else if (rank === "A") {
    center = `<div class="ace">${s}</div>`;
  } else {
    center = `<div class="court"><span class="court-fig">${COURT[rank] || "♛"}</span><span class="court-suit">${s}</span></div>`;
  }
  d.innerHTML =
    `<span class="corner tl"><b>${rank}</b><i>${s}</i></span>` +
    center +
    `<span class="corner br"><b>${rank}</b><i>${s}</i></span>`;
  return d;
}
function randomCard() { return { rank: pick(RANKS), suit: pick(SUITS) }; }
function cardValue(rank) { return RANKS.indexOf(rank) + 2; } // 2..14 (A=14)

/* 生成若干张点数和为 total 的牌（用于21点） */
function cardsForTotal(total) {
  const cards = [];
  let remaining = total;
  while (remaining > 0) {
    let v;
    if (remaining > 11) v = randInt(2, 11);
    else v = remaining;
    if (v > 11) v = 11;
    remaining -= v;
    let rank;
    if (v === 11) rank = "A";
    else if (v === 10) rank = pick(["10", "J", "Q", "K"]);
    else rank = String(v);
    cards.push({ rank, suit: pick(SUITS) });
    if (cards.length > 6) break;
  }
  return cards;
}

/* 选择按钮组：返回 {wrap, get()} */
function choiceGroup(options, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "choice-row";
  let selected = null;
  options.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = opt.label;
    b.onclick = () => {
      selected = opt.value;
      wrap.querySelectorAll(".choice").forEach((c) => c.classList.remove("selected"));
      b.classList.add("selected");
      ctx.setReady(true);
    };
    wrap.appendChild(b);
  });
  return { wrap, get: () => selected };
}

/* ---------- 3D 骰子工具 ---------- */
// 各点数对应的点位(百分比坐标，3x3 布局)
const PIP_MAP = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 30], [70, 30], [30, 50], [70, 50], [30, 70], [70, 70]],
};
// 把一颗骰子渲染成对应点数的真实点子(非数字)
function renderDie(el, value) {
  el.innerHTML = "";
  el.dataset.val = value;
  (PIP_MAP[value] || []).forEach(([x, y]) => {
    const p = document.createElement("span");
    p.className = "pip" + (value === 1 ? " one" : "");
    p.style.left = x + "%"; p.style.top = y + "%";
    el.appendChild(p);
  });
}
// 初始：三颗骰子在场地里排成一排(轻微错落)，随机面朝上
function layoutDiceRow(arena) {
  const dice = [...arena.querySelectorAll(".die")];
  const W = arena.clientWidth || 300, H = arena.clientHeight || 175;
  const D = 58, gap = 16;
  const total = D * 3 + gap * 2;
  const startX = Math.max(4, (W - total) / 2);
  dice.forEach((d, i) => {
    d.style.left = (startX + i * (D + gap)) + "px";
    d.style.top = ((H - D) / 2) + "px";
    d.style.rotate = randInt(-8, 8) + "deg";
    renderDie(d, randInt(1, 6));
  });
}
// 掀盅后：三颗骰子随机散落，互不并列、互不重叠
function scatterDice(dice, W, H) {
  const D = dice[0].offsetWidth || 58;
  const m = 6;
  const centers = [];
  dice.forEach(() => {
    let x, y, tries = 0;
    do {
      x = randInt(m, Math.max(m, W - D - m));
      y = randInt(m, Math.max(m, H - D - m));
      tries++;
    } while (tries < 60 && centers.some((c) => Math.hypot(c.x - x, c.y - y) < D * 0.95));
    centers.push({ x, y });
  });
  return centers.map((c) => ({ x: c.x, y: c.y, rot: randInt(-45, 45) }));
}

/* ============================================================
 * 1. 摇骰子 · 猜大小   (第0局解锁，最简单)
 * ============================================================ */
const DiceGame = {
  id: "dice", name: "摇骰子", short: "猜大小", unlockAtRound: 0, risk: false,
  img: "assets/game_dice.png",
  rules: "三颗骰子摇出总和：4~10 为「小」，11~17 为「大」。先押一边再开摇。猜中赢双倍时间，猜错损失全部赌注，豹子(三颗相同)算平局退还。",
  _choice: null,
  setup(stage, ctx) {
    this._choice = null;
    stage.innerHTML = `<div class="stage-title">🎲 摇骰子 · 猜大小</div>`;
    const arena = document.createElement("div");
    arena.className = "dice-arena";
    arena.innerHTML = `<div class="dice-shaker">
        <div class="die"></div><div class="die"></div><div class="die"></div>
        <div class="dice-cup"></div>
      </div>`;
    stage.appendChild(arena);
    layoutDiceRow(arena); // 初始三颗骰子(随机面)
    const info = document.createElement("div");
    info.className = "stage-info";
    info.textContent = "三颗骰子总和：4~10 为「小」，11~17 为「大」，豹子(三同)算平局退还。";
    stage.appendChild(info);
    const cg = choiceGroup([
      { label: "押 小", value: "small" }, { label: "押 大", value: "big" },
    ], ctx);
    this._cg = cg;
    stage.appendChild(cg.wrap);
  },
  ready() { return this._cg && this._cg.get() !== null; },
  async resolve(stage, { outcome, nearMiss }) {
    const choice = this._cg.get();
    const arena = stage.querySelector(".dice-arena");
    const shaker = arena.querySelector(".dice-shaker");
    const cup = arena.querySelector(".dice-cup");
    const dice = [...arena.querySelectorAll(".die")];

    // 计算最终点数(逻辑不变)
    let vals;
    if (outcome === "draw") {
      const v = randInt(1, 6); vals = [v, v, v]; // 豹子
    } else {
      const wantBig = (outcome === "win") === (choice === "big");
      let targetSum;
      if (nearMiss) targetSum = wantBig ? 11 : 10; // 擦边制造"差一点"
      else targetSum = wantBig ? randInt(12, 16) : randInt(5, 9);
      vals = sumToDice(targetSum);
    }

    // 1) 三颗骰子聚到中央，骰盅扣下盖住
    const W = arena.clientWidth, H = arena.clientHeight, D = dice[0].offsetWidth || 58;
    dice.forEach((d) => {
      d.style.left = ((W - D) / 2 + randInt(-10, 10)) + "px";
      d.style.top = ((H - D) / 2 + randInt(-8, 8)) + "px";
      d.style.rotate = randInt(-20, 20) + "deg";
    });
    cup.classList.add("show", "dropping");
    await wait(300);
    SoundFX.diceLand(); // 扣下的闷响
    await wait(180);

    // 2) 摇盅：骰盅连骰子一起剧烈摇晃
    shaker.classList.add("shaking");
    SoundFX.dice();
    await wait(420); SoundFX.dice();
    await wait(420); SoundFX.dice();
    await wait(360);
    shaker.classList.remove("shaking");
    cup.classList.remove("dropping");

    // 3) 盅内定型 + 随机散开(此刻仍被盅盖住，掀开即见结果)
    const pos = scatterDice(dice, W, H);
    dice.forEach((d, i) => {
      renderDie(d, vals[i]);
      d.style.left = pos[i].x + "px";
      d.style.top = pos[i].y + "px";
      d.style.rotate = pos[i].rot + "deg";
    });
    await wait(140);

    // 4) 掀盅，逐颗弹跳亮点
    cup.classList.add("lifting");
    SoundFX.diceLand();
    await wait(420);
    cup.classList.remove("show", "lifting");
    for (let i = 0; i < dice.length; i++) {
      dice[i].classList.remove("pop"); void dice[i].offsetWidth; dice[i].classList.add("pop");
      SoundFX.diceLand();
      await wait(150);
    }
    return { displaySum: vals.reduce((a, b) => a + b, 0) };
  },
};
function sumToDice(sum) {
  let a, b, c;
  do { a = randInt(1, 6); b = randInt(1, 6); c = sum - a - b; }
  while (c < 1 || c > 6 || (a === b && b === c));
  return [a, b, c];
}

/* ============================================================
 * 2. 扑克比大小   (第4局)
 * ============================================================ */
const HighCardGame = {
  id: "highcard", name: "扑克比大小", short: "比点数", unlockAtRound: 4, risk: false,
  img: "assets/game_highcard.png",
  rules: "你和庄家各翻一张牌，点数大的一方获胜（A 最大，2 最小）。你赢则得双倍时间，输则损失赌注，点数相同为平局退还。",
  setup(stage, ctx) {
    stage.innerHTML = `<div class="stage-title">🂡 翻牌比大小</div>`;
    const row = document.createElement("div");
    row.className = "card-row"; row.id = "hcRow";
    row.innerHTML = `<div style="text-align:center"><div class="card back">?</div><div class="stage-info">你</div></div>
                     <div style="font-size:24px;align-self:center">VS</div>
                     <div style="text-align:center"><div class="card back">?</div><div class="stage-info">庄家</div></div>`;
    stage.appendChild(row);
    const info = document.createElement("div");
    info.className = "stage-info";
    info.textContent = "各翻一张牌，点数大者胜（A 最大）。点数相同为平局。";
    stage.appendChild(info);
    ctx.setReady(true); // 无需选择
  },
  ready() { return true; },
  async resolve(stage, { outcome, nearMiss }) {
    let pv, dv;
    if (outcome === "draw") { pv = randInt(2, 14); dv = pv; }
    else if (outcome === "win") { pv = randInt(8, 14); dv = nearMiss ? pv - 1 : randInt(2, pv - 1); }
    else { dv = randInt(8, 14); pv = nearMiss ? dv - 1 : randInt(2, dv - 1); }
    const pr = RANKS[pv - 2], dr = RANKS[dv - 2];
    const cards = stage.querySelectorAll(".card");
    await wait(400);
    const ps = pick(SUITS), ds = pick(SUITS);
    SoundFX.card();
    cards[0].replaceWith(cardEl(pr, ps));
    await wait(500);
    const cards2 = stage.querySelectorAll(".card");
    SoundFX.card();
    cards2[1].replaceWith(cardEl(dr, ds));
    await wait(300);
    return {};
  },
};

/* ============================================================
 * 3. 百家乐   (第8局)
 * ============================================================ */
/* 百家乐：把目标点数(个位)拆成两张真实扑克牌
 * 牌面点数：A=1，2~9=面值，10/J/Q/K=0；两张相加取个位 */
function bacValueToCard(v) {
  let rank;
  if (v === 1) rank = "A";
  else if (v === 0) rank = pick(["10", "J", "Q", "K"]);
  else rank = String(v);
  return { rank, suit: pick(SUITS) };
}
function baccaratCards(point) {
  const v1 = randInt(0, 9);
  const v2 = ((point - v1) % 10 + 10) % 10;
  return [bacValueToCard(v1), bacValueToCard(v2)];
}
const BaccaratGame = {
  id: "baccarat", name: "百家乐", short: "押庄/闲/和", unlockAtRound: 8, risk: false,
  img: "assets/game_baccarat.png",
  rules: "押注「闲」「庄」或「和」三选一。双方各发两张真实扑克牌，按牌面计点（A=1，2~9为面值，10/J/Q/K=0，相加取个位），比谁更接近 9。押中你选的一方即赢，押「和」赔率最高但极难命中。",
  setup(stage, ctx) {
    stage.innerHTML = `<div class="stage-title">🎴 百家乐</div>
      <div class="stage-info">双方各发两张牌，按牌面取点（取个位），点数大者胜。押「和」赔率高但极难中。</div>`;
    const table = document.createElement("div");
    table.className = "bac-table";
    table.innerHTML = `
      <div class="bac-side"><div class="stage-info">闲 PLAYER</div><div class="card-row" id="bacP"></div></div>
      <div class="bac-side"><div class="stage-info">庄 BANKER</div><div class="card-row" id="bacB"></div></div>`;
    stage.appendChild(table);
    const cg = choiceGroup([
      { label: "押 闲", value: "player" }, { label: "押 庄", value: "banker" }, { label: "押 和", value: "tie" },
    ], ctx);
    this._cg = cg;
    stage.appendChild(cg.wrap);
    const res = document.createElement("div");
    res.id = "bacRes"; res.className = "stage-info"; stage.appendChild(res);
  },
  ready() { return this._cg && this._cg.get() !== null; },
  async resolve(stage, { outcome, nearMiss }) {
    const choice = this._cg.get();
    const res = stage.querySelector("#bacRes");
    const pRow = stage.querySelector("#bacP"), bRow = stage.querySelector("#bacB");
    pRow.innerHTML = ""; bRow.innerHTML = "";
    res.textContent = "发牌中…";
    let p, b;
    const tieBet = choice === "tie";
    if (outcome === "draw" || (tieBet && outcome === "win")) { p = randInt(0, 9); b = p; }
    else {
      const win = outcome === "win";
      const playerHigher = (choice === "player") === win; // 闲赢? 
      if (tieBet) { // 押和却没中 -> 不和
        do { p = randInt(0, 9); b = randInt(0, 9); } while (p === b);
      } else if (playerHigher) {
        b = randInt(0, 8); p = nearMiss ? Math.min(9, b + 1) : randInt(b + 1, 9);
      } else {
        p = randInt(0, 8); b = nearMiss ? Math.min(9, p + 1) : randInt(p + 1, 9);
      }
    }
    const pc = baccaratCards(p), bc = baccaratCards(b);
    const seq = [[pRow, pc[0]], [bRow, bc[0]], [pRow, pc[1]], [bRow, bc[1]]];
    for (const [row, c] of seq) { SoundFX.card(); row.appendChild(cardEl(c.rank, c.suit)); await wait(300); }
    await wait(200);
    res.innerHTML = `闲 <b style="color:#6fa8dc">${p}</b> 点 ｜ 庄 <b style="color:#e74c3c">${b}</b> 点`;
    return {};
  },
};

/* ============================================================
 * 4. 21点 (Blackjack)   (第12局) —— 第一个需要决策的游戏
 * ============================================================ */
const BlackjackGame = {
  id: "blackjack", name: "21点", short: "要牌/停牌", unlockAtRound: 12, risk: false,
  img: "assets/game_blackjack.png",
  rules: "目标是让手牌点数尽量接近 21 且不超过。J/Q/K 算 10，A 算 11 或 1。点数偏小可「要牌」继续抓，满意则「停牌」与庄家比大小；一旦超过 21 立即爆牌输掉。",
  setup(stage, ctx) {
    this._ctx = ctx; this._done = false;
    this._player = [randomCard(), randomCard()];
    stage.innerHTML = `<div class="stage-title">🃏 21点 · 尽量接近21且不爆</div>`;
    this._area = document.createElement("div");
    stage.appendChild(this._area);
    const btns = document.createElement("div");
    btns.className = "choice-row";
    const hit = document.createElement("button"); hit.className = "choice"; hit.textContent = "要牌";
    const stand = document.createElement("button"); stand.className = "choice"; stand.textContent = "停牌";
    hit.onclick = () => this._hit();
    stand.onclick = () => this._stand();
    this._hitBtn = hit; this._standBtn = stand;
    btns.appendChild(hit); btns.appendChild(stand);
    stage.appendChild(btns);
    this._render();
    SoundFX.card();
    ctx.setReady(false); // 必须先停牌
  },
  _total(cards) {
    let sum = 0, aces = 0;
    cards.forEach((c) => {
      let v = cardValue(c.rank);
      if (c.rank === "A") { v = 11; aces++; }
      else if (v > 10) v = 10;
      sum += v;
    });
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
  },
  _render() {
    const t = this._total(this._player);
    this._area.innerHTML = `<div class="card-row" id="bjP"></div>
      <div class="stage-info">你的点数：<b style="color:#e8c14a">${t}</b></div>`;
    const row = this._area.querySelector("#bjP");
    this._player.forEach((c) => row.appendChild(cardEl(c.rank, c.suit)));
  },
  _hit() {
    if (this._done) return;
    this._player.push(randomCard());
    SoundFX.card();
    this._render();
    if (this._total(this._player) > 21) { // 爆牌即输
      this._busted = true; this._lock(); this._ctx.setReady(true); this._ctx.autoPlay();
    }
  },
  _stand() { if (this._done) return; this._lock(); this._ctx.setReady(true); this._ctx.autoPlay(); },
  _lock() { this._done = true; this._hitBtn.disabled = true; this._standBtn.disabled = true;
            this._hitBtn.style.opacity = .4; this._standBtn.style.opacity = .4; },
  ready() { return this._done; },
  async resolve(stage, { outcome, nearMiss }) {
    const pt = this._total(this._player);
    let dealerTotal;
    if (this._busted) {
      dealerTotal = randInt(17, 21); outcome = "lose";
    } else if (outcome === "draw") {
      dealerTotal = pt;
    } else if (outcome === "win") {
      // 庄家必须更小(且≥17才会停)或直接爆牌
      dealerTotal = pt > 17 ? randInt(17, pt - 1) : randInt(22, 26);
    } else {
      // 输：庄家更大且不爆；差一点则只多1点
      dealerTotal = nearMiss && pt < 21 ? pt + 1 : randInt(Math.min(21, pt + 1), 21);
    }
    const dcards = cardsForTotal(dealerTotal);
    const dShow = document.createElement("div");
    dShow.innerHTML = `<div class="card-row" id="bjD"></div>
      <div class="stage-info">庄家：<b style="color:#e74c3c">${dealerTotal > 21 ? dealerTotal + "（爆牌）" : dealerTotal}</b></div>`;
    this._area.appendChild(dShow);
    const row = dShow.querySelector("#bjD");
    for (const c of dcards) { SoundFX.card(); row.appendChild(cardEl(c.rank, c.suit)); await wait(350); }
    return {};
  },
};

/* ============================================================
 * 5. 炸金花   (第18局) —— 比牌型，烧脑
 * ============================================================ */
const HANDS_3 = [
  { lvl: 0, name: "高牌", cards: [["K", 0], ["9", 1], ["4", 3]] },
  { lvl: 1, name: "对子", cards: [["10", 0], ["10", 1], ["6", 3]] },
  { lvl: 2, name: "顺子", cards: [["7", 0], ["8", 1], ["9", 3]] },
  { lvl: 3, name: "金花", cards: [["2", 1], ["7", 1], ["J", 1]] },
  { lvl: 4, name: "顺金", cards: [["4", 0], ["5", 0], ["6", 0]] },
  { lvl: 5, name: "豹子", cards: [["A", 0], ["A", 1], ["A", 3]] },
];
const GoldenFlowerGame = makeCompareGame({
  id: "goldenflower", name: "炸金花", short: "比牌型", unlockAtRound: 18, risk: false,
  img: "assets/game_goldenflower.png",
  title: "🔥 炸金花 · 比牌型", count: 3, hands: HANDS_3,
  info: "三张牌比牌型：豹子>顺金>金花>顺子>对子>高牌。需要点脑子。",
  rules: "你和庄家各发 3 张牌，比牌型大小。牌型从大到小：豹子(三同)>顺金(同花顺子)>金花(同花)>顺子>对子>高牌。牌型大者赢得双倍时间。",
});

/* ============================================================
 * 6. 梭哈 (五张)   (第25局) —— 最复杂的"技巧"游戏
 * ============================================================ */
const HANDS_5 = [
  { lvl: 0, name: "高牌", cards: [["A", 0], ["J", 1], ["8", 3], ["5", 2], ["2", 0]] },
  { lvl: 1, name: "一对", cards: [["9", 0], ["9", 1], ["K", 3], ["6", 2], ["3", 0]] },
  { lvl: 2, name: "两对", cards: [["Q", 0], ["Q", 1], ["7", 3], ["7", 2], ["2", 0]] },
  { lvl: 3, name: "三条", cards: [["8", 0], ["8", 1], ["8", 3], ["K", 2], ["4", 0]] },
  { lvl: 4, name: "顺子", cards: [["5", 0], ["6", 1], ["7", 3], ["8", 2], ["9", 0]] },
  { lvl: 5, name: "同花", cards: [["2", 1], ["6", 1], ["9", 1], ["J", 1], ["K", 1]] },
  { lvl: 6, name: "葫芦", cards: [["10", 0], ["10", 1], ["10", 3], ["4", 2], ["4", 0]] },
  { lvl: 7, name: "四条", cards: [["7", 0], ["7", 1], ["7", 3], ["7", 2], ["A", 0]] },
  { lvl: 8, name: "同花顺", cards: [["9", 2], ["10", 2], ["J", 2], ["Q", 2], ["K", 2]] },
];
const StudGame = makeCompareGame({
  id: "stud", name: "梭哈", short: "五张比牌", unlockAtRound: 25, risk: false,
  img: "assets/game_stud.png",
  title: "💵 梭哈 · 五张比牌型", count: 5, hands: HANDS_5,
  info: "经典五张：同花顺>四条>葫芦>同花>顺子>三条>两对>一对>高牌。",
  rules: "你和庄家各发 5 张牌，比牌型大小。牌型从大到小：同花顺>四条>葫芦>同花>顺子>三条>两对>一对>高牌。牌型大者赢得双倍时间。",
});

/* 比牌型类游戏工厂（炸金花 / 梭哈共用） */
function makeCompareGame(cfg) {
  return {
    id: cfg.id, name: cfg.name, short: cfg.short, unlockAtRound: cfg.unlockAtRound, risk: !!cfg.risk,
    img: cfg.img,
    rules: cfg.rules,
    setup(stage, ctx) {
      stage.innerHTML = `<div class="stage-title">${cfg.title}</div>
        <div class="stage-info">${cfg.info}</div>`;
      this._area = document.createElement("div");
      stage.appendChild(this._area);
      // 先发玩家自己的牌（看牌），玩家看清牌型后再决定下注多少
      const hands = cfg.hands;
      const max = hands.length - 1;
      const mid = Math.floor(max / 2);
      this._pLvl = randInt(Math.max(0, mid - 1), Math.min(max, mid + 1));
      this._pHand = hands[this._pLvl];
      this._area.innerHTML = `
        <div class="stage-info">你的牌（先看牌，再下注）</div><div class="card-row" id="cgP"></div>
        <div class="stage-info" id="cgPn">？</div>
        <div class="stage-info" style="margin-top:14px">庄家</div>
        <div class="card-row" id="cgD">${'<div class="card back">?</div>'.repeat(cfg.count)}</div>
        <div class="stage-info" id="cgDn">下注后揭晓庄家牌</div>`;
      const pr = this._area.querySelector("#cgP");
      for (const [rank, si] of this._pHand.cards) { SoundFX.card(); pr.appendChild(cardEl(rank, SUITS[si])); }
      this._area.querySelector("#cgPn").innerHTML = `你的牌型：<b style="color:#e8c14a">${this._pHand.name}</b>`;
      ctx.setReady(true);
    },
    ready() { return true; },
    async resolve(stage, { outcome, nearMiss }) {
      const hands = cfg.hands;
      const max = hands.length - 1;
      const pLvl = this._pLvl;
      let dLvl;
      if (outcome === "draw") dLvl = pLvl;
      else if (outcome === "win") dLvl = nearMiss ? Math.max(0, pLvl - 1) : randInt(0, Math.max(0, pLvl - 1));
      else dLvl = nearMiss ? Math.min(max, pLvl + 1) : randInt(Math.min(max, pLvl + 1), max);
      const dHand = hands[dLvl];
      const dr = this._area.querySelector("#cgD");
      dr.innerHTML = "";
      for (const [rank, si] of dHand.cards) { SoundFX.card(); dr.appendChild(cardEl(rank, SUITS[si])); await wait(220); }
      this._area.querySelector("#cgDn").innerHTML = `庄家牌型：<b style="color:#e74c3c">${dHand.name}</b>`;
      await wait(300);
      return {};
    },
  };
}

/* ============================================================
 * 7. 老虎机   (第32局，高风险) —— 差一点机制的最佳载体
 * ============================================================ */
const SYMBOLS = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
const SlotGame = {
  id: "slot", name: "老虎机", short: "拉一把", unlockAtRound: 32, risk: true,
  img: "assets/game_slot.png",
  rules: "拉动三个转轮，停下后三个图案完全相同即中奖，7️⃣7️⃣7️⃣ 为头奖。高赔率高刺激，但中奖远比看上去难——你常常会「只差一个」。",
  setup(stage, ctx) {
    stage.innerHTML = `<div class="stage-title">🎰 老虎机 · 高风险高回报</div>`;
    const row = document.createElement("div");
    row.className = "slot-row"; row.id = "slotRow";
    row.innerHTML = `<div class="reel">🍒</div><div class="reel">🔔</div><div class="reel">💎</div>`;
    stage.appendChild(row);
    stage.insertAdjacentHTML("beforeend",
      `<div class="stage-info">三个相同图案即中奖！<b style="color:#e8c14a">7️⃣7️⃣7️⃣</b> 是头奖。</div>`);
    ctx.setReady(true);
  },
  ready() { return true; },
  async resolve(stage, { outcome, nearMiss }) {
    const reels = stage.querySelectorAll(".reel");
    reels.forEach((r) => r.classList.add("spinning"));
    SoundFX.dice();
    const spin = setInterval(() => reels.forEach((r) => (r.textContent = pick(SYMBOLS))), 80);
    await wait(1100);
    clearInterval(spin);
    let result;
    if (outcome === "win") { const s = pick(SYMBOLS); result = [s, s, s]; }
    else if (outcome === "draw") { const s = pick(SYMBOLS); result = [s, s, pick(SYMBOLS.filter((x) => x !== s))]; }
    else if (nearMiss) { result = ["7️⃣", "7️⃣", pick(SYMBOLS.filter((x) => x !== "7️⃣"))]; }
    else {
      do { result = [pick(SYMBOLS), pick(SYMBOLS), pick(SYMBOLS)]; }
      while (result[0] === result[1] && result[1] === result[2]);
    }
    for (let i = 0; i < 3; i++) { reels[i].classList.remove("spinning"); reels[i].textContent = result[i]; SoundFX.diceLand(); await wait(300); }
    return {};
  },
};

/* ============================================================
 * 8. 俄罗斯轮盘   (第40局/濒死，极限高风险)
 *    —— 不赌时间，赌命：中弹直接归零(死亡)，幸存巨额回血
 * ============================================================ */
const RevolverGame = {
  id: "revolver", name: "俄罗斯轮盘", short: "赌命", unlockAtRound: 40, risk: true, deadly: true,
  img: "assets/game_revolver.png",
  rules: "六个弹膛，只装一颗子弹。扣下扳机：中弹则生命瞬间归零(直接死亡)，幸存则赌注 ×4 巨额回血。这是庄家给绝望者的「恩赐」——但子弹从不讲情面。",
  setup(stage, ctx) {
    stage.innerHTML = `<div class="stage-title">💀 俄罗斯轮盘 · 赌上性命</div>
      <div class="revolver" id="gun">🔫</div>
      <div class="stage-info">六个弹膛，一颗子弹。<br/>
      <b style="color:#e74c3c">中弹 = 生命瞬间归零（死亡）</b><br/>
      幸存 = 赌注 <b style="color:#e8c14a">×4</b> 巨额回血。<br/>
      <span style="color:#ff3b30">这是庄家给绝望者的最后"恩赐"。</span></div>`;
    ctx.setReady(true);
  },
  ready() { return true; },
  async resolve(stage, { outcome }) {
    const gun = stage.querySelector("#gun");
    gun.classList.add("spinning");
    SoundFX.gunSpin();
    await wait(1200);
    gun.classList.remove("spinning");
    SoundFX.gunClick();
    await wait(600);
    // outcome: win=幸存, lose=中弹
    if (outcome === "lose") {
      gun.textContent = "💥";
      gun.style.fontSize = "120px";
      SoundFX.gunShot();
      await wait(500);
      return { deadly: true };
    } else {
      gun.textContent = "😮‍💨";
      await wait(400);
      return {};
    }
  },
};

/* ============================================================
 * 9. 麻将 · 听牌摸将   (第22局) —— 自摸胡牌
 * ============================================================ */
/* 渲染一张麻将牌：kind 决定花色配色 */
function mjTileEl(label, kind) {
  const t = document.createElement("div");
  t.className = "mj-tile mj-" + (kind || "wan");
  t.innerHTML = `<span class="mj-face">${label}</span>`;
  return t;
}
function mjBackEl() {
  const t = document.createElement("div");
  t.className = "mj-tile mj-back";
  t.innerHTML = `<span class="mj-face">?</span>`;
  return t;
}
const MahjongGame = {
  id: "mahjong", name: "麻将", short: "听牌摸将", unlockAtRound: 22, risk: false,
  img: "assets/game_mahjong.png",
  rules: "你已「听牌」，只差最后一张。摸到所听的牌即「自摸·胡了」，赢得双倍时间；摸错（诈胡）则输掉赌注；摸到花牌为流局，退还赌注。",
  setup(stage, ctx) {
    stage.innerHTML = `<div class="stage-title">🀄 麻将 · 听牌摸将</div>
      <div class="stage-info">你已听牌，只差最后一张。摸到所听之牌即自摸胡牌！</div>`;
    // 一手听牌（仅作展示）：234万 567筒 88条 + 听 6条/9条
    this._listen = [["6", "tiao"], ["9", "tiao"]];
    const hand = [
      ["二", "wan"], ["三", "wan"], ["四", "wan"],
      ["五", "tong"], ["六", "tong"], ["七", "tong"],
      ["八", "tiao"], ["八", "tiao"],
    ];
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="mj-hand" id="mjHand"></div>
      <div class="mj-draw-wrap"><div class="stage-info">摸牌</div><div class="mj-draw" id="mjDraw"></div></div>
      <div class="stage-info" id="mjRes">听：<b style="color:#e8c14a">六条 / 九条</b>　摸到即胡！</div>`;
    stage.appendChild(wrap);
    const h = wrap.querySelector("#mjHand");
    for (const [lab, kind] of hand) h.appendChild(mjTileEl(lab, kind));
    wrap.querySelector("#mjDraw").appendChild(mjBackEl());
    ctx.setReady(true);
  },
  ready() { return true; },
  async resolve(stage, { outcome, nearMiss }) {
    const draw = stage.querySelector("#mjDraw");
    const res = stage.querySelector("#mjRes");
    res.textContent = "摸牌中…";
    // 摸牌摇摆动画
    const back = draw.querySelector(".mj-tile");
    back.classList.add("mj-shake");
    SoundFX.diceLand(); await wait(260);
    SoundFX.diceLand(); await wait(260);
    let label, kind, msg;
    if (outcome === "win") {
      const t = pick(this._listen); label = t[0] === "6" ? "六" : "九"; kind = "tiao";
      msg = `自摸 <b style="color:#e8c14a">${label}条</b> —— 🀄 胡了！`;
    } else if (outcome === "draw") {
      label = "花"; kind = "flower"; msg = `摸到 <b style="color:#7bc47f">花牌</b> —— 流局，退还赌注`;
    } else {
      // 诈胡：摸一张非所听之牌
      const wrong = pick([["一", "wan"], ["九", "wan"], ["东", "honor"], ["北", "honor"], ["三", "tong"]]);
      label = wrong[0]; kind = wrong[1]; msg = `摸到 <b style="color:#e74c3c">${label}</b> —— 没胡，黄了…`;
    }
    draw.innerHTML = "";
    const tile = mjTileEl(label, kind);
    tile.classList.add("mj-pop");
    draw.appendChild(tile);
    SoundFX.diceLand();
    await wait(450);
    res.innerHTML = msg;
    return {};
  },
};

/* ---------- 导出所有游戏 ---------- */
window.GAMES = [
  DiceGame, HighCardGame, BaccaratGame, BlackjackGame,
  GoldenFlowerGame, StudGame, MahjongGame, SlotGame, RevolverGame,
];
