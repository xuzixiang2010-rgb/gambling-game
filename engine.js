/* ============================================================
 * engine.js —— 核心引擎
 * 负责：实时倒计时 / 生命管理 / 隐藏赔率衰减 / 上瘾机制 /
 *       庄家演出 / 两个结局(离开=胜利, 归零=死亡揭示)
 * ============================================================ */

const State = {
  life: 180,            // 当前生命(秒)
  round: 0,             // 已完成局数
  bet: 20,              // 当前下注(预设/自定义)
  allinMode: false,     // 全押模式：下注额动态等于当前生命
  currentGame: null,    // 当前选中的游戏对象
  ready: false,         // 玩家是否完成必要选择
  resolving: false,     // 是否正在演出(暂停倒计时)
  paused: true,         // 倒计时是否暂停(开场前暂停)
  // 统计(用于结局揭示)
  gamesPlayed: 0, wins: 0, losses: 0, draws: 0,
  secWon: 0, secLost: 0,
  lossStreak: 0, rescued: false,
  startWall: 0,         // 真实开始时间戳
  forcedWinsLeft: 2,    // 诱饵：开局强制赢2把
  godMode: false,       // GM 模式：解锁全部 + 无限生命
};
const GOD_LIFE = 99999; // GM 模式下的"无限"生命值

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const els = {};

/* ---------- 隐藏赔率：越往后越难赢，界面永远显示50/50 ---------- */
function hiddenWinRate() {
  let base;
  const r = State.round;
  if (r < 5) base = 0.70;        // 蜜月期
  else if (r < 15) base = 0.55;  // 温水期
  else if (r < 30) base = 0.45;  // 转折期
  else base = 0.35;              // 深渊期
  // 赢家诅咒：时间太多就偷偷调低，把钱割回来
  if (State.life > 300) base *= 0.78;
  // 临终收割：濒死时推荐的"特别场"其实更黑
  if (State.life < 30) base *= 0.85;
  return base;
}

/* 俄罗斯轮盘存活率（看似1/6中弹，实则后期更黑） */
function revolverSurvival() {
  let s = State.round < 15 ? 0.80 : 0.66;
  if (State.life > 200) s -= 0.08;
  return s;
}

/* 决定本局结果（玩家永远看不到这个） */
function decideOutcome() {
  if (State.currentGame.deadly) {
    return Math.random() < revolverSurvival() ? "win" : "lose";
  }
  if (State.forcedWinsLeft > 0) { State.forcedWinsLeft--; return "win"; }
  // 连败救援：连输3把强制赢一次，防止玩家退出
  if (State.lossStreak >= 3 && !State.rescued) { State.rescued = true; return "win"; }
  const drawChance = 0.07;
  if (Math.random() < drawChance) return "draw";
  return Math.random() < hiddenWinRate() ? "win" : "lose";
}

/* ---------- 庄家演出 ---------- */
function dealerPhase() {
  if (State.life < 40) return "terminal";
  if (State.round >= 15) return "abyss";
  if (State.round >= 5) return "warmup";
  return "honeymoon";
}
const DEALER = {
  honeymoon: { face: "🎩", idle: ["坐吧朋友，今晚你手气一定旺。", "新手运总是特别好，试试看？", "瞧你这面相，就是天选之人。"] },
  warmup: { face: "🎩", idle: ["手感来了对吧？别停。", "再来一把，回本就在眼前。", "你比大多数人都有天赋。"] },
  abyss: { face: "🧐", idle: ["运气是会回来的，加点注？", "差一点而已，下一把肯定中。", "都到这儿了，现在走太可惜了。"] },
  terminal: { face: "😈", idle: ["别慌，我给你开个特别场，赢了直接回血。", "就剩这么点了？孤注一掷吧。", "命都快没了，还在乎这点？梭哈！"] },
};
const REACT = {
  win: ["漂亮！我就说你行。", "看吧，手气正旺，别走！", "赢麻了，再来再来！"],
  lose: ["唉，差一点。下一把准回来。", "运气背了点，加注捞回来啊。", "别灰心，赌徒哪有不翻盘的。"],
  draw: ["平局，钱还你，再赌一把？", "白忙一场，来真的吧。"],
  near: ["啊——就差一点点！太可惜了！", "就差一个数！下一把必中！"],
  bigwin: ["你简直是赌神！加大注啊！", "这手气，押大点才对得起它！"],
};
function dealerSay(text) {
  els.dealerFace.textContent = DEALER[dealerPhase()].face;
  els.dealerSpeech.textContent = text;
  els.dealerFace.style.transform = "scale(1.15)";
  setTimeout(() => (els.dealerFace.style.transform = "scale(1)"), 200);
}
function dealerIdle() { dealerSay(pick(DEALER[dealerPhase()].idle)); }

