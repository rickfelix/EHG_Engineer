#!/bin/bash
# create-sd-worktree.sh - Create isolated git worktree for SD parallel execution
#
# Usage: bash scripts/create-sd-worktree.sh <SD-ID>
# Example: bash scripts/create-sd-worktree.sh SD-STAGE-09-001
#
# Creates a worktree at /mnt/c/_EHG/ehg-worktrees/<SD-ID>
# with a feature branch named feat/<SD-ID>

set -e

SD_ID="${1:-}"

if [ -z "$SD_ID" ]; then
  echo "Usage: bash scripts/create-sd-worktree.sh <SD-ID>"
  echo "Example: bash scripts/create-sd-worktree.sh SD-STAGE-09-001"
  exit 1
fi

# Configuration
MAIN_REPO="/mnt/c/_EHG/ehg"
WORKTREE_BASE="/mnt/c/_EHG/ehg-worktrees"
WORKTREE_PATH="${WORKTREE_BASE}/${SD_ID}"
BRANCH_NAME="feat/${SD_ID}"

# Ensure we're in the main repo
if [ ! -d "$MAIN_REPO/.git" ]; then
  echo "Error: Main repo not found at $MAIN_REPO"
  exit 1
fi

# Create worktree base directory if it doesn't exist
mkdir -p "$WORKTREE_BASE"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
  echo "Worktree already exists at $WORKTREE_PATH"
  echo ""
  echo "To use it: cd $WORKTREE_PATH"
  echo "To remove it: git -C $MAIN_REPO worktree remove $WORKTREE_PATH"
  exit 0
fi

# Go to main repo
cd "$MAIN_REPO"

# Fetch latest from origin
echo "Fetching latest from origin..."
git fetch origin main

# Check if branch already exists remotely
if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
  echo "Branch $BRANCH_NAME exists remotely, creating worktree from it..."
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
# Check if branch exists locally
elif git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  echo "Branch $BRANCH_NAME exists locally, creating worktree from it..."
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  echo "Creating new branch $BRANCH_NAME from origin/main..."
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" origin/main
fi

echo ""
echo "=== Worktree Created Successfully ==="
echo "Location: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
echo ""
echo "Next steps:"
echo "  1. cd $WORKTREE_PATH"
echo "  2. Do your SD work"
echo "  3. Commit and push: git push -u origin $BRANCH_NAME"
echo "  4. Create PR and merge"
echo "  5. Cleanup: git -C $MAIN_REPO worktree remove $WORKTREE_PATH"
echo ""
echo "List all worktrees: git -C $MAIN_REPO worktree list"
