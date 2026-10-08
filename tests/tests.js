// 실실 자동 테스트 (docs/TESTCASES.md의 TC 번호와 같음)
// - 실제 앱 화면을 띄워 버튼을 누르고 입력하며 확인함. 저장소는 메모리(?demo=test)라 실제 기록과 무관
// - 결과는 #test-results[data-results]에 base64(JSON)로 남기고, tests/run.js가 읽어서 출력
(() => {
  const TESTS = [];
  const test = (id, name, fn) => TESTS.push({ id, name, fn });

  // ---------- 도우미 ----------
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what = '조건', timeout = 4000) {
    const start = Date.now();
    for (;;) {
      let v;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - start > timeout) throw new Error(`기다렸지만 안 됨: ${what}`);
      await sleep(20);
    }
  }
  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  function eq(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${msg}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);
    }
  }
  async function nav(hash) {
    if (location.hash === hash) { location.hash = '#/tools'; await sleep(30); }
    location.hash = hash;
    await sleep(40);
  }
  async function click(target, what) {
    const el = typeof target === 'string' ? await until(() => $(target), what || target) : target;
    el.click();
    await sleep(40);
    return el;
  }
  function type(target, value) {
    const el = typeof target === 'string' ? $(target) : target;
    assert(el, `입력칸 없음: ${target}`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el;
  }
  async function submit(formSel) {
    const form = $(formSel);
    assert(form, `폼 없음: ${formSel}`);
    form.requestSubmit();
    await sleep(60);
  }
  const banner = () => $('#banner').textContent;
  const modal = () => $('.modal-overlay');
  async function modalField(field, value) {
    const el = await until(() => $(`.modal-overlay [data-field="${field}"]`), `팝업 입력칸 ${field}`);
    el.value = value;
  }
  async function modalBtn(id) {
    await click(await until(() => $(`.modal-overlay [data-modal-btn="${id}"]`), `팝업 버튼 ${id}`));
    await sleep(40);
  }
  async function pickItem(value) {
    await click(await until(() => $(`.modal-overlay [data-picker-value="${value}"]`), `고르기 항목 ${value}`));
    await sleep(40);
  }
  function setFiles(input, files) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pngFile(name = 'chart-test.png', w = 300, h = 600) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3E6577';
    for (let y = 0; y < h; y += 20) ctx.fillRect(0, y, w, 1);
    return new Promise((r) => c.toBlob((b) => r(new File([b], name, { type: 'image/png' })), 'image/png'));
  }

  // 매 테스트 전에 빈 상태로
  async function reset() {
    $$('.modal-overlay').forEach((m) => m.remove());
    Storage.getProjects().forEach((p) => Storage.deleteProject(p.id));
    Storage.saveProjects([]);
    Storage.getCounters().forEach((c) => Storage.deleteCounter(c.id));
    Storage.getYarns().forEach((y) => Storage.deleteYarn(y.id));
    for (const pt of Storage.getPatterns()) { Storage.deletePattern(pt.id); await FileStore.remove(pt.id); }
    Storage.getSavedPatterns().forEach((f) => Storage.unfavoritePattern(f.ravelryPatternId));
    Storage.saveSettings({ ravelryKey: '', ravelrySecret: '', highlightColor: null, lastBackupAt: new Date().toISOString() });
    Storage.getAbbreviations().filter((ab) => !ab.isDefault).forEach((ab) => Storage.deleteAbbreviation(ab.id));
    Storage.restoreDefaultAbbreviations();
    window.fetch = realFetch;
    $('#banner').textContent = '';
    await nav('#/');
  }
  const realFetch = window.fetch.bind(window);

  // 데이터 만들기
  const mkYarn = (data) => Storage.createYarn({ name: '테스트 실', amount: 10, weightPerBall: 50, ...data });
  function mkFO(name, yarn, used, date) {
    const p = Storage.createProject({ name });
    Storage.linkYarnToProject(p.id, yarn.id);
    Storage.recordYarnUsage(p.id, yarn.id, used);
    Storage.updateProject(p.id, { status: 'completed', completedDate: date || Utils.todayStr() });
    return Storage.getProject(p.id);
  }
  async function mkPattern(name = '테스트 차트', needleSize = '') {
    const pt = Storage.createPattern({ name, fileType: 'image', fileSize: 1000, needleSize });
    await FileStore.put(pt.id, await pngFile());
    return pt;
  }

  // =====================================================================
  // 공통 · 저장소
  // =====================================================================
  test('COM-01', '테스트 모드는 메모리 저장소를 쓰고 목업 데이터를 채우지 않는다', async () => {
    assert(Utils.isDemo && Utils.demoMode === 'test', '테스트 모드가 아님');
    assert(Storage.usesMemory && FileStore.usesMemory, '메모리 저장소가 아님');
    eq(Storage.getProjects().length, 0, '작품 수');
    assert(!$('.demo-badge'), '데모 표시가 보이면 안 됨');
  });

  test('COM-02', '하단 탭 5개로 각 화면에 가고, 누른 탭이 활성화된다', async () => {
    const tabs = [['#/yarn', 'yarn', 'Yarn'], ['#/pattern', 'pattern', 'Patterns'], ['#/tools', 'tools', 'Tools'], ['#/archive', 'archive', 'Archive'], ['#/', 'projects', 'Projects']];
    for (const [hash, tab, title] of tabs) {
      await click(`.tabbar a[data-tab="${tab}"]`);
      await sleep(40);
      eq(location.hash || '#/', hash, '주소');
      eq($('.page-header h1').textContent.trim(), title, '화면 제목');
      assert($(`.tabbar a[data-tab="${tab}"]`).classList.contains('active'), `${tab} 탭 활성화`);
    }
  });

  test('COM-03', '앱 이름이 실실로 바뀌어 있다 (탭 제목, 홈 화면 이름)', async () => {
    const html = await (await realFetch('../index.html')).text();
    assert(html.includes('<title>실실 SilSil</title>'), '탭 제목');
    assert(html.includes('apple-mobile-web-app-title" content="실실"'), '홈 화면 이름');
    const manifest = await (await realFetch('../manifest.webmanifest')).json();
    eq(manifest.short_name, '실실', 'manifest short_name');
  });

  // =====================================================================
  // Projects
  // =====================================================================
  test('PRJ-01', '작품이 없으면 빈 화면 안내가 보인다', async () => {
    await nav('#/');
    assert($('.empty-state'), '빈 화면 안내 없음');
    assert($('.empty-title').textContent.includes('아직 작품이 없어요'), '안내 문구');
  });

  test('PRJ-02', '작품명 없이 저장하면 오류가 보이고 저장되지 않는다', async () => {
    await nav('#/project/new');
    await submit('#project-form');
    assert(!$('#name-error').hidden, '오류 문구가 안 보임');
    eq(Storage.getProjects().length, 0, '작품 수');
  });

  test('PRJ-03', 'WIP로 새 작품을 만들면 시작일이 오늘이고 목록 WIP에 보인다', async () => {
    await nav('#/project/new');
    await click('[data-new-status="active"]');
    type('[name="name"]', '봄 목도리');
    await submit('#project-form');
    const p = Storage.getProjects()[0];
    eq(p.status, 'active', '상태');
    eq(p.startDate, Utils.todayStr(), '시작일');
    eq(location.hash, `#/project/${p.id}`, '상세로 이동');
    await nav('#/');
    assert($('.section-head').textContent.includes('WIP 1'), 'WIP 묶음');
    assert($(`[data-project-id="${p.id}"]`), '목록 카드');
  });

  test('PRJ-04', 'CO Waiting List로 만들면 시작일 칸이 숨고, 상세에 Cast On이 보인다', async () => {
    await nav('#/project/new');
    await click('[data-new-status="onhold"]');
    assert($('#start-date-field').hidden, '시작일 칸이 보임');
    type('[name="name"]', '아란 스웨터');
    await submit('#project-form');
    const p = Storage.getProjects()[0];
    eq(p.status, 'onhold', '상태');
    eq(p.startDate, '', '시작일은 비어 있어야 함');
    assert($('[data-action="cast-on"]'), 'Cast On 버튼');
    await nav('#/');
    assert($$('.section-head').some((h) => h.textContent.includes('CO Waiting List 1')), 'CO 묶음');
    assert($(`[data-project-id="${p.id}"]`).classList.contains('is-onhold'), '점선 카드');
  });

  test('PRJ-05', 'Cast On을 누르면 WIP로 옮기고 시작일을 오늘로 기록한다', async () => {
    const p = Storage.createProject({ name: '모자', status: 'onhold' });
    await nav(`#/project/${p.id}`);
    await click('[data-action="cast-on"]');
    const after = Storage.getProject(p.id);
    eq(after.status, 'active', '상태');
    eq(after.startDate, Utils.todayStr(), '시작일');
    assert(banner().includes('Cast On'), '안내 문구');
  });

  test('PRJ-06', '새 작품에서 Choose Yarn으로 고른 실은 연결만 되고 보유량은 그대로다', async () => {
    const y = mkYarn({ name: '메리노', amount: 5 });
    await nav('#/project/new');
    await click('[data-action="pick-yarn"]');
    await pickItem(y.id);
    assert($('[data-unpick-yarn]'), '고른 실이 목록에 없음');
    type('[name="name"]', '카디건');
    await submit('#project-form');
    const p = Storage.getProjects()[0];
    eq(p.yarns.length, 1, '연결된 실 수');
    eq(p.yarns[0].pending, true, '사용량 기록 전');
    eq(Storage.getYarn(y.id).amount, 5, '보유량 그대로');
  });

  test('PRJ-07', 'Library 도안에서 Start Project로 오면 이름·바늘이 채워지고 CO가 기본이다', async () => {
    const pt = await mkPattern('케이블 모자 도안', '4.5mm');
    await nav(`#/project/new/pattern/${pt.id}`);
    eq($('[name="name"]').value, '케이블 모자 도안', '이름 채움');
    eq($('[name="needleSize"]').value, '4.5mm', '바늘 채움');
    assert($('[data-new-status="onhold"]').classList.contains('active'), 'CO 기본');
    await submit('#project-form');
    const p = Storage.getProjects()[0];
    eq(p.patternId, pt.id, '도안 연결');
  });

  test('PRJ-08', '작품 수정에서 이름·메모를 바꾸면 저장된다', async () => {
    const p = Storage.createProject({ name: '원래 이름' });
    await nav(`#/project/${p.id}/edit`);
    type('[name="name"]', '바꾼 이름');
    type('[name="memo"]', '소매 2cm 늘림');
    await submit('#project-form');
    const after = Storage.getProject(p.id);
    eq(after.name, '바꾼 이름', '이름');
    eq(after.memo, '소매 2cm 늘림', '메모');
    assert($('.page-header h1').textContent.includes('바꾼 이름'), '상세 제목');
  });

  test('PRJ-09', '사용량을 기록한 작품을 지울 때 Restore를 고르면 실 보유량이 돌아온다', async () => {
    const y = mkYarn({ amount: 10 });
    const p = Storage.createProject({ name: '지울 작품' });
    Storage.linkYarnToProject(p.id, y.id);
    Storage.recordYarnUsage(p.id, y.id, 3);
    eq(Storage.getYarn(y.id).amount, 7, '기록 후 보유량');
    await nav(`#/project/${p.id}/edit`);
    await click('[data-action="delete"]');
    await modalBtn('ok');
    await modalBtn('ok'); // Restore
    eq(Storage.getProject(p.id), null, '작품 삭제');
    eq(Storage.getYarn(y.id).amount, 10, '보유량 복원');
  });

  test('PRJ-10', 'FO로 옮기면 사용량 기록 팝업이 뜨고, 기록하면 보유량이 줄고 Archive로 간다', async () => {
    const y = mkYarn({ amount: 10 });
    const p = Storage.createProject({ name: '완성할 작품' });
    Storage.linkYarnToProject(p.id, y.id);
    await nav(`#/project/${p.id}`);
    await click('[data-status="completed"]');
    await modalField('y0', '2');
    await modalBtn('ok');
    await until(() => modal(), '땀 팝업');
    await modalBtn('ok');
    await sleep(80);
    const after = Storage.getProject(p.id);
    eq(after.status, 'completed', '상태');
    eq(after.completedDate, Utils.todayStr(), '완성일');
    eq(Storage.getYarn(y.id).amount, 8, '보유량');
    eq(location.hash, '#/archive', 'Archive로 이동');
  });

  test('PRJ-11', 'FO를 다시 WIP로 되돌리면 완성일이 지워진다', async () => {
    const y = mkYarn();
    const p = mkFO('되돌릴 작품', y, 1);
    await nav(`#/project/${p.id}`);
    await click('[data-status="active"]');
    const after = Storage.getProject(p.id);
    eq(after.status, 'active', '상태');
    eq(after.completedDate, null, '완성일');
  });

  test('PRJ-12', 'Instagram 링크: 잘못된 주소는 경고, 게시글 주소는 정리해서 저장, Unlink로 해제', async () => {
    const y = mkYarn();
    const p = mkFO('인스타 작품', y, 1);
    await nav(`#/project/${p.id}`);
    type('#ig-url', 'https://example.com/abc');
    await click('[data-action="ig-save"]');
    assert(banner().includes('링크를 확인'), '경고 문구');
    eq(Storage.getProject(p.id).instagramUrl || '', '', '잘못된 주소는 저장 안 됨');
    type('#ig-url', 'https://www.instagram.com/someone/p/AbC123_x/?igsh=xyz');
    await click('[data-action="ig-save"]');
    eq(Storage.getProject(p.id).instagramUrl, 'https://www.instagram.com/p/AbC123_x/', '정리된 주소');
    assert($('.ig-embed iframe'), '게시글 미리보기');
    await click('[data-action="ig-remove"]');
    eq(Storage.getProject(p.id).instagramUrl, '', '해제');
  });

  test('PRJ-13', '상세에서 콘사(g)를 연결하고 남은 무게를 적으면 쓴 양을 계산해 기록한다', async () => {
    const y = mkYarn({ name: '코튼 콘사', amount: 1000, unit: 'g' });
    const p = Storage.createProject({ name: '네트백' });
    await nav(`#/project/${p.id}`);
    await click('[data-action="link-yarn"]');
    await pickItem(y.id);
    await click(`[data-record-yarn="${y.id}"]`);
    await modalField('y0', '720');
    await modalBtn('ok');
    await sleep(60);
    const link = Storage.getProject(p.id).yarns[0];
    eq(link.pending, false, '기록됨');
    eq(link.used, 280, '쓴 양 = 1000 - 720');
    eq(Storage.getYarn(y.id).amount, 720, '보유량');
  });

  test('PRJ-14', '실 연결 해제: 기록 전이면 보유량 그대로, 기록 후 Restore면 보유량 복원', async () => {
    const a = mkYarn({ name: 'A', amount: 5 });
    const b = mkYarn({ name: 'B', amount: 5 });
    const p = Storage.createProject({ name: '해제 작품' });
    Storage.linkYarnToProject(p.id, a.id);
    Storage.linkYarnToProject(p.id, b.id);
    Storage.recordYarnUsage(p.id, b.id, 2);
    await nav(`#/project/${p.id}`);
    await click(`[data-unlink-yarn="${a.id}"]`);
    await modalBtn('ok');
    eq(Storage.getYarn(a.id).amount, 5, 'A 보유량 그대로');
    await sleep(40);
    await click(`[data-unlink-yarn="${b.id}"]`);
    await modalBtn('ok'); // Restore
    eq(Storage.getYarn(b.id).amount, 5, 'B 보유량 복원');
    eq(Storage.getProject(p.id).yarns.length, 0, '연결 모두 해제');
  });

  test('PRJ-15', '바늘이 비어 있는 작품에 도안을 연결하면 도안의 바늘 굵기로 채운다', async () => {
    const pt = await mkPattern('바늘 있는 도안', '3.5mm');
    const p = Storage.createProject({ name: '바늘 빈 작품' });
    await nav(`#/project/${p.id}`);
    await click('[data-action="link-pattern"]');
    await pickItem(`pattern:${pt.id}`);
    const after = Storage.getProject(p.id);
    eq(after.patternId, pt.id, '도안 연결');
    eq(after.needleSize, '3.5mm', '바늘 채움');
    assert($('.knit-card .knit-card-title').textContent.includes('Open Pattern'), 'Open Pattern 카드');
  });

  // =====================================================================
  // Yarn
  // =====================================================================
  test('YRN-01', '이름 없이 저장하면 오류가 보이고 저장되지 않는다', async () => {
    await nav('#/yarn/new');
    await submit('#yarn-form');
    assert(!$('#name-error').hidden, '오류 문구');
    eq(Storage.getYarns().length, 0, '실 수');
  });

  test('YRN-02', '볼 단위 실과 콘사(g) 실을 등록하면 목록에 단위대로 보인다', async () => {
    await nav('#/yarn/new');
    type('[name="name"]', '메리노 DK');
    type('[name="color"]', '카멜');
    type('[name="weight"]', 'DK');
    type('[name="amount"]', '3');
    await submit('#yarn-form');
    await nav('#/yarn/new');
    type('[name="name"]', '램스울 콘사');
    type('[name="amount"]', '820');
    type('[name="unit"]', 'g');
    await submit('#yarn-form');
    eq(location.hash, '#/yarn', '목록으로 이동');
    const text = $('#yarn-list-body').textContent;
    assert(text.includes('보유 3볼'), '볼 단위 표시');
    assert(text.includes('보유 820g'), 'g 단위 표시');
    eq(Storage.getYarns().find((y) => y.name === '램스울 콘사').unit, 'g', '저장된 단위');
  });

  test('YRN-03', '굵기 칩과 검색으로 거르고, 보유량 없는 실은 맨 아래에 보인다', async () => {
    mkYarn({ name: '빈 실', weight: 'DK', amount: 0 });
    mkYarn({ name: '울 워스티드', color: '그린', weight: 'Worsted', amount: 2 });
    mkYarn({ name: '메리노', color: '카멜', weight: 'DK', amount: 3 });
    await nav('#/yarn');
    const names = () => $$('#yarn-list-body .card h3').map((h) => h.textContent);
    eq(names()[names().length - 1], '빈 실', '보유량 없는 실은 마지막');
    assert($('#yarn-list-body .card.is-empty').textContent.includes('보유량 없음'), '보유량 없음 표시');
    await click('#yarn-weight-filter [data-weight="Worsted"]');
    eq(names(), ['울 워스티드'], 'Worsted만');
    await click('#yarn-weight-filter [data-weight="all"]');
    type('#yarn-search', '카멜');
    eq(names(), ['메리노'], '색상 검색');
  });

  test('YRN-04', '권장 바늘: 목록에서 고르거나 직접 입력할 수 있다', async () => {
    await nav('#/yarn/new');
    type('[name="name"]', '바늘 실');
    const select = $('[data-needle-select]');
    select.value = '4mm';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    eq($('[name="needleSize"]').value, '4mm', '목록 선택');
    select.value = '__custom';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    assert(!$('[name="needleSize"]').hidden, '직접 입력칸이 보여야 함');
    type('[name="needleSize"]', '4–4.5mm');
    await submit('#yarn-form');
    eq(Storage.getYarns()[0].needleSize, '4–4.5mm', '저장된 바늘');
  });

  test('YRN-05', '실 수정과 삭제(확인 후)가 된다', async () => {
    const y = mkYarn({ name: '고칠 실' });
    await nav(`#/yarn/${y.id}`);
    type('[name="color"]', '라벤더');
    await submit('#yarn-form');
    eq(Storage.getYarn(y.id).color, '라벤더', '수정');
    await nav(`#/yarn/${y.id}`);
    await click('[data-action="delete"]');
    await modalBtn('cancel');
    assert(Storage.getYarn(y.id), '취소하면 남아 있음');
    await click('[data-action="delete"]');
    await modalBtn('ok');
    eq(Storage.getYarn(y.id), null, '삭제');
  });

  test('YRN-06', '연결만 하고 기록 전인 실은 카드에 "사용 중"이 보인다', async () => {
    const y = mkYarn({ name: '쓰는 실' });
    const p = Storage.createProject({ name: '양말' });
    Storage.linkYarnToProject(p.id, y.id);
    await nav('#/yarn');
    assert($('.yarn-in-use').textContent.includes('양말에서 사용 중'), '사용 중 표시');
  });

  // =====================================================================
  // Patterns
  // =====================================================================
  test('PAT-01', '도안 이미지를 올리면 이름이 파일 이름으로 채워지고 저장 후 뷰어가 열린다', async () => {
    await nav('#/pattern/new');
    assert($('#pattern-submit').disabled, '파일 전에는 저장 비활성');
    setFiles($('#pattern-file'), [await pngFile('겨울 목도리 차트.png')]);
    await until(() => !$('#pattern-submit').disabled, '저장 버튼 활성화');
    eq($('[name="name"]').value, '겨울 목도리 차트', '이름 채움');
    await submit('#pattern-form');
    await sleep(80);
    const pt = Storage.getPatterns()[0];
    eq(pt.fileType, 'image', '파일 종류');
    eq(location.hash, `#/pattern/${pt.id}`, '뷰어로 이동');
    assert(await FileStore.get(pt.id), '파일 저장');
  });

  test('PAT-02', '이미지·PDF가 아닌 파일은 오류가 보이고 저장할 수 없다', async () => {
    await nav('#/pattern/new');
    setFiles($('#pattern-file'), [new File(['hello'], 'note.txt', { type: 'text/plain' })]);
    await sleep(60);
    assert(!$('#file-error').hidden, '오류 문구');
    assert($('#pattern-submit').disabled, '저장 비활성');
  });

  test('PAT-03', 'Library 카드의 Start Project는 새 작품 화면으로 간다 (카드 클릭은 뷰어)', async () => {
    const pt = await mkPattern('카드 도안');
    await nav('#/pattern');
    await click(`[data-pattern-id="${pt.id}"] [data-start-project]`);
    await sleep(40);
    eq(location.hash, `#/project/new/pattern/${pt.id}`, 'Start Project');
    await nav('#/pattern');
    await click(`[data-pattern-id="${pt.id}"] .card-body h3`);
    eq(location.hash, `#/pattern/${pt.id}`, '카드 클릭은 뷰어');
  });

  test('PAT-04', '뷰어 단수 카운터: + Row Counter로 켜고, +1에 단수가 늘며 줄이 위로, ×로 숨겨도 단수 유지', async () => {
    const pt = await mkPattern('카운터 도안');
    const p = Storage.createProject({ name: '카운터 작품' });
    Storage.linkPatternToProject(p.id, pt.id);
    await nav(`#/pattern/${pt.id}/for/${p.id}`);
    await click('[data-action="enable-counter"]');
    await until(() => parseFloat($('#highlight-bar').style.top) > 0, '하이라이트 줄 배치');
    const counter = () => Storage.getCountersByProject(p.id)[0].value;
    const top0 = parseFloat($('#highlight-bar').style.top);
    await click('[data-action="viewer-plus"]');
    eq(counter(), 1, '+1 후 단수');
    assert(parseFloat($('#highlight-bar').style.top) < top0, '줄이 위로 이동');
    await sleep(320); // 연타 방지 시간
    await click('[data-action="viewer-plus"]');
    eq(counter(), 2, '+1 두 번');
    await click('[data-action="viewer-minus"]');
    eq(counter(), 1, '-1');
    await click('[data-action="disable-counter"]');
    eq(Storage.getProject(p.id).counterEnabled, false, '숨김');
    eq(counter(), 1, '숨겨도 단수 유지');
    assert($('[data-action="enable-counter"]'), '다시 켜는 버튼');
  });

  test('PAT-05', '뷰어 하이라이트 색을 고르면 설정에 저장된다', async () => {
    const pt = await mkPattern('색 도안');
    await nav(`#/pattern/${pt.id}`);
    await click('[data-highlight-color="mint"]');
    eq(Storage.getSettings().highlightColor, 'mint', '저장된 색');
    eq($('[data-highlight-color="mint"]').getAttribute('aria-checked'), 'true', '선택 표시');
  });

  test('PAT-06', '작품에 연결된 도안을 지우면 작품의 도안 연결도 풀린다', async () => {
    const pt = await mkPattern('지울 도안');
    const p = Storage.createProject({ name: '도안 작품' });
    Storage.linkPatternToProject(p.id, pt.id);
    await nav(`#/pattern/${pt.id}/edit`);
    await click('[data-action="delete-pattern"]');
    await modalBtn('ok');
    await sleep(60);
    eq(Storage.getPattern(pt.id), null, '도안 삭제');
    eq(Storage.getProject(p.id).patternId, null, '연결 해제');
  });

  test('PAT-07', 'Favorites의 하트를 누르면 찜이 해제된다 (Ravelry 창은 안 열림)', async () => {
    Storage.saveFavoritePattern({ ravelryPatternId: 777, name: 'Flax Light', url: 'https://www.ravelry.com/patterns/library/flax-light', needleSize: '4mm' });
    let opened = false;
    const realOpen = window.open;
    window.open = () => { opened = true; };
    try {
      await nav('#/pattern/saved');
      await click('[data-unfavorite="777"]');
      eq(Storage.getSavedPatterns().length, 0, '찜 해제');
      assert(!opened, 'Ravelry 창이 열리면 안 됨');
    } finally { window.open = realOpen; }
  });

  test('PAT-08', 'Ravelry 키가 없으면 Search 탭에 설정 안내가 보인다', async () => {
    await nav('#/pattern/search');
    assert($('#pattern-tab-body').textContent.includes('Ravelry 연동이 필요해요'), '설정 안내');
  });

  test('PAT-09', 'Ravelry 검색(가짜 응답): 결과·바늘 표시, 하트로 찜, Start Project로 새 작품', async () => {
    Storage.saveSettings({ ravelryKey: 'k', ravelrySecret: 's' });
    window.fetch = async (url) => {
      const u = String(url);
      const json = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/patterns/search.json')) return json({ patterns: [{ id: 501, name: 'Test Cable Hat', permalink: 'test-cable-hat', free: true, designer: { name: 'Tester' } }], paginator: { last_page: 1 } });
      if (u.includes('/patterns/501.json')) return json({ pattern: { pattern_needle_sizes: [{ metric: 4 }, { metric: 4.5 }], yardage: 200 } });
      return realFetch(url);
    };
    await nav('#/pattern/search');
    type('#pattern-query', 'cable hat');
    await click('[data-action="search"]');
    await until(() => $('#pattern-results [data-favorite="501"]'), '검색 결과');
    assert($('#pattern-results').textContent.includes('Test Cable Hat'), '도안 이름');
    assert($('#pattern-results').textContent.includes('4–4.5mm'), '바늘 굵기');
    await click('[data-favorite="501"]');
    assert(Storage.isPatternSaved(501), '찜 저장');
    eq(Storage.getSavedPatterns()[0].needleSize, '4–4.5mm', '찜에 바늘 저장');
    await click('[data-start-favorite="501"]');
    eq(location.hash, '#/project/new/favorite/501', 'Start Project');
    await sleep(40);
    eq($('[name="name"]').value, 'Test Cable Hat', '이름 채움');
  });

  // =====================================================================
  // Tools
  // =====================================================================
  test('GAU-01', '게이지 계산: 10cm에 22코·30단 → 50×60cm는 110코·180단, 0이면 오류', async () => {
    Storage.createProject({ name: '게이지 작품' });
    await nav('#/tools/gauge');
    const set = (n, v) => type(`[name="${n}"]`, v);
    set('sampleWidth', '10'); set('sampleHeight', '10'); set('sampleStitches', '22'); set('sampleRows', '30');
    set('targetWidth', '50'); set('targetHeight', '60');
    eq($('#result-stitches').textContent, '110', '코 수');
    eq($('#result-rows').textContent, '180', '단 수');
    assert(!$('#gauge-save').hidden, '메모 저장 칸');
    await click('[data-action="save-memo"]');
    assert(Storage.getProjects()[0].memo.includes('110코 x 180단'), '작품 메모에 저장');
    set('sampleWidth', '0');
    eq($('#result-stitches').textContent, '-', '잘못된 값이면 결과 지움');
    assert(!$('[data-error="sampleWidth"]').hidden, '오류 문구');
  });

  test('ABR-01', '약어: 기본 약어가 있고, 추가·중복 경고·검색·삭제·기본 복원이 된다', async () => {
    await nav('#/tools/abbreviations');
    assert(Storage.getAbbreviations().some((a) => a.term === 'k2tog'), '기본 약어 k2tog');
    await click('[data-action="new-abbr"]');
    await modalField('term', 'tbl');
    await modalField('description', '꼬아뜨기');
    await modalBtn('ok');
    assert(Storage.getAbbreviations().some((a) => a.term === 'tbl'), '추가');
    await click('[data-action="new-abbr"]');
    await modalField('term', 'k2tog');
    await modalField('description', '중복');
    await modalBtn('ok');
    assert(banner().includes('이미 등록된 약어'), '중복 경고');
    type('#abbr-search', 'tbl');
    eq($$('#abbr-list-body .counter-row').length, 1, '검색 결과 1개');
    type('#abbr-search', '');
    const k2 = Storage.getAbbreviations().find((a) => a.term === 'k2tog');
    await click(`[data-delete-abbr="${k2.id}"]`);
    await modalBtn('ok');
    assert(!Storage.getAbbreviations().some((a) => a.term === 'k2tog'), '삭제');
    assert(!$('#abbr-restore').hidden, '기본 약어 복원 링크');
    await click('[data-action="restore-defaults"]');
    assert(Storage.getAbbreviations().some((a) => a.term === 'k2tog'), '복원');
  });

  test('BAK-01', '백업: 도안 파일은 담기고 Ravelry 키는 빠지며, 가져오기로 그대로 되살린다', async () => {
    Storage.saveSettings({ ravelryKey: 'secret-key', ravelrySecret: 'secret' });
    const y = mkYarn({ name: '백업 실' });
    mkFO('백업 작품', y, 2);
    const pt = await mkPattern('백업 도안');
    const payload = await Storage.exportBackup(true, true);
    const json = JSON.stringify(payload);
    assert(!json.includes('secret-key'), 'Ravelry 키가 백업에 들어가면 안 됨');
    assert(payload.data.patternFiles && payload.data.patternFiles[pt.id], '도안 파일 포함');
    // 데이터를 지우고 파일로 가져오기
    await reset();
    await nav('#/tools/backup');
    setFiles($('#import-input'), [new File([json], 'silsil-backup.json', { type: 'application/json' })]);
    await modalBtn('ok');
    await until(() => Storage.getProjects().length === 1, '가져오기 완료');
    eq(Storage.getProjects()[0].name, '백업 작품', '작품 복원');
    eq(Storage.getYarns()[0].name, '백업 실', '실 복원');
    const restoredPt = Storage.getPatterns()[0];
    assert(restoredPt && (await FileStore.get(restoredPt.id)), '도안 파일 복원');
  });

  test('BAK-02', '형식이 틀린 백업 파일은 경고만 하고 데이터는 그대로다', async () => {
    Storage.createProject({ name: '남아 있어야 할 작품' });
    await nav('#/tools/backup');
    setFiles($('#import-input'), [new File(['{"hello":1}'], 'wrong.json', { type: 'application/json' })]);
    await modalBtn('ok');
    await until(() => banner().includes('형식이 올바르지 않아요'), '경고 문구');
    eq(Storage.getProjects().length, 1, '데이터 유지');
  });

  test('RAV-01', 'Ravelry 키를 저장하면 연동 상태가 된다', async () => {
    await nav('#/tools/ravelry');
    type('[name="ravelryKey"]', 'my-key');
    type('[name="ravelrySecret"]', 'my-secret');
    await submit('#ravelry-form');
    assert(Ravelry.isConfigured(), '연동 상태');
  });

  // =====================================================================
  // 십자수 샘플러 · 뜨개 친구
  // =====================================================================
  test('SMP-01', '땀 계산: 50g=1볼=5땀, 볼은 볼당 무게(없으면 50g), 콘사는 g, 소수 땀은 이월', async () => {
    eq(Sampler.GRAMS_PER_BALL, 50, '1볼 무게');
    eq(Sampler.STITCHES_PER_BALL, 5, '1볼 땀 수');
    const a = mkYarn({ name: '25g 실', weightPerBall: 25, amount: 20 });
    const b = mkYarn({ name: '볼당 무게 없음', weightPerBall: null, amount: 20 });
    const c = mkYarn({ name: '콘사', unit: 'g', amount: 1000 });
    mkFO('A', a, 2); // 50g
    mkFO('B', b, 1); // 50g (기본)
    mkFO('C', c, 15); // 15g
    const prog = Sampler.progress();
    eq(prog.grams, 115, '총 무게');
    eq(prog.stitches, 11, '115g → 11땀 (5g은 이월)');
    eq(prog.gramsToNext, 5, '다음 땀까지 5g');
  });

  test('SMP-02', 'WIP·기록 전 실은 세지 않고, 샘플러가 차면 완성일이 그 FO 날짜가 된다', async () => {
    const y = mkYarn({ amount: 100 });
    const wip = Storage.createProject({ name: 'WIP' });
    Storage.linkYarnToProject(wip.id, y.id);
    Storage.recordYarnUsage(wip.id, y.id, 10);
    eq(Sampler.progress().stitches, 0, 'WIP는 세지 않음');
    const first = Sampler.SAMPLERS[0];
    mkFO('첫 FO', y, 2, '2026-01-10'); // 10땀
    mkFO('둘째 FO', y, 4, '2026-02-20'); // +20땀 → 30
    const it = Sampler.progress().list[0];
    assert(first.total <= 30, '첫 샘플러는 30땀 이하');
    eq(it.done, true, '첫 샘플러 완성');
    eq(it.completedDate, '2026-02-20', '완성일');
  });

  test('SMP-03', 'FO로 첫 샘플러를 다 채우면 "Sampler Complete!" 후 친구 이름이 나타난다', async () => {
    const y = mkYarn({ amount: 50 });
    const p = Storage.createProject({ name: '첫 작품' });
    Storage.linkYarnToProject(p.id, y.id);
    await nav(`#/project/${p.id}`);
    await click('[data-status="completed"]');
    await modalField('y0', '6'); // 300g = 30땀 → 단추(24땀) 완성
    await modalBtn('ok');
    const title = await until(() => $('.modal-overlay .modal-title'), '땀 팝업');
    eq(title.textContent, 'Sampler Complete!', '완성 제목');
    assert($('.modal-overlay').textContent.includes('+30땀'), '늘어난 땀');
    const name = Characters.get(Sampler.SAMPLERS[0].id).name;
    await until(() => title.textContent.includes(name), '친구 등장 제목', 6000);
    assert($('.modal-overlay .sampler-pop.is-popped .pop-char svg'), '친구 그림');
    await modalBtn('ok');
  });

  test('SMP-04', 'Sampler Album: 완성은 친구, 진행 중은 Stitching…, 아직은 ?로 보인다', async () => {
    const y = mkYarn({ amount: 50 });
    mkFO('FO', y, 6); // 30땀: 1장 1번 완성, 2번 진행 중
    await nav('#/archive/sampler');
    const cards = $$('.sampler-card');
    eq(cards.length, Sampler.SAMPLERS.length, '샘플러 수');
    assert(cards[0].classList.contains('is-done') && cards[0].querySelector('.char'), '완성 카드에 친구');
    assert(cards[1].classList.contains('is-current') && cards[1].textContent.includes('Stitching'), '진행 중 카드');
    assert(cards[2].classList.contains('is-locked') && cards[2].textContent.includes('?'), '잠긴 카드');
    await click(cards[0]);
    assert($('.modal-overlay .friend-hello'), '친구 소개 팝업');
    await modalBtn('ok');
  });

  test('SMP-05', '모든 샘플러를 다 채운 뒤 FO를 더 해도 오류 없이 안내 문구만 나온다', async () => {
    const total = Sampler.SAMPLERS.reduce((s, x) => s + x.total, 0);
    const y = mkYarn({ unit: 'g', amount: 100000 });
    mkFO('엄청 큰 작품', y, total * Sampler.GRAMS_PER_STITCH);
    assert(Sampler.progress().allDone, '모두 완성');
    const p = Storage.createProject({ name: '그 다음 작품' });
    Storage.linkYarnToProject(p.id, y.id);
    await nav(`#/project/${p.id}`);
    await click('[data-status="completed"]');
    const before = Storage.getYarn(y.id).amount;
    await modalField('y0', String(before - 100)); // 남은 무게 → 100g 사용
    await modalBtn('ok');
    await until(() => banner().includes('수놓았어요') || banner().includes('FO로 옮겼어요'), '안내 문구');
    eq(Storage.getProject(p.id).status, 'completed', 'FO 완료');
  });

  test('CHR-01', '모든 샘플러에 같은 id의 친구가 있고, 그림이 그려진다', async () => {
    Sampler.SAMPLERS.forEach((s) => {
      const c = Characters.get(s.id);
      assert(c && c.name && c.hello && c.story, `${s.id} 친구 정보`);
      assert(Characters.render(s.id).includes('<svg'), `${s.id} 그림`);
      assert(Characters.inline(s.id, 0, 0, 50).includes('<svg'), `${s.id} 장면용 그림`);
    });
  });

  // =====================================================================
  // Archive · 실타래 유리병
  // =====================================================================
  test('JAR-01', 'Jar 탭: FO마다 실타래 하나, 만난 친구 수만큼 병 속 친구, 숫자 요약이 맞다', async () => {
    const y = mkYarn({ amount: 50 });
    mkFO('목도리', y, 4, '2026-01-01'); // 200g
    mkFO('모자', y, 2, '2026-02-01'); // 100g → 30땀, 친구 1
    await nav('#/archive');
    eq($$('.jar-svg .jar-ball').length, 2, '실타래 수');
    eq($$('.jar-svg [data-friend]').length, 1, '병 속 친구 수');
    const stats = $('.jar-stats').textContent.replace(/\s+/g, '');
    assert(stats.includes('2FO') && stats.includes('6볼') && stats.includes('300g'), `숫자 요약: ${stats}`);
  });

  test('JAR-02', '실타래를 누르면 작품 말풍선이 뜨고, Open으로 작품 상세에 간다', async () => {
    const y = mkYarn({ amount: 50 });
    const p = mkFO('크림 스웨터', y, 3);
    await nav('#/archive');
    $(`.jar-svg [data-fo-id="${p.id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(40);
    const bubble = $('.scene-bubble');
    assert(!bubble.hidden && bubble.textContent.includes('크림 스웨터'), '말풍선');
    assert(bubble.textContent.includes('3볼'), '쓴 양');
    await click('[data-open-fo]');
    eq(location.hash, `#/project/${p.id}`, '작품 상세');
  });

  test('JAR-03', '병의 빈 곳을 누르면 병과 안의 실타래가 흔들렸다가 제자리로 돌아온다', async () => {
    const y = mkYarn({ amount: 50 });
    mkFO('흔들 작품', y, 2);
    await nav('#/archive');
    const svg = $('.jar-svg');
    // 헤드리스 Chrome은 애니메이션 프레임을 건너뛸 때가 있어서, 흔들기 실행 여부 + 첫 프레임 + 끝난 뒤 제자리를 확인
    const realShake = YarnJar.shake;
    let shaken = 0;
    YarnJar.shake = (el) => { shaken += 1; return realShake(el); };
    try {
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      eq(shaken, 1, '흔들기 실행');
      // 실타래를 누르면 흔들지 않음 (말풍선)
      $('.jar-svg [data-fo-id]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      eq(shaken, 1, '실타래 클릭은 흔들기 아님');
      await sleep(2000);
      assert(!$('.jar-wobble').getAttribute('transform'), '병 제자리');
      assert(!$$('.jar-shake').some((el) => el.getAttribute('transform')), '실타래 제자리');
    } finally { YarnJar.shake = realShake; }
  });

  test('JAR-04', 'Gallery 탭에 FO 카드가 보이고, 카드를 누르면 작품 상세로 간다', async () => {
    const y = mkYarn({ amount: 50 });
    const p = mkFO('갤러리 작품', y, 1);
    await nav('#/archive');
    await click('#archive-tab-switch [data-tab="gallery"]');
    eq(location.hash, '#/archive/gallery', '주소');
    assert($('.archive-grid').textContent.includes('갤러리 작품'), 'FO 카드');
    assert(!$('.jar-scene'), 'Gallery에는 병이 없음');
    await click(`.archive-grid [data-project-id="${p.id}"]`);
    eq(location.hash, `#/project/${p.id}`, '작품 상세');
  });

  test('JAR-05', 'Jar 탭은 화면 높이에 맞아서 스크롤이 생기지 않는다', async () => {
    const y = mkYarn({ amount: 50 });
    for (let i = 0; i < 6; i += 1) mkFO(`작품 ${i}`, y, 3);
    await nav('#/archive');
    await sleep(80);
    const d = document.documentElement;
    assert(d.scrollHeight <= window.innerHeight + 1, `페이지 높이 ${d.scrollHeight} > 화면 ${window.innerHeight}`);
    const scene = $('.jar-scene').getBoundingClientRect();
    assert(scene.height > 150, `병 영역이 너무 작음: ${Math.round(scene.height)}px`);
  });

  test('JAR-06', '병이 가득 차면 선반에 옮기고 새 병을 채운다', async () => {
    const y = mkYarn({ unit: 'g', amount: 1000000 });
    for (let i = 0; i < 40; i += 1) mkFO(`큰 작품 ${i}`, y, 2500, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
    await nav('#/archive');
    assert($('.jar-shelf .jar-mini'), '가득 찬 병 선반');
    assert($('.jar-shelf').textContent.includes('번째 병을 채우는 중'), '안내 문구');
  });

  // =====================================================================
  // 데모 모드
  // =====================================================================
  test('DEM-01', '?demo로 열면 목업 데이터(FO 15, 친구 9)가 뜨고 실제 기록(localStorage)은 그대로다', async () => {
    const marker = JSON.stringify([{ id: 'REAL', name: '진짜 작품' }]);
    const before = localStorage.getItem('kw_projects');
    localStorage.setItem('kw_projects', marker);
    try {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-9999px;width:400px;height:800px';
      frame.src = '../index.html?demo#/archive';
      document.body.appendChild(frame);
      await until(() => frame.contentWindow && frame.contentWindow.document.querySelector('.jar-svg'), '데모 화면', 10000);
      const fo = frame.contentWindow.eval("Storage.getProjects().filter((p) => p.status === 'completed').length");
      const friends = frame.contentWindow.eval('Sampler.progress().list.filter((x) => x.done).length');
      eq(fo, 15, '데모 FO 수');
      eq(friends, 9, '데모 친구 수');
      assert(frame.contentWindow.document.querySelector('.demo-badge'), '데모 표시');
      eq(localStorage.getItem('kw_projects'), marker, '실제 기록 그대로');
      frame.remove();
    } finally {
      if (before === null) localStorage.removeItem('kw_projects'); else localStorage.setItem('kw_projects', before);
    }
  });

  // ---------- 실행 ----------
  async function runAll() {
    const only = new URLSearchParams(location.search).get('only');
    const list = only ? TESTS.filter((t) => t.id.startsWith(only)) : TESTS;
    const results = [];
    for (const t of list) {
      const start = performance.now();
      let error = null;
      try {
        await reset();
        await t.fn();
      } catch (e) {
        error = (e && e.message) || String(e);
      }
      results.push({ id: t.id, name: t.name, ok: !error, error, ms: Math.round(performance.now() - start) });
      console.log(`${error ? 'FAIL' : 'PASS'} ${t.id} ${t.name}${error ? ` — ${error}` : ''}`);
    }
    await reset();
    const json = JSON.stringify({ results, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight] });
    const out = $('#test-results');
    out.dataset.results = btoa(unescape(encodeURIComponent(json)));
    out.dataset.done = 'true';
    document.title = `DONE ${results.filter((r) => r.ok).length}/${results.length}`;
  }

  window.addEventListener('load', () => setTimeout(runAll, 300));
})();
