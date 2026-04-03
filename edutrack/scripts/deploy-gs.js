/**
 * 自動 push GS 並依 CLASP_DEPLOYMENT_ID 更新既有部署（若未設則只 push + 建立新版本）
 * 使用方式：CLASP_DEPLOYMENT_ID=xxx node scripts/deploy-gs.js  或  npm run gs:release
 */
const { execSync } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');
const deploymentId = process.env.CLASP_DEPLOYMENT_ID;

function run(cmd, opts = {}) {
  console.log('>', cmd);
  execSync(cmd, { cwd: backendDir, stdio: 'inherit', ...opts });
}

try {
  run('npx clasp push');
  if (deploymentId) {
    run(`npx clasp deploy -i ${deploymentId}`);
    console.log('已 push 並更新既有部署版本');
  } else {
    run('npx clasp deploy');
    console.log('已 push 並建立新版本（若要更新既有 Web App 網址，請設 CLASP_DEPLOYMENT_ID 後執行 gs:release）');
  }
} catch (e) {
  process.exit(e.status || 1);
}
