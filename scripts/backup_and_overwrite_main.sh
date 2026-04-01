#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

remote="estoque"
target_branch="main"
timestamp=$(date -u +"%Y%m%dT%H%M%SZ")

echo "Fetching $remote..."
git fetch "$remote" --prune

if git show-ref --verify --quiet "refs/remotes/$remote/$target_branch"; then
  remote_commit=$(git rev-parse "refs/remotes/$remote/$target_branch")
  backup_branch="backup/${target_branch}-before-overwrite-$timestamp"
  echo "Remote branch $target_branch found at $remote_commit"
  echo "Creating local branch $backup_branch pointing to remote/$target_branch..."
  git branch "$backup_branch" "$remote/$target_branch"
  echo "Pushing backup branch $backup_branch to remote $remote..."
  git push "$remote" "$backup_branch:$backup_branch"
  echo "Deleting local backup branch $backup_branch..."
  git branch -D "$backup_branch"
  echo "Backup created: $remote/$backup_branch"
else
  echo "Remote $remote does not have branch $target_branch — skipping backup."
fi

echo "Force-pushing local HEAD to $remote/$target_branch..."
# Force push local HEAD to remote target branch and set upstream
git push --force --set-upstream "$remote" HEAD:"$target_branch"
echo "Force-push complete."
