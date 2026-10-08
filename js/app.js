const App = (() => {
  const root = document.getElementById('app');
  const bannerEl = document.getElementById('banner');
  let bannerTimer = null;
  let wakeLock = null;
  let tapGuard = {};
  let flashTimers = {};
  let currentRoute = { name: '', params: {} };
  let viewCleanup = null;

  // ---------- Banner ----------
  function showBanner(message, tone = 'info', duration = 3000) {
    clearTimeout(bannerTimer);
    bannerEl.textContent = message;
    bannerEl.className = `banner show ${tone}`;
    bannerTimer = setTimeout(() => {
      bannerEl.className = 'banner';
    }, duration);
  }

  // ---------- Wake Lock ----------
  // Screens where the user is knitting along and the display shouldn't dim.
  const KEEP_AWAKE_ROUTES = ['project-detail', 'pattern-viewer'];
  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* unsupported or denied: ignore per spec */ }
  }
  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && KEEP_AWAKE_ROUTES.includes(currentRoute.name)) {
      acquireWakeLock();
    }
  });

  // ---------- Router ----------
  function parseHash() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { name: 'list', params: {} };
    if (parts[0] === 'archive') {
      if (parts[1] === 'sampler') return { name: 'sampler-album', params: {} };
      return { name: 'archive', params: {} };
    }
    if (parts[0] === 'yarn') {
      if (parts[1] === 'new') return { name: 'yarn-form', params: {} };
      if (parts[1]) return { name: 'yarn-form', params: { id: parts[1] } };
      return { name: 'yarn-list', params: {} };
    }
    if (parts[0] === 'pattern') {
      if (parts[1] === 'new') return { name: 'pattern-form', params: {} };
      if (parts[1] === 'saved') return { name: 'pattern-list', params: { tab: 'saved' } };
      if (parts[1] === 'search') return { name: 'pattern-list', params: { tab: 'search' } };
      if (parts[1] === 'recommend' && parts[2]) return { name: 'pattern-recommend', params: { yarnId: parts[2] } };
      if (parts[1] && parts[2] === 'edit') return { name: 'pattern-form', params: { id: parts[1] } };
      if (parts[1] && parts[2] === 'for' && parts[3]) return { name: 'pattern-viewer', params: { id: parts[1], projectId: parts[3] } };
      if (parts[1]) return { name: 'pattern-viewer', params: { id: parts[1] } };
      return { name: 'pattern-list', params: {} };
    }
    if (parts[0] === 'tools') {
      if (parts[1] === 'gauge') return { name: 'tools-gauge', params: {} };
      if (parts[1] === 'abbreviations') return { name: 'tools-abbr', params: {} };
      if (parts[1] === 'backup') return { name: 'tools-backup', params: {} };
      if (parts[1] === 'ravelry') return { name: 'tools-ravelry', params: {} };
      return { name: 'tools-home', params: {} };
    }
    if (parts[0] === 'project') {
      if (parts[1] === 'new') {
        // 도안에서 시작: #/project/new/pattern/{id} (Library) · #/project/new/favorite/{ravelryId} (Favorites)
        if (parts[2] === 'pattern' && parts[3]) return { name: 'project-form', params: { from: { kind: 'pattern', id: parts[3] } } };
        if (parts[2] === 'favorite' && parts[3]) return { name: 'project-form', params: { from: { kind: 'favorite', id: parts[3] } } };
        return { name: 'project-form', params: {} };
      }
      if (parts[2] === 'edit') return { name: 'project-form', params: { id: parts[1] } };
      if (parts[1]) return { name: 'project-detail', params: { id: parts[1] } };
    }
    return { name: 'list', params: {} };
  }

  function go(hash) {
    location.hash = hash;
  }

  function render() {
    const route = parseHash();
    currentRoute = route;
    if (viewCleanup) {
      viewCleanup();
      viewCleanup = null;
    }
    document.body.dataset.view = route.name;
    if (KEEP_AWAKE_ROUTES.includes(route.name)) acquireWakeLock();
    else releaseWakeLock();

    switch (route.name) {
      case 'list': return renderList();
      case 'archive': return renderArchive();
      case 'sampler-album': return renderSamplerAlbum();
      case 'project-form': return renderProjectForm(route.params.id, route.params.from);
      case 'project-detail': return renderProjectDetail(route.params.id);
      case 'yarn-list': return renderYarnList();
      case 'yarn-form': return renderYarnForm(route.params.id);
      case 'tools-home': return renderToolsHome();
      case 'tools-gauge': return renderGaugeCalculator();
      case 'tools-abbr': return renderAbbreviations();
      case 'tools-backup': return renderBackup();
      case 'tools-ravelry': return renderRavelrySettings();
      case 'pattern-list': return renderPatternList(route.params.tab);
      case 'pattern-form': return renderPatternForm(route.params.id);
      case 'pattern-viewer': return renderPatternViewer(route.params.id, route.params.projectId);
      case 'pattern-recommend': return renderPatternRecommend(route.params.yarnId);
      default: return renderList();
    }
  }

  function setActiveTab(tab) {
    document.querySelectorAll('.tabbar a').forEach((a) => {
      a.classList.toggle('active', a.dataset.tab === tab);
    });
  }

  // ---------- View: Project List ----------
  function renderList() {
    setActiveTab('projects');
    const projects = Storage.getProjects()
      .filter((p) => p.status !== 'completed')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return new Date(b.lastWorkedAt) - new Date(a.lastWorkedAt);
      });

    const completedCount = Storage.getProjects().filter((p) => p.status === 'completed').length;

    root.innerHTML = `
      <header class="page-header">
        <h1>Projects</h1>
        <button class="btn primary sm" data-action="new-project">+ New Project</button>
      </header>
      ${projects.length === 0
        ? emptyState('아직 작품이 없어요', '새 작품을 추가해서 뜨개를 시작해보세요.', 'sweater')
        : [['active', 'WIP'], ['onhold', 'CO Waiting List']].map(([status, label]) => {
          const group = projects.filter((p) => p.status === status);
          if (!group.length) return '';
          return `
            <section class="project-group">
              <h2 class="section-head">${label} ${group.length}</h2>
              <div class="list">${group.map(projectCard).join('')}</div>
            </section>`;
        }).join('')}
      ${completedCount > 0 ? `<div class="list-footer-pill"><a class="pill-link" href="#/archive">FO ${completedCount}개</a></div>` : ''}
    `;

    root.querySelector('[data-action="new-project"]').addEventListener('click', () => go('#/project/new'));
    root.querySelectorAll('[data-project-id]').forEach((el) => {
      el.addEventListener('click', () => go(`#/project/${el.dataset.projectId}`));
    });
  }

  function emptyState(title, desc, art) {
    return `<div class="empty-state">${art ? `<div class="empty-art">${Icons.stitch(art)}</div>` : ''}<p class="empty-title">${title}</p><p class="empty-desc">${desc}</p></div>`;
  }

  // 단수 카운터는 사용자가 도안 뷰어에서 추가한 작품에서만 보여줌.
  // 예전 작품(counterEnabled 없음)은 이미 단수를 센 적이 있으면 켜진 걸로 봄.
  function isCounterOn(project) {
    if (!project) return false;
    if (project.counterEnabled != null) return !!project.counterEnabled;
    return Storage.getCountersByProject(project.id).some((c) => c.value > 0);
  }

  function projectCard(p) {
    const cover = p.photos && p.photos[p.mainPhotoIndex || 0];
    const counters = Storage.getCountersByProject(p.id);
    const main = counters.find((c) => c.isDefault) || counters[0];
    // CO Waiting List(캐스트온 대기)는 아직 시작 전이라 단수를 보여주지 않음
    const isCO = p.status === 'onhold';
    return `
      <div class="card project-card ${isCO ? 'is-onhold' : ''}" data-project-id="${p.id}">
        <div class="card-thumb">${cover ? `<img src="${cover}" alt="">` : `<div class="thumb-stitch">${Icons.stitch('sweater', 0.38)}</div>`}</div>
        <div class="card-body">
          <h3 class="project-card-title">${Utils.escapeHtml(p.name)}</h3>
        </div>
        ${main && !isCO && isCounterOn(p) ? `
          <div class="row-count">
            <div class="row-count-num">${Icons.stitchNumber(main.value, 0.3)}</div>
            <span class="row-count-unit">단</span>
          </div>` : ''}
      </div>`;
  }

  // ---------- View: Archive ----------
  function renderArchive() {
    setActiveTab('archive');
    const projects = Storage.getProjects()
      .filter((p) => p.status === 'completed')
      .sort((a, b) => new Date(b.completedDate || 0) - new Date(a.completedDate || 0));

    root.innerHTML = `
      <header class="page-header"><h1>Archive</h1></header>
      ${samplerSummaryCard()}
      ${projects.length ? `<h2 class="section-head">FO ${projects.length}</h2>` : ''}
      <div class="grid-2 archive-grid">
        ${projects.length === 0 ? emptyState('완성한 작품이 아직 없어요', '작품을 완성하면 여기에 모여요.') : projects.map(archiveCard).join('')}
      </div>
    `;
    root.querySelectorAll('[data-project-id]').forEach((el) => {
      el.addEventListener('click', () => go(`#/project/${el.dataset.projectId}`));
    });
    root.querySelector('[data-sampler-album]').addEventListener('click', () => go('#/archive/sampler'));
    bindFriends(root);
  }

  // ---------- 십자수 샘플러 + 뜨개 친구 ----------
  // 샘플러를 다 채우면 같은 id의 캐릭터가 튀어나와 Archive의 바구니에 모여 앉음
  const ballText = (grams) => `${Sampler.fmt(grams / Sampler.GRAMS_PER_BALL)}볼`;
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BASKET_SVG = `
    <svg class="basket" viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true">
      <g filter="url(#kw-hand)" stroke="#4A1F18" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke">
        <path d="M8 10 H312 L296 57 H24 Z" fill="#E9C77E" vector-effect="non-scaling-stroke"/>
        <path d="M13 26 H307 M17 40 H303 M21 52 H299" fill="none" stroke="#C99F4F" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <path d="${Array.from({ length: 19 }, (_, i) => `M${24 + i * 15} 16 v38`).join(' ')}" fill="none" stroke="#C99F4F" stroke-width="1.6" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>
        <rect x="2" y="3" width="316" height="13" rx="6.5" fill="#F2D594" vector-effect="non-scaling-stroke"/>
      </g>
    </svg>`;

  // 완성한 친구들이 바구니에 모여 앉은 장면
  function friendsBasket(prog) {
    Characters.ensureFilters();
    const friends = prog.list.filter((it) => it.done);
    const friendBtn = (it, i) => `
      <button type="button" class="friend" data-friend="${it.sampler.id}" style="--d:${((i * 0.73) % 3).toFixed(2)}s;--blink:${((i * 1.7) % 4.6).toFixed(2)}s" aria-label="${Utils.escapeHtml(Characters.get(it.sampler.id).name)}">
        ${Characters.render(it.sampler.id)}
      </button>`;
    // 5명이 넘으면 나중에 온 친구들은 뒷줄에 앉음
    const front = friends.slice(0, 5);
    const back = friends.slice(5);
    return `
      <div class="friends-basket">
        ${back.length ? `<div class="friends-row is-back">${back.map((it, i) => friendBtn(it, i + 5)).join('')}</div>` : ''}
        <div class="friends-row">
          ${front.length ? front.map(friendBtn).join('') : '<p class="friends-empty">첫 샘플러를 다 채우면<br>친구가 바구니에 들어와요.</p>'}
        </div>
        ${BASKET_SVG}
        <p class="friend-bubble" hidden></p>
      </div>`;
  }

  // 친구를 누르면 내 기록으로 한마디
  function friendLine(id) {
    const c = Characters.get(id);
    const prog = Sampler.progress();
    const projects = Storage.getProjects();
    const fo = projects.filter((p) => p.status === 'completed').length;
    const wip = projects.filter((p) => p.status === 'active');
    const yarns = Storage.getYarns().filter((y) => y.amount > 0);
    const lines = [c.hello];
    if (fo) lines.push(`FO가 벌써 ${fo}개야! 대단해.`);
    if (prog.grams) lines.push(`지금까지 ${ballText(prog.grams)}을 떴어. 털실 산이야!`);
    if (wip.length) lines.push(`'${pickOne(wip).name}' 잘 되고 있어? 천천히 해.`);
    if (yarns.length) {
      const y = pickOne(yarns);
      lines.push(`${y.name}, 아직 ${formatYarnAmount(y.amount, yarnUnitOf(y))} 남았더라.`);
    }
    if (prog.current) lines.push(`다음 친구까지 ${prog.current.sampler.total - prog.current.filled}땀 남았어. 누굴까?`);
    return pickOne(lines);
  }

  function bindFriends(scope) {
    const basket = scope.querySelector('.friends-basket');
    if (!basket) return;
    const bubble = basket.querySelector('.friend-bubble');
    let timer = null;
    basket.querySelectorAll('[data-friend]').forEach((el) => {
      el.addEventListener('click', () => {
        el.classList.remove('is-hop');
        void el.offsetWidth;
        el.classList.add('is-hop');
        bubble.textContent = friendLine(el.dataset.friend);
        bubble.hidden = false;
        const half = bubble.offsetWidth / 2;
        const center = el.offsetLeft + el.offsetWidth / 2;
        bubble.style.left = `${Math.min(basket.clientWidth - half - 8, Math.max(half + 8, center))}px`;
        bubble.style.top = `${Math.max(4, el.offsetTop - bubble.offsetHeight + 6)}px`;
        clearTimeout(timer);
        timer = setTimeout(() => { bubble.hidden = true; }, 3600);
      });
    });
  }

  function samplerSummaryCard() {
    const prog = Sampler.progress();
    const cur = prog.current;
    return `
      <section class="sampler-home">
        ${friendsBasket(prog)}
        <button type="button" class="sampler-progress" data-sampler-album>
          ${cur ? `<span class="sampler-progress-art">${Sampler.svg(cur.sampler, { filled: cur.filled, numbers: false })}</span>` : ''}
          <span class="sampler-progress-body">
            <span class="sampler-kicker">Sampler${cur ? ` · Chapter ${cur.sampler.chapter}` : ''}</span>
            <strong>${cur ? `${cur.filled} / ${cur.sampler.total}땀` : '모든 친구를 만났어요!'}</strong>
            <span class="card-meta">${cur ? `다음 땀까지 ${Sampler.fmt(prog.gramsToNext)}g · ` : ''}지금까지 ${ballText(prog.grams)}</span>
          </span>
          <span class="sampler-summary-go" aria-hidden="true">›</span>
        </button>
      </section>`;
  }

  function samplerCard(it, isCurrent) {
    const s = it.sampler;
    if (!it.done && !isCurrent) {
      return `
        <div class="sampler-card is-locked">
          <div class="sampler-card-art"><span class="sampler-lock">?</span></div>
          <p class="sampler-card-name">?</p>
          <p class="card-meta">${s.size}×${s.size} · ${s.total}땀</p>
        </div>`;
    }
    return `
      <button type="button" class="sampler-card ${it.done ? 'is-done' : 'is-current'}" data-sampler-id="${s.id}">
        <div class="sampler-card-art">${it.done ? Characters.render(s.id, { blink: false }) : Sampler.svg(s, { filled: it.filled, numbers: false })}</div>
        <p class="sampler-card-name">${it.done ? Utils.escapeHtml(Characters.get(s.id).name) : 'Stitching…'}</p>
        <p class="card-meta">${it.done ? (it.completedDate ? Utils.formatDate(it.completedDate) : '완성') : `${it.filled} / ${s.total}땀`}</p>
      </button>`;
  }

  function renderSamplerAlbum() {
    setActiveTab('archive');
    const prog = Sampler.progress();
    const chapters = [...new Set(Sampler.SAMPLERS.map((s) => s.chapter))];
    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1 class="display-title">Sampler Album</h1>
      </header>
      <div class="sampler-intro">
        <p>FO에 쓴 실을 기록하면 샘플러에 한 땀씩 수놓아져요. 다 채우면 숨어 있던 뜨개 친구가 튀어나와요.</p>
        <p class="card-meta">${Sampler.GRAMS_PER_BALL}g = 1볼 = ${Sampler.STITCHES_PER_BALL}땀 · 지금까지 ${ballText(prog.grams)}(${Sampler.fmt(prog.grams)}g), ${prog.stitches}땀</p>
      </div>
      ${chapters.map((ch) => {
        const items = prog.list.filter((it) => it.sampler.chapter === ch);
        const size = items[0].sampler.size;
        return `
          <h2 class="section-head">Chapter ${ch}</h2>
          <p class="card-meta sampler-chapter-meta">${size}×${size} 모눈</p>
          <div class="sampler-grid-list">
            ${items.map((it) => samplerCard(it, prog.current && prog.current.index === it.index)).join('')}
          </div>`;
      }).join('')}
    `;
    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());
    root.querySelectorAll('[data-sampler-id]').forEach((el) => {
      el.addEventListener('click', () => openSamplerModal(el.dataset.samplerId));
    });
  }

  function openSamplerModal(samplerId) {
    const it = Sampler.progress().list.find((x) => x.sampler.id === samplerId);
    if (!it) return;
    const s = it.sampler;
    const c = Characters.get(s.id);
    if (!it.done) {
      Modal.open({
        title: 'Stitching…',
        bodyHtml: `
          <div class="sampler-view">${Sampler.svg(s, { filled: it.filled })}</div>
          <p class="card-meta">${it.filled} / ${s.total}땀 · 다 채우면 누군가 튀어나와요.</p>`,
        buttons: [{ id: 'ok', label: 'Close', variant: 'primary' }],
      });
      return;
    }
    Modal.open({
      title: Utils.escapeHtml(c.name),
      bodyHtml: `
        <div class="friend-hero">${Characters.render(s.id)}</div>
        <p class="friend-hello">“${Utils.escapeHtml(c.hello)}”</p>
        <p>${Utils.escapeHtml(c.story)}</p>
        <div class="friend-origin">
          <div class="friend-origin-art">${Sampler.svg(s, { numbers: false })}</div>
          <p class="card-meta">${it.completedDate ? `${Utils.formatDate(it.completedDate)}, ` : ''}${s.total}땀으로 수놓은 ${Utils.escapeHtml(c.kind)}</p>
        </div>`,
      buttons: [{ id: 'ok', label: 'Close', variant: 'primary' }],
    });
  }

  // FO에 실 사용량이 기록된 뒤: 이번 작품으로 늘어난 땀을 보여주고, 샘플러를 다 채웠으면 친구가 튀어나옴
  async function showSamplerGain(projectId, beforeStitches) {
    const prog = Sampler.progress();
    const gained = prog.stitches - beforeStitches;
    const project = Storage.getProject(projectId);
    if (!project || project.status !== 'completed' || gained <= 0) return;
    const grams = Sampler.projectGrams(project);
    const touched = prog.list.filter((x) => x.start < prog.stitches && x.start + x.sampler.total > beforeStitches);
    const finished = touched.filter((x) => x.done);
    const it = finished.length ? finished[finished.length - 1] : touched[touched.length - 1];
    const s = it.sampler;
    const newFrom = Math.max(0, beforeStitches - it.start);
    const c = finished.length ? Characters.get(s.id) : null;
    const pending = Modal.open({
      title: c ? 'Sampler Complete!' : 'Stitched!',
      bodyHtml: `
        <p>이번 작품으로 <strong>${ballText(grams)}</strong>을 수놓았어요. <strong>+${gained}땀</strong></p>
        <div class="sampler-pop" data-sampler-pop>
          ${Sampler.svg(s, { filled: it.filled, newFrom })}
          ${c ? `<div class="pop-sparks" aria-hidden="true">${'<i></i>'.repeat(8)}</div><div class="pop-char">${Characters.render(s.id)}</div>` : ''}
        </div>
        ${c
          ? `<p class="friend-hello pop-hello" data-pop-hello>“${Utils.escapeHtml(c.hello)}”</p>
             <p class="card-meta pop-hello" data-pop-hello>${finished.length > 1 ? `친구 ${finished.length}명이 한꺼번에 나왔어요! ` : ''}Archive 바구니에서 기다릴게요.</p>`
          : `<p class="card-meta">${it.filled} / ${s.total}땀 · 다음 땀까지 ${Sampler.fmt(prog.gramsToNext)}g</p>`}`,
      buttons: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    });
    if (c) {
      const popEl = document.querySelector('[data-sampler-pop]');
      const titleEl = popEl && popEl.closest('.modal').querySelector('.modal-title');
      const reveal = () => {
        if (!popEl || !popEl.isConnected) return;
        popEl.classList.add('is-popped');
        if (titleEl) titleEl.textContent = `${c.name} 등장!`;
        document.querySelectorAll('[data-pop-hello]').forEach((el) => el.classList.add('is-shown'));
      };
      if (prefersReducedMotion()) reveal();
      else setTimeout(reveal, Math.min(2400, (it.filled - newFrom) * 60) + 700);
    }
    await pending;
  }

  // 인스타그램 게시글 주소 → { url, embed } (게시물 /p/, 릴스 /reel/, /tv/ 지원)
  function parseInstagramUrl(raw) {
    const m = String(raw || '').trim().match(/instagram\.com\/(?:[^/?#]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const kind = m[1].toLowerCase();
    const url = `https://www.instagram.com/${kind}/${m[2]}/`;
    return { url, embed: `${url}embed/` };
  }

  function archiveCard(p) {
    const cover = p.photos && p.photos[p.mainPhotoIndex || 0];
    return `
      <div class="card archive-card" data-project-id="${p.id}">
        <div class="card-thumb square">${cover ? `<img src="${cover}" alt="">` : `<div class="thumb-stitch is-archive">${Icons.stitch('sweater', 0.3)}</div>`}</div>
        <div class="card-body">
          <h3>${Utils.escapeHtml(p.name)}</h3>
          <p class="card-meta">${Utils.formatDate(p.completedDate)}${p.instagramUrl ? ' · <span class="ig-mark">Instagram</span>' : ''}</p>
        </div>
      </div>`;
  }

  // ---------- View: Placeholder tabs ----------
  // ---------- View: Yarn List ----------
  const YARN_WEIGHTS = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];
  let yarnActiveWeight = 'all';

  function renderYarnList() {
    setActiveTab('yarn');
    yarnActiveWeight = 'all';
    const usedWeights = Array.from(new Set(Storage.getYarns().map((y) => y.weight).filter(Boolean)));

    root.innerHTML = `
      <header class="page-header">
        <h1>Yarn</h1>
        <button class="btn primary sm" data-action="new-yarn">+ Add Yarn</button>
      </header>
      ${usedWeights.length ? `
        <div class="status-row wrap" id="yarn-weight-filter">
          <button type="button" class="chip display-chip active" data-weight="all">All</button>
          ${usedWeights.map((w) => `<button type="button" class="chip display-chip" data-weight="${Utils.escapeHtml(w)}">${Utils.escapeHtml(w)}</button>`).join('')}
        </div>` : ''}
      <label class="field search-field">
        <input type="text" id="yarn-search" placeholder="이름, 색상으로 검색">
      </label>
      <div class="list" id="yarn-list-body"></div>
    `;

    function renderBody() {
      const q = root.querySelector('#yarn-search').value.trim().toLowerCase();
      const list = Storage.getYarns()
        .filter((y) => yarnActiveWeight === 'all' || y.weight === yarnActiveWeight)
        .filter((y) => !q || `${y.name} ${y.color}`.toLowerCase().includes(q))
        .sort((a, b) => {
          const aEmpty = a.amount > 0 ? 0 : 1;
          const bEmpty = b.amount > 0 ? 0 : 1;
          if (aEmpty !== bEmpty) return aEmpty - bEmpty;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
      const body = root.querySelector('#yarn-list-body');
      body.innerHTML = list.length === 0
        ? emptyState('아직 등록한 실이 없어요', '실을 추가하고 보관함을 채워보세요.')
        : list.map(yarnCard).join('');
      body.querySelectorAll('[data-yarn-id]').forEach((el) => {
        el.addEventListener('click', () => go(`#/yarn/${el.dataset.yarnId}`));
      });
    }

    root.querySelector('[data-action="new-yarn"]').addEventListener('click', () => go('#/yarn/new'));
    const filterRow = root.querySelector('#yarn-weight-filter');
    if (filterRow) {
      filterRow.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-weight]');
        if (!btn) return;
        yarnActiveWeight = btn.dataset.weight;
        filterRow.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
        renderBody();
      });
    }
    root.querySelector('#yarn-search').addEventListener('input', renderBody);

    renderBody();
  }

  // 바늘 굵기 드롭다운: 자주 쓰는 mm 굵기(US 호수 함께) + 직접 입력.
  // 실제 값은 input[name="needleSize"]에 "4mm" 형식으로 들어감. Ravelry 범위("4–4.5mm")나 목록에 없는 값은 직접 입력.
  const NEEDLE_SIZES = [
    [2, '0'], [2.25, '1'], [2.5, '1.5'], [2.75, '2'], [3, '2.5'], [3.25, '3'], [3.5, '4'], [3.75, '5'],
    [4, '6'], [4.5, '7'], [5, '8'], [5.5, '9'], [6, '10'], [6.5, '10.5'], [7, ''], [8, '11'],
    [9, '13'], [10, '15'], [12, '17'], [15, '19'],
  ];
  const needleValue = (mm) => `${mm}mm`;
  const isKnownNeedle = (v) => NEEDLE_SIZES.some(([mm]) => needleValue(mm) === v);
  function needleFieldHtml(value, placeholder = '예: 4–4.5mm') {
    const v = String(value || '').trim();
    const custom = v && !isKnownNeedle(v);
    return `
      <div class="needle-field" data-needle-field>
        <select data-needle-select aria-label="바늘 굵기">
          <option value="">선택 안 함</option>
          ${NEEDLE_SIZES.map(([mm, us]) => `<option value="${needleValue(mm)}" ${needleValue(mm) === v ? 'selected' : ''}>${mm}mm${us ? ` (US ${us})` : ''}</option>`).join('')}
          <option value="__custom" ${custom ? 'selected' : ''}>직접 입력</option>
        </select>
        <input type="text" name="needleSize" value="${Utils.escapeHtml(v)}" placeholder="${placeholder}" ${custom ? '' : 'hidden'}>
      </div>`;
  }
  // 코드로 바늘 값을 넣을 때(도안·Ravelry에서 채우기) 드롭다운도 같이 맞춤
  function setNeedleValue(input, value) {
    if (!input) return;
    input.value = String(value || '').trim();
    const wrap = input.closest('[data-needle-field]');
    if (!wrap) return;
    const custom = input.value && !isKnownNeedle(input.value);
    wrap.querySelector('[data-needle-select]').value = !input.value ? '' : (custom ? '__custom' : input.value);
    input.hidden = !custom;
  }
  root.addEventListener('change', (e) => {
    const select = e.target.closest && e.target.closest('[data-needle-select]');
    if (!select) return;
    const input = select.closest('[data-needle-field]').querySelector('input');
    if (select.value === '__custom') {
      if (isKnownNeedle(input.value)) input.value = '';
      input.hidden = false;
      input.focus();
    } else {
      input.value = select.value;
      input.hidden = true;
    }
  });

  // 실 보유량 표시: 3볼 / 2.5볼 / 820g
  function formatYarnAmount(value, unit) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return unit === 'g' ? `${n}g` : `${n}볼`;
  }
  const yarnUnitOf = (yarn) => (yarn && yarn.unit === 'g' ? 'g' : 'ball');

  // 이 실을 연결해두고 아직 사용량을 기록하지 않은 작품들
  function projectsUsingYarn(yarnId) {
    return Storage.getProjectsLinkedToYarn(yarnId)
      .filter((proj) => (proj.yarns || []).some((l) => l.yarnId === yarnId && l.pending));
  }

  // 사용량 기록: 볼 단위는 쓴 볼 수, g 단위(콘사)는 지금 남은 무게를 받아 쓴 양을 계산.
  // 비워둔 실은 기록하지 않음. 이미 기록한 실은 다시 고칠 수 있음.
  async function openYarnUsageModal(projectId, yarnIds, { title = '사용량 기록', intro = '' } = {}) {
    const project = Storage.getProject(projectId);
    if (!project) return false;
    const round2 = (n) => Math.round(n * 100) / 100;
    const rows = yarnIds.map((yarnId, i) => {
      const yarn = Storage.getYarn(yarnId);
      const link = (project.yarns || []).find((l) => l.yarnId === yarnId);
      if (!yarn || !link) return null;
      // 이 작품에 쓰기 전 보유량 (이미 기록한 양은 되돌려서 계산)
      const before = round2(yarn.amount + Storage.linkUsedAmount(link));
      const prevUsed = link.pending ? null : Storage.linkUsedAmount(link);
      return { i, yarnId, yarn, before, prevUsed, unit: yarnUnitOf(yarn) };
    }).filter(Boolean);
    if (!rows.length) return false;

    const res = await Modal.open({
      title,
      bodyHtml: `
        ${intro ? `<p>${intro}</p>` : ''}
        ${rows.map((r) => (r.unit === 'g' ? `
          <label class="field">
            <span>${Utils.escapeHtml(r.yarn.name)} · 쓰기 전 ${formatYarnAmount(r.before, 'g')}</span>
            <input type="number" min="0" step="any" inputmode="decimal" data-field="y${r.i}" placeholder="지금 남은 무게 (g)" value="${r.prevUsed != null ? round2(r.before - r.prevUsed) : ''}">
          </label>` : `
          <label class="field">
            <span>${Utils.escapeHtml(r.yarn.name)} · 보유 ${formatYarnAmount(r.before, 'ball')}</span>
            <input type="number" min="0" step="0.5" inputmode="decimal" data-field="y${r.i}" placeholder="쓴 볼 수" value="${r.prevUsed != null ? r.prevUsed : ''}">
          </label>`)).join('')}
        <p class="card-meta">g 단위 실(콘사)은 저울에 올린 남은 무게를 적으면 쓴 양을 계산해요. 비워두면 기록하지 않아요.</p>`,
      buttons: [{ id: 'cancel', label: 'Later', variant: 'ghost' }, { id: 'ok', label: 'Save', variant: 'primary' }],
    });
    if (res.id !== 'ok') return false;

    let count = 0;
    rows.forEach((r) => {
      const raw = String(res.values[`y${r.i}`] == null ? '' : res.values[`y${r.i}`]).trim();
      if (raw === '') return;
      const n = Math.max(0, Number(raw) || 0);
      const used = r.unit === 'g' ? Math.max(0, r.before - n) : n;
      Storage.recordYarnUsage(projectId, r.yarnId, used);
      count += 1;
    });
    if (count) showBanner(`실 ${count}개의 사용량을 기록했어요.`);
    return count > 0;
  }

  // 고르기 창(Modal.pick) 항목: 최근에 추가한 것부터 (같은 시각이면 나중에 추가한 것 먼저)
  const newestFirst = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''));
  function libraryPickItems() {
    return [...Storage.getPatterns()].reverse().sort(newestFirst('createdAt')).map((pt) => ({
      value: `pattern:${pt.id}`,
      label: pt.name,
      meta: [pt.fileType === 'pdf' ? `PDF · ${pt.pageCount}쪽` : '이미지', pt.needleSize && `바늘 ${pt.needleSize}`].filter(Boolean).join(' · '),
    }));
  }
  function favoritePickItems() {
    return [...Storage.getSavedPatterns()].reverse().sort(newestFirst('savedAt')).map((f) => ({
      value: `favorite:${f.ravelryPatternId}`,
      label: f.name,
      meta: ['Ravelry', f.needleSize && `바늘 ${f.needleSize}`].filter(Boolean).join(' · '),
    }));
  }
  // 실: 보유량 있는 실 먼저, 그 안에서 최근 것부터
  function yarnPickItems(yarns) {
    return [...yarns].reverse()
      .sort((a, b) => (b.amount > 0) - (a.amount > 0) || newestFirst('createdAt')(a, b))
      .map((y) => ({
        value: y.id,
        label: y.name,
        meta: [y.color, y.weight, `보유 ${formatYarnAmount(y.amount, yarnUnitOf(y))}`].filter(Boolean).join(' · '),
      }));
  }

  function yarnCard(y) {
    const empty = !(y.amount > 0);
    const using = projectsUsingYarn(y.id);
    return `
      <div class="card ${empty ? 'is-empty' : ''}" data-yarn-id="${y.id}">
        <div class="card-thumb">${y.photo ? `<img src="${y.photo}" alt="">` : `<div class="thumb-stitch is-yarn">${Icons.stitch('yarn', 0.4)}</div>`}</div>
        <div class="card-body">
          <div class="card-title-row"><h3>${Utils.escapeHtml(y.name)}</h3></div>
          <p class="card-sub">${[y.color, y.weight, y.material].filter(Boolean).map((v) => Utils.escapeHtml(v)).join(' · ') || '-'}</p>
          <p class="card-meta">${[empty ? '보유량 없음' : `보유 ${formatYarnAmount(y.amount, yarnUnitOf(y))}`, y.needleSize && `바늘 ${Utils.escapeHtml(y.needleSize)}`].filter(Boolean).join(' · ')}</p>
          ${using.length ? `<p class="card-meta yarn-in-use">${using.map((proj) => Utils.escapeHtml(proj.name)).join(', ')}에서 사용 중</p>` : ''}
        </div>
      </div>`;
  }

  // ---------- View: Yarn Form (create/edit) ----------
  function renderYarnForm(id) {
    const editing = !!id;
    const yarn = editing ? Storage.getYarn(id) : null;
    if (editing && !yarn) return go('#/yarn');
    const linkedProjects = editing ? Storage.getProjectsLinkedToYarn(id) : [];

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        ${editing ? '<h1>실 수정</h1>' : '<h1 class="display-title">New Yarn</h1>'}
      </header>
      <form id="yarn-form" class="form">
        <label class="field">
          <span>브랜드/이름 <em>*</em></span>
          ${Ravelry.isConfigured() ? `
            <div class="input-with-action">
              <input type="text" name="name" value="${yarn ? Utils.escapeHtml(yarn.name) : ''}" placeholder="예: 메리노 DK" enterkeyhint="search">
              <button type="button" class="btn ghost sm" data-action="ravelry-search">Search Ravelry</button>
            </div>
          ` : `<input type="text" name="name" value="${yarn ? Utils.escapeHtml(yarn.name) : ''}" placeholder="예: 메리노 DK">`}
          <p class="field-error" id="name-error" hidden>이름을 입력해주세요.</p>
        </label>
        ${Ravelry.isConfigured()
          ? `<div class="list" id="ravelry-results"></div>`
          : `<p class="card-meta">Ravelry 연동을 설정하면 위 이름으로 실 정보를 자동으로 불러올 수 있어요. <a href="#/tools/ravelry">설정하러 가기 →</a></p>`}
        <label class="field">
          <span>색상</span>
          <input type="text" name="color" value="${yarn ? Utils.escapeHtml(yarn.color) : ''}" placeholder="예: 카멜">
        </label>
        <label class="field">
          <span>굵기</span>
          <select name="weight">
            <option value="">선택 안 함</option>
            ${YARN_WEIGHTS.map((w) => `<option value="${w}" ${yarn && yarn.weight === w ? 'selected' : ''}>${w}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>권장 바늘</span>
          ${needleFieldHtml(yarn && yarn.needleSize)}
        </label>
        <label class="field">
          <span>소재</span>
          <input type="text" name="material" value="${yarn ? Utils.escapeHtml(yarn.material) : ''}" placeholder="예: 메리노 울 100%">
        </label>
        <div class="field">
          <span>보유량</span>
          <div class="amount-row">
            <input type="number" name="amount" min="0" step="any" inputmode="decimal" value="${yarn ? yarn.amount : 0}">
            <select name="unit" aria-label="보유량 단위">
              <option value="ball" ${yarnUnitOf(yarn) === 'ball' ? 'selected' : ''}>볼</option>
              <option value="g" ${yarnUnitOf(yarn) === 'g' ? 'selected' : ''}>g (콘사)</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <label class="field"><span>볼당 길이(m)</span><input type="number" name="lengthPerBall" min="0" value="${yarn && yarn.lengthPerBall != null ? yarn.lengthPerBall : ''}"></label>
          <label class="field"><span>볼당 무게(g)</span><input type="number" name="weightPerBall" min="0" value="${yarn && yarn.weightPerBall != null ? yarn.weightPerBall : ''}"></label>
        </div>
        <div class="field">
          <span>사진</span>
          <div class="photo-grid" id="photo-grid"></div>
        </div>
        ${editing && linkedProjects.length ? `
          <div class="info-block">
            <h3>연결된 작품</h3>
            <ul class="yarn-link-list">
              ${linkedProjects.map((p) => {
                const link = (p.yarns || []).find((l) => l.yarnId === id);
                const usage = !link || link.pending ? '사용 중' : `${formatYarnAmount(Storage.linkUsedAmount(link), yarnUnitOf(yarn))} 사용`;
                return `<li class="yarn-link-row"><span>${Utils.escapeHtml(p.name)} · ${usage}</span></li>`;
              }).join('')}
            </ul>
          </div>` : ''}
        ${editing ? `<a class="link-row" href="#/pattern/recommend/${id}">이 실로 뜰 도안 찾기 →</a>` : ''}
        <div class="form-actions">
          <button type="submit" class="btn primary block">Save</button>
          ${editing ? `<button type="button" class="btn danger block" data-action="delete">Delete Yarn</button>` : ''}
        </div>
      </form>
    `;

    let photo = yarn ? yarn.photo || null : null;
    let ravelryYarnId = yarn ? yarn.ravelryYarnId || null : null;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    const ravelrySearchBtn = root.querySelector('[data-action="ravelry-search"]');
    if (ravelrySearchBtn) {
      ravelrySearchBtn.addEventListener('click', async () => {
        const query = root.querySelector('[name="name"]').value.trim();
        const resultsEl = root.querySelector('#ravelry-results');
        if (!query) {
          showBanner('먼저 이름을 입력해주세요.', 'warn');
          return;
        }
        resultsEl.innerHTML = `<p class="card-meta">검색 중이에요...</p>`;
        let results;
        try {
          results = await Ravelry.searchYarns(query);
        } catch (err) {
          resultsEl.innerHTML = '';
          showBanner(Ravelry.errorMessage(err), 'warn');
          return;
        }
        if (!results.length) {
          resultsEl.innerHTML = `<p class="card-meta">검색 결과가 없어요.</p>`;
          return;
        }
        resultsEl.innerHTML = results.map((r) => `
          <div class="counter-row" data-ravelry-yarn="${r.id}">
            <div class="counter-row-main">
              <strong>${Utils.escapeHtml(r.name)}</strong>
              <span class="card-sub">${Utils.escapeHtml(r.company)}</span>
            </div>
            <div class="counter-row-controls"><button type="button" class="icon-btn sm display-text">Import</button></div>
          </div>`).join('');
        resultsEl.querySelectorAll('[data-ravelry-yarn]').forEach((row) => {
          row.addEventListener('click', async () => {
            try {
              const detail = await Ravelry.getYarnDetail(row.dataset.ravelryYarn);
              root.querySelector('[name="name"]').value = detail.name;
              if (detail.weight) root.querySelector('[name="weight"]').value = detail.weight;
              if (detail.material) root.querySelector('[name="material"]').value = detail.material;
              if (detail.lengthPerBall != null) root.querySelector('[name="lengthPerBall"]').value = detail.lengthPerBall;
              if (detail.weightPerBall != null) root.querySelector('[name="weightPerBall"]').value = detail.weightPerBall;
              if (detail.needleSize) setNeedleValue(root.querySelector('[name="needleSize"]'), detail.needleSize);
              ravelryYarnId = detail.ravelryYarnId;
              resultsEl.innerHTML = '';
              showBanner('실 정보를 불러왔어요.');
            } catch (err) {
              showBanner(Ravelry.errorMessage(err), 'warn');
            }
          });
        });
      });
      // 이름 칸에서 엔터를 누르면 폼 저장 대신 Ravelry 검색
      root.querySelector('[name="name"]').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        ravelrySearchBtn.click();
      });
    }

    function refreshPhotoGrid() {
      const grid = root.querySelector('#photo-grid');
      grid.innerHTML = (photo ? photoThumb(photo, 0) : '') +
        (photo ? '' : `<label class="photo-add"><input type="file" id="photo-input" accept="image/*" hidden><span>+</span></label>`);
      const input = grid.querySelector('#photo-input');
      if (input) input.addEventListener('change', handlePhotoChange);
      const removeBtn = grid.querySelector('[data-remove-photo]');
      if (removeBtn) removeBtn.addEventListener('click', () => { photo = null; refreshPhotoGrid(); });
    }
    async function handlePhotoChange(e) {
      const file = (e.target.files || [])[0];
      if (!file) return;
      try { photo = await resizeImage(file); } catch (err) { console.error(err); }
      refreshPhotoGrid();
    }
    refreshPhotoGrid();

    if (editing) {
      root.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const linked = Storage.getProjectsLinkedToYarn(id);
        const ok = await Modal.confirm(linked.length ? {
          title: '연결된 작품이 있어요',
          message: `${linked.map((p) => p.name).join(', ')}에 연결돼 있어요. 삭제해도 작품에는 실 이름이 남아요.`,
          okLabel: 'Delete',
          cancelLabel: 'Cancel',
          danger: true,
        } : {
          title: '실을 삭제할까요?',
          message: '삭제한 실 정보는 되돌릴 수 없어요.',
          okLabel: 'Delete',
          cancelLabel: 'Cancel',
          danger: true,
        });
        if (!ok) return;
        Storage.deleteYarn(id);
        showBanner('실을 삭제했어요.');
        go('#/yarn');
      });
    }

    root.querySelector('#yarn-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get('name') || '').trim();
      const errorEl = root.querySelector('#name-error');
      if (!name) {
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      const data = {
        name,
        color: String(fd.get('color') || '').trim(),
        weight: String(fd.get('weight') || '').trim(),
        needleSize: String(fd.get('needleSize') || '').trim(),
        material: String(fd.get('material') || '').trim(),
        amount: Math.max(0, Number(fd.get('amount')) || 0),
        unit: fd.get('unit') === 'g' ? 'g' : 'ball',
        lengthPerBall: fd.get('lengthPerBall') ? Number(fd.get('lengthPerBall')) : null,
        weightPerBall: fd.get('weightPerBall') ? Number(fd.get('weightPerBall')) : null,
        photo,
        ravelryYarnId,
      };
      if (editing) {
        Storage.updateYarn(id, data);
        showBanner('실 정보를 수정했어요.');
      } else {
        Storage.createYarn(data);
        showBanner('새 실을 등록했어요.');
      }
      go('#/yarn');
    });
  }

  // ---------- View: Tools Home ----------
  function renderToolsHome() {
    setActiveTab('tools');
    root.innerHTML = `
      <header class="page-header"><h1>Tools</h1></header>
      <nav class="tools-menu">
        ${[
          ['#/tools/gauge', 'Gauge Calculator', '게이지로 코·단 수 계산'],
          ['#/tools/abbreviations', 'Abbreviations', '뜨개 약어 사전'],
          ['#/tools/backup', 'Backup', '데이터 내보내기 / 가져오기'],
          ['#/tools/ravelry', 'Ravelry', 'Ravelry 연동 설정'],
        ].map(([href, title, sub]) => `
          <a class="tools-menu-item" href="${href}">
            <span class="tools-menu-text"><span class="tools-menu-title">${title}</span><span class="tools-menu-sub">${sub}</span></span>
            <span class="tools-menu-arrow" aria-hidden="true">→</span>
          </a>`).join('')}
      </nav>
    `;
  }

  // ---------- View: Gauge Calculator ----------
  const GAUGE_FIELDS = ['sampleWidth', 'sampleHeight', 'sampleStitches', 'sampleRows', 'targetWidth', 'targetHeight'];

  function renderGaugeCalculator() {
    setActiveTab('tools');
    const projects = Storage.getProjects();

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1 class="display-title">Gauge Calculator</h1>
      </header>
      <form id="gauge-form" class="gauge-form">
        <div class="info-block gauge-card">
          <h3>내 스와치</h3>
          <p class="card-meta">뜬 게이지 샘플을 재서 적어주세요.</p>
          <div class="grid-2">
            <label class="field"><span>가로 (cm)</span><input type="number" name="sampleWidth" min="0" step="0.1" inputmode="decimal" placeholder="10"><p class="field-error" data-error="sampleWidth" hidden>0보다 큰 값을 입력해주세요.</p></label>
            <label class="field"><span>세로 (cm)</span><input type="number" name="sampleHeight" min="0" step="0.1" inputmode="decimal" placeholder="10"><p class="field-error" data-error="sampleHeight" hidden>0보다 큰 값을 입력해주세요.</p></label>
            <label class="field"><span>코 수</span><input type="number" name="sampleStitches" min="0" step="1" inputmode="numeric" placeholder="22"><p class="field-error" data-error="sampleStitches" hidden>0보다 큰 값을 입력해주세요.</p></label>
            <label class="field"><span>단 수</span><input type="number" name="sampleRows" min="0" step="1" inputmode="numeric" placeholder="30"><p class="field-error" data-error="sampleRows" hidden>0보다 큰 값을 입력해주세요.</p></label>
          </div>
        </div>
        <div class="info-block gauge-card">
          <h3>만들 크기</h3>
          <div class="grid-2">
            <label class="field"><span>가로 (cm)</span><input type="number" name="targetWidth" min="0" step="0.1" inputmode="decimal"><p class="field-error" data-error="targetWidth" hidden>0보다 큰 값을 입력해주세요.</p></label>
            <label class="field"><span>세로 (cm)</span><input type="number" name="targetHeight" min="0" step="0.1" inputmode="decimal"><p class="field-error" data-error="targetHeight" hidden>0보다 큰 값을 입력해주세요.</p></label>
          </div>
        </div>
      </form>
      <div class="gauge-result">
        <div class="gauge-result-nums">
          <div class="gauge-result-item"><strong id="result-stitches">-</strong><span>코</span></div>
          <div class="gauge-result-x" aria-hidden="true">×</div>
          <div class="gauge-result-item"><strong id="result-rows">-</strong><span>단</span></div>
        </div>
        <p class="card-meta" id="gauge-result-note">칸을 모두 채우면 필요한 코 수와 단 수를 계산해요.</p>
      </div>
      ${projects.length ? `
        <div class="info-block gauge-card" id="gauge-save" hidden>
          <h3>결과를 작품 메모에 저장</h3>
          <label class="field">
            <select id="gauge-project-select">${projects.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}</select>
          </label>
          <button type="button" class="btn ghost block" data-action="save-memo">Save to Notes</button>
        </div>` : ''}
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    const form = root.querySelector('#gauge-form');
    const resultBox = root.querySelector('.gauge-result');
    const saveBox = root.querySelector('#gauge-save');
    let lastResult = null;

    function calc() {
      const fd = new FormData(form);
      const values = {};
      let hasEmpty = false;
      let hasInvalid = false;
      GAUGE_FIELDS.forEach((f) => {
        const raw = fd.get(f);
        const errorEl = root.querySelector(`[data-error="${f}"]`);
        if (raw === '' || raw == null) {
          hasEmpty = true;
          if (errorEl) errorEl.hidden = true;
          return;
        }
        const num = Number(raw);
        values[f] = num;
        if (Number.isNaN(num) || num <= 0) {
          hasInvalid = true;
          if (errorEl) errorEl.hidden = false;
        } else if (errorEl) {
          errorEl.hidden = true;
        }
      });

      if (hasEmpty || hasInvalid) {
        root.querySelector('#result-stitches').textContent = '-';
        root.querySelector('#result-rows').textContent = '-';
        root.querySelector('#gauge-result-note').textContent = hasInvalid
          ? '0보다 큰 값을 넣어주세요.'
          : '칸을 모두 채우면 필요한 코 수와 단 수를 계산해요.';
        resultBox.classList.remove('is-ready');
        if (saveBox) saveBox.hidden = true;
        lastResult = null;
        return;
      }

      const neededStitches = (values.sampleStitches / values.sampleWidth) * values.targetWidth;
      const neededRows = (values.sampleRows / values.sampleHeight) * values.targetHeight;
      lastResult = {
        stitches: Math.round(neededStitches), rows: Math.round(neededRows),
        targetWidth: values.targetWidth, targetHeight: values.targetHeight,
      };

      root.querySelector('#result-stitches').textContent = lastResult.stitches;
      root.querySelector('#result-rows').textContent = lastResult.rows;
      const per10 = (n, size) => Math.round((n / size) * 10 * 10) / 10;
      root.querySelector('#gauge-result-note').textContent =
        `10cm당 ${per10(values.sampleStitches, values.sampleWidth)}코 × ${per10(values.sampleRows, values.sampleHeight)}단`
        // 반올림한 값과 다를 때만 계산값을 같이 보여줌
        + (Math.abs(neededStitches - lastResult.stitches) > 0.05 || Math.abs(neededRows - lastResult.rows) > 0.05
          ? ` · 계산값 ${neededStitches.toFixed(1)}코, ${neededRows.toFixed(1)}단` : '');
      resultBox.classList.add('is-ready');
      if (saveBox) saveBox.hidden = false;
    }

    form.addEventListener('input', calc);

    const saveBtn = root.querySelector('[data-action="save-memo"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (!lastResult) return;
        const projectId = root.querySelector('#gauge-project-select').value;
        const project = Storage.getProject(projectId);
        if (!project) return;
        const note = `[게이지 계산] 목표 ${lastResult.targetWidth}x${lastResult.targetHeight}cm → ${lastResult.stitches}코 x ${lastResult.rows}단`;
        const memo = project.memo ? `${project.memo}\n${note}` : note;
        Storage.updateProject(projectId, { memo });
        showBanner('작품 메모에 저장했어요.');
      });
    }
  }

  // ---------- View: Abbreviation Dictionary ----------
  function renderAbbreviations() {
    setActiveTab('tools');
    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1 class="display-title">Abbreviations</h1>
        <button class="btn primary sm" data-action="new-abbr">+ Add</button>
      </header>
      <label class="field search-field"><input type="text" id="abbr-search" placeholder="약어, 설명 검색"></label>
      <div class="list" id="abbr-list-body"></div>
      <div class="list-footer-link" id="abbr-restore" hidden><a href="#" data-action="restore-defaults">기본 약어 복원</a></div>
    `;

    function renderBody() {
      const q = root.querySelector('#abbr-search').value.trim().toLowerCase();
      const list = Storage.getAbbreviations()
        .filter((a) => !q || a.term.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
        .sort((a, b) => a.term.localeCompare(b.term));
      const body = root.querySelector('#abbr-list-body');
      body.innerHTML = list.length === 0
        ? emptyState('약어가 없어요', '검색어를 바꾸거나 새 약어를 추가해보세요.')
        : list.map(abbrRow).join('');
      body.querySelectorAll('[data-edit-abbr]').forEach((btn) => {
        btn.addEventListener('click', () => openAbbrEditor(btn.dataset.editAbbr));
      });
      body.querySelectorAll('[data-delete-abbr]').forEach((btn) => {
        btn.addEventListener('click', () => deleteAbbr(btn.dataset.deleteAbbr));
      });
      root.querySelector('#abbr-restore').hidden = Storage.getMissingDefaultAbbreviations().length === 0;
    }

    async function openAbbrEditor(id) {
      const existing = id ? Storage.getAbbreviations().find((a) => a.id === id) : null;
      const res = await Modal.open({
        title: existing ? '약어 수정' : '약어 추가',
        bodyHtml: `
          <label class="field"><span>약어</span><input type="text" data-field="term" value="${existing ? Utils.escapeHtml(existing.term) : ''}" placeholder="예: k2tog"></label>
          <label class="field"><span>설명</span><input type="text" data-field="description" value="${existing ? Utils.escapeHtml(existing.description) : ''}" placeholder="예: 겉뜨기 2코 모아뜨기"></label>
        `,
        buttons: [{ id: 'cancel', label: 'Cancel', variant: 'ghost' }, { id: 'ok', label: 'Save', variant: 'primary' }],
      });
      if (res.id !== 'ok') return;
      const term = (res.values.term || '').trim();
      const description = (res.values.description || '').trim();
      if (!term || !description) {
        showBanner('약어와 설명을 모두 입력해주세요.', 'warn');
        return;
      }
      const dup = Storage.findAbbreviationByTerm(term, existing ? existing.id : null);
      if (dup) {
        showBanner('이미 등록된 약어예요.', 'warn');
        return;
      }
      if (existing) {
        Storage.updateAbbreviation(existing.id, { term, description });
        showBanner('약어를 수정했어요.');
      } else {
        Storage.createAbbreviation({ term, description });
        showBanner('약어를 추가했어요.');
      }
      renderBody();
    }

    async function deleteAbbr(id) {
      const ok = await Modal.confirm({
        title: '약어를 삭제할까요?',
        message: '기본 약어라면 나중에 "기본 약어 복원"으로 되살릴 수 있어요.',
        okLabel: 'Delete',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!ok) return;
      Storage.deleteAbbreviation(id);
      showBanner('약어를 삭제했어요.');
      renderBody();
    }

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());
    root.querySelector('[data-action="new-abbr"]').addEventListener('click', () => openAbbrEditor(null));
    root.querySelector('#abbr-search').addEventListener('input', renderBody);
    root.querySelector('[data-action="restore-defaults"]').addEventListener('click', (e) => {
      e.preventDefault();
      const restored = Storage.restoreDefaultAbbreviations();
      showBanner(restored.length ? `기본 약어 ${restored.length}개를 복원했어요.` : '복원할 기본 약어가 없어요.');
      renderBody();
    });

    renderBody();
  }

  function abbrRow(a) {
    return `
      <div class="counter-row">
        <div class="counter-row-main">
          <strong>${Utils.escapeHtml(a.term)}</strong>
          <span class="card-sub">${Utils.escapeHtml(a.description)}</span>
        </div>
        <div class="counter-row-controls">
          <button type="button" class="icon-btn sm display-text" data-edit-abbr="${a.id}">Edit</button>
          <button type="button" class="icon-btn sm display-text" data-delete-abbr="${a.id}">Delete</button>
        </div>
      </div>`;
  }

  // ---------- View: Backup ----------
  function renderBackup() {
    setActiveTab('tools');
    const settings = Storage.getSettings();
    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1 class="display-title">Backup</h1>
      </header>
      <div class="info-block backup-card">
        <h3>저장소 보호</h3>
        <p class="card-meta" id="persist-status">확인 중...</p>
      </div>
      <div class="info-block backup-card">
        <h3>내보내기</h3>
        <p class="card-meta">작품, 실, 도안, Favorites, 약어를 백업 파일(.json)로 저장해요. 마지막 백업: ${settings.lastBackupAt ? Utils.formatDateTime(settings.lastBackupAt) : '아직 없어요'}</p>
        <label class="field checkbox">
          <input type="checkbox" id="include-photos" checked>
          <span>작품·실 사진 포함</span>
        </label>
        <label class="field checkbox">
          <input type="checkbox" id="include-pattern-files" checked>
          <span>도안 파일(PDF·이미지) 포함</span>
        </label>
        <p class="card-meta">사진과 도안 파일을 넣으면 백업 파일이 커질 수 있어요. Ravelry API 키는 백업에 들어가지 않아요.</p>
        <button type="button" class="btn primary block" data-action="export">Export Data</button>
      </div>
      <div class="info-block backup-card">
        <h3>가져오기</h3>
        <p class="card-meta">백업 파일로 데이터를 되살려요. 지금 있는 데이터는 모두 파일 내용으로 바뀌어요.</p>
        <label class="btn ghost block">
          <input type="file" id="import-input" accept="application/json,.json" hidden>
          Choose Backup File
        </label>
      </div>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    requestPersistentStorage().then((persisted) => {
      const el = root.querySelector('#persist-status');
      if (!el) return;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      el.textContent = persisted === true
        ? '켜짐 · 브라우저가 이 앱의 데이터를 임의로 지우지 않아요.'
        : persisted === false
          ? `꺼짐 · 저장공간이 부족하면 브라우저가 데이터를 지울 수 있어요.${standalone ? '' : ' 홈 화면에 추가해서 쓰면 더 안전해요.'} 백업을 꼭 해두세요.`
          : `이 브라우저는 저장소 보호를 지원하지 않아요.${standalone ? '' : ' 홈 화면에 추가해서 쓰면 더 안전해요.'} 백업을 꼭 해두세요.`;
    });

    root.querySelector('[data-action="export"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const includePhotos = root.querySelector('#include-photos').checked;
      const includePatternFiles = root.querySelector('#include-pattern-files').checked;
      btn.disabled = true;
      btn.textContent = '백업 파일 만드는 중...';
      let payload;
      try {
        payload = await Storage.exportBackup(includePhotos, includePatternFiles);
      } catch (err) {
        console.error(err);
        showBanner('백업 파일을 만들지 못했어요.', 'warn');
        renderBackup();
        return;
      }
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      a.href = url;
      a.download = `knitting-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showBanner('백업 파일을 내보냈어요.');
      renderBackup();
    });

    root.querySelector('#import-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const proceed = await Modal.confirm({
        title: '데이터를 덮어쓸까요?',
        message: '가져오기를 하면 지금 있는 데이터가 모두 사라지고 파일 내용으로 바뀌어요. 걱정되면 취소하고 먼저 내보내기를 해두세요.',
        okLabel: 'Import',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!proceed) {
        e.target.value = '';
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const result = await Storage.importBackup(parsed);
        if (!result) {
          showBanner('백업 파일 형식이 올바르지 않아요.', 'warn');
          return;
        }
        showBanner(result.patternFilesRestored ? `데이터와 도안 파일 ${result.patternFilesRestored}개를 가져왔어요.` : '데이터를 가져왔어요.');
        go('#/');
      } catch (err) {
        console.error(err);
        showBanner('백업 파일을 읽을 수 없어요.', 'warn');
      } finally {
        e.target.value = '';
      }
    });
  }

  // ---------- View: Ravelry Settings ----------
  function renderRavelrySettings() {
    setActiveTab('tools');
    const settings = Storage.getSettings();
    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1 class="display-title">Ravelry</h1>
      </header>
      <div class="info-block">
        <p class="card-meta">
          실 정보를 Ravelry에서 불러오려면 개인용 API 키가 필요해요.
          아직 없다면 <a href="https://www.ravelry.com/pro/developer" target="_blank" rel="noopener">Ravelry 개발자 페이지</a>에서
          개인용 읽기 전용(read-only) 키를 발급받아 아래에 입력해주세요.
        </p>
      </div>
      <form id="ravelry-form" class="form">
        <label class="field">
          <span>API 액세스 키</span>
          <input type="text" name="ravelryKey" value="${Utils.escapeHtml(settings.ravelryKey || '')}" autocomplete="off">
        </label>
        <label class="field">
          <span>API 시크릿</span>
          <input type="password" name="ravelrySecret" value="${Utils.escapeHtml(settings.ravelrySecret || '')}" autocomplete="off">
        </label>
        <div class="form-actions">
          <button type="submit" class="btn primary block">Save</button>
          <button type="button" class="btn ghost block" data-action="test-connection">Test Connection</button>
        </div>
      </form>
      <p class="card-meta">이 앱은 Ravelry에서 만들거나 제휴·보증한 앱이 아니에요. 키와 시크릿은 이 기기에만 저장되고 Ravelry API 호출에만 사용돼요.</p>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    root.querySelector('#ravelry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      Storage.saveSettings({
        ravelryKey: String(fd.get('ravelryKey') || '').trim(),
        ravelrySecret: String(fd.get('ravelrySecret') || '').trim(),
      });
      showBanner('Ravelry 설정을 저장했어요.');
    });

    root.querySelector('[data-action="test-connection"]').addEventListener('click', async () => {
      const fd = new FormData(root.querySelector('#ravelry-form'));
      Storage.saveSettings({
        ravelryKey: String(fd.get('ravelryKey') || '').trim(),
        ravelrySecret: String(fd.get('ravelrySecret') || '').trim(),
      });
      try {
        await Ravelry.testConnection();
        showBanner('연결됐어요!');
      } catch (err) {
        showBanner(Ravelry.errorMessage(err), 'warn');
      }
    });
  }

  // ---------- View: Pattern List ----------
  const PATTERN_MAX_BYTES = 20 * 1024 * 1024;
  let currentPatternObjectUrl = null;

  function revokePatternObjectUrl() {
    if (currentPatternObjectUrl) {
      URL.revokeObjectURL(currentPatternObjectUrl);
      currentPatternObjectUrl = null;
    }
  }

  function renderPatternList(tab) {
    tab = ['saved', 'search'].includes(tab) ? tab : 'owned';
    setActiveTab('pattern');
    revokePatternObjectUrl();
    const patterns = Storage.getPatterns();
    const saved = Storage.getSavedPatterns();

    root.innerHTML = `
      <header class="page-header">
        <h1>Patterns</h1>
        <button class="btn primary sm" data-action="new-pattern">+ Add Pattern</button>
      </header>
      <div class="status-row" id="pattern-tab-switch">
        <button type="button" class="chip display-chip ${tab === 'owned' ? 'active' : ''}" data-tab="owned">Library</button>
        <button type="button" class="chip display-chip ${tab === 'saved' ? 'active' : ''}" data-tab="saved">Favorites</button>
        <button type="button" class="chip display-chip ${tab === 'search' ? 'active' : ''}" data-tab="search">Search</button>
      </div>
      <div class="list" id="pattern-tab-body"></div>
    `;

    root.querySelector('[data-action="new-pattern"]').addEventListener('click', () => go('#/pattern/new'));

    const body = root.querySelector('#pattern-tab-body');
    if (tab === 'owned') {
      body.innerHTML = patterns.length === 0
        ? emptyState('아직 등록한 도안이 없어요', '이미지나 PDF로 된 도안을 추가해보세요.')
        : patterns.map(patternCard).join('');
      body.querySelectorAll('[data-pattern-id]').forEach((el) => {
        el.addEventListener('click', (e) => {
          // Start Project 버튼은 링크 그대로 이동 (카드 클릭으로 도안 뷰어가 열리지 않게)
          if (e.target.closest('[data-start-project]')) return;
          go(`#/pattern/${el.dataset.patternId}`);
        });
      });
    } else if (tab === 'search') {
      renderPatternSearch(body);
    } else {
      body.innerHTML = saved.length === 0
        ? emptyState('Favorites가 비어 있어요', 'Search 탭에서 Ravelry 도안을 찾아 찜해보세요.')
        : saved.map(savedPatternCard).join('');
      body.querySelectorAll('[data-unfavorite]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // 카드 클릭(Ravelry 새 탭)으로 번지지 않게
          Storage.unfavoritePattern(btn.dataset.unfavorite);
          showBanner('찜을 해제했어요.');
          renderPatternList('saved');
        });
      });
      backfillFavoriteNeedles();
      // 카드를 누르면 Ravelry 도안 페이지를 새 탭으로 (하트, Start Project는 제외)
      body.querySelectorAll('[data-ravelry-url]').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-unfavorite], [data-start-project]')) return;
          window.open(card.dataset.ravelryUrl, '_blank', 'noopener');
        });
      });
    }

    root.querySelector('#pattern-tab-switch').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      go({ saved: '#/pattern/saved', search: '#/pattern/search' }[btn.dataset.tab] || '#/pattern');
    });
  }

  // Patterns > Search: Ravelry 도안 검색. 탭을 오가거나 Start Project 후 돌아와도 결과를 유지.
  const patternSearchState = { query: '', craft: '', freeOnly: false, items: [], page: 1, hasMore: false, searched: false };

  function renderPatternSearch(body) {
    if (!Ravelry.isConfigured()) {
      body.innerHTML = `
        <div class="info-block">
          <h3>Ravelry 연동이 필요해요</h3>
          <p class="card-meta">Ravelry API 키를 설정하면 도안을 검색하고 찜할 수 있어요.</p>
          <a class="btn primary sm" href="#/tools/ravelry">Go to Settings</a>
        </div>`;
      return;
    }
    const st = patternSearchState;
    body.innerHTML = `
      <div class="pattern-search">
      <label class="field search-field">
        <div class="input-with-action">
          <input type="search" id="pattern-query" value="${Utils.escapeHtml(st.query)}" placeholder="도안 이름, 디자이너 (예: cable hat)" enterkeyhint="search">
          <button type="button" class="btn ghost sm" data-action="search">Search</button>
        </div>
      </label>
      <div class="status-row" id="craft-filter">
        <button type="button" class="chip ${st.craft === '' ? 'active' : ''}" data-craft="">전체</button>
        <button type="button" class="chip ${st.craft === 'knitting' ? 'active' : ''}" data-craft="knitting">대바늘</button>
        <button type="button" class="chip ${st.craft === 'crochet' ? 'active' : ''}" data-craft="crochet">코바늘</button>
      </div>
      <label class="field checkbox"><input type="checkbox" id="free-only" ${st.freeOnly ? 'checked' : ''}><span>무료 도안만 보기</span></label>
      <div class="list results-list" id="pattern-results"></div>
      </div>
    `;

    const queryInput = body.querySelector('#pattern-query');
    const results = mountPatternResults(body.querySelector('#pattern-results'), (page) => Ravelry.searchPatterns({
      query: st.query, craft: st.craft, freeOnly: st.freeOnly, page,
    }), st);

    const search = () => {
      st.query = queryInput.value.trim();
      st.freeOnly = body.querySelector('#free-only').checked;
      if (!st.query) {
        showBanner('검색어를 입력해주세요.', 'warn');
        return;
      }
      results.run(true);
    };
    body.querySelector('[data-action="search"]').addEventListener('click', search);
    queryInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      search();
    });
    body.querySelector('#craft-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-craft]');
      if (!btn) return;
      st.craft = btn.dataset.craft;
      body.querySelectorAll('#craft-filter .chip').forEach((c) => c.classList.toggle('active', c === btn));
      if (st.query) search();
    });
    body.querySelector('#free-only').addEventListener('change', () => { if (st.query) search(); });
  }

  // Ravelry 도안 결과 목록 (Search 탭, 도안 추천 공용)
  // state: { items, page, hasMore, searched } — 바깥에서 들고 있어서 화면을 다시 그려도 결과가 남음
  function mountPatternResults(resultsEl, fetchPage, state) {
    const find = (id) => state.items.find((r) => String(r.id) === String(id));
    const favData = (p) => ({ ravelryPatternId: p.id, name: p.name, photoUrl: p.thumbnail, url: p.url, needleSize: p.needleSize });

    function render() {
      if (!state.items.length) {
        resultsEl.innerHTML = state.searched ? emptyState('검색 결과가 없어요', '검색어나 필터를 바꿔서 다시 찾아보세요.') : '';
        return;
      }
      resultsEl.innerHTML = state.items.map(patternResultCard).join('')
        + (state.hasMore ? '<button type="button" class="btn ghost block" data-action="load-more">Load More</button>' : '');

      resultsEl.querySelectorAll('[data-favorite]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // 카드 클릭(Ravelry 새 탭)으로 번지지 않게
          const pt = find(btn.dataset.favorite);
          if (!pt) return;
          if (Storage.isPatternSaved(pt.id)) {
            Storage.unfavoritePattern(pt.id);
            setHeart(btn, false);
            showBanner('찜을 해제했어요.');
          } else {
            Storage.saveFavoritePattern(favData(pt));
            setHeart(btn, true);
            showBanner('Favorites에 저장했어요.');
          }
        });
      });
      // Start Project: 아직 찜 안 한 도안이면 찜하고 시작 (작품에 Ravelry 링크로 연결됨)
      resultsEl.querySelectorAll('[data-start-favorite]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // 카드 클릭(Ravelry 새 탭)으로 번지지 않게
          const pt = find(btn.dataset.startFavorite);
          if (!pt) return;
          if (!Storage.isPatternSaved(pt.id)) Storage.saveFavoritePattern(favData(pt));
          go(`#/project/new/favorite/${pt.id}`);
        });
      });
      // 카드를 누르면 Ravelry 도안 페이지를 새 탭으로
      resultsEl.querySelectorAll('[data-ravelry-url]').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-favorite], [data-start-favorite]')) return;
          window.open(card.dataset.ravelryUrl, '_blank', 'noopener');
        });
      });
      const more = resultsEl.querySelector('[data-action="load-more"]');
      if (more) more.addEventListener('click', () => run(false));
    }

    async function run(reset) {
      const page = reset ? 1 : state.page + 1;
      if (reset) {
        resultsEl.innerHTML = '<p class="card-meta">찾는 중이에요...</p>';
      } else {
        const more = resultsEl.querySelector('[data-action="load-more"]');
        if (more) { more.disabled = true; more.textContent = '불러오는 중이에요...'; }
      }
      let res;
      try {
        res = await fetchPage(page);
      } catch (err) {
        if (reset) { state.items = []; state.searched = false; }
        render();
        showBanner(Ravelry.errorMessage(err), 'warn');
        return;
      }
      state.page = page;
      state.items = reset ? res.items : state.items.concat(res.items);
      state.hasMore = res.hasMore;
      state.searched = true;
      render();
    }

    render();
    return { run };
  }

  // 예전에 찜해서 바늘 정보가 없는 Favorites를 Ravelry에서 한 번 더 불러와 채움.
  // 한 번 확인한 도안은 needleChecked로 표시해서 (Ravelry에 바늘 정보가 없어도) 다시 부르지 않음.
  let favoriteNeedleBackfillRunning = false;
  async function backfillFavoriteNeedles() {
    if (favoriteNeedleBackfillRunning || !Ravelry.isConfigured() || !navigator.onLine) return;
    const missing = Storage.getSavedPatterns().filter((f) => !f.needleSize && !f.needleChecked);
    if (!missing.length) return;
    favoriteNeedleBackfillRunning = true;
    let filled = 0;
    try {
      for (const fav of missing) {
        try {
          const needleSize = await Ravelry.getPatternNeedles(fav.ravelryPatternId);
          Storage.updateFavoritePattern(fav.ravelryPatternId, { needleSize, needleChecked: true });
          if (needleSize) filled += 1;
        } catch (err) {
          // 네트워크·인증 오류는 표시하지 않고 다음에 다시 시도
          console.error(err);
          break;
        }
      }
    } finally {
      favoriteNeedleBackfillRunning = false;
    }
    // 아직 Favorites 탭을 보고 있으면 채운 정보로 다시 그림
    if (filled && currentRoute.name === 'pattern-list' && currentRoute.params.tab === 'saved') {
      renderPatternList('saved');
    }
  }

  // 찜 버튼: 찜하면 꽉 찬 하트, 아니면 빈 하트
  function heartButton(saved, attrs) {
    return `<button type="button" class="heart-btn ${saved ? 'is-saved' : ''}" ${attrs}
      aria-pressed="${saved}" aria-label="${saved ? '찜 해제' : '찜하기'}">${Icons.svg(saved ? 'heart' : 'heart-outline')}</button>`;
  }
  function setHeart(btn, saved) {
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', String(saved));
    btn.setAttribute('aria-label', saved ? '찜 해제' : '찜하기');
    btn.innerHTML = Icons.svg(saved ? 'heart' : 'heart-outline');
  }

  function savedPatternCard(p) {
    return `
      <div class="card pattern-card" data-ravelry-url="${Utils.escapeHtml(p.url)}">
        <div class="card-thumb">${p.photoUrl ? `<img src="${p.photoUrl}" alt="">` : `<div class="thumb-stitch is-pattern">${Icons.stitch('pattern', 0.4)}</div>`}</div>
        <div class="card-body">
          <div class="card-title-row">
            <h3>${Utils.escapeHtml(p.name)}</h3>
            ${heartButton(true, `data-unfavorite="${p.ravelryPatternId}"`)}
          </div>
          ${p.needleSize ? `<p class="card-meta">바늘 ${Utils.escapeHtml(p.needleSize)}</p>` : ''}
          <div class="counter-controls">
            <a class="btn primary sm display-btn" href="#/project/new/favorite/${p.ravelryPatternId}" data-start-project>Start Project</a>
          </div>
        </div>
      </div>`;
  }

  function patternCard(pt) {
    return `
      <div class="card pattern-card" data-pattern-id="${pt.id}">
        <div class="card-thumb"><div class="thumb-stitch is-pattern">${Icons.stitch('pattern', 0.4)}</div></div>
        <div class="card-body">
          <div class="card-title-row"><h3>${Utils.escapeHtml(pt.name)}</h3></div>
          ${pt.needleSize ? `<p class="card-meta">바늘 ${Utils.escapeHtml(pt.needleSize)}</p>` : ''}
          <div class="counter-controls">
            <a class="btn primary sm display-btn" href="#/project/new/pattern/${pt.id}" data-start-project>Start Project</a>
          </div>
        </div>
      </div>`;
  }

  // ---------- View: Pattern Upload Form ----------
  function renderPatternForm(id) {
    setActiveTab('pattern');
    const editing = !!id;
    const pattern = editing ? Storage.getPattern(id) : null;
    if (editing && !pattern) return go('#/pattern');

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        ${editing ? '<h1>도안 수정</h1>' : '<h1 class="display-title">New Pattern</h1>'}
      </header>
      <form id="pattern-form" class="form">
        <label class="field">
          <span>도안 이름 <em>*</em></span>
          <input type="text" name="name" value="${pattern ? Utils.escapeHtml(pattern.name) : ''}" placeholder="예: 겨울 목도리 도안">
          <p class="field-error" id="name-error" hidden>이름을 입력해주세요.</p>
        </label>
        <label class="field">
          <span>바늘 굵기</span>
          ${needleFieldHtml(pattern && pattern.needleSize)}
        </label>
        <div class="field">
          <span>도안 파일 <em>*</em></span>
          <label class="file-drop" id="file-drop">
            <input type="file" id="pattern-file" accept="image/jpeg,image/png,application/pdf" hidden>
            <div class="file-drop-empty">
              <div class="file-drop-icon">${Icons.stitch('pattern', 0.4)}</div>
              <strong>도안 파일 선택</strong>
              <div class="file-drop-hint">이미지(JPG, PNG) 또는 PDF · 최대 20MB</div>
            </div>
            <div class="file-drop-picked" hidden>
              <div class="file-drop-thumb"></div>
              <div class="file-drop-info">
                <strong class="file-drop-name"></strong>
                <div class="file-drop-meta"></div>
              </div>
              <div class="file-drop-change">변경</div>
            </div>
          </label>
          <p class="field-error" id="file-error" hidden></p>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn primary block" id="pattern-submit" ${editing ? '' : 'disabled'}>Save</button>
          ${editing ? '<button type="button" class="btn danger block" data-action="delete-pattern">Delete Pattern</button>' : ''}
        </div>
      </form>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    let pendingFile = null;
    let pendingMeta = null;

    const drop = root.querySelector('#file-drop');
    const emptyEl = drop.querySelector('.file-drop-empty');
    const pickedEl = drop.querySelector('.file-drop-picked');
    let previewUrl = null;

    function showPicked(file, metaText) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      drop.querySelector('.file-drop-thumb').innerHTML = previewUrl ? `<img src="${previewUrl}" alt="">` : Icons.stitch('pattern', 0.38);
      drop.querySelector('.file-drop-name').textContent = file.name;
      drop.querySelector('.file-drop-meta').textContent = metaText;
      emptyEl.hidden = true;
      pickedEl.hidden = false;
      drop.classList.add('has-file');
      // 이름을 아직 안 적었으면 파일 이름으로 채워줌
      const nameInput = root.querySelector('[name="name"]');
      if (!nameInput.value.trim()) nameInput.value = file.name.replace(/\.[^.]+$/, '');
    }

    function resetPicked() {
      emptyEl.hidden = false;
      pickedEl.hidden = true;
      drop.classList.remove('has-file');
    }

    const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);

    async function showCurrentFile() {
      if (!editing) return;
      const metaText = pattern.fileType === 'pdf'
        ? `PDF · ${pattern.pageCount}쪽 · ${formatSize(pattern.fileSize || 0)}`
        : `이미지 · ${formatSize(pattern.fileSize || 0)}`;
      drop.querySelector('.file-drop-thumb').innerHTML = Icons.stitch('pattern', 0.38);
      drop.querySelector('.file-drop-name').textContent = '지금 도안 파일';
      drop.querySelector('.file-drop-meta').textContent = metaText;
      emptyEl.hidden = true;
      pickedEl.hidden = false;
      drop.classList.add('has-file');
      if (pattern.fileType !== 'image') return;
      try {
        const blob = await FileStore.get(id);
        if (!blob || pendingFile) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        drop.querySelector('.file-drop-thumb').innerHTML = `<img src="${previewUrl}" alt="">`;
      } catch (err) { console.error(err); }
    }
    showCurrentFile();

    async function handleFile(file) {
      const errorEl = root.querySelector('#file-error');
      const submitBtn = root.querySelector('#pattern-submit');
      errorEl.hidden = true;
      // 수정할 때는 파일을 안 바꿔도 저장 가능
      submitBtn.disabled = !editing;
      pendingFile = null;
      pendingMeta = null;
      resetPicked();
      if (!file) { showCurrentFile(); return; }

      if (file.size > PATTERN_MAX_BYTES) {
        errorEl.textContent = '파일이 너무 커요. 20MB 이하로 올려주세요.';
        errorEl.hidden = false;
        showCurrentFile();
        return;
      }

      if (file.type === 'application/pdf') {
        try {
          const buf = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          pendingFile = file;
          pendingMeta = { fileType: 'pdf', fileSize: file.size, pageCount: pdf.numPages };
          submitBtn.disabled = false;
          showPicked(file, `PDF · ${pdf.numPages}쪽 · ${formatSize(file.size)}`);
        } catch (err) {
          console.error(err);
          errorEl.textContent = '이 PDF를 열 수 없어요. 암호가 걸려있거나 손상된 파일일 수 있어요.';
          errorEl.hidden = false;
          showCurrentFile();
        }
      } else if (file.type === 'image/jpeg' || file.type === 'image/png') {
        pendingFile = file;
        pendingMeta = { fileType: 'image', fileSize: file.size, pageCount: 1 };
        submitBtn.disabled = false;
        showPicked(file, `이미지 · ${formatSize(file.size)}`);
      } else {
        errorEl.textContent = '이미지(JPG, PNG) 또는 PDF 파일만 올릴 수 있어요.';
        errorEl.hidden = false;
        showCurrentFile();
      }
    }

    root.querySelector('#pattern-file').addEventListener('change', (e) => {
      handleFile(e.target.files && e.target.files[0]);
    });
    // PC에서는 끌어다 놓기도 됨
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-dragover');
      handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    viewCleanup = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };

    root.querySelector('#pattern-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get('name') || '').trim();
      const nameError = root.querySelector('#name-error');
      if (!name) {
        nameError.hidden = false;
        return;
      }
      nameError.hidden = true;
      const needleSize = String(fd.get('needleSize') || '').trim();

      if (editing) {
        if (pendingFile && pendingMeta) {
          await FileStore.put(id, pendingFile);
          // 새 파일 쪽수가 줄었으면, 그보다 뒤쪽에 있던 하이라이트 위치는 첫 쪽으로
          Storage.getProjectsLinkedToPattern(id).forEach((proj) => {
            if (proj.highlight && proj.highlight.page > pendingMeta.pageCount) {
              Storage.saveProjectHighlight(proj.id, { ...proj.highlight, page: 1, y: 0.5 });
            }
          });
        }
        Storage.updatePattern(id, { name, needleSize, ...(pendingMeta || {}) });
        showBanner('도안을 수정했어요.');
        history.back();
        return;
      }

      if (!pendingFile || !pendingMeta) return;
      const created = Storage.createPattern({ name, needleSize, ...pendingMeta });
      await FileStore.put(created.id, pendingFile);
      showBanner('도안을 추가했어요.');
      go(`#/pattern/${created.id}`);
    });

    const deleteBtn = root.querySelector('[data-action="delete-pattern"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const linked = Storage.getProjectsLinkedToPattern(id);
        const ok = await Modal.confirm(linked.length ? {
          title: '연결된 작품이 있어요',
          message: `${linked.map((proj) => proj.name).join(', ')}에서 이 도안을 보고 있어요. 삭제하면 연결도 함께 풀려요.`,
          okLabel: 'Delete',
          cancelLabel: 'Cancel',
          danger: true,
        } : {
          title: '도안을 삭제할까요?',
          message: '삭제한 도안 파일은 되돌릴 수 없어요.',
          okLabel: 'Delete',
          cancelLabel: 'Cancel',
          danger: true,
        });
        if (!ok) return;
        Storage.deletePattern(id);
        await FileStore.remove(id);
        showBanner('도안을 삭제했어요.');
        go('#/pattern');
      });
    }
  }

  // ---------- View: Pattern Viewer ----------
  // 하이라이트 줄 색: 디자인 시스템 팔레트에서 5가지 (fill은 반투명, line은 위아래 테두리)
  const HIGHLIGHT_COLORS = [
    { id: 'slate', label: '슬레이트 블루', fill: 'rgba(62,101,119,.22)', line: '#3E6577' },
    { id: 'butter', label: '버터 노랑', fill: 'rgba(232,185,49,.32)', line: '#C9971A' },
    { id: 'mint', label: '민트', fill: 'rgba(94,140,110,.25)', line: '#5E8C6E' },
    { id: 'brick', label: '벽돌', fill: 'rgba(192,65,59,.2)', line: '#C0413B' },
    { id: 'label', label: '라벨 블루', fill: 'rgba(46,123,176,.22)', line: '#2E7BB0' },
  ];

  function renderPatternViewer(patternId, projectId) {
    setActiveTab('pattern');
    revokePatternObjectUrl();
    const pattern = Storage.getPattern(patternId);
    if (!pattern) return go('#/pattern');
    const project = projectId ? Storage.getProject(projectId) : null;
    const initial = (project && project.highlight) || { page: 1, y: 0.5, barThickness: 40 };
    const projectCounters = project ? Storage.getCountersByProject(project.id) : [];
    const viewerCounter = projectCounters.find((c) => c.isDefault) || projectCounters[0] || null;
    let highlightColorId = Storage.getSettings().highlightColor || 'slate';

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>${Utils.escapeHtml(pattern.name)}</h1>
        ${project ? '' : `<a class="btn primary sm display-btn" href="#/project/new/pattern/${patternId}">Start Project</a>`}
        <a class="icon-btn display-text" href="#/pattern/${patternId}/edit">Edit</a>
      </header>
      <div class="pattern-toolbar">
        <div class="pattern-toolbar-group">
          <button type="button" class="icon-btn" data-action="zoom-out">−</button>
          <span id="zoom-label">100%</span>
          <button type="button" class="icon-btn" data-action="zoom-in">+</button>
        </div>
        ${pattern.fileType === 'pdf' ? `
          <div class="pattern-toolbar-group">
            <button type="button" class="icon-btn" data-action="prev-page">‹</button>
            <span id="page-label">${initial.page} / ${pattern.pageCount}</span>
            <button type="button" class="icon-btn" data-action="next-page">›</button>
          </div>` : ''}
      </div>
      <div class="pattern-viewport" id="pattern-viewport">
        <div class="pattern-content" id="pattern-content">
          ${pattern.fileType === 'image' ? '<img id="pattern-surface" alt="">' : '<canvas id="pattern-surface"></canvas>'}
          <div class="highlight-bar" id="highlight-bar"></div>
        </div>
      </div>
      <div class="pattern-toolbar">
        <div class="pattern-toolbar-group">
          <span class="t-caption">두께</span>
          <input type="range" id="thickness-range" min="6" max="120" step="2" value="${initial.barThickness}">
        </div>
        <div class="pattern-toolbar-group highlight-swatches" role="radiogroup" aria-label="하이라이트 색">
          ${HIGHLIGHT_COLORS.map((c) => `
            <button type="button" class="swatch" role="radio" data-highlight-color="${c.id}" aria-label="${c.label}"
              aria-checked="${c.id === highlightColorId ? 'true' : 'false'}" style="--swatch:${c.line}"></button>`).join('')}
        </div>
        <div class="pattern-toolbar-group">
          <button type="button" class="icon-btn" data-action="move-up">▲</button>
          <button type="button" class="icon-btn" data-action="move-down">▼</button>
        </div>
      </div>
      ${viewerCounter ? '<div id="viewer-counter-slot"></div>' : ''}
      ${!project ? `<p class="card-meta" style="text-align:center;margin-top:8px">작품에 연결하면 하이라이트 위치가 저장되고 단수 카운터를 같이 쓸 수 있어요.</p>` : ''}
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    // 도안을 보면서 단수 세기: 사용자가 "+ 단수 카운터"로 추가한 작품에서만 보여줌.
    // 화면 전체를 다시 그리면 도안을 다시 불러오므로 카운터 자리만 다시 그림.
    const counterSlot = root.querySelector('#viewer-counter-slot');
    function renderCounterDock() {
      if (!counterSlot) return;
      if (!isCounterOn(Storage.getProject(project.id))) {
        counterSlot.innerHTML = '<button type="button" class="btn ghost block viewer-add-counter" data-action="enable-counter">+ Row Counter</button>';
        counterSlot.querySelector('[data-action="enable-counter"]').addEventListener('click', () => {
          Storage.updateProject(project.id, { counterEnabled: true });
          renderCounterDock();
        });
        return;
      }
      const current = () => Storage.getCountersByProject(project.id).find((c) => c.id === viewerCounter.id);
      counterSlot.innerHTML = `
        <div class="viewer-counter" data-counter-id="${viewerCounter.id}">
          <button type="button" class="btn ghost" data-action="viewer-minus" aria-label="한 단 빼기">-1</button>
          <div class="viewer-counter-value">
            <span class="viewer-counter-num" id="viewer-counter-num">${Icons.stitchNumber((current() || viewerCounter).value, 0.3)}</span>
            <span class="viewer-counter-name">${Utils.escapeHtml(project.name)} · ${Utils.escapeHtml(viewerCounter.name)}</span>
          </div>
          <button type="button" class="btn primary viewer-plus" data-action="viewer-plus" aria-label="한 단 추가">+1</button>
          <button type="button" class="icon-btn sm viewer-counter-close" data-action="disable-counter" aria-label="단수 카운터 숨기기">×</button>
        </div>`;
      const numEl = counterSlot.querySelector('#viewer-counter-num');
      const refreshCount = () => {
        const fresh = current();
        if (fresh) numEl.innerHTML = Icons.stitchNumber(fresh.value, 0.3);
        return fresh;
      };
      const bump = (delta) => {
        const fresh = refreshCount();
        if (!fresh) return;
        if (delta < 0 && fresh.value <= 0) return;
        changeCounter(fresh, delta, project.id);
        refreshCount();
        moveBarByRows(delta);
        // 주기 자동 리셋은 900ms 뒤에 일어나서 한 번 더 갱신
        if (fresh.autoReset) setTimeout(refreshCount, 950);
      };
      counterSlot.querySelector('[data-action="viewer-plus"]').addEventListener('click', () => {
        if (!canTap(viewerCounter.id)) return;
        bump(1);
      });
      counterSlot.querySelector('[data-action="viewer-minus"]').addEventListener('click', () => bump(-1));
      // 숨겨도 센 단수는 그대로 남음
      counterSlot.querySelector('[data-action="disable-counter"]').addEventListener('click', () => {
        Storage.updateProject(project.id, { counterEnabled: false });
        renderCounterDock();
      });
    }
    renderCounterDock();

    // zoom is relative to "fit to viewport width" (1 = 100% = fills the width),
    // so the pattern opens at a readable size on phones and tablets alike and
    // stays fitted when an iPad is rotated.
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 4;
    let zoom = 1;
    let page = initial.page;
    let y = initial.y;
    let thickness = initial.barThickness;
    let baseWidth = 0;
    let baseHeight = 0;
    let pdfDoc = null;
    let blobRef = null;

    const viewport = root.querySelector('#pattern-viewport');
    const content = root.querySelector('#pattern-content');
    const bar = root.querySelector('#highlight-bar');

    function applyHighlightColor() {
      const c = HIGHLIGHT_COLORS.find((h) => h.id === highlightColorId) || HIGHLIGHT_COLORS[0];
      bar.style.setProperty('--hl-fill', c.fill);
      bar.style.setProperty('--hl-line', c.line);
      root.querySelectorAll('[data-highlight-color]').forEach((b) => {
        b.setAttribute('aria-checked', b.dataset.highlightColor === c.id ? 'true' : 'false');
      });
    }
    root.querySelectorAll('[data-highlight-color]').forEach((b) => {
      b.addEventListener('click', () => {
        highlightColorId = b.dataset.highlightColor;
        Storage.saveSettings({ highlightColor: highlightColorId });
        applyHighlightColor();
      });
    });
    applyHighlightColor();

    function persist() {
      if (!project) return;
      Storage.saveProjectHighlight(project.id, { page, y, barThickness: thickness });
    }

    // CSS px per source px at the current zoom.
    function displayScale() {
      if (!baseWidth) return 1;
      return (viewport.clientWidth / baseWidth) * zoom;
    }

    function layoutBar() {
      // content is laid out at its real zoomed pixel size (width/height set
      // directly, not via CSS transform) so the parent viewport's overflow/
      // scroll works correctly at any zoom level. Bar top/height are in that
      // same zoomed pixel space.
      const zoomedHeight = baseHeight * displayScale();
      bar.style.height = `${thickness}px`;
      bar.style.top = `${Math.max(0, Math.min(zoomedHeight - thickness, y * zoomedHeight - thickness / 2))}px`;
    }

    function applyZoom() {
      const scale = displayScale();
      content.style.width = `${baseWidth * scale}px`;
      content.style.height = `${baseHeight * scale}px`;
      root.querySelector('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
      layoutBar();
    }

    // Zoom while keeping the pattern point under (clientX, clientY) in place —
    // the pinch midpoint, or the viewport center for the +/− buttons.
    function zoomTo(nextZoom, clientX, clientY) {
      if (!baseWidth) return;
      const rect = viewport.getBoundingClientRect();
      const ax = (clientX === undefined ? rect.left + rect.width / 2 : clientX) - rect.left - viewport.clientLeft;
      const ay = (clientY === undefined ? rect.top + rect.height / 2 : clientY) - rect.top - viewport.clientTop;
      const prevScale = displayScale();
      const px = (viewport.scrollLeft + ax) / prevScale;
      const py = (viewport.scrollTop + ay) / prevScale;
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      applyZoom();
      const scale = displayScale();
      viewport.scrollLeft = px * scale - ax;
      viewport.scrollTop = py * scale - ay;
    }

    function scrollToBar() {
      const zoomedHeight = baseHeight * displayScale();
      viewport.scrollTop = Math.max(0, y * zoomedHeight - viewport.clientHeight / 2);
    }

    async function renderImagePage(blob) {
      revokePatternObjectUrl();
      currentPatternObjectUrl = URL.createObjectURL(blob);
      const img = root.querySelector('#pattern-surface');
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = currentPatternObjectUrl;
      });
      baseWidth = img.naturalWidth;
      baseHeight = img.naturalHeight;
      applyZoom();
    }

    async function renderPdfPage(blob) {
      if (!pdfDoc) {
        const buf = await blob.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
      }
      const pdfPage = await pdfDoc.getPage(page);
      // Render sharp enough for the fitted view on retina screens (iPad) with
      // headroom for zooming in, but under iOS Safari's canvas pixel cap.
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const wanted = Math.max(2, (viewport.clientWidth * dpr * 1.5) / unscaled.width);
      const maxScale = Math.sqrt(12e6 / (unscaled.width * unscaled.height));
      const pageViewport = pdfPage.getViewport({ scale: Math.min(wanted, maxScale) });
      const canvas = root.querySelector('#pattern-surface');
      canvas.width = pageViewport.width;
      canvas.height = pageViewport.height;
      const ctx = canvas.getContext('2d');
      await pdfPage.render({ canvasContext: ctx, viewport: pageViewport }).promise;
      baseWidth = pageViewport.width;
      baseHeight = pageViewport.height;
      const label = root.querySelector('#page-label');
      if (label) label.textContent = `${page} / ${pattern.pageCount}`;
      applyZoom();
    }

    root.querySelector('[data-action="zoom-in"]').addEventListener('click', () => {
      zoomTo(+(zoom + 0.25).toFixed(2));
    });
    root.querySelector('[data-action="zoom-out"]').addEventListener('click', () => {
      zoomTo(+(zoom - 0.25).toFixed(2));
    });

    // Two-finger pinch zooms the pattern only, not the whole page.
    let pinch = null;
    const touchDistance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) pinch = { distance: touchDistance(e.touches), zoom };
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      zoomTo(pinch.zoom * (touchDistance(e.touches) / pinch.distance), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    }, { passive: false });
    viewport.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
    });
    // Safari fires its own gesture events for pinch; stop them zooming the page.
    viewport.addEventListener('gesturestart', (e) => e.preventDefault());

    // Re-fit when the viewport changes size (iPad rotation, split view).
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(() => {
        if (!baseWidth || !viewport.clientWidth) return;
        // Keep the same spot of the pattern on screen across the re-fit.
        const ratio = viewport.scrollTop / (viewport.scrollHeight || 1);
        applyZoom();
        viewport.scrollTop = ratio * viewport.scrollHeight;
      });
      resizeObserver.observe(viewport);
      viewCleanup = () => resizeObserver.disconnect();
    }

    if (pattern.fileType === 'pdf') {
      root.querySelector('[data-action="prev-page"]').addEventListener('click', async () => {
        if (!blobRef || page <= 1) return;
        page -= 1;
        y = 0.5;
        await renderPdfPage(blobRef);
        scrollToBar();
        persist();
      });
      root.querySelector('[data-action="next-page"]').addEventListener('click', async () => {
        if (!blobRef || page >= pattern.pageCount) return;
        page += 1;
        y = 0.5;
        await renderPdfPage(blobRef);
        scrollToBar();
        persist();
      });
    }

    content.addEventListener('click', (e) => {
      if (!baseHeight) return;
      const rect = content.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      y = Math.max(0, Math.min(1, offsetY / (baseHeight * displayScale())));
      layoutBar();
      persist();
    });

    // 뜨개 차트는 아래에서 위로 읽음: 단수 +1 → 줄이 한 칸(=줄 두께) 위로, -1 → 아래로
    function moveBarByRows(rows) {
      if (!baseHeight) return;
      const zoomedHeight = baseHeight * displayScale();
      y = Math.max(0, Math.min(1, y - (rows * thickness) / zoomedHeight));
      layoutBar();
      persist();
      // 줄이 화면 밖으로 나가면 따라가기
      const barTop = parseFloat(bar.style.top) || 0;
      if (barTop < viewport.scrollTop || barTop + thickness > viewport.scrollTop + viewport.clientHeight) {
        scrollToBar();
      }
    }

    const STEP = 0.02;
    root.querySelector('[data-action="move-up"]').addEventListener('click', () => {
      y = Math.max(0, y - STEP);
      layoutBar();
      persist();
    });
    root.querySelector('[data-action="move-down"]').addEventListener('click', () => {
      y = Math.min(1, y + STEP);
      layoutBar();
      persist();
    });

    root.querySelector('#thickness-range').addEventListener('input', (e) => {
      thickness = Number(e.target.value);
      layoutBar();
      persist();
    });

    FileStore.get(pattern.id).then(async (blob) => {
      if (!blob) {
        showBanner('도안 파일을 찾을 수 없어요.', 'warn');
        return;
      }
      blobRef = blob;
      if (pattern.fileType === 'image') await renderImagePage(blob);
      else await renderPdfPage(blob);
      // Reopen right where the saved highlight is.
      scrollToBar();
    });
  }

  // ---------- View: Pattern Recommendation ----------
  function renderPatternRecommend(yarnId) {
    setActiveTab('pattern');
    const yarn = Storage.getYarn(yarnId);
    if (!yarn) return go('#/yarn');

    if (!yarn.weight || !yarn.lengthPerBall) {
      root.innerHTML = `
        <header class="page-header with-back">
          <button class="icon-btn" data-action="back">←</button>
          <h1>도안 추천</h1>
        </header>
        ${emptyState('굵기와 볼당 길이가 필요해요', '실 정보에 굵기와 볼당 길이를 먼저 입력해주세요.')}
        <div class="form-actions">
          <a class="btn primary block" href="#/yarn/${yarnId}">Edit Yarn Info</a>
        </div>
      `;
      root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());
      return;
    }

    const ballsOwned = yarnUnitOf(yarn) === 'g'
      ? (yarn.weightPerBall ? (yarn.amount || 0) / yarn.weightPerBall : 0)
      : (yarn.amount || 0);
    const availableMeters = Math.round(ballsOwned * yarn.lengthPerBall);

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>도안 추천</h1>
      </header>
      <div class="info-block">
        <h3>${Utils.escapeHtml(yarn.name)}</h3>
        <p class="card-meta">${Utils.escapeHtml(yarn.weight)} · 보유 ${availableMeters}m (도안마다 필요한 실 양을 함께 보여드려요)</p>
        <p class="card-meta">${yarn.ravelryYarnId
          ? 'Ravelry에 연결된 실이라 이 실로 만든 도안을 우선 보여줘요.'
          : '이 실은 Ravelry에 연결돼 있지 않아서 굵기로 찾아요.'} 인기순으로 정렬돼요.</p>
      </div>
      <div class="status-row wrap" id="pattern-type-filter">
        <button type="button" class="chip active" data-type="">전체 종류</button>
        ${Ravelry.PATTERN_TYPES.map((t) => `<button type="button" class="chip" data-type="${t.en}">${t.ko}</button>`).join('')}
      </div>
      <div class="status-row" id="craft-filter">
        <button type="button" class="chip active" data-craft="">전체</button>
        <button type="button" class="chip" data-craft="knitting">대바늘</button>
        <button type="button" class="chip" data-craft="crochet">코바늘</button>
      </div>
      <label class="field checkbox"><input type="checkbox" id="free-only"><span>무료 도안만 보기</span></label>
      <div class="form-actions">
        <button type="button" class="btn primary block" data-action="search">Find Patterns</button>
      </div>
      <div class="list results-list" id="pattern-results"></div>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    let activeType = '';
    let activeCraft = '';

    root.querySelector('#pattern-type-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      activeType = btn.dataset.type;
      root.querySelectorAll('#pattern-type-filter .chip').forEach((c) => c.classList.toggle('active', c === btn));
    });
    root.querySelector('#craft-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-craft]');
      if (!btn) return;
      activeCraft = btn.dataset.craft;
      root.querySelectorAll('#craft-filter .chip').forEach((c) => c.classList.toggle('active', c === btn));
    });

    const results = mountPatternResults(root.querySelector('#pattern-results'), (page) => Ravelry.searchPatterns({
      typeTerm: activeType,
      weight: yarn.weight,
      craft: activeCraft,
      freeOnly: root.querySelector('#free-only').checked,
      ravelryYarnId: yarn.ravelryYarnId,
      page,
    }), { items: [], page: 1, hasMore: false, searched: false });

    root.querySelector('[data-action="search"]').addEventListener('click', () => results.run(true));
  }

  function patternResultCard(p) {
    const saved = Storage.isPatternSaved(p.id);
    const yardageText = p.metersMin
      ? (p.metersMax && p.metersMax !== p.metersMin ? `${p.metersMin}~${p.metersMax}m 필요` : `약 ${p.metersMin}m 필요`)
      : '필요 실 양 정보 없음';
    return `
      <div class="card" data-ravelry-url="${Utils.escapeHtml(p.url)}">
        <div class="card-thumb">${p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : `<div class="thumb-stitch is-pattern">${Icons.stitch('pattern', 0.4)}</div>`}</div>
        <div class="card-body">
          <div class="card-title-row">
            <h3>${Utils.escapeHtml(p.name)}</h3>
            ${heartButton(saved, `data-favorite="${p.id}"`)}
          </div>
          <p class="card-sub">${Utils.escapeHtml(p.designer)} · ${p.free ? '무료' : '유료'}</p>
          <p class="card-meta">${[yardageText, p.needleSize && `바늘 ${Utils.escapeHtml(p.needleSize)}`].filter(Boolean).join(' · ')}</p>
          <div class="counter-controls">
            <button type="button" class="btn primary sm display-btn" data-start-favorite="${p.id}">Start Project</button>
          </div>
        </div>
      </div>`;
  }

  // ---------- View: Project Form (create/edit) ----------
  // 도안 → 작품 시작 정보: Library 도안(파일) 또는 Favorites(Ravelry 링크)
  function patternSource(from) {
    if (!from) return null;
    if (from.kind === 'pattern') {
      const pt = Storage.getPattern(from.id);
      return pt ? { kind: 'pattern', key: `pattern:${pt.id}`, name: pt.name, needleSize: pt.needleSize || '', patternId: pt.id } : null;
    }
    if (from.kind === 'favorite') {
      const fav = Storage.getSavedPatterns().find((f) => String(f.ravelryPatternId) === String(from.id));
      return fav ? {
        kind: 'favorite', key: `favorite:${fav.ravelryPatternId}`, name: fav.name, needleSize: fav.needleSize || '',
        ravelryPattern: { id: fav.ravelryPatternId, name: fav.name, url: fav.url },
      } : null;
    }
    return null;
  }

  function renderProjectForm(id, from) {
    const editing = !!id;
    const project = editing ? Storage.getProject(id) : null;
    if (editing && !project) return go('#/');
    let source = editing ? null : patternSource(from);
    // 도안에서 시작하면 보통 "나중에 뜰 것"이라 CO Waiting List가 기본
    let status = source ? 'onhold' : 'active';
    let pickedYarns = []; // New Project에서 고른 실: { yarnId } (사용량은 나중에 기록)

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        ${editing ? '<h1>작품 수정</h1>' : '<h1 class="display-title">New Project</h1>'}
      </header>
      <form id="project-form" class="form">
        ${editing ? '' : `
          <div class="field">
            <span>도안</span>
            <div id="pattern-source"></div>
          </div>
          <div class="field">
            <span>상태</span>
            <div class="status-row project-status" id="new-status">
              <button type="button" class="chip display-chip" data-new-status="onhold">CO Waiting List</button>
              <button type="button" class="chip display-chip" data-new-status="active">WIP</button>
            </div>
          </div>`}
        <label class="field">
          <span>작품명 <em>*</em></span>
          <input type="text" name="name" value="${project ? Utils.escapeHtml(project.name) : ''}" placeholder="예: 겨울 목도리">
          <p class="field-error" id="name-error" hidden>작품명을 입력해주세요.</p>
        </label>
        <label class="field" id="start-date-field">
          <span>시작일</span>
          <input type="date" name="startDate" value="${project ? (project.startDate || '') : Utils.todayStr()}">
        </label>
        ${editing ? `
          <label class="field">
            <span>사용 실</span>
            <input type="text" name="yarnText" value="${Utils.escapeHtml(project.yarnText)}" placeholder="예: 코스모스 그레이 3볼">
          </label>` : `
          <div class="field">
            <span>사용 실</span>
            <div id="yarn-picks"></div>
            <input type="text" name="yarnText" placeholder="보관함에 없는 실 직접 입력">
          </div>`}
        <label class="field">
          <span>바늘 호수</span>
          ${needleFieldHtml(project && project.needleSize)}
        </label>
        <label class="field">
          <span>메모</span>
          <textarea name="memo" rows="4" placeholder="게이지, 패턴 메모 등">${project ? Utils.escapeHtml(project.memo) : ''}</textarea>
        </label>
        <div class="field">
          <span>진행 사진</span>
          <div class="photo-grid" id="photo-grid">
            ${(project && project.photos || []).map((src, i) => photoThumb(src, i)).join('')}
            <label class="photo-add">
              <input type="file" id="photo-input" accept="image/*" multiple hidden>
              <span>+</span>
            </label>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn primary block">Save</button>
          ${editing ? `<button type="button" class="btn danger block" data-action="delete">Delete Project</button>` : ''}
        </div>
      </form>
    `;

    let photos = project ? [...(project.photos || [])] : [];

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    if (!editing) {
      const sourceEl = root.querySelector('#pattern-source');
      const statusRow = root.querySelector('#new-status');

      const renderStatus = () => {
        statusRow.querySelectorAll('[data-new-status]').forEach((b) => b.classList.toggle('active', b.dataset.newStatus === status));
        // 아직 코를 안 잡았으면 시작일은 Cast On 할 때 기록
        root.querySelector('#start-date-field').hidden = status === 'onhold';
      };
      statusRow.addEventListener('click', (e) => {
        const b = e.target.closest('[data-new-status]');
        if (!b) return;
        status = b.dataset.newStatus;
        renderStatus();
      });

      const renderSource = () => {
        sourceEl.innerHTML = source ? `
          <ul class="link-list source-card">
            <li class="link-item">
              <div class="link-item-main">
                <span class="link-item-name">${Utils.escapeHtml(source.name)}</span>
                <span class="link-item-meta">${source.kind === 'pattern' ? 'Library' : 'Favorites · Ravelry'}${source.needleSize ? ` · 바늘 ${Utils.escapeHtml(source.needleSize)}` : ''}</span>
              </div>
              <button type="button" class="text-btn primary" data-action="pick-pattern">Change</button>
              <button type="button" class="text-btn" data-action="clear-pattern">Remove</button>
            </li>
          </ul>`
          : '<button type="button" class="btn ghost block display-font" data-action="pick-pattern">Choose Pattern</button>';
        sourceEl.querySelectorAll('[data-action="pick-pattern"]').forEach((b) => b.addEventListener('click', pickPattern));
        const clearBtn = sourceEl.querySelector('[data-action="clear-pattern"]');
        if (clearBtn) clearBtn.addEventListener('click', () => { source = null; renderSource(); });
      };

      // 도안을 고르면 이름·바늘을 채움 (이미 적어둔 값은 overwrite일 때만 덮어씀)
      const applySource = (next, overwrite) => {
        const prev = source;
        source = next;
        const nameInput = root.querySelector('[name="name"]');
        const needleInput = root.querySelector('[name="needleSize"]');
        const wasAuto = (input, key) => prev && input.value.trim() === (prev[key] || '');
        if (overwrite || !nameInput.value.trim() || wasAuto(nameInput, 'name')) nameInput.value = next.name;
        if (next.needleSize && (overwrite || !needleInput.value.trim() || wasAuto(needleInput, 'needleSize'))) setNeedleValue(needleInput, next.needleSize);
        renderSource();
      };

      async function pickPattern() {
        const library = Storage.getPatterns();
        const favorites = Storage.getSavedPatterns();
        if (!library.length && !favorites.length) {
          showBanner('Library나 Favorites에 도안이 없어요.', 'warn');
          return;
        }
        const picked = await Modal.pick({
          title: 'Choose Pattern',
          placeholder: '도안 이름으로 찾기',
          sections: [
            { label: 'Library', items: libraryPickItems() },
            { label: 'Favorites', items: favoritePickItems() },
          ],
        });
        if (!picked) return;
        const [kind, ...rest] = String(picked).split(':');
        const next = patternSource({ kind, id: rest.join(':') });
        if (next) applySource(next, false);
      }

      renderStatus();
      if (source) applySource(source, true); else renderSource();

      // 사용 실: 실 보관함에서 골라 연결 (저장할 때 보유량에서 사용할 볼 수만큼 빠짐)
      const yarnPicksEl = root.querySelector('#yarn-picks');
      const renderYarnPicks = () => {
        const rows = pickedYarns.map((pick) => {
          const y = Storage.getYarn(pick.yarnId);
          if (!y) return '';
          const meta = [y.color, y.weight, `보유 ${formatYarnAmount(y.amount, yarnUnitOf(y))}`].filter(Boolean).join(' · ');
          return `
            <li class="link-item">
              <div class="link-item-main">
                <span class="link-item-name">${Utils.escapeHtml(y.name)}</span>
                <span class="link-item-meta">${Utils.escapeHtml(meta)}</span>
              </div>
              <button type="button" class="text-btn" data-unpick-yarn="${pick.yarnId}">Remove</button>
            </li>`;
        }).join('');
        yarnPicksEl.innerHTML = (rows ? `<ul class="link-list source-card">${rows}</ul>` : '')
          + '<button type="button" class="btn ghost block display-font" data-action="pick-yarn">+ Choose Yarn</button>';
        yarnPicksEl.querySelectorAll('[data-unpick-yarn]').forEach((b) => b.addEventListener('click', () => {
          pickedYarns = pickedYarns.filter((x) => x.yarnId !== b.dataset.unpickYarn);
          renderYarnPicks();
        }));
        yarnPicksEl.querySelector('[data-action="pick-yarn"]').addEventListener('click', pickYarn);
      };

      async function pickYarn() {
        const available = Storage.getYarns().filter((y) => !pickedYarns.some((x) => x.yarnId === y.id));
        if (!available.length) {
          showBanner(Storage.getYarns().length ? '더 고를 수 있는 실이 없어요.' : '실 보관함에 실이 없어요. Yarn 탭에서 먼저 추가해주세요.', 'warn');
          return;
        }
        const picked = await Modal.pick({
          title: 'Choose Yarn',
          placeholder: '이름, 색상, 굵기로 찾기',
          sections: [{ label: 'Yarn', items: yarnPickItems(available) }],
        });
        if (!picked) return;
        pickedYarns.push({ yarnId: picked });
        renderYarnPicks();
      }

      renderYarnPicks();
    }

    async function handlePhotoChange(e) {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try {
          const base64 = await resizeImage(file);
          photos.push(base64);
        } catch (err) { console.error(err); }
      }
      refreshPhotoGrid();
    }

    function refreshPhotoGrid() {
      const grid = root.querySelector('#photo-grid');
      grid.innerHTML = photos.map((src, i) => photoThumb(src, i)).join('') + `
        <label class="photo-add">
          <input type="file" id="photo-input" accept="image/*" multiple hidden>
          <span>+</span>
        </label>`;
      grid.querySelector('#photo-input').addEventListener('change', handlePhotoChange);
      grid.querySelectorAll('[data-remove-photo]').forEach((btn) => {
        btn.addEventListener('click', () => {
          photos.splice(Number(btn.dataset.removePhoto), 1);
          refreshPhotoGrid();
        });
      });
    }
    refreshPhotoGrid();

    if (editing) {
      root.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: '작품을 삭제할까요?',
          message: '작품과 카운터, 사진이 모두 삭제돼요.',
          okLabel: 'Delete',
          cancelLabel: 'Cancel',
          danger: true,
        });
        if (ok) {
          // 사용량을 기록한 실이 있을 때만 되돌릴지 물음 (기록 전 실은 보유량에서 빠진 게 없음)
          if ((project.yarns || []).some((l) => Storage.linkUsedAmount(l) > 0)) {
            const restore = await Modal.confirm({
              title: '연결된 실이 있어요',
              message: '차감했던 실 보유량을 되돌릴까요?',
              okLabel: 'Restore',
              cancelLabel: 'Keep',
            });
            if (restore) Storage.restoreYarnAmounts(project);
          }
          Storage.deleteProject(id);
          showBanner('작품을 삭제했어요.');
          go('#/');
        }
      });
    }

    root.querySelector('#project-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get('name') || '').trim();
      const errorEl = root.querySelector('#name-error');
      if (!name) {
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      const data = {
        name,
        startDate: !editing && status === 'onhold' ? '' : (fd.get('startDate') || (editing ? '' : Utils.todayStr())),
        yarnText: String(fd.get('yarnText') || '').trim(),
        needleSize: String(fd.get('needleSize') || '').trim(),
        memo: String(fd.get('memo') || '').trim(),
        photos,
      };
      if (editing) {
        Storage.updateProject(id, data);
        showBanner('작품을 수정했어요.');
        go(`#/project/${id}`);
      } else {
        const created = Storage.createProject({
          ...data,
          status,
          patternId: source && source.kind === 'pattern' ? source.patternId : null,
          ravelryPattern: source && source.kind === 'favorite' ? source.ravelryPattern : null,
        });
        pickedYarns.forEach((pick) => Storage.linkYarnToProject(created.id, pick.yarnId));
        showBanner('새 작품을 만들었어요.');
        go(`#/project/${created.id}`);
      }
    });
  }

  function photoThumb(src, i) {
    return `<div class="photo-thumb"><img src="${src}" alt=""><button type="button" data-remove-photo="${i}">×</button></div>`;
  }

  async function resizeImage(file, maxDim = 1280, quality = 0.78) {
    const dataUrl = await Utils.fileToBase64(file);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // ---------- View: Project Detail ----------
  // 진행 기간 한 줄: CO 대기 / Cast On · N일째 / Cast On → FO · N일
  function projectTimeline(project) {
    const day = 86400000;
    const days = (from, to) => Math.max(0, Math.round((new Date(to) - new Date(from)) / day));
    if (project.status === 'onhold') {
      return project.createdAt ? `${Utils.formatDate(project.createdAt)}에 CO Waiting List에 담았어요` : '';
    }
    if (!project.startDate) return '';
    if (project.status === 'completed' && project.completedDate) {
      return `Cast On ${Utils.formatDate(project.startDate)} → FO ${Utils.formatDate(project.completedDate)} · ${days(project.startDate, project.completedDate) + 1}일`;
    }
    return `Cast On ${Utils.formatDate(project.startDate)} · ${days(project.startDate, Utils.todayStr()) + 1}일째`;
  }

  function renderProjectDetail(id) {
    const project = Storage.getProject(id);
    if (!project) return go('#/');
    setActiveTab('projects');
    const cover = project.photos && project.photos[project.mainPhotoIndex || 0];
    const libraryPattern = project.patternId ? Storage.getPattern(project.patternId) : null;
    const counters = Storage.getCountersByProject(id);
    const mainCounter = counters.find((c) => c.isDefault) || counters[0];
    const counterOn = isCounterOn(project);
    const timeline = projectTimeline(project);
    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>${Utils.escapeHtml(project.name)}</h1>
        <button class="icon-btn display-text" data-action="edit">Edit</button>
      </header>

      <div class="detail-hero ${cover ? 'has-photo' : ''}">
        ${cover ? `<img src="${cover}" alt="">` : `
          <div class="detail-hero-art">${Icons.stitch('sweater', 0.3)}</div>
          <label class="btn ghost sm detail-hero-add">
            <input type="file" accept="image/*" multiple hidden data-photo-input>
            + Add Photo
          </label>`}
      </div>

      <div class="status-row project-status">
        ${statusButton(project, 'onhold', 'CO Waiting List')}
        ${statusButton(project, 'active', 'WIP')}
        ${statusButton(project, 'completed', 'FO')}
      </div>
      ${timeline ? `<p class="detail-timeline">${timeline}</p>` : ''}

      ${project.status === 'onhold' ? `
        <div class="cast-on-card">
          <div class="cast-on-art">${Icons.stitch('yarn', 0.35)}</div>
          <p class="cast-on-title">아직 코를 잡기 전이에요</p>
          <p class="card-meta">코를 잡으면 눌러주세요. WIP로 옮기고 시작일을 오늘로 기록해요.</p>
          <button type="button" class="btn primary block display-btn cast-on-btn" data-action="cast-on">Cast On</button>
        </div>` : ''}

      ${project.status === 'active' ? (libraryPattern ? `
        <a class="knit-card" href="#/pattern/${libraryPattern.id}/for/${id}">
          <div class="knit-card-text">
            <span class="knit-card-title">Open Pattern</span>
            <span class="knit-card-sub">${Utils.escapeHtml(libraryPattern.name)}</span>
          </div>
          ${counterOn && mainCounter ? `<div class="knit-card-count">${Icons.stitchNumber(mainCounter.value, 0.3)}</div>` : '<span class="knit-card-arrow" aria-hidden="true">→</span>'}
        </a>` : `
        <div class="knit-card is-empty-pattern">
          <div class="knit-card-text">
            <span class="knit-card-title">Open Pattern</span>
            <span class="knit-card-sub">도안 파일을 연결하면 도안을 보면서 단수를 셀 수 있어요.</span>
          </div>
          <button type="button" class="btn primary sm" data-action="link-pattern">Link Pattern</button>
        </div>`) : ''}
      ${project.status === 'active' && (libraryPattern || project.ravelryPattern) ? `
        <div class="knit-card-actions">
          ${project.ravelryPattern ? `<a class="text-btn primary" href="${project.ravelryPattern.url}" target="_blank" rel="noopener">Ravelry</a>` : ''}
          ${libraryPattern ? '<button type="button" class="text-btn" data-action="link-pattern">Change Pattern</button>' : ''}
          ${libraryPattern ? '<button type="button" class="text-btn" data-action="unlink-pattern">Unlink Pattern</button>' : ''}
          ${project.ravelryPattern ? '<button type="button" class="text-btn" data-action="unlink-ravelry">Unlink Ravelry</button>' : ''}
        </div>` : ''}

      ${project.status === 'completed' ? `
        <div class="field inline completed-row">
          <span>완성일</span>
          <input type="date" id="completed-date" value="${project.completedDate || Utils.todayStr()}">
        </div>
        <div class="info-block ig-block">
          <div class="section-title-row">
            <h3>Instagram</h3>
            ${project.instagramUrl ? '<button type="button" class="text-btn" data-action="ig-remove">Unlink</button>' : ''}
          </div>
          ${parseInstagramUrl(project.instagramUrl) ? `
            <div class="ig-embed">
              <iframe src="${parseInstagramUrl(project.instagramUrl).embed}" title="Instagram 게시글" loading="lazy" scrolling="no" allowtransparency="true"></iframe>
            </div>
            <a class="text-btn primary ig-open" href="${parseInstagramUrl(project.instagramUrl).url}" target="_blank" rel="noopener">Open in Instagram</a>` : `
            <label class="field">
              <div class="input-with-action">
                <input type="url" id="ig-url" placeholder="https://www.instagram.com/p/..." enterkeyhint="done">
                <button type="button" class="btn ghost sm" data-action="ig-save">Save</button>
              </div>
            </label>
            <p class="card-meta">완성작을 올린 게시글의 링크를 붙여넣으면 여기에 같이 보여줘요. 게시글 아래 공유(종이비행기) → "링크 복사"로 가져올 수 있어요.</p>`}
        </div>` : ''}

      ${project.status === 'active' ? '' : `
      <div class="info-block">
        <div class="section-title-row">
          <h3>Pattern</h3>
          ${libraryPattern ? '' : `<button type="button" class="btn ghost sm" data-action="link-pattern">+ Link Pattern</button>`}
        </div>
        ${libraryPattern || project.ravelryPattern ? `
          <ul class="link-list">
            ${libraryPattern ? `
              <li class="link-item">
                <div class="link-item-main">
                  <span class="link-item-name">${Utils.escapeHtml(libraryPattern.name)}</span>
                  <span class="link-item-meta">${['Library', libraryPattern.needleSize && `바늘 ${Utils.escapeHtml(libraryPattern.needleSize)}`].filter(Boolean).join(' · ')}</span>
                </div>
                <a class="text-btn primary" href="#/pattern/${libraryPattern.id}/for/${id}">View Pattern</a>
                <button type="button" class="text-btn" data-action="unlink-pattern">Unlink</button>
              </li>` : ''}
            ${project.ravelryPattern ? `
              <li class="link-item">
                <div class="link-item-main">
                  <span class="link-item-name">${Utils.escapeHtml(project.ravelryPattern.name)}</span>
                  <span class="link-item-meta">Ravelry 링크</span>
                </div>
                <a class="text-btn primary" href="${project.ravelryPattern.url}" target="_blank" rel="noopener">Ravelry</a>
                <button type="button" class="text-btn" data-action="unlink-ravelry">Unlink</button>
              </li>` : ''}
          </ul>` : `
          <p class="card-meta">연결된 도안이 없어요.</p>`}
      </div>`}

      <div class="info-block">
        <div class="section-title-row">
          <h3>Yarn</h3>
          <button type="button" class="btn ghost sm" data-action="link-yarn">+ Link Yarn</button>
        </div>
        ${(project.yarns || []).length || project.yarnText ? `
          <ul class="link-list">
            ${(project.yarns || []).map((l) => {
              const liveYarn = Storage.getYarn(l.yarnId);
              const label = liveYarn ? liveYarn.name : (l.yarnName || '실');
              const usage = l.pending ? '사용량 기록 전' : `${formatYarnAmount(Storage.linkUsedAmount(l), liveYarn ? yarnUnitOf(liveYarn) : (l.unit || 'ball'))} 사용`;
              const meta = [liveYarn && liveYarn.color, liveYarn && liveYarn.weight, usage, !liveYarn && '삭제된 실'].filter(Boolean).join(' · ');
              return `
                <li class="link-item">
                  <div class="link-item-main">
                    <span class="link-item-name">${Utils.escapeHtml(label)}</span>
                    <span class="link-item-meta">${Utils.escapeHtml(meta)}</span>
                  </div>
                  ${liveYarn ? `<button type="button" class="text-btn primary" data-record-yarn="${l.yarnId}">${l.pending ? 'Record Usage' : 'Edit'}</button>` : ''}
                  <button type="button" class="text-btn" data-unlink-yarn="${l.yarnId}">Unlink</button>
                </li>`;
            }).join('')}
            ${project.yarnText ? `
              <li class="link-item">
                <div class="link-item-main">
                  <span class="link-item-name">${Utils.escapeHtml(project.yarnText)}</span>
                  <span class="link-item-meta">직접 적은 사용 실</span>
                </div>
              </li>` : ''}
          </ul>` : `
          <p class="card-meta">연결된 실이 없어요.</p>`}
      </div>

      <div class="info-block">
        <div class="section-title-row"><h3>Details</h3></div>
        <dl>
          <dt>바늘 호수</dt><dd>${Utils.escapeHtml(project.needleSize) || '-'}</dd>
          <dt>메모</dt><dd class="pre">${Utils.escapeHtml(project.memo) || '-'}</dd>
        </dl>
      </div>

      <div class="info-block">
        <div class="section-title-row"><h3>Photos</h3></div>
        <div class="photo-grid readonly">
          ${(project.photos || []).map((src) => `<div class="photo-thumb"><img src="${src}" alt=""></div>`).join('')}
          <label class="photo-add">
            <input type="file" accept="image/*" multiple hidden data-photo-input>
            <span>+</span>
          </label>
        </div>
      </div>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => go('#/'));
    root.querySelector('[data-action="edit"]').addEventListener('click', () => go(`#/project/${id}/edit`));

    root.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => onStatusChange(project, btn.dataset.status));
    });

    const igInput = root.querySelector('#ig-url');
    if (igInput) {
      const saveIg = () => {
        const parsed = parseInstagramUrl(igInput.value);
        if (!parsed) {
          showBanner('인스타그램 게시글 링크를 확인해주세요.', 'warn');
          return;
        }
        Storage.updateProject(id, { instagramUrl: parsed.url });
        showBanner('Instagram 게시글을 연결했어요.');
        render();
      };
      root.querySelector('[data-action="ig-save"]').addEventListener('click', saveIg);
      igInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        saveIg();
      });
    }
    const igRemove = root.querySelector('[data-action="ig-remove"]');
    if (igRemove) {
      igRemove.addEventListener('click', () => {
        Storage.updateProject(id, { instagramUrl: '' });
        showBanner('Instagram 연결을 해제했어요.');
        render();
      });
    }

    const completedDateInput = root.querySelector('#completed-date');
    if (completedDateInput) {
      completedDateInput.addEventListener('change', () => {
        Storage.updateProject(id, { completedDate: completedDateInput.value });
      });
    }

    const castOnBtn = root.querySelector('[data-action="cast-on"]');
    if (castOnBtn) castOnBtn.addEventListener('click', () => castOn(project));

    root.querySelectorAll('[data-photo-input]').forEach((input) => {
      input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const added = [];
        for (const file of files) {
          try { added.push(await resizeImage(file)); } catch (err) { console.error(err); }
        }
        if (!added.length) return;
        Storage.updateProject(id, { photos: [...(Storage.getProject(id).photos || []), ...added] });
        showBanner(`사진 ${added.length}장을 추가했어요.`);
        render();
      });
    });

    root.querySelectorAll('[data-record-yarn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const stitchesBefore = Sampler.progress().stitches;
        if (await openYarnUsageModal(id, [btn.dataset.recordYarn])) {
          await showSamplerGain(id, stitchesBefore);
          render();
        }
      });
    });

    root.querySelectorAll('[data-unlink-yarn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const yarnId = btn.dataset.unlinkYarn;
        const link = (Storage.getProject(id).yarns || []).find((l) => l.yarnId === yarnId);
        if (!link || link.pending) {
          const ok = await Modal.confirm({ title: '실 연결을 해제할까요?', message: '아직 사용량을 기록하지 않아서 실 보유량은 그대로예요.', okLabel: 'Unlink', cancelLabel: 'Cancel' });
          if (!ok) return;
          Storage.unlinkYarnFromProject(id, yarnId, false);
        } else {
          const restore = await Modal.confirm({
            title: '연결을 해제할까요?',
            message: '기록한 사용량만큼 실 보관함 보유량을 되돌릴까요?',
            okLabel: 'Restore',
            cancelLabel: 'Keep',
          });
          Storage.unlinkYarnFromProject(id, yarnId, restore);
        }
        showBanner('실 연결을 해제했어요.');
        render();
      });
    });

    root.querySelector('[data-action="link-yarn"]').addEventListener('click', async () => {
      const available = Storage.getYarns().filter((y) => !(project.yarns || []).some((l) => l.yarnId === y.id));
      if (!available.length) {
        showBanner('연결할 수 있는 실이 없어요.', 'warn');
        return;
      }
      const picked = await Modal.pick({
        title: '실 연결',
        placeholder: '이름, 색상, 굵기로 찾기',
        sections: [{ label: 'Yarn', items: yarnPickItems(available) }],
      });
      if (!picked) return;
      Storage.linkYarnToProject(id, picked);
      showBanner('실을 연결했어요.');
      render();
    });

    root.querySelectorAll('[data-action="link-pattern"]').forEach((linkPatternBtn) => {
      linkPatternBtn.addEventListener('click', async () => {
        const available = Storage.getPatterns();
        if (!available.length) {
          const goUpload = await Modal.confirm({
            title: '등록된 도안이 없어요',
            message: 'Patterns 탭에서 먼저 도안을 추가해주세요.',
            okLabel: 'Add Pattern',
            cancelLabel: 'Close',
          });
          if (goUpload) go('#/pattern/new');
          return;
        }
        const picked = await Modal.pick({
          title: '도안 연결',
          placeholder: '도안 이름으로 찾기',
          sections: [{ label: 'Library', items: libraryPickItems() }],
        });
        if (!picked) return;
        const patternId = String(picked).replace(/^pattern:/, '');
        Storage.linkPatternToProject(id, patternId);
        // 작품 바늘 호수가 비어 있으면 도안의 바늘 굵기로 채움 (이미 적은 값은 그대로)
        const linked = Storage.getPattern(patternId);
        const fillNeedle = linked && linked.needleSize && !String(project.needleSize || '').trim();
        if (fillNeedle) Storage.updateProject(id, { needleSize: linked.needleSize });
        showBanner(fillNeedle ? `도안을 연결하고 바늘 호수를 ${linked.needleSize}로 채웠어요.` : '도안을 연결했어요.');
        render();
      });
    });

    const unlinkRavelryBtn = root.querySelector('[data-action="unlink-ravelry"]');
    if (unlinkRavelryBtn) {
      unlinkRavelryBtn.addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: 'Ravelry 링크를 해제할까요?',
          message: 'Favorites에 찜해둔 도안은 그대로 남아요.',
          okLabel: 'Unlink',
          cancelLabel: 'Cancel',
        });
        if (!ok) return;
        Storage.updateProject(id, { ravelryPattern: null });
        showBanner('Ravelry 링크를 해제했어요.');
        render();
      });
    }

    const unlinkPatternBtn = root.querySelector('[data-action="unlink-pattern"]');
    if (unlinkPatternBtn) {
      unlinkPatternBtn.addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: '도안 연결을 해제할까요?',
          message: '하이라이트 위치가 사라져요. 도안 파일 자체는 그대로 남아요.',
          okLabel: 'Unlink',
          cancelLabel: 'Cancel',
        });
        if (!ok) return;
        Storage.unlinkPatternFromProject(id);
        showBanner('도안 연결을 해제했어요.');
        render();
      });
    }
  }

  function statusButton(project, status, label) {
    return `<button class="chip display-chip ${project.status === status ? 'active' : ''}" data-status="${status}">${label}</button>`;
  }

  // 코 잡기: CO Waiting List → WIP, 시작일을 오늘로
  function castOn(project) {
    Storage.updateProject(project.id, { status: 'active', startDate: Utils.todayStr() });
    showBanner('Cast On! WIP로 옮겼어요.');
    render();
  }

  async function onStatusChange(project, status) {
    if (status === project.status) return;
    if (project.status === 'onhold' && status === 'active') {
      castOn(project);
      return;
    }
    if (status === 'completed') {
      const stitchesBefore = Sampler.progress().stitches;
      Storage.updateProject(project.id, { status, completedDate: Utils.todayStr() });
      const pendingYarnIds = (project.yarns || []).filter((l) => l.pending && Storage.getYarn(l.yarnId)).map((l) => l.yarnId);
      if (pendingYarnIds.length) {
        await openYarnUsageModal(project.id, pendingYarnIds, {
          title: 'FO 축하해요!',
          intro: '이 작품에 쓴 실 양을 기록하면 실 보관함 보유량이 맞춰지고, 샘플러에 땀이 수놓아져요.',
        });
      }
      await showSamplerGain(project.id, stitchesBefore);
      showBanner('FO로 옮겼어요. Archive에서 볼 수 있어요.');
      go('#/archive');
      return;
    }
    if (project.status === 'completed' && status !== 'completed') {
      Storage.updateProject(project.id, { status, completedDate: null });
      showBanner('작품을 다시 진행 상태로 되돌렸어요.');
      render();
      return;
    }
    Storage.updateProject(project.id, { status });
    render();
  }

  function canTap(counterId) {
    const now = Date.now();
    const last = tapGuard[counterId] || 0;
    if (now - last < 300) return false;
    tapGuard[counterId] = now;
    return true;
  }

  function changeCounter(counter, delta, projectId) {
    const prevValue = counter.value;
    let nextValue = Math.max(0, prevValue + delta);
    Storage.setLastAction({ counterId: counter.id, projectId, prevValue });
    Storage.updateCounter(counter.id, { value: nextValue });
    Storage.touchProject(projectId);

    if (delta > 0 && counter.cycle > 0 && nextValue > 0 && nextValue % counter.cycle === 0) {
      showBanner(`"${counter.name}" ${counter.cycle}단마다 알림 · 현재 ${nextValue}단`, 'highlight');
      flashCounter(counter.id);
      if (counter.autoReset) {
        setTimeout(() => {
          Storage.updateCounter(counter.id, { value: 0 });
        }, 900);
      }
    }
  }

  function flashCounter(counterId) {
    clearTimeout(flashTimers[counterId]);
    const el = root.querySelector(`[data-counter-id="${counterId}"]`);
    if (el) el.classList.add('flash');
    flashTimers[counterId] = setTimeout(() => {
      const el2 = root.querySelector(`[data-counter-id="${counterId}"]`);
      if (el2) el2.classList.remove('flash');
    }, 1200);
  }

  // ---------- Instagram embed ----------
  // 임베드 iframe은 내용 높이를 postMessage(MEASURE)로 알려줌. 받으면 그 높이로 맞추고, 못 받으면 CSS 기본 높이.
  window.addEventListener('message', (e) => {
    if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin)) return;
    let data = e.data;
    try { if (typeof data === 'string') data = JSON.parse(data); } catch (err) { return; }
    const height = data && data.type === 'MEASURE' && data.details && data.details.height;
    if (!height) return;
    root.querySelectorAll('.ig-embed iframe').forEach((frame) => {
      if (frame.contentWindow === e.source) frame.style.height = `${Math.ceil(height)}px`;
    });
  });

  // ---------- Backup reminder ----------
  function checkBackupReminder() {
    const settings = Storage.getSettings();
    const last = settings.lastBackupAt;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (!last || Date.now() - new Date(last).getTime() > THIRTY_DAYS) {
      showBanner('마지막 백업이 오래됐어요. Tools 탭에서 백업할 수 있어요.', 'info', 5000);
    }
  }

  // ---------- Service worker ----------
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.error('SW register failed', e));
    }
  }

  // ---------- Init ----------
  // ---------- Persistent storage ----------
  // 데이터가 이 기기에만 있으므로, 브라우저가 저장공간이 부족하거나 오래 안 썼을 때
  // 사이트 데이터를 지우지 않도록 "지속 저장소"를 요청함. 결과: true(보호됨) / false / null(지원 안 함)
  async function requestPersistentStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function init() {
    window.addEventListener('hashchange', render);
    // 시간 기록 기능을 없애면서, 예전에 진행 중이던 기록 상태가 남아 있으면 비움
    if (Storage.getActiveSession()) Storage.setActiveSession(null);
    render();
    checkBackupReminder();
    registerServiceWorker();
    requestPersistentStorage();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