/* ---------- 渲染 ---------- */
function fmt(s) { return (Math.max(0, s)).toFixed(1) + "s"; }

function renderLife() {
  if (State.godMode) State.life = GOD_LIFE; // 无限生命：每次刷新都钉死
  const over = State.life > 180;
  const txt = State.godMode ? "∞  (GM 无限)" : fmt(State.life) + (over ? "  ▲ 突破上限!" : "");
  els.lifeText.textContent = txt;
  const pct = Math.max(0, Math.min(100, (State.life / 180) * 100));
  els.lifeFill.style.width = pct + "%";
  els.lifeFill.classList.toggle("overflow", over);
  // 大厅里的生命条同步刷新(挑选时也在流逝)
  if (els.lobbyLifeText) {
    els.lobbyLifeText.textContent = State.godMode ? "∞ GM" : fmt(State.life) + (over ? "  ▲" : "");
    els.lobbyLifeFill.style.width = pct + "%";
    els.lobbyLifeFill.classList.toggle("overflow", over);
  }
  document.body.classList.toggle("dying", !State.godMode && State.life < 30 && State.life > 0);
  updateBetDisplay(); // 全押额度/开赌按钮随生命实时刷新
}

/* 筹码扔上桌的动画 */
function spawnChipToss(bet) {
  const scene = $("scene");
  if (!scene) return;
  const chip = document.createElement("div");
  chip.className = "chip-toss";
  chip.textContent = bet;
  scene.appendChild(chip);
  setTimeout(() => chip.remove(), 650);
}

function renderHud() {
  els.roundNum.textContent = State.round;
  els.oddsText.textContent = "50/50"; // 永远的谎言
}

function renderSunkCost() {
  if (State.life >= 180) {
    els.sunkCost.innerHTML = `已玩 <b>${State.gamesPlayed}</b> 局 ｜ 你正盈利，何不再赢一把？`;
  } else {
    const need = Math.ceil((180 - State.life) / 40); // 每赢一把净赚20，回到180
    els.sunkCost.innerHTML = `已玩 <b>${State.gamesPlayed}</b> 局 ｜ 距离回本(180s)只差 <b>再赢 ${need} 把</b>`;
  }
}

/* ---------- 大厅：游戏卡片选择 ---------- */
function renderLobby() {
  if (!els.lobbyGrid) return;
  els.lobbyGrid.innerHTML = "";
  GAMES.forEach((g) => {
    const unlocked = State.godMode || State.round >= g.unlockAtRound;
    const card = document.createElement(unlocked ? "button" : "div");
    card.className = "lobby-card" + (unlocked ? "" : " locked");
    card.innerHTML = `
      <img class="thumb" src="${g.img}" alt="${g.name}" />
      ${g.risk ? '<span class="risk-badge">⚠ 高风险</span>' : ""}
      <div class="card-body">
        <div class="gname">${g.name}</div>
        <div class="gshort">${g.short}</div>
        <div class="gunlock">${unlocked ? "▶ 点击进入" : "第 " + g.unlockAtRound + " 局解锁"}</div>
      </div>
      ${unlocked ? "" : `<div class="lock-overlay"><span class="lock-ico">🔒</span><span>第 ${g.unlockAtRound} 局解锁</span></div>`}`;
    if (unlocked) card.onclick = () => enterGame(g);
    els.lobbyGrid.appendChild(card);
  });
}

/* 游戏内显示当前在玩的游戏名 */
function renderCurrentGame() {
  if (els.currentGameName && State.currentGame) {
    els.currentGameName.textContent =
      "正在玩：" + State.currentGame.name + (State.currentGame.risk ? " ⚠" : "");
  }
}

/* 进入大厅(挑选赌局)；倒计时继续流逝 */
function enterLobby() {
  if (State.resolving) { dealerSay("这把还没开完，别急着换桌！"); return; }
  if ($("ending").classList.contains("active")) return;
  switchScreen("lobby");
  State.paused = false;
  renderLife();
  renderLobby();
}

