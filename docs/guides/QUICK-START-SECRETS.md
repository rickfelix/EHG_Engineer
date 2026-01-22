# Quick Start: Fix CI/CD in 15 Minutes ⚡

**Total Time**: 15 minutes
**Fixes**: 8+ failing workflows

---

## Overview

```
Step 1 (5 min)  →  Step 2 (10 min)  →  Step 3 (2 min)  →  Done! ✅
Add Database       Add GitHub           Re-enable         8+ workflows
Secret            Token                UAT Testing        now working
```

---

## Step 1: Add Database Secret (5 minutes)

### A. Get the Key from Supabase

1. **Open browser**: https://app.supabase.com/project/dedlbzhpgkmetvhbkyzq/settings/api
2. **Find**: Section "Project API keys"
3. **Copy**: The "service_role" key (very long, starts with `eyJ...`)

### B. Add to GitHub

**Open terminal and run**:

```bash
cd /mnt/c/_EHG/EHG_Engineer

gh secret set SUPABASE_SERVICE_ROLE_KEY
# Paste the key and press Enter
```

### C. Verify

```bash
gh secret list | grep SERVICE_ROLE
```

**✅ Should show**: `SUPABASE_SERVICE_ROLE_KEY` with today's date

---

## Step 2: Add GitHub Token (10 minutes)

### A. Create Token on GitHub

1. **Open browser**: https://github.com/settings/tokens
2. **Click**: "Generate new token" → "Generate new token (classic)"
3. **Fill out**:
   - Note: `CI/CD UAT Testing - EHG Repo Access`
   - Expiration: `90 days`
   - Scopes: Check ✅ **repo** only
4. **Click**: "Generate token" (green button at bottom)
5. **Copy**: The token (starts with `ghp_...`)
   - ⚠️ **IMPORTANT**: Only shown once!

### B. Add to GitHub

**In terminal**:

```bash
gh secret set GH_PAT
# Paste the token and press Enter
```

### C. Verify

```bash
gh secret list | grep GH_PAT
```

**✅ Should show**: `GH_PAT` with today's date

---

## Step 3: Re-enable UAT Testing (2 minutes)

### A. Edit the File

**Open**:
```bash
code .github/workflows/uat-testing.yml
```

### B. Make 2 Changes

**Change 1** - Around line 17:
```yaml
# DELETE THIS LINE:
    if: false
```

**Change 2** - Lines 27-35:
```yaml
# REMOVE the # symbols from these lines:
      - name: Checkout EHG application
        uses: actions/checkout@v4
        with:
          repository: rickfelix/ehg
          token: ${{ secrets.GH_PAT }}
          path: ehg
```

### C. Save and Push

```bash
git add .github/workflows/uat-testing.yml
git commit -m "fix(ci-cd): Re-enable UAT testing workflow"
git push
```

---

## Verify Everything Works ✅

```bash
# 1. Check secrets (should see 10 total)
gh secret list

# 2. Run a test workflow
gh workflow run stories-ci.yml

# 3. Watch it run (wait 2-3 minutes)
gh run watch

# 4. Check recent runs
gh run list --limit 5
```

**Success = All workflows show ✓ (green checkmark)**

---

## Troubleshooting

### "gh: command not found"

**Install GitHub CLI**:
- Windows: `winget install GitHub.cli`
- Mac: `brew install gh`
- Linux: `sudo apt install gh`

Then login: `gh auth login`

---

### Workflow fails with "secret not found"

**Check**:
```bash
gh secret list
```

**If missing**: Repeat Step 1 or Step 2 above

---

### "Permission denied"

**Fix**:
```bash
cd /mnt/c/_EHG/EHG_Engineer
ls .github/workflows  # Should see .yml files
```

---

## What You Fixed

### Before
- ❌ 8+ workflows failing
- ❌ "Secret not found" errors
- ❌ UAT testing disabled
- ❌ No story verification

### After
- ✅ All workflows working
- ✅ Automated testing active
- ✅ UAT testing enabled
- ✅ Story verification running

---

## Next Steps

### Set Reminder

**90 days from now** (January 24, 2026):
- Renew GitHub token (GH_PAT)
- Follow Step 2 again

### Monitor Health

**Weekly check** (30 seconds):
```bash
gh run list --limit 10
```

Green checkmarks ✓ = healthy!

---

## Full Guide

For detailed explanations and more help:
📖 **Read**: `docs/BEGINNER-GUIDE-CI-CD-SETUP.md`

---

**Done!** 🎉

You've fixed 8+ workflows in 15 minutes!
