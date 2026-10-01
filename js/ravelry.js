const Ravelry = (() => {
  const BASE = 'https://api.ravelry.com';

  const WEIGHT_MAP = {
    lace: '레이스',
    cobweb: '레이스',
    thread: '레이스',
    'light fingering': '합연사',
    fingering: '합연사',
    sock: '합연사',
    sport: '중세',
    dk: '중세',
    worsted: '합태',
    aran: '합태',
    bulky: '극태',
    'super bulky': '특극태',
    jumbo: '특극태',
  };

  function mapWeight(name) {
    if (!name) return '';
    return WEIGHT_MAP[name.toLowerCase().trim()] || '';
  }

  function makeError(code) {
    const err = new Error(code);
    err.code = code;
    return err;
  }

  function authHeader() {
    const { ravelryKey, ravelrySecret } = Storage.getSettings();
    if (!ravelryKey || !ravelrySecret) return null;
    return `Basic ${btoa(`${ravelryKey}:${ravelrySecret}`)}`;
  }

  function isConfigured() {
    const { ravelryKey, ravelrySecret } = Storage.getSettings();
    return !!(ravelryKey && ravelrySecret);
  }

  async function request(path) {
    const auth = authHeader();
    if (!auth) throw makeError('not-configured');
    if (navigator.onLine === false) throw makeError('offline');

    let res;
    try {
      res = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
    } catch (e) {
      throw makeError('network');
    }
    if (res.status === 401 || res.status === 403) throw makeError('auth');
    if (!res.ok) throw makeError('server');
    try {
      return await res.json();
    } catch (e) {
      throw makeError('server');
    }
  }

  async function testConnection() {
    await request('/yarns/search.json?query=wool&page_size=1');
    return true;
  }

  async function searchYarns(query) {
    const data = await request(`/yarns/search.json?query=${encodeURIComponent(query)}&page_size=15`);
    return (data.yarns || []).map((y) => ({
      id: y.id,
      name: y.name,
      company: y.yarn_company_name || '',
    }));
  }

  async function getYarnDetail(id) {
    const data = await request(`/yarns/${id}.json`);
    const y = data.yarn || {};
    const weightName = y.yarn_weight && y.yarn_weight.name;
    const company = (y.yarn_company && y.yarn_company.name) || y.yarn_company_name || '';
    const material = Array.isArray(y.yarn_fibers) && y.yarn_fibers.length
      ? y.yarn_fibers.map((f) => {
          const typeName = f.fiber_type && f.fiber_type.name;
          if (!typeName) return '';
          return f.percentage ? `${typeName} ${f.percentage}%` : typeName;
        }).filter(Boolean).join(', ')
      : '';
    const yards = y.yardage || null;
    return {
      name: [company, y.name].filter(Boolean).join(' '),
      weight: mapWeight(weightName),
      material,
      lengthPerBall: yards ? Math.round(yards * 0.9144) : null,
      weightPerBall: y.grams || null,
      ravelryYarnId: y.id || id,
    };
  }

  function errorMessage(err) {
    switch (err && err.code) {
      case 'offline':
      case 'network':
        return '인터넷 연결이 필요해요.';
      case 'not-configured':
        return 'Ravelry 연동을 먼저 설정해주세요.';
      case 'auth':
        return 'Ravelry 키가 올바르지 않아요. 설정에서 다시 확인해주세요.';
      default:
        return '잠시 후 다시 시도해주세요.';
    }
  }

  return { isConfigured, testConnection, searchYarns, getYarnDetail, errorMessage };
})();
