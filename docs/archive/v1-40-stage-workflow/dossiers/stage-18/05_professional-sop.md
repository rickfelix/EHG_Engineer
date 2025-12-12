# Stage 18: Professional Standard Operating Procedure

## Purpose

This SOP provides step-by-step instructions for executing Stage 18: Documentation Sync to GitHub. Follow this procedure to ensure consistent, repeatable, high-quality synchronization of all venture documentation and code to version control.

**Target Audience**: EXEC agents (DevOps engineers, automation scripts)
**Execution Mode**: Manual (current) → Assisted (next) → Automated (future)
**Estimated Duration**: 9-18 hours (manual), 2-4 hours (automated)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:781-826 "Synchronize all documentation and code to version control"

## Pre-Execution Checklist

**Before starting Stage 18, verify all entry gates**:

### Entry Gate 1: Documentation Complete

**Validation Steps**:
1. Check for required documentation files:
   - [ ] README.md (venture overview)
   - [ ] API documentation (OpenAPI spec or equivalent)
   - [ ] Architecture diagrams (system design, database schema)
   - [ ] User guides (customer-facing docs)
2. Run documentation completeness script:
   ```bash
   # Count markdown files
   find ./docs -name "*.md" | wc -l
   # Expected: ≥10 files for typical venture
   ```
3. Verify documentation from Stage 17 (GTM strategy docs):
   - [ ] Campaign playbooks
   - [ ] Customer segmentation documents
   - [ ] Agent configuration files

**Failure Action**: If documentation incomplete, recurse to Stage 14 (Technical Documentation) or Stage 17 (GTM)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:800 "Documentation complete"

### Entry Gate 2: Code Ready

**Validation Steps**:
1. Run linting:
   ```bash
   npm run lint  # JavaScript/TypeScript
   # or
   pylint src/   # Python
   # Expected: 0 errors
   ```
2. Run build:
   ```bash
   npm run build  # JavaScript/TypeScript
   # or
   python setup.py build  # Python
   # Expected: Build succeeds
   ```
3. Run tests:
   ```bash
   npm test  # JavaScript/TypeScript
   # or
   pytest  # Python
   # Expected: All tests pass
   ```
4. Check for uncommitted changes:
   ```bash
   git status
   # Expected: "nothing to commit, working tree clean"
   ```

**Failure Action**: Fix code issues (syntax errors, failing tests) before proceeding

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:801 "Code ready"

## Substage 18.1: Repository Setup

**Owner**: EXEC agent (DevOps engineer or automation script)
**Estimated Duration**: 2-4 hours (manual), 15-30 minutes (automated)

### Step 1.1: Create GitHub Organization (if needed)

**When to execute**: First venture in a new business domain

**Manual Execution**:
1. Navigate to GitHub.com
2. Click profile icon → Your organizations → New organization
3. Choose plan (Free for open-source, Team for private ventures)
4. Enter organization name (e.g., `EHG-Ventures`)
5. Add billing information (if Team plan)

**Automated Execution** (future):
```bash
# Using GitHub CLI
gh org create EHG-Ventures --plan=team
```

**Output**: Organization URL (e.g., `https://github.com/EHG-Ventures`)

### Step 1.2: Create Repository

**Manual Execution**:
1. Navigate to organization page (e.g., `https://github.com/EHG-Ventures`)
2. Click "New repository"
3. Configure repository:
   - **Name**: `venture-name` (lowercase, hyphenated)
   - **Description**: One-line venture summary
   - **Visibility**: Private (default) or Public (LEAD approval required)
   - **Initialize**: Check "Add a README file" (skip if migrating existing repo)
4. Click "Create repository"

**Automated Execution**:
```bash
# Using GitHub CLI
gh repo create EHG-Ventures/venture-name \
  --description "One-line venture summary" \
  --private \
  --clone
# Output: Repo created and cloned to ./venture-name
```

**Output**: Repository URL (e.g., `https://github.com/EHG-Ventures/venture-name`)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:810 "Repos created"

