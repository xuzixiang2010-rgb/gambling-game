/* ============================================================
 * sound.js —— 用 Web Audio API 实时合成所有音效与背景音乐
 * 无需任何外部音频文件。必须在用户手势(点击)后 init/resume。
 * ============================================================ */
const SoundFX = (() => {
  let ctx, master, sfx, bgm, bgmTimer, muted = false;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.85; sfx.connect(master);
    bgm = ctx.createGain(); bgm.gain.value = 0.16; bgm.connect(master);
  }
  function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }

  function noiseBuffer(dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  // 一段经过滤波+包络的噪声(用于沙沙/撞击声)
  function burst(when, dur, { type = "bandpass", freq = 1000, q = 1, gain = 0.2 } = {}) {
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    src.start(t); src.stop(t + dur + 0.02);
  }
  // 一个带包络的音符(用于旋律/提示音)
  function blip(freq, dur, { type = "sine", gain = 0.25, when = 0, dest } = {}) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ---------- 公开音效 ---------- */
  // 筹码扔在桌上：金属叮当 + 落桌闷响
  function chip() {
    if (!ctx) return; resume();
    for (let i = 0; i < 5; i++) {
      blip(1600 + Math.random() * 1400, 0.07, { type: "triangle", gain: 0.10, when: i * 0.035 });
    }
    burst(0, 0.10, { type: "bandpass", freq: 4200, q: 0.8, gain: 0.14 });
    blip(140, 0.10, { type: "sine", gain: 0.12, when: 0.02 });
  }
  // 摇骰子：约0.9s 的连续碰撞沙沙声
  function dice() {
    if (!ctx) return; resume();
    for (let i = 0; i < 12; i++) {
      burst(i * 0.075, 0.05, { freq: 800 + Math.random() * 1800, q: 2.5, gain: 0.16 });
    }
  }
  // 骰子落定：一声闷顿
  function diceLand() {
    if (!ctx) return;
    blip(180, 0.10, { type: "square", gain: 0.10 });
    burst(0, 0.06, { freq: 500, q: 1, gain: 0.10 });
  }
  // 发牌：一声利落的"嗖"
  function card() {
    if (!ctx) return; resume();
    burst(0, 0.13, { type: "highpass", freq: 2600, q: 0.6, gain: 0.18 });
  }
  // 赢：上行欢快琶音
  function win() {
    if (!ctx) return; resume();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      blip(f, 0.32, { type: "triangle", gain: 0.22, when: i * 0.085 }));
  }
  // 输：下行低沉
  function lose() {
    if (!ctx) return; resume();
    [330, 277, 220, 165].forEach((f, i) =>
      blip(f, 0.34, { type: "sawtooth", gain: 0.13, when: i * 0.1 }));
  }
  // 平局：两声平淡
  function draw() {
    if (!ctx) return; resume();
    blip(440, 0.18, { type: "sine", gain: 0.16 });
    blip(440, 0.2, { type: "sine", gain: 0.16, when: 0.16 });
  }
  // 差一点：紧张拍音
  function near() {
    if (!ctx) return; resume();
    blip(880, 0.55, { type: "sawtooth", gain: 0.07 });
    blip(886, 0.55, { type: "sawtooth", gain: 0.07 });
  }
  // 心跳(濒死)
  function heartbeat() {
    if (!ctx) return;
    blip(58, 0.16, { type: "sine", gain: 0.4 });
    blip(48, 0.16, { type: "sine", gain: 0.3, when: 0.16 });
  }
  // 俄罗斯轮盘
  function gunSpin() { if (!ctx) return; resume(); burst(0, 0.6, { freq: 1400, q: 4, gain: 0.10 }); }
  function gunClick() { if (!ctx) return; blip(1600, 0.05, { type: "square", gain: 0.2 }); }
  function gunShot() {
    if (!ctx) return; resume();
    burst(0, 0.32, { type: "lowpass", freq: 320, q: 1, gain: 0.7 });
    blip(70, 0.3, { type: "square", gain: 0.45 });
  }

  /* ---------- 背景音乐：循环的暗调环境和弦 ---------- */
  const CHORDS = [
    [130.81, 164.81, 196.0], // Cm-ish
    [146.83, 174.61, 220.0],
    [123.47, 155.56, 196.0],
    [110.0, 138.59, 164.81],
  ];
  function startBGM() {
    if (!ctx || bgmTimer) return;
    let idx = 0;
    const dur = 4.2;
    const play = () => {
      const ch = CHORDS[idx % CHORDS.length]; idx++;
      const t = ctx.currentTime;
      ch.forEach((f) => {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = f * 2.001;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.32, t + 1.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); o2.connect(g); g.connect(bgm);
        o.start(t); o.stop(t + dur + 0.1);
        o2.start(t); o2.stop(t + dur + 0.1);
      });
    };
    play();
    bgmTimer = setInterval(play, dur * 1000);
  }
  function stopBGM() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; }
  function isMuted() { return muted; }

  return {
    init, resume, chip, dice, diceLand, card, win, lose, draw, near,
    heartbeat, gunSpin, gunClick, gunShot, startBGM, stopBGM, setMuted, isMuted,
  };
})();
window.SoundFX = SoundFX;
