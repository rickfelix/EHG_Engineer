# Beginner's Guide: Fix CI/CD Secrets (Step-by-Step)

**Time Required**: 15 minutes
**Difficulty**: Beginner-friendly
**What You'll Fix**: 8+ failing workflows will start working

---

## What Are We Fixing?

Your GitHub workflows (automated tests and checks) need "secrets" (like passwords) to work. Right now, 2 important secrets are missing, so 8+ workflows are failing. We're going to add those secrets.

Think of it like this:
- Your automated tests are like a robot
- The robot needs a key (secret) to access your database
- We're going to give the robot that key

---

## Part 1: Add Database Access Key (5 minutes)

### What is this?
This is a special key that lets GitHub workflows access your Supabase database. Without it, 8 workflows can't run tests.

### Step 1: Open Supabase Dashboard

1. Open your web browser
2. Go to: https://app.supabase.com/project/dedlbzhpgkmetvhbkyzq/settings/api
3. Log in if asked

**What you'll see**: A page titled "API" with several sections

### Step 2: Find the Service Role Key

1. Scroll down to the section called **"Project API keys"**
2. You'll see a table with different keys
3. Find the row labeled **"service_role"** (usually the second or third row)
4. The key will look like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (very long)
5. Click the **"Copy"** icon next to this key (looks like two overlapping squares)

**⚠️ IMPORTANT**: This is a SECRET key. Don't share it with anyone or post it online!

### Step 3: Open Your Terminal

1. On Windows: Open "Command Prompt" or "PowerShell" or "Git Bash"
2. On Mac: Open "Terminal"
3. On Linux: Open your terminal application

### Step 4: Navigate to Your Project Folder

Type this command (replace the path with your actual project path):

```bash
cd /mnt/c/_EHG/EHG_Engineer
```

**How to know if it worked**: Type `ls` and press Enter. You should see folders like `.github`, `src`, `docs`, etc.

### Step 5: Add the Secret to GitHub

Type this command and press Enter:

```bash
gh secret set SUPABASE_SERVICE_ROLE_KEY
```

**What happens next**:
1. You'll see: `? Paste your secret:`
2. Press `Ctrl+V` (Windows/Linux) or `Cmd+V` (Mac) to paste the key you copied earlier
3. **You won't see the key appear** - this is normal for security!
4. Press Enter

**Success message**: `✓ Set Actions secret SUPABASE_SERVICE_ROLE_KEY for rickfelix/EHG_Engineer`

### Step 6: Verify It Worked

Type this command:

```bash
gh secret list | grep SERVICE_ROLE
```

**You should see**:
```
SUPABASE_SERVICE_ROLE_KEY    2025-10-26T...
```

**✅ Success!** You've added the database key!

---

## Part 2: Add GitHub Personal Access Token (10 minutes)

### What is this?
This is a special password that lets one GitHub repository (EHG_Engineer) access another repository (ehg). It's needed for UAT testing.

### Step 1: Create the Token on GitHub

1. Open your web browser
2. Go to: https://github.com/settings/tokens
3. Click the green button **"Generate new token"** (might be a dropdown)
4. Select **"Generate new token (classic)"**

### Step 2: Configure the Token

You'll see a form. Fill it out like this:

**Note** (token description):
```
CI/CD UAT Testing - EHG Repo Access
```

**Expiration**:
- Click the dropdown
- Select **"90 days"**

**Select scopes** (checkboxes):
- ✅ Check the box next to **"repo"** (Full control of private repositories)
- This will automatically check all the boxes under it - that's fine!
- ⚠️ Don't check any other boxes

**Why 90 days?** For security, tokens should expire. You'll need to create a new one in 90 days (we can set up a reminder later).

### Step 3: Generate and Copy the Token

1. Scroll to the bottom
2. Click the green **"Generate token"** button
3. **IMPORTANT**: You'll see a long token starting with `ghp_...`
4. Click the **copy icon** next to it (two overlapping squares)
5. **⚠️ CRITICAL**: This token is only shown ONCE! If you close this page without copying, you'll have to create a new one.

