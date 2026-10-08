// 데모 모드 목업 데이터 (?demo = 샘플러 전부 완성, ?demo=half = 2장 진행 중)
// Storage/FileStore가 메모리를 쓰는 상태에서만 실행되므로 실제 기록에는 영향 없음
(() => {
  if (!Utils.isDemo) return;
  const full = Utils.demoMode === 'full';
  const daysAgo = (n) => Utils.dateToStr(new Date(Date.now() - n * 86400000));

  // ---- 실 ----
  const Y = {};
  [
    ['merino', { name: '메리노 DK', color: '카멜', weight: 'DK', material: '메리노 울 100%', amount: 30, weightPerBall: 50, lengthPerBall: 120, needleSize: '4mm' }],
    ['lamb', { name: '램스울 핑거링', color: '오트밀', weight: 'Fingering', material: '램스울 100%', amount: 14, weightPerBall: 25, lengthPerBall: 110, needleSize: '3mm' }],
    ['cotton', { name: '코튼 콘사', color: '아이보리', weight: 'Sport', material: '코튼 100%', amount: 1000, unit: 'g', needleSize: '3.5mm' }],
    ['alpaca', { name: '알파카 실크', color: '더스티 핑크', weight: 'Lace', material: '알파카 70% 실크 30%', amount: 9, weightPerBall: 25, needleSize: '3.5mm' }],
    ['worsted', { name: '울 워스티드', color: '포레스트 그린', weight: 'Worsted', material: '울 100%', amount: 6, weightPerBall: 100, needleSize: '5mm' }],
    ['mohair', { name: '키드모헤어', color: '라벤더', weight: 'Lace', material: '키드모헤어 72% 실크 28%', amount: 12, weightPerBall: 25, needleSize: '4mm' }],
    ['aran', { name: '아란 울', color: '크림', weight: 'Aran', material: '울 100%', amount: 30, weightPerBall: 100, needleSize: '5mm' }],
    ['cone', { name: '램스울 콘사', color: '차콜', weight: 'Fingering', material: '램스울 100%', amount: 4000, unit: 'g', needleSize: '3mm' }],
    ['tweed', { name: '트위드 DK', color: '머스타드', weight: 'DK', material: '울 90% 비스코스 10%', amount: 5, weightPerBall: 50, needleSize: '4mm' }],
  ].forEach(([key, data]) => { Y[key] = Storage.createYarn(data); });

  // ---- 도안 (모눈 차트 이미지를 그려서 넣음) ----
  function chartBlob(samplerId, cols, rows) {
    const s = Sampler.SAMPLERS.find((x) => x.id === samplerId);
    const cell = 24;
    const pad = 32;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cell + pad * 2;
    canvas.height = rows * cell + pad * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFCF3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ox = Math.floor((cols - s.size) / 2);
    const oy = Math.floor((rows - s.size) / 2);
    s.cells.forEach((c) => {
      ctx.fillStyle = c.color;
      ctx.fillRect(pad + (ox + c.x) * cell, pad + (oy + c.y) * cell, cell, cell);
    });
    ctx.strokeStyle = '#CFE0EA';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) { ctx.beginPath(); ctx.moveTo(pad + x * cell + 0.5, pad); ctx.lineTo(pad + x * cell + 0.5, pad + rows * cell); ctx.stroke(); }
    for (let y = 0; y <= rows; y += 1) { ctx.beginPath(); ctx.moveTo(pad, pad + y * cell + 0.5); ctx.lineTo(pad + cols * cell, pad + y * cell + 0.5); ctx.stroke(); }
    ctx.fillStyle = '#7C5A50';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let r = 1; r <= rows; r += 1) ctx.fillText(String(r), pad + cols * cell + 14, pad + (rows - r) * cell + cell / 2 + 4);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  function addPattern(name, needleSize, samplerId, cols, rows) {
    const pt = Storage.createPattern({ name, fileType: 'image', fileSize: 120000, needleSize });
    chartBlob(samplerId, cols, rows).then((blob) => blob && FileStore.put(pt.id, blob));
    return pt;
  }
  const ptSheep = addPattern('양 배색 요크 차트', '4mm', 'sheep', 30, 36);
  const ptCat = addPattern('고양이 배색 파우치', '3.5mm', 'cat', 24, 24);
  addPattern('달팽이 쿠션 커버', '5mm', 'snail', 28, 28);

  [
    [9001, 'Flax Light', '4mm'],
    [9002, 'Fair Isle Mittens', '3mm'],
    [9003, 'Cozy Cabled Hat', '4.5mm'],
  ].forEach(([id, name, needleSize]) => Storage.saveFavoritePattern({
    ravelryPatternId: id, name, needleSize, url: `https://www.ravelry.com/patterns/search#query=${encodeURIComponent(name)}`,
  }));

  // ---- 작품 ----
  // FO: [이름, 완성 며칠 전, 걸린 일수, 바늘, [[실, 쓴 양]...], 메모]
  const FOS = [
    ['첫 목도리', 540, 30, '5mm', [['merino', 4]], '처음 끝까지 뜬 작품'],
    ['초록 비니', 500, 7, '5mm', [['worsted', 1]]],
    ['여름 네트백', 470, 12, '4mm', [['cotton', 280]]],
    ['오트밀 양말', 430, 20, '2.5mm', [['lamb', 4]]],
    ['카멜 래글런 스웨터', 380, 45, '4mm', [['merino', 12]], '탑다운 래글런, 소매 길이 2cm 늘림'],
    ['코튼 반팔 티', 330, 25, '3.5mm', [['cotton', 450]]],
    ['핑크 레이스 숄', 290, 35, '3.5mm', [['alpaca', 6]]],
    ['아란 카디건', 240, 60, '5mm', [['aran', 7]]],
    ['라벤더 모헤어 스웨터', 200, 40, '4mm', [['mohair', 10], ['lamb', 8]]],
    ['초록 장갑', 170, 10, '4.5mm', [['worsted', 1]]],
    ['차콜 조끼', 140, 28, '3mm', [['cone', 380]]],
    ['오버사이즈 케이블 스웨터', 100, 55, '5mm', [['aran', 9]]],
    ['차콜 블랭킷', 60, 80, '3.5mm', [['cone', 2200]], '겨울 내내 뜬 담요'],
    ['크림 아란 스웨터', 30, 50, '5mm', [['aran', 8]]],
    ['미튼 한 켤레', 12, 6, '4.5mm', [['worsted', 1]]],
  ];
  const fos = full ? FOS : FOS.slice(0, 8);
  fos.forEach(([name, ago, took, needleSize, uses, memo]) => {
    const p = Storage.createProject({ name, needleSize, memo: memo || '', startDate: daysAgo(ago + took) });
    uses.forEach(([key, used]) => {
      Storage.linkYarnToProject(p.id, Y[key].id);
      Storage.recordYarnUsage(p.id, Y[key].id, used);
    });
    Storage.updateProject(p.id, { status: 'completed', completedDate: daysAgo(ago) });
  });

  // WIP: 도안 연결 + 단수 카운터, 실은 아직 사용량 기록 전(FO로 옮기면 기록 팝업과 샘플러 확인 가능)
  const cardigan = Storage.createProject({ name: '양 요크 스웨터', needleSize: '4mm', startDate: daysAgo(18), patternId: ptSheep.id });
  Storage.linkPatternToProject(cardigan.id, ptSheep.id);
  Storage.linkYarnToProject(cardigan.id, Y.merino.id);
  Storage.updateProject(cardigan.id, { counterEnabled: true });
  Storage.updateCounter(Storage.getCountersByProject(cardigan.id)[0].id, { value: 42 });

  const pouch = Storage.createProject({ name: '고양이 파우치', needleSize: '3.5mm', startDate: daysAgo(5) });
  Storage.linkPatternToProject(pouch.id, ptCat.id);
  Storage.linkYarnToProject(pouch.id, Y.tweed.id);

  const socks = Storage.createProject({ name: '트위드 양말', needleSize: '2.5mm', startDate: daysAgo(3) });
  Storage.linkYarnToProject(socks.id, Y.lamb.id);

  // CO Waiting List
  Storage.createProject({ name: 'Flax Light 풀오버', status: 'onhold', needleSize: '4mm', ravelryPattern: { id: 9001, name: 'Flax Light', url: 'https://www.ravelry.com/patterns/search#query=Flax%20Light' } });
  Storage.createProject({ name: '페어아일 모자', status: 'onhold', needleSize: '3mm' });

  Storage.saveSettings({ lastBackupAt: new Date().toISOString() });

  // 데모 표시
  const badge = document.createElement('div');
  badge.className = 'demo-badge';
  badge.textContent = 'Demo · 저장 안 됨';
  document.body.appendChild(badge);
})();
