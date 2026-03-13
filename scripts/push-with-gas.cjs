/**
 * 若有 gas/ 或 .clasp.json 變更才執行 clasp push，再 git add / commit / push。
 * 使用：node scripts/push-with-gas.cjs [commit訊息]
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const commitMsg = process.argv[2] || 'sync';

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function getChangedFiles() {
  try {
    const out = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf-8' });
    const staged = execSync('git diff --name-only --cached', { cwd: root, encoding: 'utf-8' });
    return (out + '\n' + staged).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const files = getChangedFiles();
const gasChanged = files.some(f => f.replace(/\\/g, '/').startsWith('gas/') || f === '.clasp.json');
const firebaseChanged = files.some(f => {
  const n = f.replace(/\\/g, '/');
  return n === 'firestore.rules' || n === 'firebase.json' || n === '.firebaserc';
});

if (gasChanged) {
  console.log('偵測到 GAS 變更，先推送到 Apps Script…');
  run('npx clasp push');
} else {
  console.log('GAS 無變更，略過 clasp push。');
}

if (firebaseChanged) {
  console.log('偵測到 Firestore 規則或 Firebase 設定變更，部署至 Firebase…');
  try {
    run('npx firebase deploy --only firestore');
  } catch (e) {
    console.warn('Firebase 部署失敗（請先執行 npm run firebase:login）：', e.message);
  }
} else {
  console.log('Firebase 設定無變更，略過 firebase deploy。');
}

run('git add -A');
let hasStaged = false;
try {
  execSync('git diff --cached --quiet', { cwd: root });
} catch {
  hasStaged = true;
}
if (!hasStaged) {
  console.log('無變更可提交。');
  process.exit(0);
}
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
run('git push');
console.log('完成。');
