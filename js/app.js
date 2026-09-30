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
    if (parts[0] === 'yarn') return { name: 'placeholder', params: { tab: 'yarn' } };
    if (parts[0] === 'pattern') return { name: 'placeholder', params: { tab: 'pattern' } };
    if (parts[0] === 'tools') return { name: 'placeholder', params: { tab: 'tools' } };
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
      case 'placeholder': return renderPlaceholder(route.params.tab);
      case 'project-form': return renderProjectForm(route.params.id);
      case 'project-detail': return renderProjectDetail(route.params.id);
      case 'sessions': return renderSessions(route.params.id);
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
  function renderPlaceholder(tab) {
    setActiveTab(tab);
    const titles = { yarn: '실', pattern: '도안', tools: '도구' };
    root.innerHTML = `
      <header class="page-header"><h1>${titles[tab]}</h1></header>
      ${emptyState('준비 중이에요', '다음 개발 단계에서 만나볼 수 있어요.')}
    `;
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
    registerServiceWorker();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
