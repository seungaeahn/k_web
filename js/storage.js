const Storage = (() => {
  const KEYS = {
    projects: 'kw_projects',
    counters: 'kw_counters',
    sessions: 'kw_sessions',
    settings: 'kw_settings',
    activeSession: 'kw_active_session',
    lastAction: 'kw_last_action',
  };

  const DEFAULT_SETTINGS = { autoEndMinutes: 15, lastBackupAt: null };

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
    getSettings, saveSettings,
    getActiveSession, setActiveSession,
    getLastAction, setLastAction,
  };
})();