### Step 1.3: Define Repository Structure

**Recommended Folder Structure** (monorepo):
```
venture-name/
├── .github/
│   ├── workflows/        # GitHub Actions CI/CD
│   └── ISSUE_TEMPLATE/   # Issue templates
├── docs/
│   ├── architecture/     # System design docs
│   ├── api/              # API documentation
│   └── user-guide/       # Customer-facing docs
├── src/
│   ├── client/           # Frontend code
│   ├── server/           # Backend code
│   └── shared/           # Shared utilities
├── tests/
│   ├── unit/             # Unit tests
│   └── e2e/              # End-to-end tests
├── scripts/              # Build/deployment scripts
├── .gitignore            # Git ignore rules
├── README.md             # Venture overview
├── package.json          # Dependencies (Node.js)
└── docker-compose.yml    # Local development setup
```

**Execution**:
```bash
cd venture-name
mkdir -p .github/workflows docs/architecture docs/api docs/user-guide \
  src/client src/server src/shared tests/unit tests/e2e scripts
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:811 "Structure defined"

### Step 1.4: Set Permissions

**Team Roles**:
- **Admin**: LEAD agents, EXEC lead
- **Write**: EXEC agents, PLAN agents
- **Read**: External contractors, auditors

**Manual Execution**:
1. Navigate to repo Settings → Collaborators and teams
2. Click "Add teams"
3. For each team:
   - Select team name (e.g., "EXEC-Team")
   - Choose role (Admin/Write/Read)
   - Click "Add [team] to this repository"

**Automated Execution** (future):
```bash
# Using GitHub CLI
gh api repos/EHG-Ventures/venture-name/collaborators/exec-team \
  -X PUT -F permission=admin
```

**Security Best Practices**:
- Enable branch protection on `main` (require PR reviews)
- Require 2FA for all team members
- Enable GitHub Advanced Security (if available)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:812 "Permissions set"

### Substage 18.1 Exit Criteria

**Validation**:
- [ ] Repository exists and is accessible (verify URL loads)
- [ ] Folder structure created (run `tree -L 2` to verify)
- [ ] Permissions configured (team members can clone repo)

**Proceed to Substage 18.2**

## Substage 18.2: Content Migration

**Owner**: EXEC agent (automated sync script or manual upload)
**Estimated Duration**: 4-8 hours (manual), 1-2 hours (automated)

### Step 2.1: Initialize Git (if not already done)

**Execution**:
```bash
cd /path/to/venture-code
git init
git remote add origin https://github.com/EHG-Ventures/venture-name.git
```

**Verify**:
```bash
git remote -v
# Expected output:
# origin  https://github.com/EHG-Ventures/venture-name.git (fetch)
# origin  https://github.com/EHG-Ventures/venture-name.git (push)
```

### Step 2.2: Create .gitignore

**Template** (Node.js/TypeScript):
```gitignore
# Dependencies
node_modules/
package-lock.json

# Build outputs
dist/
build/
*.log

# Environment variables (CRITICAL: Never commit secrets)
.env
.env.local
.env.*.local

# IDE files
.vscode/
.idea/
*.swp

# OS files
.DS_Store
Thumbs.db

# Test coverage
coverage/
.nyc_output/
```

**Execution**:
```bash
curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore
# Customize as needed
```

**Verification**:
```bash
# Test that .env files are ignored
echo "SECRET_KEY=test" > .env
git status
# Expected: .env should NOT appear in untracked files
```

### Step 2.3: Push Code

**Execution**:
```bash
# Stage all files
git add .

# Verify staged files (check for accidentally staged secrets)
git status
# Review list carefully

# Commit with descriptive message
git commit -m "Initial commit: Sync Stage 18 code and docs

- Add src/ directory with client and server code
- Add docs/ with architecture, API, and user guides
- Configure .gitignore for Node.js project
- Set up folder structure per Stage 18 SOP

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:781-826"

