// 샘플러를 다 채우면 튀어나오는 뜨개 친구들
// - 지금 그림은 임시 SVG. 손그림 PNG로 바꿀 때는 image(기본), imageBlink(눈 감은 얼굴, 선택)에 경로만 넣으면 됨
//   예: image: 'img/characters/sheep.png' (정사각형, 배경 투명 권장)
// - 키는 Sampler.SAMPLERS의 id와 같아야 함
const Characters = (() => {
  const LINE = '#4A1F18';

  // 얼굴: 점 눈 + 볼터치 + 작은 입 (눈은 깜빡임 애니메이션 대상)
  function face(cx, cy, gap = 8, { mouth = true, closed = false, eye = LINE } = {}) {
    const blush = `<g class="char-blush"><ellipse cx="${cx - gap - 5}" cy="${cy + 5}" rx="4" ry="2.6"/><ellipse cx="${cx + gap + 5}" cy="${cy + 5}" rx="4" ry="2.6"/></g>`;
    const eyes = closed
      ? `<path class="char-closed" d="M${cx - gap - 3} ${cy} q3 3 6 0 M${cx + gap - 3} ${cy} q3 3 6 0"/>`
      : `<g class="char-eyes" fill="${eye}"><circle cx="${cx - gap}" cy="${cy}" r="2.3"/><circle cx="${cx + gap}" cy="${cy}" r="2.3"/></g>`;
    const m = mouth ? `<path class="char-mouth" d="M${cx - 2.5} ${cy + 4.5} q2.5 2.4 5 0"/>` : '';
    return blush + eyes + m;
  }

  const CHARACTERS = {
    button: {
      name: '단단이', kind: '단추',
      hello: '안녕! 나는 단추 단단이야. 떨어지지 않게 꼭 붙어 있을게.',
      story: '스웨터 맨 위 단추 자리에서 태어났어요. 작아도 제일 단단해요.',
      body: () => `
        <path d="M37 86 q-2 9 6 9 q6 0 5 -9 Z M55 86 q-1 9 5 9 q8 0 6 -9 Z" fill="#E8C76B"/>
        <path d="M20 58 q-10 -1 -12 8 M80 58 q10 -1 12 8" fill="none"/>
        <circle cx="50" cy="56" r="32" fill="#F6D98A"/>
        <circle cx="50" cy="56" r="25" fill="none" stroke-width="1.6" stroke-dasharray="3 3.5"/>
        <g fill="#E3BC5C" stroke-width="1.8"><circle cx="43" cy="69" r="3"/><circle cx="57" cy="69" r="3"/><circle cx="43" cy="77" r="3"/><circle cx="57" cy="77" r="3"/></g>
        ${face(50, 52, 9)}`,
    },
    yarnball: {
      name: '몽실이', kind: '실타래',
      hello: '나는 실타래 몽실이! 풀려도 괜찮아, 다시 감으면 되거든.',
      story: '바구니 맨 아래에서 굴러 나온 분홍 실타래. 머리 위 실 한 가닥이 자랑이에요.',
      body: () => `
        <path d="M76 76 q14 4 13 17" fill="none"/>
        <path d="M38 85 q-2 9 6 9 q6 0 5 -9 Z M53 85 q-1 9 5 9 q8 0 6 -9 Z" fill="#E99AAA"/>
        <circle cx="50" cy="58" r="30" fill="#F4B9C2"/>
        <path d="M24 46 q26 -16 52 4 M30 36 q20 -8 38 2 M26 74 q24 -10 48 2 M34 82 q16 -6 32 0" fill="none" stroke="#D98BA0" stroke-width="2"/>
        <path d="M50 28 q-5 -12 5 -17 q10 -3 7 8" fill="none"/>
        ${face(50, 58, 9)}`,
    },
    thimble: {
      name: '골미', kind: '골무',
      hello: '골무 투구를 쓴 골미야. 바늘이 와도 하나도 안 무서워!',
      story: '반짇고리 속 탐험가. 손가락 끝을 지켜주는 게 가장 큰 임무예요.',
      body: () => `
        <path d="M30 93 q-4 -30 20 -32 q24 2 20 32 Z" fill="#FFF3DD"/>
        <circle cx="50" cy="56" r="22" fill="#FFF3DD"/>
        <path d="M27 52 q0 -28 23 -29 q23 1 23 29 Z" fill="#CFC9C0"/>
        <g fill="#A9A39A" stroke="none"><circle cx="40" cy="34" r="1.6"/><circle cx="46" cy="30" r="1.6"/><circle cx="52" cy="30" r="1.6"/><circle cx="58" cy="34" r="1.6"/><circle cx="37" cy="42" r="1.6"/><circle cx="44" cy="39" r="1.6"/><circle cx="50" cy="38" r="1.6"/><circle cx="56" cy="39" r="1.6"/><circle cx="63" cy="42" r="1.6"/></g>
        <rect x="24" y="48" width="52" height="8" rx="4" fill="#BDB6AC"/>
        ${face(50, 65, 7)}`,
    },
    sheep: {
      name: '뭉게', kind: '양',
      hello: '실은 다 내 털에서 왔어. 고맙다고? 헤헤, 별말씀을.',
      story: '언덕 위 구름인 줄 알았던 양. 빨간 목도리는 첫 FO 선물이에요.',
      body: () => `
        <path d="M38 80 v14 M62 80 v14" stroke-width="7" stroke="#5A4038"/>
        <g fill="#FFF6E3">
          <circle cx="29" cy="48" r="12"/><circle cx="42" cy="36" r="12"/><circle cx="58" cy="36" r="12"/><circle cx="71" cy="48" r="12"/>
          <circle cx="74" cy="64" r="12"/><circle cx="62" cy="77" r="12"/><circle cx="38" cy="77" r="12"/><circle cx="26" cy="64" r="12"/>
          <circle cx="50" cy="57" r="26" stroke="none"/>
        </g>
        <ellipse cx="32" cy="57" rx="8" ry="4" fill="#5A4038" transform="rotate(-18 32 57)"/>
        <ellipse cx="68" cy="57" rx="8" ry="4" fill="#5A4038" transform="rotate(18 68 57)"/>
        <ellipse cx="50" cy="58" rx="15" ry="13" fill="#6B4A3E"/>
        <path d="M34 72 q16 8 32 0 l0 6 q-16 8 -32 0 Z M58 76 l4 12 l6 -2 l-3 -11" fill="#E07A5F"/>
        ${face(50, 56, 6, { eye: '#FFF6E3' })}`,
    },
    cat: {
      name: '실냥이', kind: '고양이',
      hello: '실타래는 내 거야! …아, 뜨개 하려고? 그럼 조금만 빌려줄게.',
      story: '실타래 속에서 낮잠 자다 몸이 실이 되어버린 고양이. 꼬리는 아직 덜 감겼어요.',
      body: () => `
        <path d="M72 78 q18 -4 14 -22 q-2 -8 -9 -5" fill="none"/>
        <circle cx="52" cy="72" r="21" fill="#A9C6DE"/>
        <path d="M36 66 q16 -8 32 2 M34 78 q18 -8 36 2" fill="none" stroke="#7FA7C9" stroke-width="2"/>
        <path d="M30 40 l1 -18 l13 10 Z M66 40 l-1 -18 l-13 10 Z" fill="#A9C6DE"/>
        <ellipse cx="48" cy="46" rx="21" ry="18" fill="#A9C6DE"/>
        <path d="M24 50 h-9 M24 54 l-8 3 M72 50 h9 M72 54 l8 3" fill="none" stroke-width="1.4"/>
        <ellipse cx="48" cy="50" rx="2" ry="1.4" fill="#D9839A" stroke="none"/>
        ${face(48, 45, 8, { mouth: false })}
        <path class="char-mouth" d="M45 52 q1.5 2 3 0 q1.5 2 3 0"/>`,
    },
    mitten: {
      name: '엄지', kind: '장갑',
      hello: '안녕! 엄지 척! 추운 날엔 나를 꼭 껴줘.',
      story: '한 짝을 잃어버렸던 장갑. 이제는 친구들이 생겨서 외롭지 않아요.',
      body: () => `
        <path d="M30 86 L30 46 q0 -28 21 -28 q21 0 21 28 L72 52 q6 -16 15 -12 q8 4 0 18 L72 74 L72 86 Z" fill="#B9CC95"/>
        <path d="M36 70 l4 4 m0 -4 l-4 4 M46 70 l4 4 m0 -4 l-4 4 M56 70 l4 4 m0 -4 l-4 4 M66 70 l4 4 m0 -4 l-4 4" fill="none" stroke="#FFF6E3" stroke-width="2"/>
        <rect x="27" y="80" width="48" height="14" rx="4" fill="#E9A0A0"/>
        <path d="M35 82 v10 M43 82 v10 M51 82 v10 M59 82 v10 M67 82 v10" fill="none" stroke="#D9839A" stroke-width="1.6"/>
        ${face(51, 48, 8)}`,
    },
    bear: {
      name: '보송', kind: '곰',
      hello: '털모자는 할머니가 떠주셨어. 너도 나한테 하나 떠줄래?',
      story: '겨울잠 대신 뜨개를 배우기로 한 곰. 아직 겉뜨기만 할 줄 알아요.',
      body: () => `
        <path d="M30 94 q-4 -28 20 -28 q24 0 20 28 Z" fill="#A9C6DE"/>
        <path d="M42 74 v18 M58 74 v18" fill="none" stroke="#7FA7C9" stroke-width="1.6"/>
        <circle cx="28" cy="50" r="7" fill="#C99B78"/><circle cx="72" cy="50" r="7" fill="#C99B78"/>
        <circle cx="50" cy="56" r="22" fill="#C99B78"/>
        <ellipse cx="50" cy="66" rx="8" ry="6" fill="#F1DCC5"/>
        <ellipse cx="50" cy="63.5" rx="2.6" ry="1.8" fill="${LINE}" stroke="none"/>
        <path class="char-mouth" d="M47.5 67 q2.5 2.4 5 0"/>
        <path d="M28 48 q0 -26 22 -26 q22 0 22 26 Z" fill="#F4B9C2"/>
        <rect x="26" y="42" width="48" height="9" rx="4.5" fill="#E99AAA"/>
        <path d="M33 43 v7 M39 43 v7 M45 43 v7 M51 43 v7 M57 43 v7 M63 43 v7 M69 43 v7" fill="none" stroke="#D9839A" stroke-width="1.4"/>
        <circle cx="50" cy="21" r="6" fill="#F6D98A"/>
        ${face(50, 58, 8, { mouth: false })}`,
    },
    snail: {
      name: '느릿', kind: '달팽이',
      hello: '천천히 떠도 괜찮아. 나도 한 단 뜨는 데 하루 걸려.',
      story: '실타래 껍데기를 지고 다니는 달팽이. 언제든 바늘을 꺼내 뜰 수 있어요.',
      body: () => `
        <path d="M80 52 l-5 -16 M90 52 l5 -16" fill="none"/>
        <circle cx="75" cy="35" r="3" fill="#CFE0C5"/><circle cx="95" cy="35" r="3" fill="#CFE0C5"/>
        <path d="M10 88 q0 -9 12 -9 L70 79 q2 -26 15 -29 q12 -2 12 12 q0 14 -6 25 L92 88 q0 6 -6 6 L16 94 q-6 0 -6 -6 Z" fill="#CFE0C5"/>
        <path d="M54 38 L68 16 M60 40 L76 22" fill="none" stroke-width="2.2"/>
        <circle cx="68" cy="16" r="3" fill="#E07A5F"/><circle cx="76" cy="22" r="3" fill="#E07A5F"/>
        <circle cx="42" cy="58" r="25" fill="#F6D98A"/>
        <path d="M42 58 m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a12 12 0 1 1 24 0 a16 16 0 1 1 -32 0 a20 20 0 1 1 40 0" fill="none" stroke="#D9A93A" stroke-width="2"/>
        ${face(85, 64, 5, { mouth: false })}
        <path class="char-mouth" d="M83 70 q2 2 4 0"/>`,
    },
    'tree-of-life': {
      name: '뜨개나무 할머니', kind: '나무',
      hello: '여기까지 오느라 수고 많았구나. 네가 뜬 것들이 다 내 가지에 피었단다.',
      story: '모든 친구들이 모여 사는 바구니를 지켜보는 나무. 잎사귀 하나하나가 뜨개로 떠져 있어요.',
      body: () => `
        <path d="M45 74 L46 54 L54 54 L55 74 Z" fill="#A5795C"/>
        <g fill="#B9CC95">
          <circle cx="28" cy="38" r="14"/><circle cx="40" cy="22" r="14"/><circle cx="60" cy="22" r="14"/><circle cx="72" cy="38" r="14"/>
          <circle cx="62" cy="52" r="13"/><circle cx="38" cy="52" r="13"/>
          <circle cx="50" cy="38" r="22" stroke="none"/>
        </g>
        <path d="M24 30 l3 3 l3 -3 M68 28 l3 3 l3 -3 M30 48 l3 3 l3 -3 M64 48 l3 3 l3 -3 M44 16 l3 3 l3 -3" fill="none" stroke="#7FA36B" stroke-width="1.8"/>
        <g stroke="none"><circle cx="22" cy="40" r="3.4" fill="#F4B9C2"/><circle cx="78" cy="34" r="3.4" fill="#F6D98A"/><circle cx="58" cy="12" r="3.4" fill="#F4B9C2"/><circle cx="72" cy="52" r="3.4" fill="#E07A5F"/><circle cx="30" cy="26" r="3.4" fill="#A9C6DE"/></g>
        <rect x="26" y="68" width="48" height="9" rx="3" fill="#D9926E"/>
        <path d="M30 77 L70 77 L64 95 L36 95 Z" fill="#C9805F"/>
        <path d="M40 84 l4 4 m0 -4 l-4 4 M48 84 l4 4 m0 -4 l-4 4 M56 84 l4 4 m0 -4 l-4 4" fill="none" stroke="#F6D98A" stroke-width="1.8"/>
        ${face(50, 38, 8, { closed: true })}`,
    },
  };

  // 손그림 느낌: 선을 살짝 흔들고(wobble) 크레파스처럼 결을 냄(grain). 문서에 한 번만 넣음
  function ensureFilters() {
    if (document.getElementById('kw-char-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="kw-char-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <filter id="kw-hand" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="4" result="warp"/>
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="wobbly"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.9 0 0 0 1.25" result="grain"/>
        <feComposite in="wobbly" in2="grain" operator="in"/>
      </filter>
    </defs></svg>`;
    document.body.appendChild(holder.firstElementChild);
  }

  function get(id) {
    return CHARACTERS[id] || null;
  }

  // 캐릭터 그림 HTML. blink: 눈 깜빡임
  function render(id, { blink = true } = {}) {
    const c = get(id);
    if (!c) return '';
    if (c.image) {
      return `<span class="char ${blink && c.imageBlink ? 'has-blink-img' : ''}">
        <img class="char-img" src="${c.image}" alt="${c.name}">
        ${c.imageBlink ? `<img class="char-img is-blink" src="${c.imageBlink}" alt="">` : ''}
      </span>`;
    }
    ensureFilters();
    return `<svg class="char ${blink ? 'is-blinking' : ''}" viewBox="0 0 100 100" role="img" aria-label="${c.name}">
      <g filter="url(#kw-hand)" stroke="${LINE}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${c.body()}</g>
    </svg>`;
  }

  // 다른 SVG 장면 안에 바로 그려 넣기 (x, y: 왼쪽 위, size: 가로세로)
  function inline(id, x, y, size) {
    const c = get(id);
    if (!c) return '';
    if (c.image) {
      return `<image href="${c.image}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
    }
    ensureFilters();
    return `<svg class="char is-blinking" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100" overflow="visible">
      <g filter="url(#kw-hand)" stroke="${LINE}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${c.body()}</g>
    </svg>`;
  }

  return { CHARACTERS, get, render, inline, ensureFilters };
})();
