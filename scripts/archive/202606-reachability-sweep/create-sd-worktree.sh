#!/bin/bash
# DEPRECATED: create-sd-worktree.sh
#
# This script is deprecated. Use the Node.js CLI instead:
#   node scripts/session-worktree.js --sd-key <SD-ID> --branch <branch>
#
# To force use of this deprecated script, pass --allow-deprecated as first arg.

if [ "$1" = "--allow-deprecated" ]; then
  shift
  echo "WARNING: Using deprecated Bash worktree script. Migrate to Node CLI."
else
  echo "DEPRECATED: create-sd-worktree.sh is no longer the primary workflow."
  echo ""
  echo "Use the Node.js CLI instead:"
  echo "  node scripts/session-worktree.js --sd-key <SD-ID> --branch feat/<SD-ID>"
  echo ""
  echo "To force use of this script, pass --allow-deprecated as first arg."
  exit 1
fi

set -e

SD_ID="${1:-}"

if [ -z "$SD_ID" ]; then
  echo "Usage: bash scripts/create-sd-worktree.sh --allow-deprecated <SD-ID>"
  exit 1
fi

MAIN_REPO="../ehg"
WORKTREE_BASE="../ehg-worktrees"
WORKTREE_PATH="${WORKTREE_BASE}/${SD_ID}"
BRANCH_NAME="feat/${SD_ID}"

if [ ! -d "$MAIN_REPO/.git" ]; then
  echo "Error: Main repo not found at $MAIN_REPO"
  exit 1
fi

mkdir -p "$WORKTREE_BASE"

if [ -d "$WORKTREE_PATH" ]; then
  echo "Worktree already exists at $WORKTREE_PATH"
  echo "To use it: cd $WORKTREE_PATH"
  exit 0
fi

cd "$MAIN_REPO"

echo "Fetching latest from origin..."
git fetch origin main

if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
  echo "Branch $BRANCH_NAME exists remotely, creating worktree from it..."
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
elif git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  echo "Branch $BRANCH_NAME exists locally, creating worktree from it..."
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  echo "Creating new branch $BRANCH_NAME from origin/main..."
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" origin/main
fi

echo ""
echo "=== Worktree Created (via deprecated script) ==="
echo "Location: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
echo ""
echo "Migrate to: node scripts/session-worktree.js --sd-key $SD_ID --branch $BRANCH_NAME"