# Push to GitHub
git push -u origin main
```

**Handling Large Files** (>50MB):
```bash
# Install Git LFS
git lfs install

# Track large files
git lfs track "*.mp4"  # Videos
git lfs track "*.zip"  # Archives
git lfs track "*.psd"  # Large design files

# Add .gitattributes
git add .gitattributes
git commit -m "Configure Git LFS for large files"
git push
```

**Error Handling**:
- **Error**: `rejected (non-fast-forward)`
  - **Solution**: `git pull --rebase origin main && git push`
- **Error**: `file exceeds GitHub's file size limit of 100.00 MB`
  - **Solution**: Use Git LFS (see above) or move file to external storage (S3)
- **Error**: `remote: Password authentication is deprecated`
  - **Solution**: Use Personal Access Token (PAT) instead of password

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:816 "Code pushed"

### Step 2.4: Upload Documentation

**Execution** (if docs stored separately):
```bash
# Copy docs from Stage 17 output directory
cp -r /path/to/stage17/docs/* ./docs/

# Add and commit
git add docs/
git commit -m "Add documentation from Stage 17 (GTM strategy)"
git push
```

**Documentation Site Generation**:
```bash
# For Node.js projects (using Docusaurus)
npx create-docusaurus@latest docs-site classic
cd docs-site
npm install
npm run build
# Deploy to GitHub Pages (see Substage 18.3)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:817 "Docs uploaded"

### Step 2.5: Store Assets

**For small assets** (<50MB):
```bash
# Add images, fonts, etc. to Git
git add assets/
git commit -m "Add venture assets (logos, fonts, icons)"
git push
```

**For large assets** (>50MB):
```bash
# Use Git LFS
git lfs track "assets/videos/*.mp4"
git add assets/videos/
git commit -m "Add marketing videos via Git LFS"
git push
```

**For very large assets** (>1GB):
```bash
# Use external storage (S3, Cloudinary)
# Store URLs in config file instead of files themselves
echo "LOGO_URL=https://cdn.venture.com/logo.png" >> .env.example
git add .env.example
git commit -m "Add asset URLs (files stored in S3)"
git push
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:818 "Assets stored"

### Substage 18.2 Exit Criteria

**Validation**:
- [ ] All code pushed to GitHub (verify repo URL shows files)
- [ ] Documentation uploaded (check docs/ folder exists)
- [ ] Assets stored (images/videos accessible)
- [ ] No secrets committed (run `git log --all -- .env` returns empty)

**Proceed to Substage 18.3**

## Substage 18.3: Automation Configuration

**Owner**: EXEC agent (DevOps engineer)
**Estimated Duration**: 3-6 hours (manual), 30-60 minutes (automated)

### Step 3.1: Configure Webhooks

**Use Case**: Trigger external systems on GitHub events (e.g., deploy staging on push to `main`)

**Manual Execution**:
1. Navigate to repo Settings → Webhooks
2. Click "Add webhook"
3. Configure:
   - **Payload URL**: `https://your-deploy-server.com/webhook`
   - **Content type**: `application/json`
   - **Secret**: Generate random string (store securely)
   - **Events**: Check "Just the push event" (or customize)
4. Click "Add webhook"

**Testing**:
```bash
# Push a commit and verify webhook fires
git commit --allow-empty -m "Test webhook"
git push
# Check deploy server logs for incoming webhook
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:822 "Webhooks set"

### Step 3.2: Set Up CI/CD (GitHub Actions)

**Create Workflow File**:
```bash
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build project
        run: npm run build

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
EOF