/* 从大厅进入某个赌局 */
function enterGame(g) {
  switchScreen("game");
  State.paused = false;
  selectGame(g);
  renderLife(); renderHud(); renderBets(); renderSunkCost();
  dealerIdle();
}

// 本局实际下注额：全押模式下动态等于当前生命(向下取整)
function effectiveBet() {
  return State.allinMode ? Math.max(1, Math.floor(State.life)) : State.bet;
}

function renderBets() {
  // 预设筹码(快捷)，随局数解锁更大额度
  const opts = [{ v: 10, lbl: "10s" }, { v: 20, lbl: "20s" }];
  if (State.round >= 8) opts.push({ v: 40, lbl: "40s" });
  if (State.round >= 16) opts.push({ v: 80, lbl: "80s" });
  opts.push({ v: "allin", lbl: "全押" });
  els.betButtons.innerHTML = "";
  opts.forEach((o) => {
    const b = document.createElement("button");
    const isAllin = o.v === "allin";
    const active = isAllin ? State.allinMode : (!State.allinMode && State.bet === o.v);
    b.className = "bet-chip" + (isAllin ? " allin" : "") + (active ? " active" : "");
    b.textContent = isAllin ? `全押 ${Math.floor(State.life)}s` : o.lbl;
    b.onclick = () => {
      if (isAllin) { State.allinMode = true; }
      else { State.allinMode = false; State.bet = o.v; }
      renderBets(); updatePlayBtn();
    };
    els.betButtons.appendChild(b);
  });
  // 自定义下注秒数(始终可用)
  const custom = document.createElement("input");
  custom.type = "number"; custom.min = "1"; custom.className = "bet-custom";
  custom.placeholder = "自定义秒数";
  custom.value = State.allinMode ? "" : String(State.bet);
  custom.oninput = () => {
    let v = Math.floor(Number(custom.value));
    const maxB = Math.max(1, Math.floor(State.life));
    if (!v || v < 1) v = 1;
    if (v > maxB) { v = maxB; custom.value = String(v); }
    State.allinMode = false;
    State.bet = v;
    els.betButtons.querySelectorAll(".bet-chip").forEach((c) => c.classList.remove("active"));
    updatePlayBtn();
  };
  els.betButtons.appendChild(custom);
  updateBetDisplay();
}

// 动态刷新：全押额度与开赌按钮上的秒数(随倒计时实时变化)
function updateBetDisplay() {
  const allinChip = els.betButtons && els.betButtons.querySelector(".bet-chip.allin");
  if (allinChip) allinChip.textContent = `全押 ${Math.floor(State.life)}s`;
  if (els.playBtn) {
    els.playBtn.textContent = State.resolving ? "开赌中…" : `下注 ${effectiveBet()}s 开赌`;
  }
}

function updatePlayBtn() {
  const bet = effectiveBet();
  const canBet = bet >= 1 && State.life >= bet;
  els.playBtn.disabled = !(State.ready && canBet && !State.resolving);
  updateBetDisplay();
}

/* ---------- 游戏选择 ---------- */
function selectGame(g) {
  if (State.resolving) return;
  State.currentGame = g;
  State.ready = false;
  const ctx = {
    setReady: (b) => { State.ready = b; updatePlayBtn(); },
    autoPlay: () => play(),
    getBet: () => State.bet,
  };
  g.setup(els.stage, ctx);
  // 规则说明显示在场景下方的面板里
  if (els.rules) {
    els.rules.innerHTML = g.rules
      ? `📖 <b>${g.name} · 玩法规则</b><br/>${g.rules}`
      : "";
  }
  renderCurrentGame();
  updatePlayBtn();
}

