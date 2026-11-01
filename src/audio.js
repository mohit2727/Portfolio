// All sound is synthesised with Web Audio, so there are no audio files to load.
// Browsers only allow audio after a click, so it starts off and the visitor turns it on.
const PREF_KEY = 'webcity:sound';

export function createAudio() {
  let ctx = null, master, windGain, windFilter, humGain;
  let on = false;

  function noiseBuffer(c, seconds = 2) {
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function loopNoise(c, buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const buf = noiseBuffer(ctx);

    // Wind: band-passed noise that gets louder and brighter with speed.
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.8;
    windFilter.frequency.value = 400;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    loopNoise(ctx, buf).connect(windFilter).connect(windGain).connect(master);

    // City: a low rumble under everything.
    const hum = ctx.createBiquadFilter();
    hum.type = 'lowpass';
    hum.frequency.value = 160;
    humGain = ctx.createGain();
    humGain.gain.value = 0.22;
    loopNoise(ctx, buf).connect(hum).connect(humGain).connect(master);
  }

  function setOn(v) {
    on = v;
    if (on && !ctx) init();
    if (!ctx) return;
    if (on) ctx.resume();
    master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.15);
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* optional */ }
  }

  // speed in metres per second
  function setWind(speed) {
    if (!ctx || !on) return;
    const s = Math.min(speed / 90, 1);
    windGain.gain.setTargetAtTime(s * s * 0.55, ctx.currentTime, 0.12);
    windFilter.frequency.setTargetAtTime(300 + s * 1400, ctx.currentTime, 0.12);
  }

  // The web shot: a bright noise zip falling in pitch, with a little tonal snap.
  function thwip() {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(3800, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.25);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(og).connect(master);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // Wire every [data-sound] button to one shared state.
  const buttons = [...document.querySelectorAll('[data-sound]')];
  const paint = () => buttons.forEach((b) => {
    b.textContent = on ? 'Sound on' : 'Sound off';
    b.setAttribute('aria-pressed', String(on));
  });
  buttons.forEach((b) => b.addEventListener('click', () => { setOn(!on); paint(); }));

  // A previous "on" can't autoplay; it applies on the first click anywhere on the page.
  let wanted = false;
  try { wanted = localStorage.getItem(PREF_KEY) === '1'; } catch { /* optional */ }
  if (wanted) {
    addEventListener('pointerdown', function first(e) {
      removeEventListener('pointerdown', first);
      if (!on && !e.target.closest('[data-sound]')) { setOn(true); paint(); }
    });
  }

  return { setWind, thwip, isOn: () => on };
}
