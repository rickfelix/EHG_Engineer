## 🔀 SD/Quick-Fix Completion: Commit, Push, Merge (MANDATORY)

**Every completed Strategic Directive and Quick-Fix MUST end with:** (procedure: MANUAL § Completion commit/push/merge — command sequences)

1. **Commit** - All changes committed with proper message format
2. **Push** - Branch pushed to remote
3. **Merge to Main** - Feature branch merged into main

### For Quick-Fixes

The `complete-quick-fix.js` script handles this automatically:

```bash
node scripts/complete-quick-fix.js QF-YYYYMMDD-NNN --pr-url https://...
```

### For Strategic Directives

After LEAD approval: commit → push → `gh pr create` → `node scripts/gh-merge-safe.mjs <PR#> --merge --delete-branch` (the full command sequence and the local-merge fallback: MANUAL).

### Merge Checklist

Before merging, verify:
- [ ] All tests passing (unit + E2E)
- [ ] CI/CD pipeline green
- [ ] Code review completed (if required)
- [ ] No merge conflicts
- [ ] SD status = 'archived' OR Quick-Fix status = 'completed'

### Anti-Patterns

❌ **NEVER** leave feature branches unmerged after completion
❌ **NEVER** skip the push step
❌ **NEVER** merge without verifying tests pass
❌ **NEVER** force push to main

### Verification

After merge, confirm:
```bash
git checkout main
git pull origin main
git log --oneline -5  # Should show your merge commit
```