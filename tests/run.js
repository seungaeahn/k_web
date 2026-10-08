// 자동 테스트 실행: node tests/run.js [TC 접두어]
// 예) node tests/run.js        → 전체
//     node tests/run.js PRJ    → Projects 테스트만
// 설치할 것 없음. 로컬 서버를 띄우고, 이미 깔린 Chrome(또는 Edge)을 화면 없이 실행해서 tests/index.html?demo=test 를 돌림.
// Chrome 위치가 다르면 CHROME_PATH 환경변수로 지정.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const only = process.argv[2] || '';

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
    server.stdout.on('data', (d) => { if (String(d).includes('serving')) resolve(server); });
    server.on('error', reject);
    setTimeout(() => reject(new Error('로컬 서버가 시작되지 않았어요.')), 5000);
  });
}

function runChrome(chrome, url, profile) {
  return new Promise((resolve, reject) => {
    execFile(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--window-size=500,900',
      '--virtual-time-budget=240000', '--dump-dom', url,
    ], { maxBuffer: 64 * 1024 * 1024, timeout: 300000 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      resolve(stdout);
    });
  });
}

(async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome을 찾지 못했어요. CHROME_PATH 환경변수로 위치를 알려주세요.');
    process.exit(2);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'silsil-test-'));
  const server = await startServer();
  let exitCode = 1;
  try {
    const url = `http://localhost:${PORT}/tests/index.html?demo=test${only ? `&only=${encodeURIComponent(only)}` : ''}#/`;
    const dom = await runChrome(chrome, url, profile);
    const m = dom.match(/data-results="([^"]+)"/);
    if (!m) {
      console.error('테스트 결과를 읽지 못했어요. (시간 초과이거나 페이지 오류)');
      return;
    }
    const { results, viewport } = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].length));
    console.log(`\n실실 자동 테스트 · 화면 ${viewport[0]}×${viewport[1]}\n`);
    results.forEach((r) => {
      console.log(`${r.ok ? '✅ PASS' : '❌ FAIL'}  ${pad(r.id, 7)} ${r.name}`);
      if (!r.ok) console.log(`           └ ${r.error}`);
    });
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed} / ${results.length} 통과${passed === results.length ? ' 🎉' : ''}\n`);
    exitCode = passed === results.length ? 0 : 1;
  } finally {
    server.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome이 아직 파일을 잡고 있으면 무시 */ }
    process.exit(exitCode);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
