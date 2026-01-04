# Ship Command

Commit your changes and create a pull request.

## Instructions

1. **Check current state**:
   - Run `git status` to see uncommitted changes
   - Run `git log origin/main..HEAD` to see unpushed commits

2. **If there are uncommitted changes**:
   - Stage all changes: `git add .`
   - Create a commit with a descriptive message summarizing the changes
   - Follow the commit message format with the 🤖 Generated footer

3. **Push to remote**:
   - If on main branch, create a new feature branch first
   - Push the branch to origin with `-u` flag

4. **Create Pull Request**:
   - Use `gh pr create` with:
     - A clear, concise title
     - A body with `## Summary` (bullet points of changes) and `## Test plan`
     - The 🤖 Generated footer

5. **Return the PR URL** to the user

## Example Flow

```bash
# Check state
git status
git log origin/main..HEAD --oneline

# Commit if needed
git add .
git commit -m "feat: add notification system

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Push
git push -u origin HEAD

# Create PR
gh pr create --title "feat: add notification system" --body "## Summary
- Added email notifications via Resend
- Added SMS notifications via Twilio
- Updated Claude Code hooks

## Test plan
- [ ] Verify email notifications arrive
- [ ] Verify hooks trigger on Stop event

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
