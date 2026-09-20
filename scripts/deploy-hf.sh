#!/usr/bin/env bash
# Push the current commit to a Hugging Face Space as a Docker Space.
#
#   scripts/deploy-hf.sh <user>/<space>
#
# The Space repo is a mirror, not a branch of this one: it gets the tracked files
# of HEAD with deploy/hf/README.md swapped in as README.md, because a Space needs
# its YAML config header at the top of the root README. This repo's README stays
# clean for GitHub.
#
# Auth: set HF_TOKEN (a write token from https://huggingface.co/settings/tokens),
# or leave it unset and let git prompt for your HF username and token.
set -euo pipefail

SPACE="${1:-}"
if [ -z "$SPACE" ]; then
  echo "usage: scripts/deploy-hf.sh <user>/<space>   e.g. adityashukla2615/kosh" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit first - this pushes the tracked files of HEAD." >&2
  exit 1
fi

REMOTE="https://huggingface.co/spaces/$SPACE"
if [ -n "${HF_TOKEN:-}" ]; then
  REMOTE="https://user:$HF_TOKEN@huggingface.co/spaces/$SPACE"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git archive HEAD | tar -x -C "$TMP"
cp deploy/hf/README.md "$TMP/README.md"

(
  cd "$TMP"
  git init -q -b main
  git add -A
  git -c user.name="kosh-deploy" -c user.email="deploy@local" \
      commit -qm "Kosh $(git -C "$OLDPWD" rev-parse --short HEAD)"
  # force-push: the Space is a mirror of this repo, it has no history of its own
  git push -q -f "$REMOTE" main
)

echo "Pushed to https://huggingface.co/spaces/$SPACE"
echo "Build logs: https://huggingface.co/spaces/$SPACE?logs=build"
