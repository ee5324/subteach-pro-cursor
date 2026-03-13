#!/usr/bin/env bash
# 一次性修正 .config 權限並執行 Firebase 登入（需在本機終端機執行）
set -e
cd "$(dirname "$0")/.."

echo "步驟 1/2：修正 ~/.config 權限（會要求輸入 Mac 登入密碼）"
sudo chown -R "$(whoami):$(id -gn)" "$HOME/.config"

echo "步驟 2/2：Firebase 登入（會開啟瀏覽器）"
FIREBASE_CLI_UPDATE_CHECK=false npx firebase login

echo "完成。之後可直接執行 npm run firebase:login 或 npm run firebase:deploy"