git add .github/workflows/ci.yml
git commit -m "Add CI pipeline (GitHub Actions)"
git push
```

**Verification**:
1. Navigate to repo → Actions tab
2. Verify "CI" workflow appears
3. Check latest run status (should be green ✓)

**Common Issues**:
- **Issue**: Workflow fails with "npm: command not found"
  - **Solution**: Add `setup-node` action (see example above)
- **Issue**: Tests timeout after 6 hours
  - **Solution**: Add `timeout-minutes: 30` to job config
- **Issue**: Secrets not available in workflow
  - **Solution**: Add secrets in repo Settings → Secrets and variables → Actions

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:823 "CI/CD configured"

### Step 3.3: Enable Auto-Sync (Documentation Site)

**For GitHub Pages**:
```bash
# Add deployment workflow
cat > .github/workflows/deploy-docs.yml << 'EOF'
name: Deploy Docs

on:
  push:
    branches: [ main ]
    paths:
      - 'docs/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Build docs
        run: |
          cd docs-site
          npm ci
          npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs-site/build
EOF

git add .github/workflows/deploy-docs.yml
git commit -m "Add auto-deploy for documentation site"
git push
```

**Verification**:
1. Edit any file in `docs/`
2. Push change to GitHub
3. Wait 2-3 minutes
4. Visit `https://[org].github.io/[repo]` (docs should update)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:824 "Sync automated"

### Substage 18.3 Exit Criteria

**Validation**:
- [ ] Webhooks configured (test push triggers webhook)
- [ ] CI/CD pipeline active (Actions tab shows green ✓)
- [ ] Auto-sync enabled (docs update automatically on commit)

**Proceed to Exit Gate Validation**

## Exit Gate Validation

**Before marking Stage 18 complete, verify all exit gates**:

### Exit Gate 1: Repos Synchronized

**Validation**:
```bash
# Check sync completeness
TOTAL_FILES=$(find . -type f | wc -l)
GIT_TRACKED=$(git ls-files | wc -l)
SYNC_RATE=$(echo "scale=2; $GIT_TRACKED / $TOTAL_FILES * 100" | bc)
echo "Sync completeness: $SYNC_RATE%"
# Expected: ≥95%
```

**Pass Criteria**: Sync completeness ≥95%

**Failure Action**: Identify untracked files (`git status`), add missing files, re-push

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:803 "Repos synchronized"

### Exit Gate 2: CI/CD Connected

**Validation**:
1. Navigate to repo → Actions
2. Verify at least 1 successful workflow run (green ✓)
3. Check latest commit has passing status badge

**Pass Criteria**: Latest commit shows green ✓ in GitHub

**Failure Action**: Debug workflow errors (check Actions logs), fix issues, re-run workflow

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:804 "CI/CD connected"

### Exit Gate 3: Access Configured

**Validation**:
1. Ask 3 team members to clone repo:
   ```bash
   git clone https://github.com/EHG-Ventures/venture-name.git
   ```
2. Verify all team members can access (no permission errors)
3. Verify correct roles (EXEC = write, LEAD = admin)

**Pass Criteria**: 100% of team members have correct access

**Failure Action**: Adjust permissions (repo Settings → Collaborators)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:805 "Access configured"

## Post-Execution Tasks

### 1. Update Stage 18 Metrics

**Record metrics in database**:
```sql
INSERT INTO stage_metrics (venture_id, stage_id, metric_name, metric_value, measured_at)
VALUES
  ('VENTURE-001', 18, 'sync_completeness', 98.5, NOW()),
  ('VENTURE-001', 18, 'documentation_coverage', 85.0, NOW()),
  ('VENTURE-001', 18, 'version_control_compliance', 100.0, NOW());
```

**Evidence**: See 09_metrics-monitoring.md for detailed SQL queries

### 2. Create Stage 18 Completion Handoff

