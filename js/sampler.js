// 십자수 샘플러: FO에 기록한 실 사용량(g)만큼 숨은 그림의 땀이 채워짐
// - 기준: GRAMS_PER_BALL(g) = 1볼 = STITCHES_PER_BALL땀 → 땀당 무게는 둘을 나눈 값
// - 볼 단위 실은 볼당 무게(없으면 GRAMS_PER_BALL)로 g 환산, 소수점 땀은 다음으로 넘어감
// - 채우는 순서: 뜨개 차트처럼 아래 단부터 위로, 한 단 안에서는 왼쪽부터
// 그림을 바꾸거나 늘릴 때는 SAMPLERS만 고치면 됨 ('.' = 빈칸, 글자 = PALETTE 색)
const Sampler = (() => {
  const GRAMS_PER_BALL = 50;
  const STITCHES_PER_BALL = 5;
  const GRAMS_PER_STITCH = GRAMS_PER_BALL / STITCHES_PER_BALL;

  const PALETTE = {
    r: '#B5452F', // 빨강
    g: '#5E8C3A', // 초록
    b: '#3E4FA0', // 파랑
    l: '#6F9CC4', // 하늘
    y: '#C9A227', // 겨자
    k: '#6B3A2A', // 밤색
    p: '#9461C9', // 보라
    s: '#3E6577', // 슬레이트
    n: '#D9839A', // 분홍
    e: '#8F8A84', // 회색
  };

  // 왼쪽 절반만 그리고 좌우 대칭으로 펼침
  const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));

  // 각 샘플러를 다 채우면 같은 id의 캐릭터(js/characters.js)가 튀어나옴
  const SAMPLERS = [
    { id: 'button', chapter: 1, rows: [
      '..yyyy..',
      '.y....y.',
      'y.y..y.y',
      'y......y',
      'y......y',
      'y.y..y.y',
      '.y....y.',
      '..yyyy..',
    ] },
    { id: 'yarnball', chapter: 1, rows: [
      '..nnn...',
      '.nn.nn..',
      'n..n..n.',
      'n.n..nn.',
      'nn..n.n.',
      '.n.n.n..',
      '..nnn...',
      '.....nnn',
    ] },
    { id: 'thimble', chapter: 1, rows: [
      '..eeee..',
      '.e.e.ee.',
      '.ee.e.e.',
      '.e.e.ee.',
      '.ee.e.e.',
      'eeeeeeee',
      '.eeeeee.',
      '........',
    ] },
    { id: 'sheep', chapter: 2, rows: [
      '............',
      '....eeee....',
      '..eeeeeeee..',
      '.eeeeeeeekk.',
      '.eeeeeeeekkk',
      '.eeeeeeeekk.',
      '.eeeeeeee...',
      '..eeeeeee...',
      '..k.k..k.k..',
      '..k.k..k.k..',
      '.gggggggggg.',
      '............',
    ] },
    { id: 'cat', chapter: 2, rows: [
      '...s...s....',
      '...ss.ss....',
      '...sssss....',
      '...sysys....',
      '...ssnss....',
      '....sss.....',
      '...sssss..s.',
      '..sssssss..s',
      '..sssssss.s.',
      '..sssssss.s.',
      '..ssssssss..',
      '...s.s......',
    ] },
    { id: 'mitten', chapter: 2, rows: [
      '....ggggg...',
      '...ggggggg..',
      '...ggggggg.g',
      '...ggggggggg',
      '...gggggggg.',
      '...ggggggg..',
      '...ryryryr..',
      '...ggggggg..',
      '...ggggggg..',
      '...nnnnnnn..',
      '...n.n.n.n..',
      '............',
    ] },
    { id: 'bear', chapter: 3, rows: [
      '.......yy.......',
      '......nnnn......',
      '.....nnnnnn.....',
      '....nnnnnnnn....',
      '...nnnnnnnnnn...',
      '.kkeeeeeeeeeekk.',
      '..kkkkkkkkkkkk..',
      '..kk.kkkkkk.kk..',
      '..kkkkkkkkkkkk..',
      '...kkkk..kkkk...',
      '....kkkkkkkk....',
      '...llllllllll...',
      '..llllllllllll..',
      '..llllllllllll..',
      '...kkk....kkk...',
      '................',
    ] },
    { id: 'snail', chapter: 3, rows: [
      '................',
      '.............g.g',
      '....yyyyy....g.g',
      '..yyyyyyyyy..ggg',
      '.yyy.....yyy.ggg',
      '.yy.yyyyy.yy.ggg',
      'yy.yy...yy.yyggg',
      'yy.y..y..y.yyggg',
      'yy.y.yy..y.yyggg',
      'yy.yy...yy.yyggg',
      '.yy.yyyyy.yy.ggg',
      '.yyy.....yyy.ggg',
      '..yyyyyyyyy.gggg',
      'gggggggggggggggg',
      '.gggggggggggggg.',
      '................',
    ] },
    { id: 'tree-of-life', chapter: 4, rows: mirror([
      '..........',
      '.........p',
      '........pp',
      '...b....py',
      '..bbb...pp',
      '.bbybb...g',
      '..bbb.g..g',
      '...b...g.g',
      '.r......gg',
      'rrr....g.g',
      '.r.g..gg.g',
      '..g.g.g..g',
      '...g.gg..g',
      '....g...gg',
      '......gggg',
      '...kkkkkkk',
      '....kykkyk',
      '.....kkkkk',
      '......kkkk',
      '.....kkkkk',
    ]) },
  ];

  // 각 샘플러의 땀 순서: 아래 단부터, 왼쪽부터
  SAMPLERS.forEach((s) => {
    const cells = [];
    for (let y = s.rows.length - 1; y >= 0; y -= 1) {
      [...s.rows[y]].forEach((ch, x) => { if (ch !== '.') cells.push({ x, y, color: PALETTE[ch] || PALETTE.s }); });
    }
    s.cells = cells;
    s.total = cells.length;
    s.size = s.rows.length;
  });

  // ---- 진행도 계산 (저장하지 않고 FO 기록에서 매번 계산) ----
  function linkGrams(link) {
    const used = Storage.linkUsedAmount(link);
    if (!(used > 0)) return 0;
    if (link.unit === 'g') return used;
    const yarn = Storage.getYarn(link.yarnId);
    return used * ((yarn && yarn.weightPerBall) || GRAMS_PER_BALL);
  }
  function projectGrams(project) {
    return (project.yarns || []).reduce((sum, l) => sum + linkGrams(l), 0);
  }
  // FO 순서대로: [{ project, grams, date }]
  function events(excludeId) {
    return Storage.getProjects()
      .filter((p) => p.status === 'completed' && p.id !== excludeId)
      .map((p) => ({ project: p, grams: projectGrams(p), date: p.completedDate || '' }))
      .filter((e) => e.grams > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  function totalGrams(excludeId) {
    return events(excludeId).reduce((sum, e) => sum + e.grams, 0);
  }

  // 전체 땀 수 → 샘플러별 상태
  function progress(excludeId) {
    const evs = events(excludeId);
    const grams = evs.reduce((sum, e) => sum + e.grams, 0);
    const stitches = Math.floor(grams / GRAMS_PER_STITCH + 1e-9);
    let start = 0;
    let currentIndex = -1;
    const list = SAMPLERS.map((s, i) => {
      const filled = Math.max(0, Math.min(s.total, stitches - start));
      const done = filled >= s.total;
      // 완성한 날: 누적 땀이 이 샘플러 끝을 넘긴 FO의 날짜
      let completedDate = null;
      if (done) {
        let acc = 0;
        const need = (start + s.total) * GRAMS_PER_STITCH;
        const ev = evs.find((e) => { acc += e.grams; return acc + 1e-9 >= need; });
        completedDate = ev ? ev.date : null;
      }
      const item = { sampler: s, index: i, start, filled, done, completedDate };
      if (!done && currentIndex === -1) currentIndex = i;
      start += s.total;
      return item;
    });
    const nextGrams = (stitches + 1) * GRAMS_PER_STITCH - grams;
    return {
      grams,
      balls: grams / GRAMS_PER_BALL,
      stitches,
      list,
      current: currentIndex === -1 ? null : list[currentIndex],
      allDone: currentIndex === -1,
      gramsToNext: Math.max(0, nextGrams),
    };
  }

  // ---- 그리기 ----
  // filled: 채운 땀 수, newFrom: 이 땀부터는 "방금 채운 땀"(차례로 나타남)
  function svg(sampler, { filled = sampler.total, newFrom = filled, numbers = true } = {}) {
    const cell = 10;
    const n = sampler.size;
    const pad = numbers ? 14 : 2;
    const w = n * cell + pad * 2;
    const h = n * cell + 4;
    const ox = pad;
    const oy = 2;
    let grid = '';
    for (let i = 0; i <= n; i += 1) {
      const strong = i % 4 === 0 ? ' class="is-strong"' : '';
      grid += `<line${strong} x1="${ox}" y1="${oy + i * cell}" x2="${ox + n * cell}" y2="${oy + i * cell}"/>`;
      grid += `<line${strong} x1="${ox + i * cell}" y1="${oy}" x2="${ox + i * cell}" y2="${oy + n * cell}"/>`;
    }
    // 차트처럼 단 번호: 오른쪽은 홀수 단, 왼쪽은 짝수 단 (아래가 1단)
    let nums = '';
    if (numbers) {
      for (let row = 1; row <= n; row += 1) {
        const y = oy + (n - row) * cell + cell / 2 + 2.5;
        nums += row % 2
          ? `<text x="${ox + n * cell + 3}" y="${y}">${row}</text>`
          : `<text x="${ox - 3}" y="${y}" text-anchor="end">${row}</text>`;
      }
    }
    const p = cell * 0.18;
    const stitches = sampler.cells.slice(0, filled).map((c, i) => {
      const x0 = ox + c.x * cell + p, y0 = oy + c.y * cell + p;
      const x1 = ox + (c.x + 1) * cell - p, y1 = oy + (c.y + 1) * cell - p;
      const isNew = i >= newFrom;
      const style = isNew ? ` style="animation-delay:${Math.min(2400, (i - newFrom) * 60)}ms"` : '';
      return `<path${isNew ? ' class="is-new"' : ''}${style} stroke="${c.color}" d="M${x0} ${y0}L${x1} ${y1}M${x1} ${y0}L${x0} ${y1}"/>`;
    }).join('');
    return `<svg class="sampler-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="샘플러 ${filled}/${sampler.total}땀">
      <g class="sampler-grid">${grid}</g>
      ${numbers ? `<g class="sampler-nums">${nums}</g>` : ''}
      <g class="sampler-stitches" stroke-width="${cell * 0.2}" stroke-linecap="round" fill="none">${stitches}</g>
    </svg>`;
  }

  const fmt = (n) => String(Math.round(n * 10) / 10);

  return {
    GRAMS_PER_BALL, STITCHES_PER_BALL, GRAMS_PER_STITCH,
    SAMPLERS, projectGrams, totalGrams, progress, svg, fmt,
  };
})();
