const Storage = (() => {
  const KEYS = {
    projects: 'kw_projects',
    counters: 'kw_counters',
    sessions: 'kw_sessions',
    yarns: 'kw_yarns',
    patterns: 'kw_patterns',
    savedPatterns: 'kw_saved_patterns',
    abbreviations: 'kw_abbreviations',
    settings: 'kw_settings',
    activeSession: 'kw_active_session',
    lastAction: 'kw_last_action',
  };

  const DEFAULT_SETTINGS = { autoEndMinutes: 15, lastBackupAt: null, ravelryKey: '', ravelrySecret: '' };

  const DEFAULT_ABBREVIATIONS = [
    { term: 'k', desc: '겉뜨기' },
    { term: 'p', desc: '안뜨기' },
    { term: 'k2tog', desc: '겉뜨기 2코 모아뜨기 (오른쪽으로 기울어짐)' },
    { term: 'p2tog', desc: '안뜨기 2코 모아뜨기' },
    { term: 'ssk', desc: '코를 하나씩 옮겨 걸고 겉뜨기로 모아뜨기 (왼쪽으로 기울어짐)' },
    { term: 'yo', desc: '바늘에 실을 감아 걸기 (콧수 늘리기)' },
    { term: 'sl', desc: '코를 뜨지 않고 그대로 옮기기' },
    { term: 'psso', desc: '옮긴 코를 바로 앞 코 위로 넘기기' },
    { term: 'kfb', desc: '한 코의 앞뒤에 각각 겉뜨기해서 한 코 늘리기' },
    { term: 'm1', desc: '코와 코 사이의 실을 들어올려 한 코 늘리기' },
    { term: 'co', desc: '코 만들기 (기초코)' },
    { term: 'bo', desc: '코 막기' },
    { term: 'rs', desc: '겉면 단' },
    { term: 'ws', desc: '안면 단' },
    { term: 'rep', desc: '반복' },
    { term: 'st(s)', desc: '코(들)' },
    { term: 'rnd(s)', desc: '단 (둥근뜨기 기준)' },
    { term: 'pm', desc: '스티치 마커 놓기' },
    { term: 'sm', desc: '마커를 오른쪽 바늘로 옮기기' },
    { term: 'dpn', desc: '장갑바늘 (양쪽 바늘)' },
    { term: 'circ', desc: '줄바늘' },
    { term: 'tbl', desc: '코의 뒷면으로 뜨기' },
    { term: 'wyif', desc: '실을 뜨개 앞쪽에 두고 뜨기' },
    { term: 'wyib', desc: '실을 뜨개 뒤쪽에 두고 뜨기' },
    { term: 'c4f', desc: '4코 꽈배기, 앞쪽으로 교차' },
    { term: 'c4b', desc: '4코 꽈배기, 뒤쪽으로 교차' },
    { term: 'gauge', desc: '게이지, 정해진 크기당 코 수와 단 수' },
  ];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('storage read failed', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('storage write failed', key, e);
      return false;
    }
  }

  // ---- Projects ----
  function getProjects() {
    return read(KEYS.projects, []);
  }
  function saveProjects(list) {
    return write(KEYS.projects, list);
  }
  function getProject(id) {
    return getProjects().find((p) => p.id === id) || null;
  }
  function createProject(data) {
    const projects = getProjects();
    const now = new Date().toISOString();
    const project = {
      id: Utils.uid(),
      name: data.name,
      status: 'active',
      startDate: data.startDate || Utils.todayStr(),
      completedDate: null,
      yarnText: data.yarnText || '',
      needleSize: data.needleSize || '',
      memo: data.memo || '',
      photos: data.photos || [],
      mainPhotoIndex: 0,
      yarns: data.yarns || [],
      patternId: data.patternId || null,
      highlight: data.highlight || null,
      lastWorkedAt: now,
      createdAt: now,
    };
    projects.push(project);
    saveProjects(projects);
    createCounter({ projectId: project.id, name: '단수', isDefault: true });
    return project;
  }
  function updateProject(id, patch) {
    const projects = getProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    projects[idx] = { ...projects[idx], ...patch };
    saveProjects(projects);
    return projects[idx];
  }
  function touchProject(id) {
    updateProject(id, { lastWorkedAt: new Date().toISOString() });
  }
  function deleteProject(id) {
    saveProjects(getProjects().filter((p) => p.id !== id));
    saveCounters(getCounters().filter((c) => c.projectId !== id));
    saveSessions(getSessions().filter((s) => s.projectId !== id));
    const active = getActiveSession();
    if (active && active.projectId === id) setActiveSession(null);
  }

  // ---- Counters ----
  function getCounters() {
    return read(KEYS.counters, []);
  }
  function saveCounters(list) {
    return write(KEYS.counters, list);
  }
  function getCountersByProject(projectId) {
    return getCounters().filter((c) => c.projectId === projectId);
  }
  function createCounter({ projectId, name, isDefault = false }) {
    const counters = getCounters();
    const counter = {
      id: Utils.uid(),
      projectId,
      name: name || '카운터',
      value: 0,
      cycle: 0,
      autoReset: false,
      isDefault: !!isDefault,
    };
    counters.push(counter);
    saveCounters(counters);
    return counter;
  }
  function updateCounter(id, patch) {
    const counters = getCounters();
    const idx = counters.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    counters[idx] = { ...counters[idx], ...patch };
    saveCounters(counters);
    return counters[idx];
  }
  function deleteCounter(id) {
    saveCounters(getCounters().filter((c) => c.id !== id));
  }

  // ---- Sessions ----
  function getSessions() {
    return read(KEYS.sessions, []);
  }
  function saveSessions(list) {
    return write(KEYS.sessions, list);
  }
  function getSessionsByProject(projectId) {
    return getSessions()
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  }
  function addSession(session) {
    const sessions = getSessions();
    const record = { id: Utils.uid(), ...session };
    sessions.push(record);
    saveSessions(sessions);
    return record;
  }
  function updateSession(id, patch) {
    const sessions = getSessions();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    sessions[idx] = { ...sessions[idx], ...patch };
    saveSessions(sessions);
    return sessions[idx];
  }
  function deleteSession(id) {
    saveSessions(getSessions().filter((s) => s.id !== id));
  }

  // ---- Yarns ----
  // 예전 한국어 굵기 값 → 영어 (기존 데이터·예전 백업을 읽을 때 한 번 바꿔서 저장)
  const LEGACY_WEIGHTS = { 레이스: 'Lace', 합연사: 'Fingering', 중세: 'DK', 합태: 'Worsted', 극태: 'Bulky', 특극태: 'Super Bulky' };
  function getYarns() {
    const list = read(KEYS.yarns, []);
    if (!list.some((y) => LEGACY_WEIGHTS[y.weight])) return list;
    const migrated = list.map((y) => (LEGACY_WEIGHTS[y.weight] ? { ...y, weight: LEGACY_WEIGHTS[y.weight] } : y));
    write(KEYS.yarns, migrated);
    return migrated;
  }
  function saveYarns(list) {
    return write(KEYS.yarns, list);
  }
  function getYarn(id) {
    return getYarns().find((y) => y.id === id) || null;
  }
  function createYarn(data) {
    const yarns = getYarns();
    const yarn = {
      id: Utils.uid(),
      name: data.name,
      color: data.color || '',
      weight: data.weight || '',
      material: data.material || '',
      amount: Math.max(0, Number(data.amount) || 0),
      lengthPerBall: data.lengthPerBall != null && data.lengthPerBall !== '' ? Number(data.lengthPerBall) : null,
      weightPerBall: data.weightPerBall != null && data.weightPerBall !== '' ? Number(data.weightPerBall) : null,
      photo: data.photo || null,
      ravelryYarnId: data.ravelryYarnId || null,
      needleSize: data.needleSize || '',
      createdAt: new Date().toISOString(),
    };
    yarns.push(yarn);
    saveYarns(yarns);
    return yarn;
  }
  function updateYarn(id, patch) {
    const yarns = getYarns();
    const idx = yarns.findIndex((y) => y.id === id);
    if (idx === -1) return null;
    yarns[idx] = { ...yarns[idx], ...patch };
    saveYarns(yarns);
    return yarns[idx];
  }
  function deleteYarn(id) {
    saveYarns(getYarns().filter((y) => y.id !== id));
  }
  function getProjectsLinkedToYarn(yarnId) {
    return getProjects().filter((p) => (p.yarns || []).some((l) => l.yarnId === yarnId));
  }
  function linkYarnToProject(projectId, yarnId, amount) {
    const project = getProject(projectId);
    const yarn = getYarn(yarnId);
    if (!project || !yarn) return null;
    const amt = Math.max(0, Number(amount) || 0);
    updateYarn(yarnId, { amount: Math.max(0, yarn.amount - amt) });
    const yarns = [...(project.yarns || []), { yarnId, yarnName: yarn.name, amount: amt }];
    return updateProject(projectId, { yarns });
  }
  function unlinkYarnFromProject(projectId, yarnId, restore) {
    const project = getProject(projectId);
    if (!project) return null;
    const link = (project.yarns || []).find((l) => l.yarnId === yarnId);
    const yarns = (project.yarns || []).filter((l) => l.yarnId !== yarnId);
    updateProject(projectId, { yarns });
    if (restore && link) {
      const yarn = getYarn(yarnId);
      if (yarn) updateYarn(yarnId, { amount: yarn.amount + link.amount });
    }
    return true;
  }
  function restoreYarnAmounts(project) {
    (project.yarns || []).forEach((link) => {
      const yarn = getYarn(link.yarnId);
      if (yarn) updateYarn(link.yarnId, { amount: yarn.amount + link.amount });
    });
  }

  // ---- Abbreviations ----
  function seedAbbreviationsIfEmpty() {
    if (read(KEYS.abbreviations, null) === null) {
      const seeded = DEFAULT_ABBREVIATIONS.map((a) => ({
        id: Utils.uid(), term: a.term, description: a.desc, isDefault: true,
      }));
      write(KEYS.abbreviations, seeded);
    }
  }
  function getAbbreviations() {
    seedAbbreviationsIfEmpty();
    return read(KEYS.abbreviations, []);
  }
  function saveAbbreviations(list) {
    return write(KEYS.abbreviations, list);
  }
  function findAbbreviationByTerm(term, excludeId) {
    return getAbbreviations().find((a) => a.term.toLowerCase() === term.toLowerCase() && a.id !== excludeId) || null;
  }
  function createAbbreviation({ term, description }) {
    const list = getAbbreviations();
    const abbr = { id: Utils.uid(), term, description, isDefault: false };
    list.push(abbr);
    saveAbbreviations(list);
    return abbr;
  }
  function updateAbbreviation(id, patch) {
    const list = getAbbreviations();
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    saveAbbreviations(list);
    return list[idx];
  }
  function deleteAbbreviation(id) {
    saveAbbreviations(getAbbreviations().filter((a) => a.id !== id));
  }
  function getMissingDefaultAbbreviations() {
    const current = getAbbreviations();
    return DEFAULT_ABBREVIATIONS.filter((d) => !current.some((a) => a.term.toLowerCase() === d.term.toLowerCase()));
  }
  function restoreDefaultAbbreviations() {
    const missing = getMissingDefaultAbbreviations();
    if (!missing.length) return [];
    const list = getAbbreviations();
    const restored = missing.map((d) => ({ id: Utils.uid(), term: d.term, description: d.desc, isDefault: true }));
    saveAbbreviations([...list, ...restored]);
    return restored;
  }

  // ---- Patterns (metadata only; file bytes live in FileStore/IndexedDB) ----
  function getPatterns() {
    return read(KEYS.patterns, []);
  }
  function savePatterns(list) {
    return write(KEYS.patterns, list);
  }
  function getPattern(id) {
    return getPatterns().find((p) => p.id === id) || null;
  }
  function createPattern(data) {
    const patterns = getPatterns();
    const pattern = {
      id: Utils.uid(),
      name: data.name,
      fileType: data.fileType,
      fileSize: data.fileSize || 0,
      pageCount: data.pageCount || 1,
      needleSize: data.needleSize || '',
      createdAt: new Date().toISOString(),
    };
    patterns.push(pattern);
    savePatterns(patterns);
    return pattern;
  }
  function updatePattern(id, patch) {
    const patterns = getPatterns();
    const idx = patterns.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    patterns[idx] = { ...patterns[idx], ...patch };
    savePatterns(patterns);
    return patterns[idx];
  }
  function deletePattern(id) {
    savePatterns(getPatterns().filter((p) => p.id !== id));
    const projects = getProjects().map((p) => (
      p.patternId === id ? { ...p, patternId: null, highlight: null } : p
    ));
    saveProjects(projects);
  }
  function getProjectsLinkedToPattern(patternId) {
    return getProjects().filter((p) => p.patternId === patternId);
  }
  function linkPatternToProject(projectId, patternId) {
    return updateProject(projectId, { patternId, highlight: { page: 1, y: 0.5, barThickness: 40 } });
  }
  function unlinkPatternFromProject(projectId) {
    return updateProject(projectId, { patternId: null, highlight: null });
  }
  function saveProjectHighlight(projectId, highlight) {
    return updateProject(projectId, { highlight });
  }

  // ---- Saved (favorited) Ravelry patterns ----
  function getSavedPatterns() {
    return read(KEYS.savedPatterns, []);
  }
  function saveSavedPatterns(list) {
    return write(KEYS.savedPatterns, list);
  }
  function isPatternSaved(ravelryPatternId) {
    return getSavedPatterns().some((p) => p.ravelryPatternId === ravelryPatternId);
  }
  function saveFavoritePattern(data) {
    const list = getSavedPatterns();
    if (list.some((p) => p.ravelryPatternId === data.ravelryPatternId)) return null;
    const rec = {
      id: Utils.uid(),
      ravelryPatternId: data.ravelryPatternId,
      name: data.name,
      photoUrl: data.photoUrl || null,
      url: data.url,
      needleSize: data.needleSize || '',
      savedAt: new Date().toISOString(),
    };
    list.push(rec);
    saveSavedPatterns(list);
    return rec;
  }
  function unfavoritePattern(ravelryPatternId) {
    saveSavedPatterns(getSavedPatterns().filter((p) => p.ravelryPatternId !== ravelryPatternId));
  }

  // ---- Backup ----
  function exportBackup(includePhotos) {
    const projects = getProjects().map((p) => (includePhotos ? p : { ...p, photos: [], mainPhotoIndex: 0 }));
    const yarns = getYarns().map((y) => (includePhotos ? y : { ...y, photo: null }));
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      includesPhotos: !!includePhotos,
      data: {
        projects,
        counters: getCounters(),
        sessions: getSessions(),
        yarns,
        abbreviations: getAbbreviations(),
      },
    };
    saveSettings({ lastBackupAt: new Date().toISOString() });
    return payload;
  }
  function importBackup(parsed) {
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return false;
    const { data } = parsed;
    if (!Array.isArray(data.projects) || !Array.isArray(data.counters) || !Array.isArray(data.sessions)
      || !Array.isArray(data.yarns) || !Array.isArray(data.abbreviations)) return false;
    saveProjects(data.projects);
    saveCounters(data.counters);
    saveSessions(data.sessions);
    saveYarns(data.yarns);
    saveAbbreviations(data.abbreviations);
    setActiveSession(null);
    setLastAction(null);
    return true;
  }

  // ---- Settings ----
  function getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
  }
  function saveSettings(patch) {
    const merged = { ...getSettings(), ...patch };
    write(KEYS.settings, merged);
    return merged;
  }

  // ---- Active session (survives reload) ----
  function getActiveSession() {
    return read(KEYS.activeSession, null);
  }
  function setActiveSession(session) {
    if (session === null) {
      localStorage.removeItem(KEYS.activeSession);
    } else {
      write(KEYS.activeSession, session);
    }
  }

  // ---- Last counter action (single-level undo) ----
  function getLastAction() {
    return read(KEYS.lastAction, null);
  }
  function setLastAction(action) {
    if (action === null) localStorage.removeItem(KEYS.lastAction);
    else write(KEYS.lastAction, action);
  }

  return {
    getProjects, saveProjects, getProject, createProject, updateProject, touchProject, deleteProject,
    getCounters, getCountersByProject, createCounter, updateCounter, deleteCounter,
    getSessions, getSessionsByProject, addSession, updateSession, deleteSession,
    getYarns, getYarn, createYarn, updateYarn, deleteYarn,
    getProjectsLinkedToYarn, linkYarnToProject, unlinkYarnFromProject, restoreYarnAmounts,
    getAbbreviations, findAbbreviationByTerm, createAbbreviation, updateAbbreviation, deleteAbbreviation,
    getMissingDefaultAbbreviations, restoreDefaultAbbreviations,
    getPatterns, getPattern, createPattern, updatePattern, deletePattern,
    getProjectsLinkedToPattern, linkPatternToProject, unlinkPatternFromProject, saveProjectHighlight,
    getSavedPatterns, isPatternSaved, saveFavoritePattern, unfavoritePattern,
    exportBackup, importBackup,
    getSettings, saveSettings,
    getActiveSession, setActiveSession,
    getLastAction, setLastAction,
  };
})();
