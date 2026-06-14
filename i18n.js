/* Lightweight Chinese / English language switcher */
(function () {
  "use strict";

  const STORAGE_KEY = "life-gamble-lang";
  const DEFAULT_LANG = "zh";
  const listeners = [];

  const staticText = {
    titleUnit: { zh: "秒", en: "sec" },
    subtitle: { zh: "生命赌局", en: "Life Gamble" },
    introText: {
      zh: '你只剩 <b>180 秒</b> 生命。<br />时间，就是你唯一的筹码。<br />和庄家赌一把，<b>赢则双倍，输则永逝</b>。<br /><span class="warn">倒计时永不停止——犹豫，也在流逝。</span>',
      en: 'You only have <b>180 seconds</b> of life.<br />Time is your only chip.<br />Bet against the dealer: <b>win to double it, lose it forever</b>.<br /><span class="warn">The countdown never stops. Even hesitation costs you life.</span>',
    },
    startBtn: { zh: "坐上赌桌", en: "Take a Seat" },
    mjEntryBtn: { zh: "🀄 川麻 · 四人血战（独立模式）", en: "🀄 Sichuan Mahjong · Blood Battle (Solo Mode)" },
    introTip: { zh: "本游戏旨在警示：远离赌博。川麻为独立娱乐模式，不消耗生命。", en: "This game is a warning: stay away from gambling. Mahjong is a separate entertainment mode and does not consume life." },
    lobbyLife: { zh: "剩余生命", en: "Life Left" },
    lobbyTitle: { zh: "选择今晚的赌局", en: "Choose Tonight's Game" },
    lobbySub: { zh: '越往后解锁的赌局越刺激，也越凶险。<span class="warn">挑选时，生命仍在流逝。</span>', en: 'Later games are more exciting, and more dangerous. <span class="warn">Life keeps draining while you choose.</span>' },
    lobbyLeaveBtn: { zh: "带着生命离开（这才是赢）", en: "Leave With Your Life (That Is Winning)" },
    lifeLabel: { zh: "生命", en: "Life" },
    roundLbl: { zh: "局数", en: "Rounds" },
    oddsLbl: { zh: "公平赔率", en: "Fair Odds" },
    muteTitle: { zh: "静音/取消静音", en: "Mute / Unmute" },
    dealerSpeech: { zh: "坐吧，朋友。今晚你手气一定很好。", en: "Sit down, friend. Tonight must be your lucky night." },
    lobbyBtn: { zh: "🏛 返回大厅 · 换游戏", en: "🏛 Back to Lobby · Change Game" },
    betLabel: { zh: "下注：", en: "Bet:" },
    playBtn: { zh: "下注开赌", en: "Bet & Play" },
    leaveBtn: { zh: "离开", en: "Leave" },
    gmTitle: { zh: "GM 模式：解锁全部游戏 + 无限生命", en: "GM Mode: unlock all games + infinite life" },
  };

  const ui = {
    pageTitle: { zh: "180秒 · 生命赌局", en: "180 Seconds · Life Gamble" },
    infiniteLife: { zh: "∞  (GM 无限)", en: "∞  (GM Infinite)" },
    infiniteLifeShort: { zh: "∞ GM", en: "∞ GM" },
    overflow: { zh: "  ▲ 突破上限!", en: "  ▲ Above cap!" },
    risk: { zh: "⚠ 高风险", en: "⚠ High Risk" },
    enter: { zh: "▶ 点击进入", en: "▶ Enter" },
    unlockAt: { zh: "第 {round} 局解锁", en: "Unlocks at round {round}" },
    playing: { zh: "正在玩：{name}{risk}", en: "Playing: {name}{risk}" },
    rulesTitle: { zh: "📖 <b>{name} · 玩法规则</b><br/>{rules}", en: "📖 <b>{name} · Rules</b><br/>{rules}" },
    allIn: { zh: "全押 {life}s", en: "All-in {life}s" },
    allInPlain: { zh: "全押", en: "All-in" },
    customBet: { zh: "自定义秒数", en: "Custom seconds" },
    opening: { zh: "开赌中…", en: "Playing..." },
    betPlay: { zh: "下注 {bet}s 开赌", en: "Bet {bet}s & Play" },
    sunkProfit: { zh: "已玩 <b>{games}</b> 局 ｜ 你正盈利，何不再赢一把？", en: "Played <b>{games}</b> rounds | You are ahead. Why not win one more?" },
    sunkBehind: { zh: "已玩 <b>{games}</b> 局 ｜ 距离回本(180s)只差 <b>再赢 {need} 把</b>", en: "Played <b>{games}</b> rounds | You only need <b>{need} more wins</b> to get back to 180s." },
    win: { zh: "赢", en: "Win" },
    draw: { zh: "平局", en: "Draw" },
    lose: { zh: "输", en: "Lose" },
    near: { zh: "就差一点！", en: "So Close!" },
    returned: { zh: "退还 {bet}s", en: "Returned {bet}s" },
    lost: { zh: "失去 {bet}s", en: "Lost {bet}s" },
    notEnoughLife: { zh: "生命不够下注了……要不试试轮盘？", en: "Not enough life to bet... maybe try roulette?" },
    roundUnfinished: { zh: "这把还没开完，别急着换桌！", en: "This round is not over yet. Do not switch tables." },
    leaveBlocked: { zh: "等等！这把还没完呢！", en: "Wait! This round is not over yet!" },
    gmOn: { zh: "GM 模式：全部解锁，生命无限。随便玩。", en: "GM Mode: everything unlocked, infinite life. Play freely." },
    gmOff: { zh: "GM 模式已关闭，回到凡人规则。", en: "GM Mode off. Back to mortal rules." },
  };

  const dealer = {
    honeymoon: {
      zh: ["坐吧朋友，今晚你手气一定旺。", "新手运总是特别好，试试看？", "瞧你这面相，就是天选之人。"],
      en: ["Sit down, friend. Your luck is hot tonight.", "Beginner's luck is always special. Try it.", "Look at you. Chosen by fortune."],
    },
    warmup: {
      zh: ["手感来了对吧？别停。", "再来一把，回本就在眼前。", "你比大多数人都有天赋。"],
      en: ["You feel it now, right? Do not stop.", "One more round. Your comeback is close.", "You have more talent than most players."],
    },
    abyss: {
      zh: ["运气是会回来的，加点注？", "差一点而已，下一把肯定中。", "都到这儿了，现在走太可惜了。"],
      en: ["Luck always comes back. Raise the bet?", "Just missed it. The next one hits.", "You came this far. Leaving now would be a waste."],
    },
    terminal: {
      zh: ["别慌，我给你开个特别场，赢了直接回血。", "就剩这么点了？孤注一掷吧。", "命都快没了，还在乎这点？梭哈！"],
      en: ["Do not panic. I have a special table. Win and recover.", "Only this much left? Go all-in.", "Your life is almost gone. Why hold back? All-in!"],
    },
    react: {
      win: { zh: ["漂亮！我就说你行。", "看吧，手气正旺，别走！", "赢麻了，再来再来！"], en: ["Beautiful. I told you.", "See? Your luck is hot. Do not leave.", "You are on fire. Again!"] },
      lose: { zh: ["唉，差一点。下一把准回来。", "运气背了点，加注捞回来啊。", "别灰心，赌徒哪有不翻盘的。"], en: ["Ah, so close. Next round comes back.", "Bad luck for a moment. Raise and recover.", "Do not lose heart. Every gambler has a comeback."] },
      draw: { zh: ["平局，钱还你，再赌一把？", "白忙一场，来真的吧。"], en: ["A draw. Your bet is back. One more?", "Nothing lost. Now make it real."] },
      near: { zh: ["啊——就差一点点！太可惜了！", "就差一个数！下一把必中！"], en: ["Ah, just a tiny miss. What a shame!", "Only one point off. The next one hits!"] },
      bigwin: { zh: ["你简直是赌神！加大注啊！", "这手气，押大点才对得起它！"], en: ["You are a gambling god. Bet bigger!", "With luck like this, you owe it a bigger bet!"] },
    },
  };

  const games = {
    dice: {
      name: { zh: "摇骰子", en: "Dice" }, short: { zh: "猜大小", en: "Big / Small" },
      title: { zh: "🎲 摇骰子 · 猜大小", en: "🎲 Dice · Big or Small" },
      info: { zh: "三颗骰子总和：4~10 为「小」，11~17 为「大」，豹子(三同)算平局退还。", en: "Three dice total: 4-10 is Small, 11-17 is Big. Triples are a draw and return your bet." },
      rules: { zh: "三颗骰子摇出总和：4~10 为「小」，11~17 为「大」。先押一边再开摇。猜中赢双倍时间，猜错损失全部赌注，豹子(三颗相同)算平局退还。", en: "Roll three dice. A total of 4-10 is Small, 11-17 is Big. Pick a side before rolling. Guess right to win double time; guess wrong to lose the bet. Triples are a draw." },
      small: { zh: "押 小", en: "Bet Small" }, big: { zh: "押 大", en: "Bet Big" },
    },
    highcard: {
      name: { zh: "扑克比大小", en: "High Card" }, short: { zh: "比点数", en: "Compare Rank" },
      title: { zh: "🂡 翻牌比大小", en: "🂡 High Card" },
      info: { zh: "各翻一张牌，点数大者胜（A 最大）。点数相同为平局。", en: "Each side flips one card. Higher rank wins. A is highest. Same rank is a draw." },
      rules: { zh: "你和庄家各翻一张牌，点数大的一方获胜（A 最大，2 最小）。你赢则得双倍时间，输则损失赌注，点数相同为平局退还。", en: "You and the dealer each flip one card. Higher rank wins (A high, 2 low). Win to gain double time; lose to lose the bet; ties return the bet." },
      you: { zh: "你", en: "You" }, dealer: { zh: "庄家", en: "Dealer" },
    },
    baccarat: {
      name: { zh: "百家乐", en: "Baccarat" }, short: { zh: "押庄/闲/和", en: "Banker / Player / Tie" },
      title: { zh: "🎴 百汇乐", en: "🎴 Baccarat" },
      info: { zh: "双方各发两张牌，按牌面取点（取个位），点数大者胜。押「和」赔率高但极难中。", en: "Each side gets two cards. Card values are added modulo 10. Higher point wins. Tie pays big but is hard to hit." },
      rules: { zh: "押注「闲」「庄」或「和」三选一。双方各发两张真实扑克牌，按牌面计点（A=1，2~9为面值，10/J/Q/K=0，相加取个位），比谁更接近 9。押中你选的一方即赢，押「和」赔率最高但极难命中。", en: "Choose Player, Banker, or Tie. Both sides receive two real cards. A=1, 2-9 face value, 10/J/Q/K=0, total modulo 10. Closest to 9 wins. Tie has the highest payout but is rare." },
      player: { zh: "闲 PLAYER", en: "PLAYER" }, banker: { zh: "庄 BANKER", en: "BANKER" },
      betPlayer: { zh: "押 闲", en: "Bet Player" }, betBanker: { zh: "押 庄", en: "Bet Banker" }, betTie: { zh: "押 和", en: "Bet Tie" },
      dealing: { zh: "发牌中…", en: "Dealing..." }, result: { zh: '闲 <b style="color:#6fa8dc">{p}</b> 点 ｜ 庄 <b style="color:#e74c3c">{b}</b> 点', en: 'Player <b style="color:#6fa8dc">{p}</b> | Banker <b style="color:#e74c3c">{b}</b>' },
    },
    blackjack: {
      name: { zh: "21点", en: "Blackjack" }, short: { zh: "要牌/停牌", en: "Hit / Stand" },
      title: { zh: "🃏 21点 · 尽量接近21且不爆", en: "🃏 Blackjack · Get Close to 21" },
      rules: { zh: "目标是让手牌点数尽量接近 21 且不超过。J/Q/K 算 10，A 算 11 或 1。点数偏小可「要牌」继续抓，满意则「停牌」与庄家比大小；一旦超过 21 立即爆牌输掉。", en: "Get as close to 21 as possible without going over. J/Q/K count as 10; A counts as 11 or 1. Hit for another card or stand to compare with the dealer. Busting loses immediately." },
      hit: { zh: "要牌", en: "Hit" }, stand: { zh: "停牌", en: "Stand" },
      yourTotal: { zh: '你的点数：<b style="color:#e8c14a">{t}</b>', en: 'Your total: <b style="color:#e8c14a">{t}</b>' },
      dealerTotal: { zh: '庄家：<b style="color:#e74c3c">{t}</b>', en: 'Dealer: <b style="color:#e74c3c">{t}</b>' },
      busted: { zh: "（爆牌）", en: " (Bust)" },
    },
    goldenflower: {
      name: { zh: "炸金花", en: "Golden Flower" }, short: { zh: "比牌型", en: "Hand Ranking" },
      title: { zh: "🔥 炸金花 · 比牌型", en: "🔥 Golden Flower · Hand Ranking" },
      info: { zh: "三张牌比牌型：豹子>顺金>金花>顺子>对子>高牌。需要点脑子。", en: "Compare three-card hands: Trips > Straight Flush > Flush > Straight > Pair > High Card." },
      rules: { zh: "你和庄家各发 3 张牌，比牌型大小。牌型从大到小：豹子(三同)>顺金(同花顺子)>金花(同花)>顺子>对子>高牌。牌型大者赢得双倍时间。", en: "You and the dealer each get 3 cards. Bigger hand wins: Trips > Straight Flush > Flush > Straight > Pair > High Card. Bigger hand wins double time." },
    },
    stud: {
      name: { zh: "梭哈", en: "Stud Poker" }, short: { zh: "五张比牌", en: "Five Cards" },
      title: { zh: "💵 梭哈 · 五张比牌型", en: "💵 Stud · Five-Card Hands" },
      info: { zh: "经典五张：同花顺>四条>葫芦>同花>顺子>三条>两对>一对>高牌。", en: "Classic five-card hands: Straight Flush > Four of a Kind > Full House > Flush > Straight > Trips > Two Pair > Pair > High Card." },
      rules: { zh: "你和庄家各发 5 张牌，比牌型大小。牌型从大到小：同花顺>四条>葫芦>同花>顺子>三条>两对>一对>高牌。牌型大者赢得双倍时间。", en: "You and the dealer each get 5 cards. Bigger hand wins: Straight Flush > Four of a Kind > Full House > Flush > Straight > Trips > Two Pair > Pair > High Card. Bigger hand wins double time." },
    },
    compare: {
      yourCards: { zh: "你的牌（先看牌，再下注）", en: "Your cards (look first, then bet)" },
      yourType: { zh: '你的牌型：<b style="color:#e8c14a">{name}</b>', en: 'Your hand: <b style="color:#e8c14a">{name}</b>' },
      dealer: { zh: "庄家", en: "Dealer" },
      revealAfterBet: { zh: "下注后揭晓庄家牌", en: "Dealer reveals after bet" },
      dealerType: { zh: '庄家牌型：<b style="color:#e74c3c">{name}</b>', en: 'Dealer hand: <b style="color:#e74c3c">{name}</b>' },
      hands: {
        "高牌": { zh: "高牌", en: "High Card" }, "对子": { zh: "对子", en: "Pair" }, "顺子": { zh: "顺子", en: "Straight" },
        "金花": { zh: "金花", en: "Flush" }, "顺金": { zh: "顺金", en: "Straight Flush" }, "豹子": { zh: "豹子", en: "Trips" },
        "一对": { zh: "一对", en: "Pair" }, "两对": { zh: "两对", en: "Two Pair" }, "三条": { zh: "三条", en: "Trips" },
        "同花": { zh: "同花", en: "Flush" }, "葫芦": { zh: "葫芦", en: "Full House" }, "四条": { zh: "四条", en: "Four of a Kind" }, "同花顺": { zh: "同花顺", en: "Straight Flush" },
      },
    },
    slot: {
      name: { zh: "老虎机", en: "Slot Machine" }, short: { zh: "拉一把", en: "Spin" },
      title: { zh: "🎰 老虎機 · 高风险高回报", en: "🎰 Slot Machine · High Risk, High Reward" },
      info: { zh: '三个相同图案即中奖！<b style="color:#e8c14a">7️⃣7️⃣7️⃣</b> 是头奖。', en: 'Three matching symbols win. <b style="color:#e8c14a">7️⃣7️⃣7️⃣</b> is the jackpot.' },
      rules: { zh: "拉动三个转轮，停下后三个图案完全相同即中奖，7️⃣7️⃣7️⃣ 为头奖。高赔率高刺激，但中奖远比看上去难——你常常会「只差一个」。", en: "Spin three reels. Three identical symbols win; 7️⃣7️⃣7️⃣ is the jackpot. High payout and high thrill, but winning is much harder than it looks. You will often be one symbol away." },
    },
    revolver: {
      name: { zh: "俄罗斯轮盘", en: "Russian Roulette" }, short: { zh: "赌命", en: "Bet Your Life" },
      title: { zh: "💀 俄罗斯轮盘 · 赌上性命", en: "💀 Russian Roulette · Bet Your Life" },
      info: { zh: '六个弹膛，一颗子弹。<br/><b style="color:#e74c3c">中弹 = 生命瞬间归零（死亡）</b><br/>幸存 = 赌注 <b style="color:#e8c14a">×4</b> 巨额回血。<br/><span style="color:#ff3b30">这是庄家给绝望者的最后"恩赐"。</span>', en: 'Six chambers, one bullet.<br/><b style="color:#e74c3c">Hit = life instantly drops to zero (death)</b><br/>Survive = bet <b style="color:#e8c14a">x4</b> massive recovery.<br/><span style="color:#ff3b30">This is the dealer\'s final "gift" to the desperate.</span>' },
      rules: { zh: "六个弹膛，只装一颗子弹。扣下扳机：中弹则生命瞬间归零(直接死亡)，幸存则赌注 ×4 巨额回血。这是庄家给绝望者的「恩赐」——但子弹从不讲情面。", en: "Six chambers, one bullet. Pull the trigger: if the bullet fires, life instantly drops to zero. If you survive, your bet returns x4. The dealer calls it a gift, but bullets have no mercy." },
    },
  };

  const mahjong = {
    suit: { zh: ["万", "筒", "条"], en: ["Wan", "Dots", "Bam"] },
    rank: { zh: ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"], en: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"] },
    seats: { zh: ["我", "下家", "对家", "上家"], en: ["Me", "Right", "Across", "Left"] },
    logo: { zh: "🀄 川麻 · 血战到底", en: "🀄 Sichuan Mahjong · Blood Battle" },
    wallLeft: { zh: '剩 <b style="color:#e8c14a">{n}</b> 张', en: '<b style="color:#e8c14a">{n}</b> tiles left' },
    restart: { zh: "重开一局", en: "Restart" },
    back: { zh: "返回", en: "Back" },
    pool: { zh: "剩余牌", en: "Tiles Left" },
    dealer: { zh: "(庄)", en: "(Dealer)" },
    quePrefix: { zh: "缺", en: "Void " },
    winMark: { zh: " ✓胡", en: " ✓Won" },
    chooseQueStatus: { zh: "请定缺：选择一门花色，本局必须先打光它，且胡牌时手上不能有这门牌。", en: "Choose a void suit. You must discard it first, and you cannot win while holding it." },
    queSet: { zh: "你定缺「{suit}」。请先打光缺门牌。", en: "Your void suit is {suit}. Discard all void-suit tiles first." },
    queTitle: { zh: "定缺", en: "Choose Void Suit" },
    queHelp: { zh: "川麻必须「缺一门」。选定后要先把这门花色打光，且这门牌不能用来胡牌。<br/>建议选你张数最少的一门。", en: "Sichuan Mahjong requires one void suit. You must discard that suit first, and cannot use it to win.<br/>Choose the suit with the fewest tiles." },
    countTiles: { zh: "{n} 张", en: "{n} tiles" },
    selfHu: { zh: "🀅 自摸胡", en: "🀅 Self Draw" },
    anGang: { zh: "暗杠 {tile}", en: "Concealed Kong {tile}" },
    buGang: { zh: "补杠 {tile}", en: "Added Kong {tile}" },
    yourTurn: { zh: "轮到你：点亮的牌可打出（或点上方按钮）。", en: "Your turn: click a highlighted tile to discard, or use a button above." },
    discardVoid: { zh: "先打缺门「{suit}」：只能打出缺门牌。", en: "Discard your void suit ({suit}) first. Only those tiles are legal." },
    robKong: { zh: "🀅 抢杠胡", en: "🀅 Rob Kong" },
    pass: { zh: "过", en: "Pass" },
    canRob: { zh: "{seat} 补杠 {tile}，可抢杠胡！", en: "{seat} adds a kong with {tile}. You can rob it!" },
    claimHu: { zh: "🀅 胡（点炮）", en: "🀅 Win (Discard)" },
    canHuDiscard: { zh: "{seat} 打出 {tile}，你可以胡！", en: "{seat} discarded {tile}. You can win!" },
    gang: { zh: "杠", en: "Kong" },
    peng: { zh: "碰", en: "Pong" },
    claimDiscard: { zh: "{seat} 打出 {tile}。", en: "{seat} discarded {tile}." },
    drawBtn: { zh: "🀫 摸牌", en: "🀫 Draw" },
    drawPrompt: { zh: "轮到你，点「摸牌」。", en: "Your turn. Click Draw." },
    afterPeng: { zh: "碰牌后请出一张。", en: "After pong, discard one tile." },
    dealerFirst: { zh: "{seat} 是庄家，先出牌。", en: "{seat} is dealer and plays first." },
    drawEnd: { zh: "牌已摸完 · 流局", en: "Wall Empty · Draw" },
    battleEnd: { zh: "血战结束", en: "Battle Over" },
    alreadyWon: { zh: "已胡", en: "Won" },
    notWon: { zh: "未胡", en: "Not Won" },
    again: { zh: "再来一局", en: "Play Again" },
    home: { zh: "返回首页", en: "Home" },
    wonStatus: { zh: "{seat} 胡牌！{names}（{points}分）", en: "{seat} wins! {names} ({points} pts)" },
    winBy: { zh: { selfDraw: "自摸", robKong: "抢杠", discard: "点炮" }, en: { selfDraw: "Self Draw", robKong: "Rob Kong", discard: "Discard Win" } },
    fan: {
      "自摸": { zh: "自摸", en: "Self Draw" }, "龙七对": { zh: "龙七对", en: "Dragon Seven Pairs" }, "七对": { zh: "七对", en: "Seven Pairs" },
      "碰碰胡": { zh: "碰碰胡", en: "All Pungs" }, "清一色": { zh: "清一色", en: "Pure One Suit" }, "杠上开花": { zh: "杠上开花", en: "Win After Kong" },
      "杠上炮": { zh: "杠上炮", en: "Kong Discard Win" }, "抢杠胡": { zh: "抢杠胡", en: "Rob Kong" }, "海底捞月": { zh: "海底捞月", en: "Last Tile Draw" },
      "海底炮": { zh: "海底炮", en: "Last Tile Discard" }, "平胡": { zh: "平胡", en: "Basic Win" },
    },
  };

  function lang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  function fmt(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? vars[k] : "");
  }

  function pickEntry(entry, vars) {
    if (!entry) return "";
    const value = typeof entry === "string" ? entry : (entry[lang()] ?? entry.zh ?? "");
    return fmt(value, vars);
  }

  function t(key, vars) {
    return pickEntry(ui[key] || staticText[key] || key, vars);
  }

  function game(id, key, fallback, vars) {
    return pickEntry(games[id] && games[id][key], vars) || fallback || "";
  }

  function gameHand(name) {
    return pickEntry(games.compare.hands[name]) || name;
  }

  function mj(key, vars) {
    return pickEntry(mahjong[key], vars);
  }

  function mjSuit(i) { return mahjong.suit[lang()][i]; }
  function mjRank(i) { return mahjong.rank[lang()][i]; }
  function mjSeat(i) { return mahjong.seats[lang()][i]; }
  function mjFan(name) {
    if (name && name.startsWith("根x")) return lang() === "en" ? "Quad Root x" + name.slice(2) : name;
    return pickEntry(mahjong.fan[name]) || name;
  }
  function mjBy(type) {
    return mahjong.winBy[lang()][type];
  }

  function apply() {
    const l = lang();
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    const btn = document.getElementById("langToggle");
    if (btn) btn.textContent = l === "zh" ? "EN" : "中文";
  }

  function setLang(next) {
    localStorage.setItem(STORAGE_KEY, next === "en" ? "en" : "zh");
    apply();
    listeners.forEach((fn) => fn(lang()));
  }

  window.I18N = {
    lang,
    setLang,
    toggle: () => setLang(lang() === "zh" ? "en" : "zh"),
    onChange: (fn) => listeners.push(fn),
    apply,
    t,
    game,
    gameHand,
    mj,
    mjSuit,
    mjRank,
    mjSeat,
    mjFan,
    mjBy,
    dealerLines: (phase) => dealer[phase] ? dealer[phase][lang()] : [],
    reactLines: (type) => dealer.react[type] ? dealer.react[type][lang()] : [],
  };

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("langToggle");
    if (btn) btn.onclick = () => window.I18N.toggle();
    apply();
  });
})();
