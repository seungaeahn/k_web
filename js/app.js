const App = (() => {
  const root = document.getElementById('app');
  const bannerEl = document.getElementById('banner');
  let bannerTimer = null;
  let wakeLock = null;
  let tapGuard = {};
  let flashTimers = {};
  let currentRoute = { name: '', params: {} };

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
    if (document.visibilityState === 'visible' && currentRoute.name === 'project-detail') {
      acquireWakeLock();
    }
  });

  // ---------- Session logic ----------
  function activeSessionFor(projectId) {
    const active = Storage.getActiveSession();
    return active && active.projectId === projectId ? active : null;
  }

  function projectTodayMs(projectId) {
    const today = Utils.todayStr();
    let ms = Storage.getSessionsByProject(projectId)
      .filter((s) => Utils.isSameDay(s.startAt, today))
      .reduce((sum, s) => sum + (new Date(s.endAt) - new Date(s.startAt)), 0);
    const active = activeSessionFor(projectId);
    if (active && Utils.isSameDay(active.startAt, today)) {
      const end = active.mode === 'auto' ? Date.now() : Date.now();
      ms += end - new Date(active.startAt).getTime();
    }
    return ms;
  }

  function projectTotalMs(projectId) {
    let ms = Storage.getSessionsByProject(projectId)
      .reduce((sum, s) => sum + (new Date(s.endAt) - new Date(s.startAt)), 0);
    const active = activeSessionFor(projectId);
    if (active) ms += Date.now() - new Date(active.startAt).getTime();
    return ms;
  }

  function finalizeSession(active, endAtOverride) {
    const endAt = endAtOverride || active.lastTapAt || active.startAt;
    const durationMs = new Date(endAt) - new Date(active.startAt);
    Storage.addSession({ projectId: active.projectId, startAt: active.startAt, endAt, mode: active.mode });
    Storage.setActiveSession(null);
    Storage.touchProject(active.projectId);
    return durationMs;
  }

  function maybeFinalizeAutoSession() {
    const active = Storage.getActiveSession();
    if (!active || active.mode !== 'auto') return false;
    const settings = Storage.getSettings();
    const idleMs = Date.now() - new Date(active.lastTapAt).getTime();
    if (idleMs >= settings.autoEndMinutes * 60000) {
      const durationMs = finalizeSession(active);
      if (durationMs > 12 * 3600 * 1000) {
        showBanner('12시간이 넘는 기록이 저장됐어요. 시간 기록에서 확인해주세요.', 'warn', 5000);
      }
      return true;
    }
    return false;
  }

  function handleCounterTapSession(projectId) {
    const active = Storage.getActiveSession();
    if (active && active.mode === 'manual' && active.projectId === projectId) return;
    const now = new Date().toISOString();
    if (active && active.mode === 'auto' && active.projectId === projectId) {
      active.lastTapAt = now;
      Storage.setActiveSession(active);
      return;
    }
    if (active && active.mode === 'auto') {
      finalizeSession(active);
    }
    if (!active || active.projectId !== projectId) {
      Storage.setActiveSession({ projectId, mode: 'auto', startAt: now, lastTapAt: now });
    }
  }

  async function startManualSession(projectId) {
    const active = Storage.getActiveSession();
    if (active && active.projectId === projectId && active.mode === 'auto') {
      finalizeSession(active);
    }
    Storage.setActiveSession({ projectId, mode: 'manual', startAt: new Date().toISOString() });
  }

  async function stopManualSession(active, project, presetEndAt) {
    let endAt = presetEndAt || new Date().toISOString();
    let durationMs = new Date(endAt) - new Date(active.startAt);
    while (durationMs > 12 * 3600 * 1000) {
      const res = await Modal.open({
        title: '기록 시간이 길어요',
        bodyHtml: `
          <p>이 기록이 12시간을 넘었어요. 종료 시각을 확인해주세요.</p>
          <label class="field">
            <span>종료 시각</span>
            <input type="datetime-local" data-field="endAt" value="${Utils.toDateTimeLocal(endAt)}">
          </label>`,
        buttons: [
          { id: 'keep', label: '이대로 저장', variant: 'ghost' },
          { id: 'fix', label: '시각 수정', variant: 'primary' },
        ],
      });
      if (res.id === 'keep') break;
      const edited = new Date(res.values.endAt);
      if (!isNaN(edited.getTime())) {
        endAt = edited.toISOString();
        durationMs = new Date(endAt) - new Date(active.startAt);
      } else {
        break;
      }
    }
    Storage.addSession({ projectId: active.projectId, startAt: active.startAt, endAt, mode: 'manual' });
    Storage.setActiveSession(null);
    Storage.touchProject(active.projectId);
  }

  async function checkPendingSessionOnBoot() {
    const active = Storage.getActiveSession();
    if (!active) return;
    if (active.mode === 'auto') {
      maybeFinalizeAutoSession();
      return;
    }
    if (active.mode === 'manual') {
      const project = Storage.getProject(active.projectId);
      const name = project ? project.name : '작품';
      const ok = await Modal.confirm({
        title: '기록이 진행 중이에요',
        message: `"${Utils.escapeHtml(name)}"의 수동 기록이 계속되고 있어요. 계속할까요, 종료할까요?`,
        okLabel: '계속하기',
        cancelLabel: '종료하기',
      });
      if (!ok) {
        await stopManualSession(active, project);
        render();
      }
    }
  }

  // ---------- Clock tick ----------
  function startClock() {
    setInterval(() => {
      const finalized = maybeFinalizeAutoSession();
      if (currentRoute.name === 'project-detail') {
        updateLiveTimers();
        if (finalized) render();
      }
    }, 1000);
  }

  function updateLiveTimers() {
    const projectId = currentRoute.params.id;
    const todayEl = document.getElementById('stat-today');
    const totalEl = document.getElementById('stat-total');
    if (todayEl) todayEl.textContent = Utils.formatDuration(projectTodayMs(projectId));
    if (totalEl) totalEl.textContent = Utils.formatDuration(projectTotalMs(projectId));
    const manualTimerEl = document.getElementById('manual-timer');
    if (manualTimerEl) {
      const active = activeSessionFor(projectId);
      if (active && active.mode === 'manual') {
        manualTimerEl.textContent = Utils.formatDuration(Date.now() - new Date(active.startAt).getTime());
      }
    }
  }

  // ---------- Router ----------
  function parseHash() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { name: 'list', params: {} };
    if (parts[0] === 'archive') return { name: 'archive', params: {} };
    if (parts[0] === 'yarn') {
      if (parts[1] === 'new') return { name: 'yarn-form', params: {} };
      if (parts[1]) return { name: 'yarn-form', params: { id: parts[1] } };
      return { name: 'yarn-list', params: {} };
    }
    if (parts[0] === 'pattern') {
      if (parts[1] === 'new') return { name: 'pattern-form', params: {} };
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
      if (parts[1] === 'new') return { name: 'project-form', params: {} };
      if (parts[2] === 'edit') return { name: 'project-form', params: { id: parts[1] } };
      if (parts[2] === 'sessions') return { name: 'sessions', params: { id: parts[1] } };
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
    if (route.name !== 'project-detail') releaseWakeLock();
    else acquireWakeLock();

    switch (route.name) {
      case 'list': return renderList();
      case 'archive': return renderArchive();
      case 'project-form': return renderProjectForm(route.params.id);
      case 'project-detail': return renderProjectDetail(route.params.id);
      case 'sessions': return renderSessions(route.params.id);
      case 'yarn-list': return renderYarnList();
      case 'yarn-form': return renderYarnForm(route.params.id);
      case 'tools-home': return renderToolsHome();
      case 'tools-gauge': return renderGaugeCalculator();
      case 'tools-abbr': return renderAbbreviations();
      case 'tools-backup': return renderBackup();
      case 'tools-ravelry': return renderRavelrySettings();
      case 'pattern-list': return renderPatternList();
      case 'pattern-form': return renderPatternForm();
      case 'pattern-viewer': return renderPatternViewer(route.params.id, route.params.projectId);
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
        <h1>작품</h1>
        <button class="btn primary sm" data-action="new-project">+ 새 작품</button>
      </header>
      <div class="list">
        ${projects.length === 0 ? emptyState('아직 작품이 없어요', '새 작품을 추가해서 뜨개를 시작해보세요.') : projects.map(projectCard).join('')}
      </div>
      ${completedCount > 0 ? `<div class="list-footer-link"><a href="#/archive">완성한 작품 ${completedCount}개 보기 →</a></div>` : ''}
    `;

    root.querySelector('[data-action="new-project"]').addEventListener('click', () => go('#/project/new'));
    root.querySelectorAll('[data-project-id]').forEach((el) => {
      el.addEventListener('click', () => go(`#/project/${el.dataset.projectId}`));
    });
  }

  function emptyState(title, desc) {
    return `<div class="empty-state"><p class="empty-title">${title}</p><p class="empty-desc">${desc}</p></div>`;
  }

  function statusLabel(status) {
    return status === 'active' ? '진행 중' : status === 'onhold' ? '보류' : '완성';
  }

  function projectCard(p) {
    const cover = p.photos && p.photos[p.mainPhotoIndex || 0];
    const counters = Storage.getCountersByProject(p.id);
    const main = counters.find((c) => c.isDefault) || counters[0];
    return `
      <div class="card project-card" data-project-id="${p.id}">
        <div class="card-thumb">${cover ? `<img src="${cover}" alt="">` : `<div class="thumb-placeholder">🧶</div>`}</div>
        <div class="card-body">
          <div class="card-title-row">
            <span class="status-badge status-${p.status}">${statusLabel(p.status)}</span>
            <h3>${Utils.escapeHtml(p.name)}</h3>
          </div>
          <p class="card-sub">${main ? `${Utils.escapeHtml(main.name)} ${main.value}${main.name === '단수' ? '단' : ''}` : ''}</p>
          <p class="card-meta">오늘 ${Utils.formatDuration(projectTodayMs(p.id))} · 총 ${Utils.formatDuration(projectTotalMs(p.id))}</p>
        </div>
      </div>`;
  }

  // ---------- View: Archive ----------
  function renderArchive() {
    setActiveTab('archive');
    const projects = Storage.getProjects()
      .filter((p) => p.status === 'completed')
      .sort((a, b) => new Date(b.completedDate || 0) - new Date(a.completedDate || 0));
    const totalMs = projects.reduce((sum, p) => sum + projectTotalMs(p.id), 0);

    root.innerHTML = `
      <header class="page-header"><h1>아카이브</h1></header>
      <div class="archive-summary">
        <div><strong>${projects.length}</strong><span>완성작</span></div>
        <div><strong>${Utils.formatDuration(totalMs)}</strong><span>총 뜨개 시간</span></div>
      </div>
      <div class="grid-2">
        ${projects.length === 0 ? emptyState('완성한 작품이 아직 없어요', '작품을 완성하면 여기에 모여요.') : projects.map(archiveCard).join('')}
      </div>
    `;
    root.querySelectorAll('[data-project-id]').forEach((el) => {
      el.addEventListener('click', () => go(`#/project/${el.dataset.projectId}`));
    });
  }

  function archiveCard(p) {
    const cover = p.photos && p.photos[p.mainPhotoIndex || 0];
    return `
      <div class="card archive-card" data-project-id="${p.id}">
        <div class="card-thumb square">${cover ? `<img src="${cover}" alt="">` : `<div class="thumb-placeholder">🧶</div>`}</div>
        <div class="card-body">
          <h3>${Utils.escapeHtml(p.name)}</h3>
          <p class="card-meta">${Utils.formatDate(p.completedDate)}</p>
        </div>
      </div>`;
  }

  // ---------- View: Placeholder tabs ----------
  // ---------- View: Yarn List ----------
  const YARN_WEIGHTS = ['레이스', '합연사', '중세', '합태', '극태', '특극태'];
  let yarnActiveWeight = 'all';

  function renderYarnList() {
    setActiveTab('yarn');
    yarnActiveWeight = 'all';
    const usedWeights = Array.from(new Set(Storage.getYarns().map((y) => y.weight).filter(Boolean)));

    root.innerHTML = `
      <header class="page-header">
        <h1>실</h1>
        <button class="btn primary sm" data-action="new-yarn">+ 실 추가</button>
      </header>
      ${usedWeights.length ? `
        <div class="status-row wrap" id="yarn-weight-filter">
          <button type="button" class="chip active" data-weight="all">전체</button>
          ${usedWeights.map((w) => `<button type="button" class="chip" data-weight="${Utils.escapeHtml(w)}">${Utils.escapeHtml(w)}</button>`).join('')}
        </div>` : ''}
      <label class="field">
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

  function yarnCard(y) {
    const empty = !(y.amount > 0);
    return `
      <div class="card ${empty ? 'is-empty' : ''}" data-yarn-id="${y.id}">
        <div class="card-thumb">${y.photo ? `<img src="${y.photo}" alt="">` : `<div class="thumb-placeholder">🧵</div>`}</div>
        <div class="card-body">
          <div class="card-title-row"><h3>${Utils.escapeHtml(y.name)}</h3></div>
          <p class="card-sub">${[y.color, y.weight, y.material].filter(Boolean).map((v) => Utils.escapeHtml(v)).join(' · ') || '-'}</p>
          <p class="card-meta">${empty ? '보유량 없음' : `보유 ${y.amount}볼`}</p>
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
        <h1>${editing ? '실 수정' : '새 실'}</h1>
      </header>
      <form id="yarn-form" class="form">
        <label class="field">
          <span>브랜드/이름 <em>*</em></span>
          <input type="text" name="name" value="${yarn ? Utils.escapeHtml(yarn.name) : ''}" placeholder="예: 메리노 DK">
          <p class="field-error" id="name-error" hidden>이름을 입력해주세요.</p>
        </label>
        ${Ravelry.isConfigured() ? `
          <div class="info-block" id="ravelry-search-block">
            <button type="button" class="btn ghost sm" data-action="ravelry-search">Ravelry에서 찾아서 정보 채우기</button>
            <div class="list" id="ravelry-results"></div>
          </div>
        ` : `<p class="card-meta">Ravelry 연동을 설정하면 위 이름으로 실 정보를 자동으로 불러올 수 있어요. <a href="#/tools/ravelry">설정하러 가기 →</a></p>`}
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
          <span>소재</span>
          <input type="text" name="material" value="${yarn ? Utils.escapeHtml(yarn.material) : ''}" placeholder="예: 메리노 울 100%">
        </label>
        <label class="field">
          <span>보유량 (볼 수)</span>
          <input type="number" name="amount" min="0" step="1" value="${yarn ? yarn.amount : 0}">
        </label>
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
                return `<li class="yarn-link-row"><span>${Utils.escapeHtml(p.name)} · ${link ? link.amount : 0}볼 사용</span></li>`;
              }).join('')}
            </ul>
          </div>` : ''}
        <div class="form-actions">
          <button type="submit" class="btn primary block">저장</button>
          ${editing ? `<button type="button" class="btn danger block" data-action="delete">실 삭제</button>` : ''}
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
            <div class="counter-row-controls"><button type="button" class="icon-btn sm">불러오기</button></div>
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
              ravelryYarnId = detail.ravelryYarnId;
              resultsEl.innerHTML = '';
              showBanner('실 정보를 불러왔어요.');
            } catch (err) {
              showBanner(Ravelry.errorMessage(err), 'warn');
            }
          });
        });
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
          okLabel: '삭제',
          cancelLabel: '취소',
          danger: true,
        } : {
          title: '실을 삭제할까요?',
          message: '삭제한 실 정보는 되돌릴 수 없어요.',
          okLabel: '삭제',
          cancelLabel: '취소',
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
        material: String(fd.get('material') || '').trim(),
        amount: Math.max(0, Number(fd.get('amount')) || 0),
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
      <header class="page-header"><h1>도구</h1></header>
      <a class="link-row" href="#/tools/gauge">게이지 계산기 →</a>
      <a class="link-row" href="#/tools/abbreviations">약어 사전 →</a>
      <a class="link-row" href="#/tools/backup">백업 (내보내기/가져오기) →</a>
      <a class="link-row" href="#/tools/ravelry">Ravelry 연동 설정 →</a>
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
        <h1>게이지 계산기</h1>
      </header>
      <form id="gauge-form" class="form">
        <div class="grid-2">
          <label class="field"><span>샘플 가로(cm)</span><input type="number" name="sampleWidth" min="0" step="0.1"><p class="field-error" data-error="sampleWidth" hidden>0보다 큰 값을 입력해주세요.</p></label>
          <label class="field"><span>샘플 세로(cm)</span><input type="number" name="sampleHeight" min="0" step="0.1"><p class="field-error" data-error="sampleHeight" hidden>0보다 큰 값을 입력해주세요.</p></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>샘플 코 수</span><input type="number" name="sampleStitches" min="0" step="1"><p class="field-error" data-error="sampleStitches" hidden>0보다 큰 값을 입력해주세요.</p></label>
          <label class="field"><span>샘플 단 수</span><input type="number" name="sampleRows" min="0" step="1"><p class="field-error" data-error="sampleRows" hidden>0보다 큰 값을 입력해주세요.</p></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>목표 가로(cm)</span><input type="number" name="targetWidth" min="0" step="0.1"><p class="field-error" data-error="targetWidth" hidden>0보다 큰 값을 입력해주세요.</p></label>
          <label class="field"><span>목표 세로(cm)</span><input type="number" name="targetHeight" min="0" step="0.1"><p class="field-error" data-error="targetHeight" hidden>0보다 큰 값을 입력해주세요.</p></label>
        </div>
      </form>
      <div class="stat-row" id="gauge-result" hidden>
        <div class="stat"><span id="result-stitches">-</span><label>필요한 코 수</label></div>
        <div class="stat"><span id="result-rows">-</span><label>필요한 단 수</label></div>
      </div>
      ${projects.length ? `
        <div class="info-block" id="gauge-save" hidden>
          <h3>결과를 작품 메모에 저장</h3>
          <label class="field">
            <select id="gauge-project-select">${projects.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}</select>
          </label>
          <button type="button" class="btn ghost sm" data-action="save-memo">메모에 저장</button>
        </div>` : ''}
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    const form = root.querySelector('#gauge-form');
    const resultBox = root.querySelector('#gauge-result');
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
        resultBox.hidden = true;
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

      root.querySelector('#result-stitches').textContent = `${lastResult.stitches}코 (${neededStitches.toFixed(1)})`;
      root.querySelector('#result-rows').textContent = `${lastResult.rows}단 (${neededRows.toFixed(1)})`;
      resultBox.hidden = false;
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
        <h1>약어 사전</h1>
        <button class="btn primary sm" data-action="new-abbr">+ 추가</button>
      </header>
      <label class="field"><input type="text" id="abbr-search" placeholder="약어, 설명 검색"></label>
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
        buttons: [{ id: 'cancel', label: '취소', variant: 'ghost' }, { id: 'ok', label: '저장', variant: 'primary' }],
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
        okLabel: '삭제',
        cancelLabel: '취소',
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
          <button type="button" class="icon-btn sm" data-edit-abbr="${a.id}">수정</button>
          <button type="button" class="icon-btn sm" data-delete-abbr="${a.id}">삭제</button>
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
        <h1>백업</h1>
      </header>
      <div class="info-block">
        <h3>마지막 백업</h3>
        <p class="card-meta">${settings.lastBackupAt ? Utils.formatDateTime(settings.lastBackupAt) : '아직 백업한 적 없어요'}</p>
      </div>
      <div class="form">
        <label class="field checkbox">
          <input type="checkbox" id="include-photos" checked>
          <span>사진 포함해서 내보내기</span>
        </label>
        <div class="form-actions">
          <button type="button" class="btn primary block" data-action="export">데이터 내보내기</button>
        </div>
      </div>
      <div class="form">
        <label class="field">
          <span>백업 파일 가져오기</span>
          <input type="file" id="import-input" accept="application/json,.json">
        </label>
      </div>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    root.querySelector('[data-action="export"]').addEventListener('click', () => {
      const includePhotos = root.querySelector('#include-photos').checked;
      const payload = Storage.exportBackup(includePhotos);
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
        okLabel: '가져오기',
        cancelLabel: '취소',
        danger: true,
      });
      if (!proceed) {
        e.target.value = '';
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const ok = Storage.importBackup(parsed);
        if (!ok) {
          showBanner('백업 파일 형식이 올바르지 않아요.', 'warn');
          return;
        }
        showBanner('데이터를 가져왔어요.');
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
        <h1>Ravelry 연동</h1>
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
          <button type="submit" class="btn primary block">저장</button>
          <button type="button" class="btn ghost block" data-action="test-connection">연결 테스트</button>
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

  function renderPatternList() {
    setActiveTab('pattern');
    revokePatternObjectUrl();
    const patterns = Storage.getPatterns();
    root.innerHTML = `
      <header class="page-header">
        <h1>도안</h1>
        <button class="btn primary sm" data-action="new-pattern">+ 도안 추가</button>
      </header>
      <div class="list">
        ${patterns.length === 0 ? emptyState('아직 등록한 도안이 없어요', '이미지나 PDF로 된 도안을 추가해보세요.') : patterns.map(patternCard).join('')}
      </div>
    `;
    root.querySelector('[data-action="new-pattern"]').addEventListener('click', () => go('#/pattern/new'));
    root.querySelectorAll('[data-pattern-id]').forEach((el) => {
      el.addEventListener('click', () => go(`#/pattern/${el.dataset.patternId}`));
    });
  }

  function patternCard(pt) {
    return `
      <div class="card" data-pattern-id="${pt.id}">
        <div class="card-thumb"><div class="thumb-placeholder">${pt.fileType === 'pdf' ? '📄' : '🖼️'}</div></div>
        <div class="card-body">
          <div class="card-title-row"><h3>${Utils.escapeHtml(pt.name)}</h3></div>
          <p class="card-sub">${pt.fileType === 'pdf' ? `PDF · ${pt.pageCount}페이지` : '이미지'}</p>
        </div>
      </div>`;
  }

  // ---------- View: Pattern Upload Form ----------
  function renderPatternForm() {
    setActiveTab('pattern');
    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>새 도안</h1>
      </header>
      <form id="pattern-form" class="form">
        <label class="field">
          <span>도안 이름 <em>*</em></span>
          <input type="text" name="name" placeholder="예: 겨울 목도리 도안">
          <p class="field-error" id="name-error" hidden>이름을 입력해주세요.</p>
        </label>
        <label class="field">
          <span>파일 (이미지 또는 PDF, 최대 20MB)</span>
          <input type="file" id="pattern-file" accept="image/jpeg,image/png,application/pdf">
          <p class="field-error" id="file-error" hidden></p>
        </label>
        <div class="form-actions">
          <button type="submit" class="btn primary block" id="pattern-submit" disabled>저장</button>
        </div>
      </form>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    let pendingFile = null;
    let pendingMeta = null;

    root.querySelector('#pattern-file').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      const errorEl = root.querySelector('#file-error');
      const submitBtn = root.querySelector('#pattern-submit');
      errorEl.hidden = true;
      submitBtn.disabled = true;
      pendingFile = null;
      pendingMeta = null;
      if (!file) return;

      if (file.size > PATTERN_MAX_BYTES) {
        errorEl.textContent = '파일이 너무 커요. 20MB 이하로 올려주세요.';
        errorEl.hidden = false;
        return;
      }

      if (file.type === 'application/pdf') {
        try {
          const buf = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          pendingFile = file;
          pendingMeta = { fileType: 'pdf', fileSize: file.size, pageCount: pdf.numPages };
          submitBtn.disabled = false;
        } catch (err) {
          console.error(err);
          errorEl.textContent = '이 PDF를 열 수 없어요. 암호가 걸려있거나 손상된 파일일 수 있어요.';
          errorEl.hidden = false;
        }
      } else if (file.type === 'image/jpeg' || file.type === 'image/png') {
        pendingFile = file;
        pendingMeta = { fileType: 'image', fileSize: file.size, pageCount: 1 };
        submitBtn.disabled = false;
      } else {
        errorEl.textContent = '이미지(JPG, PNG) 또는 PDF 파일만 올릴 수 있어요.';
        errorEl.hidden = false;
      }
    });

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
      if (!pendingFile || !pendingMeta) return;
      const created = Storage.createPattern({ name, ...pendingMeta });
      await FileStore.put(created.id, pendingFile);
      showBanner('도안을 추가했어요.');
      go(`#/pattern/${created.id}`);
    });
  }

  // ---------- View: Pattern Viewer ----------
  function renderPatternViewer(patternId, projectId) {
    setActiveTab('pattern');
    revokePatternObjectUrl();
    const pattern = Storage.getPattern(patternId);
    if (!pattern) return go('#/pattern');
    const project = projectId ? Storage.getProject(projectId) : null;
    const initial = (project && project.highlight) || { page: 1, y: 0.5, barThickness: 40 };

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>${Utils.escapeHtml(pattern.name)}</h1>
        <button class="icon-btn" data-action="delete-pattern">삭제</button>
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
          <input type="range" id="thickness-range" min="16" max="120" step="4" value="${initial.barThickness}">
        </div>
        <div class="pattern-toolbar-group">
          <button type="button" class="icon-btn" data-action="move-up">▲</button>
          <button type="button" class="icon-btn" data-action="move-down">▼</button>
        </div>
      </div>
      ${!project ? `<p class="card-meta" style="text-align:center;margin-top:8px">작품에 연결하면 하이라이트 위치가 저장돼요.</p>` : ''}
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

    root.querySelector('[data-action="delete-pattern"]').addEventListener('click', async () => {
      const linked = Storage.getProjectsLinkedToPattern(patternId);
      const ok = await Modal.confirm(linked.length ? {
        title: '연결된 작품이 있어요',
        message: `${linked.map((p) => p.name).join(', ')}에서 이 도안을 보고 있어요. 삭제하면 연결도 함께 풀려요.`,
        okLabel: '삭제',
        cancelLabel: '취소',
        danger: true,
      } : {
        title: '도안을 삭제할까요?',
        message: '삭제한 도안 파일은 되돌릴 수 없어요.',
        okLabel: '삭제',
        cancelLabel: '취소',
        danger: true,
      });
      if (!ok) return;
      Storage.deletePattern(patternId);
      await FileStore.remove(patternId);
      showBanner('도안을 삭제했어요.');
      go('#/pattern');
    });

    let zoom = 1;
    let page = initial.page;
    let y = initial.y;
    let thickness = initial.barThickness;
    let baseWidth = 0;
    let baseHeight = 0;
    let pdfDoc = null;
    let blobRef = null;

    const content = root.querySelector('#pattern-content');
    const bar = root.querySelector('#highlight-bar');

    function persist() {
      if (!project) return;
      Storage.saveProjectHighlight(project.id, { page, y, barThickness: thickness });
    }

    function layoutBar() {
      // content is laid out at its real zoomed pixel size (width/height set
      // directly, not via CSS transform) so the parent viewport's overflow/
      // scroll works correctly at any zoom level. Bar top/height are in that
      // same zoomed pixel space.
      const zoomedHeight = baseHeight * zoom;
      bar.style.height = `${thickness}px`;
      bar.style.top = `${Math.max(0, Math.min(zoomedHeight - thickness, y * zoomedHeight - thickness / 2))}px`;
    }

    function applyZoom() {
      content.style.width = `${baseWidth * zoom}px`;
      content.style.height = `${baseHeight * zoom}px`;
      root.querySelector('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
      layoutBar();
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
      const pageViewport = pdfPage.getViewport({ scale: 2 });
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
      zoom = Math.min(3, +(zoom + 0.25).toFixed(2));
      applyZoom();
    });
    root.querySelector('[data-action="zoom-out"]').addEventListener('click', () => {
      zoom = Math.max(0.5, +(zoom - 0.25).toFixed(2));
      applyZoom();
    });

    if (pattern.fileType === 'pdf') {
      root.querySelector('[data-action="prev-page"]').addEventListener('click', async () => {
        if (!blobRef || page <= 1) return;
        page -= 1;
        y = 0.5;
        await renderPdfPage(blobRef);
        persist();
      });
      root.querySelector('[data-action="next-page"]').addEventListener('click', async () => {
        if (!blobRef || page >= pattern.pageCount) return;
        page += 1;
        y = 0.5;
        await renderPdfPage(blobRef);
        persist();
      });
    }

    content.addEventListener('click', (e) => {
      if (!baseHeight) return;
      const rect = content.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      y = Math.max(0, Math.min(1, offsetY / (baseHeight * zoom)));
      layoutBar();
      persist();
    });

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
    });
  }

  // ---------- View: Project Form (create/edit) ----------
  function renderProjectForm(id) {
    const editing = !!id;
    const project = editing ? Storage.getProject(id) : null;
    if (editing && !project) return go('#/');

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>${editing ? '작품 수정' : '새 작품'}</h1>
      </header>
      <form id="project-form" class="form">
        <label class="field">
          <span>작품명 <em>*</em></span>
          <input type="text" name="name" value="${project ? Utils.escapeHtml(project.name) : ''}" placeholder="예: 겨울 목도리">
          <p class="field-error" id="name-error" hidden>작품명을 입력해주세요.</p>
        </label>
        <label class="field">
          <span>시작일</span>
          <input type="date" name="startDate" value="${project ? project.startDate : Utils.todayStr()}">
        </label>
        <label class="field">
          <span>사용 실</span>
          <input type="text" name="yarnText" value="${project ? Utils.escapeHtml(project.yarnText) : ''}" placeholder="예: 코스모스 그레이 3볼">
        </label>
        <label class="field">
          <span>바늘 호수</span>
          <input type="text" name="needleSize" value="${project ? Utils.escapeHtml(project.needleSize) : ''}" placeholder="예: 4.5mm">
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
          <button type="submit" class="btn primary block">저장</button>
          ${editing ? `<button type="button" class="btn danger block" data-action="delete">작품 삭제</button>` : ''}
        </div>
      </form>
    `;

    let photos = project ? [...(project.photos || [])] : [];

    root.querySelector('[data-action="back"]').addEventListener('click', () => history.back());

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
          message: '작품과 카운터, 시간 기록, 사진이 모두 삭제돼요.',
          okLabel: '삭제',
          cancelLabel: '취소',
          danger: true,
        });
        if (ok) {
          if (project.yarns && project.yarns.length) {
            const restore = await Modal.confirm({
              title: '연결된 실이 있어요',
              message: '차감했던 실 보유량을 되돌릴까요?',
              okLabel: '되돌리기',
              cancelLabel: '되돌리지 않기',
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
        startDate: fd.get('startDate') || Utils.todayStr(),
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
        const created = Storage.createProject(data);
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
  function renderProjectDetail(id) {
    const project = Storage.getProject(id);
    if (!project) return go('#/');
    setActiveTab('projects');
    const counters = Storage.getCountersByProject(id);
    const mainCounter = counters.find((c) => c.isDefault) || counters[0];
    const extraCounters = counters.filter((c) => c.id !== (mainCounter && mainCounter.id));
    const active = activeSessionFor(id);
    const manualActive = active && active.mode === 'manual';
    const lastAction = Storage.getLastAction();
    const canUndo = lastAction && lastAction.projectId === id;

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>${Utils.escapeHtml(project.name)}</h1>
        <button class="icon-btn" data-action="edit">수정</button>
      </header>

      <div class="status-row">
        ${statusButton(project, 'active', '진행 중')}
        ${statusButton(project, 'onhold', '보류')}
        ${statusButton(project, 'completed', '완성')}
      </div>
      ${project.status === 'completed' ? `
        <div class="field inline">
          <span>완성일</span>
          <input type="date" id="completed-date" value="${project.completedDate || Utils.todayStr()}">
        </div>` : ''}

      <div class="stat-row">
        <div class="stat"><span id="stat-today">${Utils.formatDuration(projectTodayMs(id))}</span><label>오늘 뜬 시간</label></div>
        <div class="stat"><span id="stat-total">${Utils.formatDuration(projectTotalMs(id))}</span><label>총 뜬 시간</label></div>
      </div>

      <div class="manual-record">
        <button class="btn ${manualActive ? 'danger' : 'ghost'} block" data-action="toggle-manual">
          ${manualActive ? `기록 중지 · <span id="manual-timer">${Utils.formatDuration(Date.now() - new Date(active.startAt).getTime())}</span>` : '수동 기록 시작'}
        </button>
      </div>

      ${mainCounter ? mainCounterBlock(mainCounter, canUndo) : ''}

      <div class="extra-counters">
        <div class="section-title-row">
          <h3>추가 카운터</h3>
          <button class="btn ghost sm" data-action="add-counter">+ 카운터 추가</button>
        </div>
        ${extraCounters.map((c) => extraCounterRow(c)).join('')}
      </div>

      <a class="link-row" href="#/project/${id}/sessions">시간 기록 보기 →</a>

      <div class="info-block">
        <h3>작품 정보</h3>
        <dl>
          <dt>시작일</dt><dd>${Utils.formatDate(project.startDate)}</dd>
          <dt>사용 실</dt><dd>${Utils.escapeHtml(project.yarnText) || '-'}</dd>
          <dt>바늘 호수</dt><dd>${Utils.escapeHtml(project.needleSize) || '-'}</dd>
          <dt>메모</dt><dd class="pre">${Utils.escapeHtml(project.memo) || '-'}</dd>
        </dl>
        ${project.photos && project.photos.length ? `
          <div class="photo-grid readonly">
            ${project.photos.map((src) => `<div class="photo-thumb"><img src="${src}" alt=""></div>`).join('')}
          </div>` : ''}
      </div>

      <div class="info-block">
        <h3>연결한 실</h3>
        ${(project.yarns || []).length === 0 ? `<p class="card-meta">연결된 실이 없어요.</p>` : `
          <ul class="yarn-link-list">
            ${(project.yarns || []).map((l) => {
              const liveYarn = Storage.getYarn(l.yarnId);
              const label = liveYarn ? liveYarn.name : `${l.yarnName || '실'} (삭제됨)`;
              return `<li class="yarn-link-row"><span>${Utils.escapeHtml(label)} · ${l.amount}볼</span><button type="button" class="icon-btn sm" data-unlink-yarn="${l.yarnId}">연결 해제</button></li>`;
            }).join('')}
          </ul>`}
        <button type="button" class="btn ghost sm" data-action="link-yarn">+ 실 연결</button>
      </div>

      <div class="info-block">
        <h3>연결한 도안</h3>
        ${project.patternId && Storage.getPattern(project.patternId) ? `
          <p class="card-meta">${Utils.escapeHtml(Storage.getPattern(project.patternId).name)}</p>
          <div class="form-actions">
            <a class="btn ghost sm" href="#/pattern/${project.patternId}/for/${id}">도안 보기</a>
            <button type="button" class="btn ghost sm" data-action="unlink-pattern">연결 해제</button>
          </div>` : `
          <p class="card-meta">연결된 도안이 없어요.</p>
          <button type="button" class="btn ghost sm" data-action="link-pattern">+ 도안 연결</button>`}
      </div>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => go('#/'));
    root.querySelector('[data-action="edit"]').addEventListener('click', () => go(`#/project/${id}/edit`));

    root.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => onStatusChange(project, btn.dataset.status));
    });

    const completedDateInput = root.querySelector('#completed-date');
    if (completedDateInput) {
      completedDateInput.addEventListener('change', () => {
        Storage.updateProject(id, { completedDate: completedDateInput.value });
      });
    }

    root.querySelector('[data-action="toggle-manual"]').addEventListener('click', async () => {
      const cur = activeSessionFor(id);
      if (cur && cur.mode === 'manual') {
        await stopManualSession(cur, project);
      } else {
        await startManualSession(id);
      }
      render();
    });

    if (mainCounter) bindCounterEvents(mainCounter, id);
    extraCounters.forEach((c) => bindCounterEvents(c, id));

    root.querySelector('[data-action="add-counter"]').addEventListener('click', async () => {
      const res = await Modal.open({
        title: '카운터 추가',
        bodyHtml: `<label class="field"><span>이름</span><input type="text" data-field="name" placeholder="예: 무늬 반복" value="카운터"></label>`,
        buttons: [{ id: 'cancel', label: '취소', variant: 'ghost' }, { id: 'ok', label: '추가', variant: 'primary' }],
      });
      if (res.id === 'ok') {
        const name = (res.values.name || '카운터').trim() || '카운터';
        Storage.createCounter({ projectId: id, name });
        render();
      }
    });

    root.querySelectorAll('[data-unlink-yarn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const yarnId = btn.dataset.unlinkYarn;
        const restore = await Modal.confirm({
          title: '연결을 해제할까요?',
          message: '차감했던 보유량을 실 보관함으로 되돌릴까요?',
          okLabel: '되돌리기',
          cancelLabel: '되돌리지 않기',
        });
        Storage.unlinkYarnFromProject(id, yarnId, restore);
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
      const res = await Modal.open({
        title: '실 연결',
        bodyHtml: `
          <label class="field"><span>실 선택</span>
            <select data-field="yarnId">
              ${available.map((y) => `<option value="${y.id}">${Utils.escapeHtml(y.name)} (보유 ${y.amount}볼)</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>사용할 볼 수</span><input type="number" data-field="amount" min="0" step="1" value="1"></label>
        `,
        buttons: [{ id: 'cancel', label: '취소', variant: 'ghost' }, { id: 'ok', label: '연결', variant: 'primary' }],
      });
      if (res.id !== 'ok') return;
      const yarnId = res.values.yarnId;
      const amount = Math.max(0, Number(res.values.amount) || 0);
      const yarn = Storage.getYarn(yarnId);
      if (yarn && amount > yarn.amount) {
        const proceed = await Modal.confirm({
          title: '보유량보다 많아요',
          message: '보유량보다 많이 사용하면 실 보유량은 0이 돼요. 계속할까요?',
          okLabel: '계속',
          cancelLabel: '취소',
        });
        if (!proceed) return;
      }
      Storage.linkYarnToProject(id, yarnId, amount);
      showBanner('실을 연결했어요.');
      render();
    });

    const linkPatternBtn = root.querySelector('[data-action="link-pattern"]');
    if (linkPatternBtn) {
      linkPatternBtn.addEventListener('click', async () => {
        const available = Storage.getPatterns();
        if (!available.length) {
          const goUpload = await Modal.confirm({
            title: '등록된 도안이 없어요',
            message: '도안 탭에서 먼저 도안을 추가해주세요.',
            okLabel: '도안 추가하러 가기',
            cancelLabel: '닫기',
          });
          if (goUpload) go('#/pattern/new');
          return;
        }
        const res = await Modal.open({
          title: '도안 연결',
          bodyHtml: `
            <label class="field"><span>도안 선택</span>
              <select data-field="patternId">
                ${available.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}
              </select>
            </label>
          `,
          buttons: [{ id: 'cancel', label: '취소', variant: 'ghost' }, { id: 'ok', label: '연결', variant: 'primary' }],
        });
        if (res.id !== 'ok') return;
        Storage.linkPatternToProject(id, res.values.patternId);
        showBanner('도안을 연결했어요.');
        render();
      });
    }

    const unlinkPatternBtn = root.querySelector('[data-action="unlink-pattern"]');
    if (unlinkPatternBtn) {
      unlinkPatternBtn.addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: '도안 연결을 해제할까요?',
          message: '하이라이트 위치가 사라져요. 도안 파일 자체는 그대로 남아요.',
          okLabel: '해제',
          cancelLabel: '취소',
        });
        if (!ok) return;
        Storage.unlinkPatternFromProject(id);
        showBanner('도안 연결을 해제했어요.');
        render();
      });
    }
  }

  function statusButton(project, status, label) {
    return `<button class="chip ${project.status === status ? 'active' : ''}" data-status="${status}">${label}</button>`;
  }

  async function onStatusChange(project, status) {
    if (status === project.status) return;
    if (status === 'completed') {
      Storage.updateProject(project.id, { status, completedDate: Utils.todayStr() });
      showBanner('작품을 완성 처리했어요. 아카이브에서 볼 수 있어요.');
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

  function mainCounterBlock(counter, canUndo) {
    return `
      <div class="main-counter" data-counter-id="${counter.id}">
        <div class="counter-header">
          <span class="counter-name">${Utils.escapeHtml(counter.name)}</span>
          <button class="icon-btn sm" data-action="counter-settings">⚙</button>
        </div>
        <button class="tap-area" data-action="counter-tap" aria-label="한 단 추가">
          <span class="counter-value">${counter.value}</span>
          ${counter.cycle > 0 ? `<span class="counter-cycle-tag">${counter.cycle}단마다 알림</span>` : ''}
        </button>
        <div class="counter-controls">
          <button class="btn ghost sm" data-action="counter-minus">-1</button>
          <button class="btn ghost sm" data-action="counter-undo" ${canUndo ? '' : 'disabled'}>실행 취소</button>
          <button class="btn ghost sm" data-action="counter-reset">초기화</button>
        </div>
      </div>`;
  }

  function extraCounterRow(counter) {
    return `
      <div class="counter-row" data-counter-id="${counter.id}">
        <div class="counter-row-main">
          <span class="counter-name">${Utils.escapeHtml(counter.name)}</span>
          ${counter.cycle > 0 ? `<span class="counter-cycle-tag">${counter.cycle}단마다</span>` : ''}
        </div>
        <div class="counter-row-controls">
          <button class="btn ghost sm" data-action="counter-minus">-1</button>
          <span class="counter-row-value">${counter.value}</span>
          <button class="btn ghost sm" data-action="counter-plus">+1</button>
          <button class="icon-btn sm" data-action="counter-settings">⚙</button>
          <button class="icon-btn sm" data-action="counter-delete">🗑</button>
        </div>
      </div>`;
  }

  function bindCounterEvents(counter, projectId) {
    const scope = root.querySelector(`[data-counter-id="${counter.id}"]`);
    if (!scope) return;

    const plusBtn = scope.querySelector('[data-action="counter-tap"], [data-action="counter-plus"]');
    if (plusBtn) {
      plusBtn.addEventListener('click', () => {
        if (!canTap(counter.id)) return;
        changeCounter(counter, 1, projectId);
        if (counter.isDefault || scope.classList.contains('main-counter')) {
          handleCounterTapSession(projectId);
        }
        render();
      });
    }
    const minusBtn = scope.querySelector('[data-action="counter-minus"]');
    if (minusBtn) {
      minusBtn.addEventListener('click', () => {
        changeCounter(counter, -1, projectId);
        render();
      });
    }
    const undoBtn = scope.querySelector('[data-action="counter-undo"]');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        undoLastAction();
        render();
      });
    }
    const resetBtn = scope.querySelector('[data-action="counter-reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: '카운터를 초기화할까요?',
          message: `"${Utils.escapeHtml(counter.name)}" 카운터를 0으로 되돌려요.`,
          okLabel: '초기화',
          cancelLabel: '취소',
        });
        if (ok) {
          Storage.updateCounter(counter.id, { value: 0 });
          Storage.setLastAction(null);
          render();
        }
      });
    }
    const settingsBtn = scope.querySelector('[data-action="counter-settings"]');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => openCounterSettings(counter, projectId));
    }
    const deleteBtn = scope.querySelector('[data-action="counter-delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: '카운터를 삭제할까요?',
          message: `"${Utils.escapeHtml(counter.name)}" 카운터와 기록된 값이 삭제돼요.`,
          okLabel: '삭제',
          cancelLabel: '취소',
          danger: true,
        });
        if (ok) {
          Storage.deleteCounter(counter.id);
          render();
        }
      });
    }
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
          if (currentRoute.name === 'project-detail') render();
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

  function undoLastAction() {
    const action = Storage.getLastAction();
    if (!action) return;
    Storage.updateCounter(action.counterId, { value: action.prevValue });
    Storage.setLastAction(null);
  }

  async function openCounterSettings(counter, projectId) {
    const res = await Modal.open({
      title: '카운터 설정',
      bodyHtml: `
        <label class="field"><span>이름</span><input type="text" data-field="name" value="${Utils.escapeHtml(counter.name)}"></label>
        <label class="field"><span>N단마다 알림 (0 = 끔)</span><input type="number" min="0" data-field="cycle" value="${counter.cycle || 0}"></label>
        <label class="field checkbox"><input type="checkbox" data-field="autoReset" ${counter.autoReset ? 'checked' : ''}><span>주기에 도달하면 0으로 자동 리셋</span></label>
      `,
      buttons: [{ id: 'cancel', label: '취소', variant: 'ghost' }, { id: 'ok', label: '저장', variant: 'primary' }],
    });
    if (res.id !== 'ok') return;
    const name = (res.values.name || counter.name).trim() || counter.name;
    const cycle = Math.max(0, parseInt(res.values.cycle, 10) || 0);
    Storage.updateCounter(counter.id, { name, cycle, autoReset: !!res.values.autoReset });
    render();
  }

  // ---------- View: Sessions ----------
  function renderSessions(projectId) {
    const project = Storage.getProject(projectId);
    if (!project) return go('#/');
    const sessions = Storage.getSessionsByProject(projectId);

    root.innerHTML = `
      <header class="page-header with-back">
        <button class="icon-btn" data-action="back">←</button>
        <h1>시간 기록</h1>
      </header>
      <div class="session-list">
        ${sessions.length === 0 ? emptyState('기록이 없어요', '카운터를 탭하거나 수동 기록을 시작해보세요.') : sessions.map(sessionRow).join('')}
      </div>
    `;

    root.querySelector('[data-action="back"]').addEventListener('click', () => go(`#/project/${projectId}`));
    root.querySelectorAll('[data-session-id]').forEach((row) => {
      const sessionId = row.dataset.sessionId;
      row.querySelector('[data-action="edit-session"]').addEventListener('click', () => editSession(sessionId, projectId));
      row.querySelector('[data-action="delete-session"]').addEventListener('click', async () => {
        const ok = await Modal.confirm({ title: '기록을 삭제할까요?', message: '이 시간 기록을 삭제해요.', okLabel: '삭제', cancelLabel: '취소', danger: true });
        if (ok) {
          Storage.deleteSession(sessionId);
          renderSessions(projectId);
        }
      });
    });
  }

  function sessionRow(s) {
    const durationMs = new Date(s.endAt) - new Date(s.startAt);
    return `
      <div class="session-item" data-session-id="${s.id}">
        <div class="session-main">
          <span class="session-date">${Utils.formatDate(s.startAt)}</span>
          <span class="session-mode">${s.mode === 'auto' ? '자동' : '수동'}</span>
        </div>
        <div class="session-time">${Utils.formatDateTime(s.startAt).split(' ')[1]} - ${Utils.formatDateTime(s.endAt).split(' ')[1]} · ${Utils.formatDuration(durationMs)}</div>
        <div class="session-actions">
          <button class="btn ghost sm" data-action="edit-session">수정</button>
          <button class="btn ghost sm" data-action="delete-session">삭제</button>
        </div>
      </div>`;
  }

  async function editSession(sessionId, projectId) {
    const sessions = Storage.getSessions();
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const res = await Modal.open({
      title: '기록 수정',
      bodyHtml: `
        <label class="field"><span>시작 시각</span><input type="datetime-local" data-field="startAt" value="${Utils.toDateTimeLocal(s.startAt)}"></label>
        <label class="field"><span>종료 시각</span><input type="datetime-local" data-field="endAt" value="${Utils.toDateTimeLocal(s.endAt)}"></label>
      `,
      buttons: [{ id: 'cancel', label: '취소', variant: 'ghost' }, { id: 'ok', label: '저장', variant: 'primary' }],
    });
    if (res.id !== 'ok') return;
    const startAt = new Date(res.values.startAt).toISOString();
    const endAt = new Date(res.values.endAt).toISOString();
    if (new Date(endAt) <= new Date(startAt)) {
      showBanner('종료 시각은 시작 시각보다 늦어야 해요.', 'warn');
      return;
    }
    Storage.updateSession(sessionId, { startAt, endAt });
    renderSessions(projectId);
  }

  // ---------- Backup reminder ----------
  function checkBackupReminder() {
    const settings = Storage.getSettings();
    const last = settings.lastBackupAt;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (!last || Date.now() - new Date(last).getTime() > THIRTY_DAYS) {
      showBanner('마지막 백업이 오래됐어요. 도구 탭에서 백업할 수 있어요.', 'info', 5000);
    }
  }

  // ---------- Service worker ----------
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.error('SW register failed', e));
    }
  }

  // ---------- Init ----------
  function init() {
    window.addEventListener('hashchange', render);
    window.addEventListener('beforeunload', () => {
      const active = Storage.getActiveSession();
      if (active && active.mode === 'auto') {
        active.lastTapAt = active.lastTapAt || active.startAt;
        Storage.setActiveSession(active);
      }
    });
    render();
    startClock();
    checkPendingSessionOnBoot();
    checkBackupReminder();
    registerServiceWorker();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
