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
    bgm = ctx.createGain(); bgm.gain.value = 0.22; bgm.connect(master);
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

  /* ---------- 背景音乐：温暖、轻松、带邀请感的 lounge 爵士 ----------
   * 大七和弦进行 Cmaj7 - Am7 - Dm7 - G7(经典 I-vi-ii-V)，
   * 柔和正弦垫 + 低音 + 稀疏的钟琴旋律，整体经低通滤波更温润。 */
  const PROG = [
    { bass: 65.41, notes: [261.63, 329.63, 392.00, 493.88] }, // Cmaj7
    { bass: 55.00, notes: [220.00, 261.63, 329.63, 392.00] }, // Am7
    { bass: 73.42, notes: [293.66, 349.23, 440.00, 523.25] }, // Dm7
    { bass: 49.00, notes: [196.00, 246.94, 293.66, 349.23] }, // G7
  ];
  const MEL = [523.25, 587.33, 659.25, 783.99, 880.00]; // C大调五声(C D E G A)
  function startBGM() {
    if (!ctx || bgmTimer) return;
    // 低通滤波让所有声音更柔和温暖
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass"; warm.frequency.value = 1600; warm.Q.value = 0.4;
    warm.connect(bgm);

    let idx = 0;
    const dur = 3.8;
    const playBar = () => {
      const chord = PROG[idx % PROG.length]; idx++;
      const t = ctx.currentTime;

      // 低音(三角波，圆润)
      const bo = ctx.createOscillator(); bo.type = "triangle"; bo.frequency.value = chord.bass;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.linearRampToValueAtTime(0.22, t + 0.4);
      bg.gain.setValueAtTime(0.22, t + dur - 0.7);
      bg.gain.linearRampToValueAtTime(0.0001, t + dur);
      bo.connect(bg); bg.connect(warm);
      bo.start(t); bo.stop(t + dur + 0.1);

      // 和弦垫(轻柔正弦，错开起音更自然)
      chord.notes.forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = ctx.createGain();
        const peak = 0.075;
        g.gain.setValueAtTime(0.0001, t + i * 0.05);
        g.gain.linearRampToValueAtTime(peak, t + 1.0);
        g.gain.linearRampToValueAtTime(peak * 0.7, t + dur - 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(warm);
        o.start(t); o.stop(t + dur + 0.1);
      });

      // 稀疏的钟琴旋律(每小节 1~2 个音，营造轻松、邀请的氛围)
      const count = Math.random() < 0.6 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const when = 0.3 + Math.random() * (dur - 1.2);
        const f = MEL[Math.floor(Math.random() * MEL.length)];
        const tt = t + when;
        const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.10, tt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.2);
        o.connect(g); o2.connect(g); g.connect(warm);
        o.start(tt); o.stop(tt + 1.3);
        o2.start(tt); o2.stop(tt + 1.3);
      }
    };
    playBar();
    bgmTimer = setInterval(playBar, dur * 1000);
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