/* ---------- 核心：下注开赌 ---------- */
async function play() {
  if (State.resolving || !State.ready) return;
  const bet = effectiveBet();
  if (bet < 1 || State.life < bet) { dealerSay("生命不够下注了……要不试试轮盘？"); return; }
  State.resolving = true;
  State.paused = true; // 演出时暂停倒计时
  updatePlayBtn();
  els.leaveBtn.disabled = true;

  // 筹码扔上桌：音效 + 动画
  SoundFX.chip();
  spawnChipToss(bet);

  State.life -= bet;           // 先扣下注
  renderLife();

  const outcome = decideOutcome();
  const nearMiss = outcome === "lose" && Math.random() < 0.30;

  const ret = (await State.currentGame.resolve(els.stage, { outcome, nearMiss })) || {};

  // 结算
  State.gamesPlayed++;
  State.round++;

  if (ret.deadly && !State.godMode) {            // 俄罗斯轮盘中弹
    State.life = 0;
    renderLife();
    return death("你赌上了性命，子弹没有怜悯。");
  }

  if (outcome === "win") {
    const isRevolver = State.currentGame.deadly;
    const gain = isRevolver ? bet * 4 : bet * 2; // 普通赢双倍返还；轮盘×4
    State.life += gain;
    State.wins++; State.secWon += (gain - bet);
    State.lossStreak = 0; State.rescued = false;
    showToast("赢", `+${gain - bet}s`, "win");
    dealerSay(pick(State.life > 320 ? REACT.bigwin : REACT.win));
    SoundFX.win();
  } else if (outcome === "draw") {
    State.life += bet;         // 退还
    State.draws++;
    showToast("平局", "退还 " + bet + "s", "draw");
    dealerSay(pick(REACT.draw));
    SoundFX.draw();
  } else {
    State.losses++; State.secLost += bet;
    State.lossStreak++;
    if (nearMiss) { showToast("就差一点！", "失去 " + bet + "s", "near"); dealerSay(pick(REACT.near)); SoundFX.near(); }
    else { showToast("输", "失去 " + bet + "s", "lose"); dealerSay(pick(REACT.lose)); SoundFX.lose(); }
  }

  renderLife(); renderHud(); renderSunkCost();

  // 让玩家看清这一把开出的结果(此时倒计时仍暂停)
  await wait(1300);

  State.resolving = false;
  els.leaveBtn.disabled = false;
  renderBets(); renderCurrentGame();

  if (State.life <= 0.05) return death("时间，是你输不起的赌注。");

  // 若当前游戏因局数变化新解锁了筹码/游戏，重置当前游戏界面
  selectGame(State.currentGame);
  State.paused = false; // 恢复倒计时
}

/* ---------- 浮动提示 ---------- */
function showToast(main, sub, cls) {
  els.toast.className = "toast show " + cls;
  els.toast.innerHTML = `${main}<span class="sub">${sub}</span>`;
  setTimeout(() => (els.toast.className = "toast " + cls), 1100);
}

/* ---------- 倒计时(实时流逝，犹豫也掉血) ---------- */
function tick() {
  if (State.paused || State.resolving) return;
  State.life -= 0.1;
  renderLife();
  // 濒死心跳声
  if (State.life < 30 && State.life > 0) {
    if (!State._lastBeat || performance.now() - State._lastBeat > 780) {
      State._lastBeat = performance.now();
      SoundFX.heartbeat();
    }
  }
  if (State.life <= 0.05) {
    State.life = 0; renderLife();
    State.paused = true;
    death("你犹豫得太久，时间替你做了决定。");
  }
}

/* ---------- 结局：死亡揭示 ---------- */
function death(reason) {
  if (State.godMode) { State.life = GOD_LIFE; renderLife(); State.paused = false; return; }
  if ($("ending").classList.contains("active")) return;
  State.paused = true;
  document.body.classList.remove("dying");
  SoundFX.stopBGM();
  const wallSec = Math.round((Date.now() - State.startWall) / 1000);
  const wallMin = (wallSec / 60).toFixed(1);
  const realRate = State.gamesPlayed ? Math.round((State.wins / State.gamesPlayed) * 100) : 0;

  switchScreen("ending");
  els.endingBox.className = "ending-box death";
  els.endingBox.innerHTML = `
    <h2>💀 你输光了</h2>
    <p class="ending-msg">${reason}</p>
    <div class="ending-stats">
      <div class="row"><span>你以为的胜率</span><b>感觉总有一半吧？</b></div>
      <div class="row bad"><span>真实胜率</span><b>${realRate}%</b></div>
      <div class="row"><span>总共赌了</span><b>${State.gamesPlayed} 局</b></div>
      <div class="row"><span>赢回的时间</span><b>+${State.secWon.toFixed(0)}s</b></div>
      <div class="row bad"><span>输掉的时间</span><b>-${State.secLost.toFixed(0)}s</b></div>
      <div class="row bad"><span>庄家拿走</span><b>180s = 你的全部人生</b></div>
    </div>
    <p class="ending-msg">
      你刚才坐在屏幕前 <b style="color:#e8c14a">${wallMin} 分钟</b>。<br/>
      这 ${wallMin} 分钟，就是赌博偷走人生的方式。
      <span class="big">庄家永远是赢家。<br/>这不是运气，是数学。</span>
      你以为能赢，是因为开局它故意让你赢。<br/>
      你停不下来，是因为这一切都被精心设计过。<br/>
      <b style="color:#e74c3c">现实里的赌局，没有"重来"按钮。</b>
    </p>
    <button class="btn btn-ghost" onclick="location.reload()">重新开始（现实没有这个按钮）</button>
  `;
}

