#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "FETCHING remote estoque..."
git fetch estoque --prune

remote_head=$(git remote show estoque | sed -n 's/.*HEAD branch: //p' || true)
if [ -z "$remote_head" ]; then
  remote_head=$(git ls-remote --symref estoque HEAD 2>/dev/null | sed -n 's/ref: refs\/heads\///p' | head -n1 || true)
fi

if [ -z "$remote_head" ]; then
  echo "NO_REMOTE_HEAD"
  exit 0
fi

echo "REMOTE_HEAD=$remote_head"

local_commit=$(git rev-parse HEAD)
local_tree=$(git rev-parse HEAD^{tree})

echo "LOCAL_COMMIT=$local_commit"
echo "LOCAL_TREE=$local_tree"

remote_commit=$(git rev-parse "estoque/$remote_head" 2>/dev/null || echo '')
remote_tree=$(git rev-parse "estoque/$remote_head^{tree}" 2>/dev/null || echo '')

echo "REMOTE_COMMIT=$remote_commit"
echo "REMOTE_TREE=$remote_tree"

if [ "$local_tree" = "$remote_tree" ] && [ -n "$local_tree" ]; then
  echo "RESULT=TREES_IDENTICAL"
  exit 0
fi

echo "RESULT=TREES_DIFFER"

echo "----LOCAL_FILES----"
git ls-tree -r --name-only HEAD || true

echo "----REMOTE_FILES----"
git ls-tree -r --name-only "estoque/$remote_head" || true

exit 0
