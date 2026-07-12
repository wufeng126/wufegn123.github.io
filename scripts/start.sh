#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"

cd "${COZE_WORKSPACE_PATH}"

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."

# 使用自定义服务器启动（比 pnpm next start 更快）
export DEPLOY_RUN_PORT
export COZE_PROJECT_ENV="${COZE_PROJECT_ENV:-PROD}"
exec npx tsx src/server.ts