/* ---------- 结局：主动离开 = 真正的胜利 ---------- */
function leave() {
  if (State.resolving) { dealerSay("等等！这把还没完呢！"); return; }
  if ($("ending").classList.contains("active")) return;
  State.paused = true;
  document.body.classList.remove("dying");
  SoundFX.stopBGM();
  const saved = State.life;
  switchScreen("ending");
  els.endingBox.className = "ending-box win";
  els.endingBox.innerHTML = `
    <h2>🏆 你赢了</h2>
    <p class="ending-msg">
      你带着 <b style="color:#e8c14a">${fmt(saved)}</b> 的生命，
      在庄家的劝阻声中站了起来，转身离开。
    </p>
    <p class="ending-msg">
      你是极少数能<b style="color:#e8c14a">停下来</b>的人。<br/>
      <span class="big">赌局里唯一的胜利，<br/>就是不再下注。</span>
      庄家最怕的，从来不是输钱的人，<br/>
      而是<b style="color:#e8c14a">能转身走开</b>的人。
    </p>
    <button class="btn btn-gold" onclick="location.reload()">再看一次</button>
  `;
}

/* ---------- 屏幕切换 ---------- */
function switchScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* ---------- 开始游戏：先进大厅选赌局 ---------- */
function startGame() {
  State.startWall = Date.now();
  State.currentGame = GAMES[0];
  // 音频必须在用户手势后启动
  SoundFX.init(); SoundFX.resume(); SoundFX.startBGM();
  renderHud(); renderBets(); renderSunkCost();
  enterLobby();
}

/* ---------- 初始化 ---------- */
window.addEventListener("DOMContentLoaded", () => {
  ["lifeText", "lifeFill", "roundNum", "oddsText", "dealerFace", "dealerSpeech",
   "stage", "betButtons", "playBtn", "leaveBtn", "sunkCost", "toast",
   "endingBox", "rules", "muteBtn", "gmBtn",
   "lobbyLifeText", "lobbyLifeFill", "lobbyGrid", "lobbyBtn", "lobbyLeaveBtn",
   "currentGameName"].forEach((id) => (els[id] = $(id)));

  $("startBtn").onclick = startGame;
  els.playBtn.onclick = play;
  els.leaveBtn.onclick = leave;
  els.lobbyBtn.onclick = enterLobby;
  els.lobbyLeaveBtn.onclick = leave;
  els.muteBtn.onclick = () => {
    const m = !SoundFX.isMuted();
    SoundFX.setMuted(m);
    els.muteBtn.textContent = m ? "🔇" : "🔊";
  };
  els.gmBtn.onclick = () => {
    State.godMode = !State.godMode;
    els.gmBtn.classList.toggle("active", State.godMode);
    els.gmBtn.textContent = State.godMode ? "GM ✓" : "GM";
    if (State.godMode) {
      State._preGodLife = State.life;
      State.life = GOD_LIFE;
    } else {
      State.life = Math.min(State._preGodLife || 180, 180);
    }
    document.body.classList.remove("dying");
    renderLife();
    if ($("lobby").classList.contains("active")) renderLobby();
    if ($("game").classList.contains("active")) { renderBets(); updatePlayBtn(); }
    dealerSay(State.godMode ? "GM 模式：全部解锁，生命无限。随便玩。" : "GM 模式已关闭，回到凡人规则。");
  };

  setInterval(tick, 100);

  // 庄家定时碎碎念，制造存在感(仅在牌桌上)
  setInterval(() => {
    if ($("game").classList.contains("active") && !State.paused && !State.resolving) {
      if (Math.random() < 0.25) dealerIdle();
    }
  }, 6000);
});
