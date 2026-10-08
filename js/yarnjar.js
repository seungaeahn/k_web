// Archive의 "실타래 유리병": FO 하나 = 그 실 색의 실타래 하나
// - 쓴 실이 많을수록 실타래가 큼. 오래된 것부터 병에 떨어져 아래부터 빈틈을 찾아 쌓임
// - 병이 가득 차면 선반으로 옮기고 새 병을 채움
// - 샘플러를 완성해 만난 친구도 그 무렵 실타래들 사이로 같이 떨어짐 (실타래보다 크게)
// - 크기는 친구 9명을 다 만날 즈음(약 7.5kg) 병 하나가 가득 차도록 맞춤
const YarnJar = (() => {
  const LINE = '#4A1F18';
  const W = 300;
  const FRIEND_R = 32; // 병 속 친구 그림 반지름
  const FRIEND_PACK_R = 24; // 자리 잡을 때 쓰는 반지름 (작게 잡아 실타래가 친구 가장자리에 살짝 겹침)
  const BALL_PACK = 0.88; // 실타래도 서로 살짝 겹치게
  // 병 크기 (viewBox 단위)
  const JAR = { left: 50, right: 250, lidY: 30, neckY: 52, shoulderY: 74, bottom: 344, ground: 352 };
  const H = 364;
  const INNER = { left: JAR.left + 4, right: JAR.right - 4, top: JAR.shoulderY + 2, floor: JAR.bottom - 4 };

  // ---- 색 ----
  const COLOR_WORDS = [
    [/더스티\s*핑크|dusty\s*pink/i, '#D9A3A8'], [/핑크|분홍|pink|rose/i, '#EDB1BC'],
    [/라벤더|lavender|라일락|lilac/i, '#B9A6D6'], [/보라|퍼플|purple|violet/i, '#9B7BB8'],
    [/포레스트|forest|올리브|olive/i, '#6E8F5A'], [/민트|mint/i, '#A8D5BA'], [/초록|그린|green|세이지|sage/i, '#8FB07A'],
    [/네이비|navy/i, '#3E4F7A'], [/스카이|하늘|sky/i, '#A9C6DE'], [/파랑|블루|blue|데님|denim/i, '#6F9CC4'],
    [/차콜|charcoal/i, '#5A5652'], [/회색|그레이|gray|grey/i, '#A39E97'], [/검정|블랙|black/i, '#3B3633'],
    [/머스타드|mustard|겨자/i, '#D5A93C'], [/노랑|옐로|yellow|레몬/i, '#EBCB6A'], [/오렌지|orange|주황/i, '#E08A4F'],
    [/빨강|레드|red|버건디|burgundy|와인/i, '#C8553D'], [/테라코타|terracotta|벽돌/i, '#C9805F'],
    [/카멜|camel/i, '#C69C6D'], [/갈색|브라운|brown|초코|모카/i, '#8A5A44'],
    [/오트밀|oatmeal/i, '#E6D8BF'], [/베이지|beige|샌드|sand/i, '#DCC7A6'],
    [/아이보리|ivory|크림|cream|화이트|흰|white|내추럴|natural/i, '#F6EEDD'],
  ];
  const FALLBACK = ['#EDB1BC', '#A9C6DE', '#B9CC95', '#F2D594', '#C9B3DB', '#E8B38F', '#BFD8CF'];
  function hash(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }
  function colorsOf(project) {
    const colors = (project.yarns || [])
      .map((l) => {
        const y = Storage.getYarn(l.yarnId);
        const hit = y && COLOR_WORDS.find(([re]) => re.test(`${y.color} ${y.name}`));
        return hit ? hit[1] : null;
      })
      .filter(Boolean);
    return colors.length ? [...new Set(colors)] : [FALLBACK[hash(project.id) % FALLBACK.length]];
  }
  // 색을 어둡게(amt>0) / 밝게(amt<0)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (v) => Math.round(amt > 0 ? v * (1 - amt) : v + (255 - v) * -amt);
    return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')}`;
  }

  // ---- 실타래 ----
  const radiusOf = (grams) => Math.max(9, Math.min(30, 4 + Math.sqrt(grams || 0) * 0.5));

  function ballSvg(b) {
    const { x, y, r } = b;
    const main = b.colors[0];
    const wrap = b.colors[1] || shade(main, 0.22);
    const ang = ((hash(b.id) % 180) * Math.PI) / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const pt = (u, v) => `${(x + u * cos - v * sin).toFixed(1)} ${(y + u * sin + v * cos).toFixed(1)}`;
    // 감긴 실: 공 안쪽의 살짝 휜 줄 몇 개
    const wraps = [-0.5, -0.15, 0.2, 0.52].map((o) => {
      const v = o * r;
      const half = Math.sqrt(r * r - v * v) * 0.9;
      return `M${pt(-half, v)} Q${pt(0, v - r * 0.22)} ${pt(half, v)}`;
    }).join(' ');
    const cross = (() => {
      const half = r * 0.75;
      return `M${pt(-r * 0.1, -half)} Q${pt(r * 0.3, 0)} ${pt(-r * 0.1, half)}`;
    })();
    return `
      <g class="jar-shake" data-cx="${x.toFixed(1)}" data-cy="${y.toFixed(1)}" data-r="${r.toFixed(1)}"><g class="jar-ball" data-fo-id="${b.id}" filter="url(#kw-hand)">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${main}"/>
        <path d="${wraps} ${cross}" fill="none" stroke="${wrap}" stroke-width="${Math.max(1.4, r * 0.09).toFixed(1)}"/>
        <path d="M${(x - r * 0.5).toFixed(1)} ${(y - r * 0.35).toFixed(1)} q${(r * 0.15).toFixed(1)} ${(-r * 0.25).toFixed(1)} ${(r * 0.4).toFixed(1)} ${(-r * 0.3).toFixed(1)}" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="${Math.max(1.6, r * 0.1).toFixed(1)}"/>
      </g></g>`;
  }

  // 오래된 것부터 하나씩 떨어뜨려 가장 낮은 자리에 둠. 안 들어가면 새 병
  function pack(items) {
    const jars = [[]];
    items.forEach((it) => {
      const place = (balls) => {
        const target = INNER.left + ((hash(`${it.id}x`) % 1000) / 1000) * (INNER.right - INNER.left);
        let best = null;
        for (let x = INNER.left + it.pr; x <= INNER.right - it.pr; x += 2) {
          let y = INNER.floor - it.pr;
          balls.forEach((b) => {
            const dx = x - b.x;
            const reach = it.pr + b.pr;
            if (Math.abs(dx) < reach) y = Math.min(y, b.y - Math.sqrt(reach * reach - dx * dx));
          });
          const score = y - Math.abs(x - target) * 0.05;
          if (!best || score > best.score) best = { x, y, score };
        }
        return best && best.y - it.pr >= INNER.top ? best : null;
      };
      let spot = place(jars[jars.length - 1]);
      if (!spot) {
        jars.push([]);
        spot = place(jars[jars.length - 1]);
      }
      if (spot) jars[jars.length - 1].push({ ...it, x: spot.x, y: spot.y });
    });
    return jars;
  }

  // ---- 병 ----
  const bodyPath = `M${JAR.left + 20} ${JAR.neckY} H${JAR.right - 20} Q${JAR.right - 20} ${JAR.shoulderY - 6} ${JAR.right} ${JAR.shoulderY + 8}
    V${JAR.bottom - 24} Q${JAR.right} ${JAR.bottom} ${JAR.right - 24} ${JAR.bottom} H${JAR.left + 24} Q${JAR.left} ${JAR.bottom} ${JAR.left} ${JAR.bottom - 24}
    V${JAR.shoulderY + 8} Q${JAR.left + 20} ${JAR.shoulderY - 6} ${JAR.left + 20} ${JAR.neckY} Z`;

  // 병 속 친구: 원 안에 캐릭터를 조금 크게
  function friendSvg(f) {
    const size = f.r * 2;
    const tilt = ((hash(`${f.id}tilt`) % 25) - 12);
    return `<g class="jar-shake is-friend" data-cx="${f.x.toFixed(1)}" data-cy="${f.y.toFixed(1)}" data-r="${f.pr}"><g transform="rotate(${tilt} ${f.x.toFixed(1)} ${f.y.toFixed(1)})"><g class="friend jar-friend" data-friend="${f.id}" style="--d:${((hash(f.id) % 300) / 100).toFixed(2)}s;--blink:${((hash(`${f.id}b`) % 460) / 100).toFixed(2)}s">
      ${Characters.inline(f.id, (f.x - size / 2).toFixed(1), (f.y - size / 2 - 3).toFixed(1), size)}
    </g></g></g>`;
  }

  function jarSvg(contents, { id = 'main', label = '' } = {}) {
    const cx = W / 2;
    // 뚜껑: 체크무늬 천 + 끈
    const clothTop = JAR.lidY - 6;
    const span = 152;
    const scallops = Array.from({ length: 8 }, () => `q${-span / 16} 9 ${-span / 8} 0`).join(' ');
    return `
      <defs>
        <clipPath id="jar-clip-${id}"><path d="${bodyPath}"/></clipPath>
        <pattern id="gingham-${id}" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#FFF6E3"/><rect width="4" height="8" fill="#E99AAA" opacity=".55"/><rect width="8" height="4" fill="#E99AAA" opacity=".55"/>
        </pattern>
      </defs>
      <ellipse cx="${cx}" cy="${JAR.ground}" rx="${(JAR.right - JAR.left) / 2 + 18}" ry="7" fill="${LINE}" opacity=".08"/>
      <g class="jar-wobble">
      <path d="${bodyPath}" fill="#DCEBF0" fill-opacity=".55" filter="url(#kw-hand)"/>
      <g clip-path="url(#jar-clip-${id})" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
        ${contents.map((c) => (c.type === 'friend' ? friendSvg(c) : ballSvg(c))).join('')}
      </g>
      <g filter="url(#kw-hand)" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
        <path d="${bodyPath}" fill="none"/>
        <path d="M${JAR.left + 16} ${JAR.shoulderY + 30} V${JAR.bottom - 40}" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="5"/>
        <path d="M${JAR.left + 16} ${JAR.bottom - 28} v6" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="5"/>
        <path d="M${cx - span / 2} ${JAR.neckY + 2} V${clothTop + 8} Q${cx - span / 2} ${clothTop} ${cx - span / 2 + 12} ${clothTop} H${cx + span / 2 - 12} Q${cx + span / 2} ${clothTop} ${cx + span / 2} ${clothTop + 8} V${JAR.neckY + 2} ${scallops} Z" fill="url(#gingham-${id})"/>
        <path d="M${cx - 74} ${JAR.neckY - 2} Q${cx} ${JAR.neckY + 4} ${cx + 74} ${JAR.neckY - 2}" fill="none" stroke="#C8553D" stroke-width="3"/>
        <path d="M${cx + 52} ${JAR.neckY} q8 10 2 18 M${cx + 52} ${JAR.neckY} q14 6 16 14" fill="none" stroke="#C8553D" stroke-width="2.6"/>
      </g>
      </g>
      ${label ? `<text class="jar-label" x="${cx}" y="${JAR.bottom - 14}" text-anchor="middle">${label}</text>` : ''}`;
  }

  // projects: FO 목록, friends: [{ id, date }] 완성한 샘플러와 완성한 날
  function render(projects, friends) {
    Characters.ensureFilters();
    // 날짜순으로 떨어뜨림. 같은 날이면 실타래 다음에 친구 (그 작품으로 샘플러를 완성했으니까)
    const items = [
      ...projects.map((p) => ({ type: 'ball', id: p.id, key: `${p.completedDate || ''}0`, r: radiusOf(Sampler.projectGrams(p)), colors: colorsOf(p) })).map((b) => ({ ...b, pr: b.r * BALL_PACK })),
      ...friends.map((f) => ({ type: 'friend', id: f.id, key: `${f.date || ''}1`, r: FRIEND_R, pr: FRIEND_PACK_R })),
    ].sort((x, y) => x.key.localeCompare(y.key));
    const jars = pack(items);
    const current = jars[jars.length - 1];
    const full = jars.slice(0, -1);
    return `
      <div class="jar-scene" style="aspect-ratio:${W} / ${H}">
        <svg class="jar-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="완성한 작품 ${projects.length}개의 실타래와 친구 ${friends.length}명이 든 유리병">
          ${jarSvg(current)}
        </svg>
        ${items.length ? '' : '<p class="jar-empty">첫 FO를 완성하면<br>실타래가 하나 들어와요.</p>'}
        <div class="scene-bubble" hidden></div>
      </div>
      ${full.length ? `
        <div class="jar-shelf">
          ${full.map((contents, i) => `
            <div class="jar-mini">
              <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${jarSvg(contents, { id: `full${i}` })}</svg>
              <span>${i + 1}병</span>
            </div>`).join('')}
          <p class="card-meta">가득 찬 병 ${full.length}개 · 지금 ${full.length + 1}번째 병을 채우는 중</p>
        </div>` : ''}`;
  }

  // 병 흔들기: 병은 바닥을 축으로 감쇠 진동, 안의 실타래·친구는 조금 늦게 제각각 출렁이며 튐
  const shaking = new WeakMap();
  function shake(svg) {
    if (!svg) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const wobble = svg.querySelector('.jar-wobble');
    if (!wobble) return;
    cancelAnimationFrame(shaking.get(svg));
    const items = [...svg.querySelectorAll('.jar-shake')].map((el) => {
      const friend = el.classList.contains('is-friend');
      const cx = Number(el.dataset.cx);
      const cy = Number(el.dataset.cy);
      const r = Number(el.dataset.r);
      const seed = hash(`${cx},${cy}`);
      return {
        el, cx, cy,
        lag: 0.15 + (seed % 100) / 400, // 병보다 늦게 따라옴
        amp: (friend ? 5 : 4) * (0.7 + (seed % 7) / 10) * (30 / Math.max(12, r)) ** 0.3,
        hop: friend ? 9 + (seed % 5) : 2 + (seed % 4), // 친구는 더 높이 튐
        spin: (friend ? 10 : 18) * ((seed % 2) ? 1 : -1),
      };
    });
    const start = performance.now();
    const DUR = 1600;
    const pivot = `${W / 2} ${JAR.ground}`;
    const frame = (now) => {
      const t = (now - start) / 1000;
      const decay = Math.exp(-t * 3);
      const tilt = 6 * decay * Math.sin(t * 13);
      wobble.setAttribute('transform', `rotate(${tilt.toFixed(2)} ${pivot})`);
      items.forEach((it) => {
        const p = t * 13 - it.lag * 13;
        const d = Math.exp(-Math.max(0, t - it.lag) * 2.6) * (t > it.lag * 0.5 ? 1 : 0);
        const dx = -it.amp * d * Math.sin(p);
        const dy = -it.hop * d * Math.abs(Math.sin(p * 0.5 + it.lag));
        const rot = it.spin * d * Math.sin(p * 0.9);
        it.el.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${rot.toFixed(2)} ${it.cx} ${it.cy})`);
      });
      if (now - start < DUR) {
        shaking.set(svg, requestAnimationFrame(frame));
      } else {
        wobble.removeAttribute('transform');
        items.forEach((it) => it.el.removeAttribute('transform'));
      }
    };
    shaking.set(svg, requestAnimationFrame(frame));
  }

  return { render, colorsOf, shake };
})();