**Generate handoff document**:
```bash
# Template
cat > stage-18-handoff.md << EOF
# Stage 18 Handoff: Documentation Sync to GitHub

## Completion Summary
- **Venture ID**: VENTURE-001
- **Completed By**: EXEC Agent (DevOps Engineer Name)
- **Completion Date**: 2025-11-05
- **Execution Time**: 6 hours

## Outputs Delivered
1. **GitHub Repository**: https://github.com/EHG-Ventures/venture-name
2. **Documentation Site**: https://ehg-ventures.github.io/venture-name
3. **CI/CD Pipelines**: 3 workflows (CI, Deploy Docs, Release)

## Metrics Achieved
- Sync completeness: 98.5% (Target: ≥95%) ✓
- Documentation coverage: 85.0% (Target: ≥80%) ✓
- Version control compliance: 100.0% (Target: 100%) ✓

## Exit Gates Passed
- [x] Repos synchronized
- [x] CI/CD connected
- [x] Access configured

## Next Stage Readiness
Stage 19 (Tri-Party Integration Verification) can now begin.
Repository URLs and CI/CD pipelines provided to Stage 19 owner.

## Issues/Risks
- None (clean execution)

---
Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:781-826
EOF
```

### 3. Notify Downstream Stage (Stage 19)

**Send handoff to Stage 19 owner**:
```bash
# Email or Slack message
To: Stage 19 EXEC Agent
Subject: Stage 18 Complete - Repo Ready for Integration Testing

Stage 18 (Documentation Sync) is now complete.
Repository: https://github.com/EHG-Ventures/venture-name
CI/CD: Active (see .github/workflows/)
Documentation: https://ehg-ventures.github.io/venture-name

You may begin Stage 19 (Integration Verification).
```

## Error Recovery Procedures

### Scenario 1: Git Push Rejected (Divergent Branches)

**Symptoms**:
```
error: failed to push some refs to 'https://github.com/EHG-Ventures/venture-name.git'
hint: Updates were rejected because the tip of your current branch is behind
```

**Solution**:
```bash
# Pull latest changes
git pull --rebase origin main

# Resolve conflicts (if any)
git status  # Check for conflicts
# Edit conflicting files, then:
git add .
git rebase --continue

# Push again
git push origin main
```

### Scenario 2: GitHub API Rate Limit (429 Error)

**Symptoms**:
```
API rate limit exceeded for [IP address]
```

**Solution**:
```bash
# Wait 1 hour (rate limit resets)
# OR use GitHub GraphQL API (higher limits)
# OR authenticate with Personal Access Token (higher limits for authenticated users)

# Check current rate limit
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/rate_limit
```

### Scenario 3: Large File Rejected (>100MB)

**Symptoms**:
```
remote: error: File large-file.mp4 is 150.00 MB; this exceeds GitHub's file size limit of 100.00 MB
```

**Solution**:
```bash
# Option 1: Use Git LFS
git lfs install
git lfs track "large-file.mp4"
git add .gitattributes large-file.mp4
git commit --amend --no-edit
git push --force

# Option 2: Move to external storage
aws s3 cp large-file.mp4 s3://venture-assets/large-file.mp4
echo "LARGE_FILE_URL=https://s3.amazonaws.com/venture-assets/large-file.mp4" >> .env.example
git rm large-file.mp4
git commit -m "Move large file to S3"
git push
```

### Scenario 4: CI/CD Pipeline Fails

**Symptoms**:
- GitHub Actions workflow shows red X
- Build logs show errors (e.g., "MODULE_NOT_FOUND")

**Solution**:
```bash
# 1. Check logs
# Navigate to Actions tab → Failed workflow → View logs

# 2. Common fixes:
# - Missing dependency: Add to package.json, commit, push
npm install missing-package --save
git add package.json package-lock.json
git commit -m "Add missing dependency"
git push

# - Wrong Node version: Update .github/workflows/ci.yml
# Change `node-version: '16'` to `node-version: '18'`

# - Test failures: Fix tests, commit, push
npm test  # Run locally first
git add tests/
git commit -m "Fix failing tests"
git push
```

## SOP Version History

**Current Version**: v1.0 (2025-11-05)
**Changelog**:
- v1.0 (2025-11-05): Initial SOP based on stages.yaml and critique analysis

**Maintenance**: Update this SOP when stages.yaml changes or new best practices emerge.

---

**Next Steps**: Proceed to 06_agent-orchestration.md for multi-agent automation patterns.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