**Save it temporarily**: Paste the token in a text file for now (you'll delete this file later)

### Step 4: Add the Token to GitHub Secrets

Go back to your terminal and type:

```bash
gh secret set GH_PAT
```

**What happens**:
1. You'll see: `? Paste your secret:`
2. Press `Ctrl+V` (Windows/Linux) or `Cmd+V` (Mac) to paste the token
3. **You won't see the token appear** - normal!
4. Press Enter

**Success message**: `✓ Set Actions secret GH_PAT for rickfelix/EHG_Engineer`

**🔐 Security**: Now you can delete that text file with the token!

### Step 5: Verify the Token

```bash
gh secret list | grep GH_PAT
```

**You should see**:
```
GH_PAT    2025-10-26T...
```

**✅ Success!** GitHub token added!

---

## Part 3: Re-enable the UAT Testing Workflow (2 minutes)

### What is this?
The UAT (User Acceptance Testing) workflow was turned off because the GH_PAT was missing. Now we'll turn it back on.

### Step 1: Open the Workflow File

In your terminal, type:

```bash
code .github/workflows/uat-testing.yml
```

**OR** if you don't have VS Code:

```bash
nano .github/workflows/uat-testing.yml
```

**OR** open the file in any text editor you prefer.

### Step 2: Make Two Changes

**Change #1**: Find line 17

Look for this line (around line 17):
```yaml
    if: false
```

**Delete this entire line** (or put `#` at the beginning to comment it out):
```yaml
    # if: false
```

**Change #2**: Find lines 27-35

Look for these commented lines (they have `#` at the start):
```yaml
      # - name: Checkout EHG application
      #   uses: actions/checkout@v4
      #   with:
      #     repository: rickfelix/ehg
      #     token: ${{ secrets.GH_PAT }}
      #     path: ehg
```

**Remove the `#` symbols** from all these lines so they look like:
```yaml
      - name: Checkout EHG application
        uses: actions/checkout@v4
        with:
          repository: rickfelix/ehg
          token: ${{ secrets.GH_PAT }}
          path: ehg
```

**Be careful**: Keep the spacing exactly the same (YAML is very picky about spaces!)

### Step 3: Save the File

- **If using VS Code**: Press `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac)
- **If using nano**: Press `Ctrl+X`, then `Y`, then Enter
- **If using another editor**: Use File → Save

### Step 4: Commit and Push the Changes

In your terminal, type these commands one at a time:

```bash
git add .github/workflows/uat-testing.yml
```

```bash
git commit -m "fix(ci-cd): Re-enable UAT testing workflow with GH_PAT configured"
```

```bash
git push
```

**What you'll see**:
```
[main abc1234] fix(ci-cd): Re-enable UAT testing workflow with GH_PAT configured
 1 file changed, 7 insertions(+), 7 deletions(-)
```

**✅ Success!** UAT workflow is now enabled!

---

## Part 4: Verify Everything Works (3 minutes)

### Step 1: Check All Secrets

```bash
gh secret list
```

**You should see these two new secrets**:
```
GH_PAT                        2025-10-26T...
SUPABASE_SERVICE_ROLE_KEY     2025-10-26T...
```

Plus the 8 secrets that were already there. **Total: 10 secrets**

### Step 2: Trigger a Test Workflow

Let's test that the database key works:

```bash
gh workflow run stories-ci.yml
```

**Expected output**: `✓ Created workflow_dispatch event for stories-ci.yml at main`

### Step 3: Watch the Workflow Run

```bash
gh run watch
```

**What you'll see**:
- A real-time view of the workflow running
- It will show progress with checkmarks ✓
- Wait for it to complete (usually 2-3 minutes)

**Success looks like**:
```
✓ main stories-ci #123 · 1234567
Triggered via workflow_dispatch about 2 minutes ago

JOBS
✓ verify-stories (ID 1234567890)
  ✓ Set up job
  ✓ Checkout code
  ✓ Run story verification
  ...
  ✓ Complete job
```

**If it fails**: Don't worry! Press `Ctrl+C` to exit, and we'll troubleshoot (see Part 5 below)

### Step 4: Check Recent Workflow Runs

```bash
gh run list --limit 5
```

**You should see**:
- The workflow you just ran
- Status should be ✓ (green checkmark) or `completed`
- No ❌ or `failure` status

**✅ COMPLETE!** All secrets are configured and working!

---

## Part 5: Troubleshooting

### Problem: "gh: command not found"

**Solution**: You need to install GitHub CLI

**Windows**:
```bash
winget install --id GitHub.cli
```

**Mac**:
```bash
brew install gh
```

**Linux**:
```bash
sudo apt install gh
```

Then login:
```bash
gh auth login
```

Follow the prompts to authenticate.

---

### Problem: Workflow fails with "secret not found"

**Check**: Did the secret get added?
```bash
gh secret list
```

**If missing**: Repeat Part 1 or Part 2

**If present**: The workflow might be using a different secret name. Run:
```bash
gh run view --log
```

Look for the error message and see which secret is missing.

---

### Problem: "Permission denied" when running commands

**Solution**: You're not in the right folder or don't have permissions.

**Try**:
```bash
# Navigate to project
cd /mnt/c/_EHG/EHG_Engineer

# Check you're in the right place
ls .github/workflows
```

You should see a list of `.yml` files.

---

### Problem: Workflow fails with "authentication failed"

**Possible causes**:

1. **Wrong key copied**: Go back to Supabase and copy the service_role key again
2. **Expired token**: GitHub PAT might have expired (create a new one)
3. **Typo in secret name**: Run `gh secret list` and verify spelling exactly matches

**Fix**:
```bash
# Remove wrong secret
gh secret remove SUPABASE_SERVICE_ROLE_KEY

# Add it again correctly
gh secret set SUPABASE_SERVICE_ROLE_KEY
# (paste the correct key)
```

---

### Problem: Can't find the Supabase key

**Step-by-step**:
1. Go to: https://app.supabase.com
2. Click on your project (dedlbzhpgkmetvhbkyzq)
3. In the left sidebar, click ⚙️ **Settings**
4. Click **API**
5. Scroll to "Project API keys"
6. Find **service_role** (NOT anon!)
7. Click the copy icon

---

### Problem: YAML file won't save or shows errors

**Common issues**:
- **Spacing is wrong**: YAML requires exact indentation (use spaces, not tabs)
- **Missing `-`**: Lists in YAML need a dash `-` at the start

**Solution**:
1. Copy the corrected version from: `.github/KNOWN_CI_ISSUES.md`
2. Or ask for help with the specific error message

---

## Part 6: What to Expect Now

### Workflows That Should Now Work

After completing these steps, these 8+ workflows will start working:

1. **stories-ci.yml** - Story verification CI ✅
2. **leo-gates.yml** - LEO protocol gate validation ✅
3. **e2e-stories.yml** - E2E test story verification ✅
4. **story-gate-check.yml** - Story gate checking ✅
5. **uat-testing.yml** - UAT testing (newly enabled) ✅
6. Plus several others that depend on these secrets

### How to Check Health

Every day, run:
```bash
gh run list --limit 10
```

**Healthy CI/CD looks like**:
- Most runs show ✓ (completed successfully)
- Less than 5% show ❌ (failed)
- Failures are for real code issues, not "secret not found" errors

### When to Repeat This

**GitHub Personal Access Token (GH_PAT)**:
- Expires in 90 days
- You'll get an email warning before it expires
- Follow Part 2 again to create a new one
- Set a calendar reminder for 3 months from now

**Supabase Service Role Key**:
- Doesn't expire
- Only change if Supabase tells you to rotate it
- Or if the key is compromised

---

## Quick Reference Card

Save this for later:

### Add a Secret
```bash
gh secret set SECRET_NAME
# Then paste the value and press Enter
```

### List All Secrets
```bash
gh secret list
```

### Check Recent Workflows
```bash
gh run list --limit 10
```

### Run a Workflow Manually
```bash
gh workflow run workflow-name.yml
```

### Watch a Workflow
```bash
gh run watch
```

### View Workflow Logs
```bash
gh run view --log
```

---

## Summary Checklist

Use this to verify you completed everything:

- [ ] Part 1: Added SUPABASE_SERVICE_ROLE_KEY
  - [ ] Copied from Supabase dashboard
  - [ ] Added with `gh secret set`
  - [ ] Verified with `gh secret list`

- [ ] Part 2: Added GH_PAT
  - [ ] Created on GitHub settings
  - [ ] 90 days expiration set
  - [ ] Only "repo" scope selected
  - [ ] Added with `gh secret set`
  - [ ] Verified with `gh secret list`

- [ ] Part 3: Re-enabled UAT workflow
  - [ ] Removed `if: false` from line 17
  - [ ] Uncommented lines 27-35
  - [ ] Saved file
  - [ ] Committed and pushed changes

- [ ] Part 4: Verified everything works
  - [ ] `gh secret list` shows 10 secrets
  - [ ] Ran `gh workflow run stories-ci.yml`
  - [ ] Watched with `gh run watch` - passed ✅
  - [ ] No "secret not found" errors

**If all checked**: 🎉 **You're done!** Your CI/CD is fully configured!

---

## Next Steps (Optional)

### Set Up Reminders

**90-day reminder for GH_PAT renewal**:
1. Open your calendar
2. Set a reminder for **January 24, 2026** (90 days from now)
3. Title: "Renew GitHub Personal Access Token (GH_PAT)"
4. Notes: "Follow Part 2 of BEGINNER-GUIDE-CI-CD-SETUP.md"

### Monitor CI/CD Health

**Weekly check** (1 minute):
```bash
gh run list --limit 20
```

Look for patterns:
- All green ✅ = excellent!
- Some red ❌ = normal (code bugs happen)
- Lots of red ❌ = investigate

### Learn More

Want to understand what's happening behind the scenes?

- Read: `docs/CI-CD-SECRETS-CONSOLIDATED-REPORT.md` (more technical details)
- Read: `.github/KNOWN_CI_ISSUES.md` (what was fixed and why)

---

## Getting Help

### If Stuck

1. **Check the error message**: Run `gh run view --log` and read what it says
2. **Try troubleshooting section**: See Part 5 above
3. **Check existing issues**: Look in `.github/KNOWN_CI_ISSUES.md`
4. **Ask for help**: Provide the exact error message you're seeing

### Useful Commands for Debugging

```bash
# See detailed logs of failed run
gh run view FAILED_RUN_ID --log

# See what secrets are configured
gh secret list

# See what variables are configured
gh variable list

# Test database connection
psql "$DATABASE_URL" -c "SELECT version();"
```

---

**Congratulations!** 🎉

You've successfully configured all the secrets needed for CI/CD workflows. 8+ previously-failing workflows are now working, and your automated testing is fully operational!

**Time spent**: ~15 minutes
**Workflows fixed**: 8+
**Skills learned**: GitHub secrets, YAML editing, workflow management

**You're now a CI/CD secret configuration expert!** 🚀
