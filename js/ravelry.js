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

  const WEIGHT_SEARCH_TERM = {
    레이스: 'lace',
    합연사: 'fingering',
    중세: 'dk',
    합태: 'worsted',
    극태: 'bulky',
    특극태: 'super bulky',
  };

  const PATTERN_TYPES = [
    { ko: '목도리', en: 'scarf' },
    { ko: '모자', en: 'hat' },
    { ko: '스웨터', en: 'sweater' },
    { ko: '가디건', en: 'cardigan' },
    { ko: '숄', en: 'shawl' },
    { ko: '장갑', en: 'mittens' },
    { ko: '양말', en: 'socks' },
  ];

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

  async function searchPatterns({ typeTerm, weight, craft, freeOnly, ravelryYarnId, page = 1 } = {}) {
    const params = new URLSearchParams();
    if (ravelryYarnId) {
      // Yarn is linked to a specific Ravelry yarn record: prioritize patterns
      // actually made with that yarn, per PRD 6.10's recommendation order.
      params.set('yarn_ids', String(ravelryYarnId));
      if (typeTerm) params.set('query', typeTerm);
    } else {
      // Not linked to Ravelry (e.g. a domestic/local yarn): fall back to
      // searching by weight + pattern type.
      const terms = [typeTerm, weight ? WEIGHT_SEARCH_TERM[weight] : ''].filter(Boolean);
      params.set('query', terms.join(' ') || '*');
    }
    if (craft) params.set('craft', craft);
    if (freeOnly) params.set('availability', 'free');
    params.set('photo', 'yes');
    params.set('sort', 'favorites');
    params.set('page_size', '10');
    params.set('page', String(page));

    const data = await request(`/patterns/search.json?${params.toString()}`);
    const basics = (data.patterns || []).map((p) => ({
      id: p.id,
      name: p.name,
      designer: (p.designer && p.designer.name) || (p.pattern_author && p.pattern_author.name) || '',
      free: !!p.free,
      thumbnail: p.first_photo
        ? (p.first_photo.small2_url || p.first_photo.small_url || p.first_photo.thumbnail_url)
        : null,
      url: `https://www.ravelry.com/patterns/library/${p.permalink}`,
    }));

    const detailed = await Promise.all(basics.map(async (b) => {
      try {
        const d = await request(`/patterns/${b.id}.json`);
        const yd = d.pattern || {};
        const yardsMin = yd.yardage || null;
        const yardsMax = yd.yardage_max || yd.yardage || null;
        return {
          ...b,
          metersMin: yardsMin ? Math.round(yardsMin * 0.9144) : null,
          metersMax: yardsMax ? Math.round(yardsMax * 0.9144) : null,
        };
      } catch (e) {
        return { ...b, metersMin: null, metersMax: null };
      }
    }));

    const paginator = data.paginator || {};
    return { items: detailed, hasMore: page < (paginator.last_page || paginator.page_count || page) };
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

  return { isConfigured, testConnection, searchYarns, getYarnDetail, searchPatterns, errorMessage, PATTERN_TYPES };
})();
