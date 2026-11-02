// Story page: one chapter per section, each a comic card that scrolls past while the hero waits
// at that tower. Scroll position maps to a story progress value t: 0 = intro rooftop, k = tower k.
export function createStoryDom(sections) {
  const main = document.getElementById('story');
  const intro = document.getElementById('top');
  const nav = document.getElementById('chapter-nav');
  const outro = document.getElementById('outro');
  const bar = document.getElementById('progress-fill');

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
    // Stagger index for the reveal animation.
    sec.querySelectorAll('.panel-body > *').forEach((el, k) => el.style.setProperty('--i', k));
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
  // left the screen and ends just before the next card rises into view. After the last card,
  // t runs on from n to n + 1 as the outro scrolls up: the camera's closing crane-up.
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
    const oTop = outro.getBoundingClientRect().top + scrollY;
    const maxY = document.documentElement.scrollHeight - vh;
    const start = Math.max(prevEnd - vh * 0.3, keys[keys.length - 1][0] + 1);
    const end = Math.max(Math.min(oTop + outro.offsetHeight / 2 - vh / 2, maxY - 2), start + 1);
    keys.push([start, cards.length], [end, cards.length + 1]);
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

  let active = -1, shownBar = -1;
  function setActive(t) {
    const p = Math.round((t / (cards.length + 1)) * 1000) / 1000;
    if (p !== shownBar) {
      shownBar = p;
      bar.style.transform = `scaleX(${p})`;
    }
    const i = Math.min(Math.round(t), cards.length);
    if (i === active) return;
    active = i;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }

  function setMode(roam) {
    main.hidden = nav.hidden = roam;
    document.body.classList.toggle('roam', roam);
  }

  // Pop each card the first time it rises into view.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cards.forEach((c) => c.classList.add('pending'));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.replace('pending', 'in');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12 });
    cards.forEach((c) => io.observe(c));
  }

  layout();
  addEventListener('resize', layout);
  document.fonts?.ready.then(layout);
  return { progress, layout, setActive, setMode, goTo, intro };
}
