#!/usr/bin/env bash
# Link the existing Vercel project "my" to GitHub gamesenmu-source/monster-idle-rpg (Production = main).
# Requires a Vercel token once: https://vercel.com/account/tokens
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.tools/node/bin:$PATH"
cd "$ROOT"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "VERCEL_TOKEN が未設定です。"
  echo "1) ブラウザでトークンを作成: https://vercel.com/account/tokens"
  echo "2) このターミナルで実行:"
  echo "   export VERCEL_TOKEN='（貼り付け）'"
  echo "3) 再度:"
  echo "   bash scripts/connect-vercel-to-github.sh"
  /usr/bin/open "https://vercel.com/account/tokens" 2>/dev/null || true
  exit 1
fi

SCOPE="${VERCEL_SCOPE:-senmus-projects-510f32bd}"
PROJECT="${VERCEL_PROJECT:-my}"
REPO_URL="${VERCEL_GIT_URL:-https://github.com/gamesenmu-source/monster-idle-rpg.git}"

echo "Scope: $SCOPE  Project: $PROJECT  Repo: $REPO_URL"
echo "→ vercel link …"
npx --yes vercel@41 link --yes --project="$PROJECT" --scope="$SCOPE" --token="$VERCEL_TOKEN"
echo "→ vercel git connect …"
npx --yes vercel@41 git connect "$REPO_URL" --scope="$SCOPE" --token="$VERCEL_TOKEN"
echo ""
echo "完了。GitHub の main に push すると Vercel が新しい Deployment を作ります。"
echo "確認: Vercel → このプロジェクト → Deployments に最新コミットが出るか。"
