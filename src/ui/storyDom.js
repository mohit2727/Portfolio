// Story page: one chapter per section, each a comic card that scrolls past while the hero waits
// at that tower. Scroll position maps to a story progress value t: 0 = intro rooftop, k = tower k.
export function createStoryDom(sections) {
  const main = document.getElementById('story');
  const intro = document.getElementById('top');
  const nav = document.getElementById('chapter-nav');
  const outro = document.getElementById('outro');

  const cards = sections.map((s, i) => {
    const sec = document.createElement('section');
    sec.className = 'chapter';
    sec.id = s.id;
    sec.innerHTML = `
      <article class="comic story-card" style="--accent:${s.color}">
        <header class="panel-head">
          <span class="panel-tag">File 0${i + 1} · ${s.label}</span>
          <h2>${s.name}</h2>
        </header>
        <div class="panel-body">${s.html}</div>
      </article>`;
    main.insertBefore(sec, outro);
    return sec.querySelector('.story-card');
  });

  const dots = [{ id: 'top', name: 'Start', color: '#f3ead2' }, ...sections].map((s, i) => {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.className = 'dot';
    a.style.setProperty('--c', s.color);
    a.innerHTML = `<span class="dot-label">${s.name}</span>`;
    a.setAttribute('aria-label', s.name);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      goTo(i);
    });
    nav.appendChild(a);
    return a;
  });

  // Piecewise-linear map from scrollY to t. A leg starts once the previous card has mostly
  // left the screen and ends just before the next card rises into view.
  let keys = [[0, 0]];
  function layout() {
    const vh = innerHeight;
    keys = [[0, 0]];
    let prevEnd = 0;
    cards.forEach((card, i) => {
      const top = card.getBoundingClientRect().top + scrollY;
      const start = Math.max(i === 0 ? vh * 0.04 : prevEnd - vh * 0.35, keys[keys.length - 1][0] + 1);
      const arrive = Math.max(top - vh * 0.62, start + 1);
      keys.push([start, i], [arrive, i + 1]);
      prevEnd = top + card.offsetHeight;
    });
  }

  function progress() {
    const y = scrollY;
    if (y <= keys[0][0]) return 0;
    for (let i = 1; i < keys.length; i++) {
      const [y1, t1] = keys[i];
      if (y <= y1) {
        const [y0, t0] = keys[i - 1];
        return t0 + ((y - y0) / (y1 - y0)) * (t1 - t0);
      }
    }
    return keys[keys.length - 1][1];
  }

  function goTo(i) {
    const y = i === 0 ? 0 : cards[i - 1].getBoundingClientRect().top + scrollY - innerHeight * 0.12;
    scrollTo({ top: y, behavior: 'smooth' });
  }

  let active = -1;
  function setActive(t) {
    const i = Math.round(t);
    if (i === active) return;
    active = i;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }

  function setMode(roam) {
    main.hidden = nav.hidden = roam;
    document.body.classList.toggle('roam', roam);
  }

  layout();
  addEventListener('resize', layout);
  document.fonts?.ready.then(layout);
  return { progress, layout, setActive, setMode, goTo, intro };
}
