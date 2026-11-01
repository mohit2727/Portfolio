// Keyboard, mouse and touch input collected into one state object the player reads each frame.
export function createInput(canvas, { isActive, joyEl, knobEl, webBtn, jumpBtn }) {
  const state = {
    keys: {},
    lmb: false,
    webBtn: false,
    jumpQueued: false,
    joy: { x: 0, y: 0 },
    lookDX: 0,
    lookDY: 0,
    lastLookTime: -10,
    locked: false,
    consumeLook() {
      const r = [state.lookDX, state.lookDY];
      state.lookDX = state.lookDY = 0;
      return r;
    },
  };

  const look = (dx, dy) => {
    state.lookDX += dx;
    state.lookDY += dy;
    state.lastLookTime = performance.now() / 1000;
  };

  addEventListener('keydown', (e) => {
    if (!isActive() || e.target.closest?.('input, textarea')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) state.jumpQueued = true;
    state.keys[e.code] = true;
  });
  addEventListener('keyup', (e) => { state.keys[e.code] = false; });
  addEventListener('blur', () => {
    state.keys = {};
    state.lmb = state.webBtn = false;
  });

  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (!isActive()) return;
    if (e.button === 0) state.lmb = true;
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    if (!document.pointerLockElement && canvas.requestPointerLock) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* pointer lock is optional; drag-to-look still works */ }
    }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) state.lmb = false;
    dragging = false;
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
    else if (dragging) {
      look(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.lmb = false;
  });

  // Touch: left side of the screen is a floating joystick, right side drags the camera.
  let joyId = null, lookId = null, jx0 = 0, jy0 = 0, tlx = 0, tly = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (!isActive()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && joyId === null) {
        joyId = t.identifier;
        jx0 = t.clientX;
        jy0 = t.clientY;
        joyEl.style.left = `${jx0}px`;
        joyEl.style.top = `${jy0}px`;
        joyEl.classList.add('active');
      } else if (lookId === null) {
        lookId = t.identifier;
        tlx = t.clientX;
        tly = t.clientY;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = (t.clientX - jx0) / 50, dy = (t.clientY - jy0) / 50;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        state.joy.x = dx;
        state.joy.y = -dy;
        knobEl.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      } else if (t.identifier === lookId) {
        look((t.clientX - tlx) * 1.8, (t.clientY - tly) * 1.8);
        tlx = t.clientX;
        tly = t.clientY;
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        state.joy.x = state.joy.y = 0;
        knobEl.style.transform = '';
        joyEl.classList.remove('active');
      } else if (t.identifier === lookId) lookId = null;
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  const hold = (el, on) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(true); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => on(false));
  };
  hold(webBtn, (v) => { state.webBtn = v; });
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); state.jumpQueued = true; });

  return state;
}
