# LEO Protocol Repository Guidelines

**CRITICAL**: Understanding Repository Boundaries

---

## Repository Architecture

### 1. LEO Protocol Tool Repository (EHG_Engineer)
**Repository**: `EHG_Engineer`
**GitHub**: `rickfelix/EHG_Engineer` 
**Purpose**: The LEO Protocol framework and tools

**What Goes Here**:
- LEO Protocol documentation (`/docs/03_protocols_and_standards/`)
- LEO CLI tools (`/scripts/leo.js`)
- Protocol templates and helpers
- Configuration for multiple projects
- Generic Strategic Directive templates
- Protocol improvement proposals
- LEO Protocol version updates

**What NEVER Goes Here**:
- Application-specific code
- Project-specific Strategic Directives
- Implementation details
- Application retrospectives

### 2. Application Repositories (e.g., EHG)
**Repository**: Individual application (e.g., `ehg`)
**GitHub**: `rickfelix/ehg`
**Purpose**: The actual applications being built

**What Goes Here**:
- Application source code
- Project-specific Strategic Directives
- Project-specific PRDs
- Implementation retrospectives
- Application documentation
- CI/CD configurations
- Application-specific tests

**What NEVER Goes Here**:
- LEO Protocol core documentation
- LEO Protocol version updates
- Generic protocol templates
- LEO CLI tool code

---

## Critical Rules for Agents

### RULE 1: Know Your Repository
```bash
# Always check which repository you're in
pwd
git remote -v

# If path contains "EHG_Engineer" → LEO Protocol repo
# If path contains project name → Application repo
```

### RULE 2: Commit to Correct Repository
```markdown
Before ANY commit, ask:
1. Is this about the LEO Protocol itself? → EHG_Engineer
2. Is this about a specific implementation? → Application repo
3. Is this a retrospective about using LEO? → Application repo
4. Is this improving the LEO Protocol? → EHG_Engineer
```

### RULE 3: Repository Handoff Information
When handing off between agents, ALWAYS specify:
```yaml
handoff:
  working_repository: EHG_Engineer | <application_name>
  files_modified:
    - repo: EHG_Engineer
      files: [list]
    - repo: <application>
      files: [list]
```

---

## Common Scenarios

### Scenario 1: Creating Strategic Directive
- **SD Template**: EHG_Engineer (generic template)
- **Actual SD**: Application repository (specific implementation)

### Scenario 2: Protocol Improvement
- **Improvement Proposal**: EHG_Engineer
- **Retrospective Leading to It**: Application repository

### Scenario 3: Adding New Agent Workflow
- **Workflow Documentation**: EHG_Engineer
- **Example Usage**: Application repository

---

## Repository Initialization Checklist

### For LEO Protocol (EHG_Engineer)
```bash
cd /path/to/EHG_Engineer
git init
git add .
git commit -m "Initial commit: LEO Protocol v3.x.x"
gh repo create rickfelix/EHG_Engineer --public --source=. --remote=origin --push
```

### For Applications
```bash
cd /path/to/application
git init
git add .
git commit -m "Initial commit: [Application Name]"
gh repo create rickfelix/[app-name] --private --source=. --remote=origin --push
```

---

## Preventing Repository Confusion

### 1. Pre-Commit Check
Before EVERY commit, agents MUST:
```bash
# Check repository
echo "Current repo: $(basename $(git rev-parse --show-toplevel))"
echo "Committing to: $(git remote get-url origin)"
read -p "Is this correct? (y/n): " confirm
```

### 2. Clear File Headers
All LEO Protocol documents should start with:
```markdown
<!-- Repository: EHG_Engineer -->
<!-- Type: LEO Protocol Core Documentation -->
<!-- Version: 3.x.x -->
```

All application documents should start with:
```markdown
<!-- Repository: [Application Name] -->
<!-- Type: Implementation Document -->
<!-- Related to: LEO Protocol v3.x.x -->
```

### 3. Handoff Repository Check
At EVERY handoff:
```markdown
## Handoff Control Point
- [ ] Verified current repository: _______
- [ ] All files committed to correct repo
- [ ] No protocol files in application repo
- [ ] No application files in protocol repo
```

---

## Recovery Procedures

### If Protocol Files End Up in Application Repo
```bash
# In application repo
git rm docs/protocols/leo_protocol_*.md
git commit -m "fix: Remove LEO Protocol files from application repo"

# In EHG_Engineer repo
git add docs/03_protocols_and_standards/
git commit -m "fix: Move LEO Protocol files to correct repo"
```

### If Application Files End Up in Protocol Repo
```bash
# In EHG_Engineer repo
git rm -r application-specific-files
git commit -m "fix: Remove application files from protocol repo"

# In application repo
git add application-specific-files
git commit -m "fix: Move application files to correct repo"
```

---

## Audit Command

Run periodically to check for misplaced files:
```bash
# In EHG_Engineer - should NOT find these
find . -name "SD-*" -o -name "PRD-*" | grep -v template

# In Application - should NOT find these
find . -name "leo_protocol_v*.md"
```

---

## Conclusion

Repository separation is CRITICAL for:
1. **Clarity**: Know where things belong
2. **Reusability**: LEO Protocol serves multiple projects
3. **Maintenance**: Updates don't affect all projects
4. **Security**: Application code separate from framework

**Remember**: When in doubt, ask: "Is this about HOW we work (LEO) or WHAT we're building (App)?"

---

*This guideline is part of LEO Protocol v3.2.1*
*Last Updated: 2025-08-30*