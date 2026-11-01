import { N, HALF, PITCH } from '../config.js';
import { PARK } from '../world/city.js';

const $ = (id) => document.getElementById(id);

export function createHUD({ sections, landmarks, blockInfo, onTravel }) {
  const els = {
    tl: $('hud-tl'), br: $('hud-br'), map: $('minimap'), list: $('mission-list'), count: $('mission-count'),
    speed: $('g-speed'), alt: $('g-alt'), hint: $('hint'), sfx: $('sfx'), toast: $('toast'), flash: $('flash'),
    speedlines: $('speedlines'), panel: $('panel'), panelTag: $('panel-tag'), panelTitle: $('panel-title'),
    panelBody: $('panel-body'), panelClose: $('panel-close'), help: $('help'), helpBtn: $('help-btn'),
  };

  // Mission list: one row per landmark, click to fast-travel.
  const rows = new Map();
  sections.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="mission" style="--c:${s.color}" data-id="${s.id}" title="Swing to ${s.name}">
        <span class="m-dot"></span>
        <span class="m-text"><span class="m-name">${s.name}</span><span class="m-label">${s.label}</span></span>
        <span class="m-dist">–</span>
      </button>`;
    const btn = li.firstElementChild;
    btn.addEventListener('click', () => onTravel(s.id));
    els.list.appendChild(li);
    rows.set(s.id, { btn, dist: btn.querySelector('.m-dist'), index: i + 1 });
  });

  let currentId = null;
  function openPanel(sec) {
    currentId = sec.id;
    const row = rows.get(sec.id);
    els.panel.style.setProperty('--accent', sec.color);
    els.panelTag.textContent = `File 0${row.index} · ${sec.label}`;
    els.panelTitle.textContent = sec.name;
    els.panelBody.innerHTML = sec.html;
    els.panelBody.scrollTop = 0;
    els.panel.hidden = false;
    els.panel.classList.remove('pop');
    void els.panel.offsetWidth;
    els.panel.classList.add('pop');
  }
  function closePanel() {
    currentId = null;
    els.panel.hidden = true;
  }
  els.panelClose.addEventListener('click', closePanel);
  els.panelBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(els.panelBody.querySelector('.email'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      btn.textContent = 'Selected';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });

  els.helpBtn.addEventListener('click', () => {
    const open = els.help.hidden;
    els.help.hidden = !open;
    els.helpBtn.setAttribute('aria-expanded', String(open));
  });

  function setVisited(visited) {
    for (const [id, row] of rows) row.btn.classList.toggle('done', visited.has(id));
    els.count.textContent = `${visited.size}/${sections.length}`;
  }

  // Minimap: static city drawn once, player and landmarks drawn every frame.
  const ctx = els.map.getContext('2d');
  const size = els.map.width;
  const scale = size / (HALF * 2 + 80);
  const toMap = (v) => (v + HALF + 40) * scale;
  const base = document.createElement('canvas');
  base.width = base.height = size;
  {
    const g = base.getContext('2d');
    g.fillStyle = '#0b1634';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#1b1d28';
    g.fillRect(toMap(-HALF), toMap(-HALF), HALF * 2 * scale, HALF * 2 * scale);
    const bw = PITCH * scale * 0.72;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = blockInfo[i + j * N];
        if (h === -2) continue;
        const x = toMap(-HALF + i * PITCH) + (PITCH * scale - bw) / 2;
        const y = toMap(-HALF + j * PITCH) + (PITCH * scale - bw) / 2;
        if (h === -1) g.fillStyle = '#1f4630';
        else {
          const l = Math.min(1, h / 260);
          g.fillStyle = `rgb(${50 + l * 70}, ${54 + l * 66}, ${78 + l * 80})`;
        }
        g.fillRect(x, y, bw, bw);
      }
    }
    g.strokeStyle = 'rgba(46,229,157,0.5)';
    g.strokeRect(toMap(-HALF + PARK.i0 * PITCH), toMap(-HALF + PARK.j0 * PITCH), (PARK.i1 - PARK.i0 + 1) * PITCH * scale, (PARK.j1 - PARK.j0 + 1) * PITCH * scale);
  }

  function drawMap(player, yaw) {
    ctx.drawImage(base, 0, 0);
    for (const lm of landmarks) {
      ctx.fillStyle = lm.section.color;
      ctx.save();
      ctx.translate(toMap(lm.x), toMap(lm.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    }
    const a = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    ctx.save();
    ctx.translate(toMap(player.pos.x), toMap(player.pos.z));
    ctx.rotate(a);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e3262f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  let acc = 0;
  function update(player, yaw, dt, reduced) {
    drawMap(player, yaw);
    const speed = player.vel.length();
    els.speedlines.style.opacity = reduced ? 0 : Math.max(0, Math.min(1, (speed - 55) / 70)).toFixed(2);
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    els.speed.textContent = Math.round(speed * 3.6);
    els.alt.textContent = Math.round(Math.max(0, player.pos.y - 1));
    for (const lm of landmarks) {
      const d = lm.dist;
      rows.get(lm.id).dist.textContent = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
    }
  }

  let hintTimer = 0;
  function hint(text, ms = 0) {
    clearTimeout(hintTimer);
    els.hint.textContent = text;
    els.hint.hidden = !text;
    if (ms) hintTimer = setTimeout(() => { els.hint.hidden = true; }, ms);
  }

  function sfx(text) {
    els.sfx.textContent = text;
    els.sfx.classList.remove('go');
    void els.sfx.offsetWidth;
    els.sfx.classList.add('go');
  }

  let toastTimer = 0;
  function toast(text) {
    clearTimeout(toastTimer);
    els.toast.textContent = text;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4200);
  }

  function flash() {
    els.flash.classList.remove('go');
    void els.flash.offsetWidth;
    els.flash.classList.add('go');
  }

  function setVisible(on) {
    els.tl.hidden = els.br.hidden = els.map.hidden = !on;
    if (!on) {
      closePanel();
      hint('');
      els.help.hidden = true;
      els.speedlines.style.opacity = 0;
    }
  }

  return { openPanel, closePanel, currentId: () => currentId, setVisited, update, hint, sfx, toast, flash, setVisible };
}
