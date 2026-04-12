#!/usr/bin/env bash
# One-shot: GitHub (gh) + Vercel (npx). Requires interactive login unless tokens are set.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/.tools/node/bin:$ROOT/.tools:$PATH"
GH="${GH_BIN:-$ROOT/.tools/gh}"

if [[ ! -x "$GH" ]]; then
  echo "Missing gh at $GH"
  exit 1
fi

if [[ -n "${GITHUB_TOKEN:-}" ]] && ! "$GH" auth status &>/dev/null; then
  printf '%s\n' "$GITHUB_TOKEN" | "$GH" auth login --hostname github.com --with-token
fi

if ! "$GH" auth status &>/dev/null; then
  echo "Run: $GH auth login -h github.com -p https -w"
  exit 1
fi

REPO_NAME="${GITHUB_REPO_NAME:-monster-idle-rpg}"

if git remote get-url origin &>/dev/null; then
  git push -u origin main
else
  "$GH" repo create "$REPO_NAME" --public --source=. --remote=origin --push \
    -d "Monster Slayer Idle — static fantasy incremental game"
fi

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  npx --yes vercel@41 deploy --prod --yes --token "$VERCEL_TOKEN"
else
  REPO="$("$GH" repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")"
  if [[ -n "$REPO" ]]; then
    ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "https://github.com/${REPO}")"
    echo "Vercel: import this repo (GitHub → Vercel, no CLI token needed):"
    echo "  https://vercel.com/new/clone?repository-url=${ENC}"
  fi
  echo "Optional CLI: npx vercel@41 login && npx vercel@41 deploy --prod --yes"
fi
