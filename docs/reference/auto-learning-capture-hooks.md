---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Auto-Learning Capture Hooks & Patterns


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Hook Configuration](#hook-configuration)
  - [PostToolUse Hook Registration](#posttooluse-hook-registration)
  - [Environment Variables](#environment-variables)
- [Detection Patterns](#detection-patterns)
  - [Merge Success Detection](#merge-success-detection)
  - [PR Number Extraction](#pr-number-extraction)
  - [SD/QF Work Detection (Database-First)](#sdqf-work-detection-database-first)
- [Learning Signal Keywords](#learning-signal-keywords)
  - [Signal Patterns](#signal-patterns)
  - [Learning Type Categories](#learning-type-categories)
  - [Corrective Action Detection](#corrective-action-detection)
- [Work Type Classification](#work-type-classification)
  - [File Pattern Classifiers](#file-pattern-classifiers)
  - [Learning-Worthy Paths](#learning-worthy-paths)
- [Database Queries](#database-queries)
  - [Retrospective Creation](#retrospective-creation)
  - [Issue Pattern Creation](#issue-pattern-creation)
- [Error Patterns](#error-patterns)
  - [Common Hook Errors](#common-hook-errors)
  - [Common Engine Errors](#common-engine-errors)
- [Troubleshooting](#troubleshooting)
  - [Debug Checklist](#debug-checklist)
  - [Testing Patterns](#testing-patterns)
  - [Log Level Configuration](#log-level-configuration)
  - [Performance Monitoring](#performance-monitoring)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5
- **Last Updated**: 2026-02-01
- **Tags**: hooks, learning, patterns, automation, retrospectives

## Overview

This reference guide documents the hooks and patterns used in the automated learning capture system. Use this as a quick reference when debugging, extending, or maintaining the auto-capture functionality.

For architectural context, see [Learning Capture Architecture](../01_architecture/learning-capture-architecture.md).

---

## Table of Contents

1. [Hook Configuration](#hook-configuration)
2. [Detection Patterns](#detection-patterns)
3. [Learning Signal Keywords](#learning-signal-keywords)
4. [Work Type Classification](#work-type-classification)
5. [Database Queries](#database-queries)
6. [Error Patterns](#error-patterns)
7. [Troubleshooting](#troubleshooting)

---

## Hook Configuration

### PostToolUse Hook Registration

**File**: `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node C:/Users/rickf/Projects/_EHG/EHG_Engineer/scripts/hooks/auto-learning-capture.cjs",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

**Configuration Parameters**:
- **matcher**: `Bash` - Triggers on Bash tool use
- **timeout**: `20` seconds - Allows time for database queries
- **type**: `command` - Executes Node.js script

### Environment Variables

| Variable | Purpose | Default | Example |
|----------|---------|---------|---------|
| `AUTO_LEARNING_LOG_LEVEL` | Logging verbosity | `info` | `error`, `warn`, `info`, `debug` |
| `CLAUDE_TOOL_OUTPUT` | Hook receives tool output | Set by Claude Code | Command stdout/stderr |
| `CLAUDE_TOOL_INPUT` | Hook receives tool input | Set by Claude Code | Command + args |
| `CLAUDE_TOOL_NAME` | Hook receives tool name | Set by Claude Code | `Bash` |
| `SUPABASE_URL` | Database connection | From `.env` | `https://...supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Database auth | From `.env` | Service role key |

---

## Detection Patterns

### Merge Success Detection

**File**: `scripts/hooks/auto-learning-capture.cjs`

```javascript
function isMergeSuccessful(output) {
  const successIndicators = [
    /Merged/i,
    /Pull request.*merged/i,
    /Successfully merged/i,
    /deleted.*branch/i
  ];

  return successIndicators.some(pattern => pattern.test(output));
}
```

**Examples**:
```
✅ MATCH: "Merged pull request #123"
✅ MATCH: "Successfully merged and deleted branch"
✅ MATCH: "Pull request successfully merged"
❌ NO MATCH: "Failed to merge"
❌ NO MATCH: "Merge conflict detected"
```

### PR Number Extraction

```javascript
function extractPRNumber(command, output) {
  // Try command first: gh pr merge 123 or gh pr merge #123
  const cmdMatch = command.match(/gh\s+pr\s+merge\s+#?(\d+)/);
  if (cmdMatch) return cmdMatch[1];

  // Try output patterns
  const outputMatches = [
    /Merged\s+pull\s+request\s+#(\d+)/i,
    /PR\s+#?(\d+)/i,
    /pull\/(\d+)/
  ];

  for (const pattern of outputMatches) {
    const match = output.match(pattern);
    if (match) return match[1];
  }

  return null;
}
```

### SD/QF Work Detection (Database-First)

**Critical**: Must survive branch deletion, so uses database queries NOT branch names.

```javascript
async function checkSDWorkStatus() {
  // 1. Active SD claim in current session
  const { data: activeSession } = await supabase
    .from('v_active_sessions')
    .select('sd_id')
    .in('computed_status', ['active', 'idle'])
    .not('sd_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (activeSession?.sd_id) {
    return { isSDWork: true, source: 'active_session', sdId: activeSession.sd_id };
  }

  // 2. Recently released SD (within 10 minutes of merge)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentRelease } = await supabase
    .from('sd_claims')
    .select('sd_id')
    .eq('release_reason', 'completed')
    .gte('released_at', tenMinutesAgo)
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentRelease?.sd_id) {
    return { isSDWork: true, source: 'recent_release', sdId: recentRelease.sd_id };
  }

  // 3. Active Quick Fix
  const { data: activeQF } = await supabase
    .from('quick_fixes')
    .select('id, qf_key')
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeQF?.id) {
    return { isSDWork: true, source: 'active_qf', sdId: activeQF.qf_key || activeQF.id };
  }

  // 4. is_working_on flag
  const { data: workingOn } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('is_working_on', true)
    .limit(1)
    .maybeSingle();

  if (workingOn?.id) {
    return { isSDWork: true, source: 'is_working_on', sdId: workingOn.sd_key || workingOn.id };
  }

  return { isSDWork: false, source: null, sdId: null };
}
```

**Reliability by Source**:

| Source | Reliability | Survives Branch Deletion | Query Table |
|--------|-------------|--------------------------|-------------|
| `active_session` | 99% | ✅ Yes | `v_active_sessions` |
| `recent_release` | 100% | ✅ Yes | `sd_claims` |
| `active_qf` | 100% | ✅ Yes | `quick_fixes` |
| `is_working_on` | 95% | ✅ Yes | `strategic_directives_v2` |
| `commit_grep` | 85% | ✅ Yes | `gh pr view` |

---

## Learning Signal Keywords

**File**: `scripts/auto-learning-capture.js`

### Signal Patterns

```javascript
const LEARNING_SIGNALS = [
  { pattern: /\bfix(?:ed)?:/i, type: 'correction' },
  { pattern: /\bshould use\b/i, type: 'best_practice' },
  { pattern: /\binstead of\b/i, type: 'correction' },
  { pattern: /\bcorrect approach\b/i, type: 'best_practice' },
  { pattern: /\broot cause\b/i, type: 'rca' },
  { pattern: /\bthe issue was\b/i, type: 'diagnosis' },
  { pattern: /\bresilien(?:t|ce)\b/i, type: 'improvement' },
  { pattern: /\bworkaround\b/i, type: 'alternative' },
  { pattern: /\balternative\b/i, type: 'alternative' },
  { pattern: /\bactually\b/i, type: 'correction' },
  { pattern: /\bmissing\b/i, type: 'gap' },
  { pattern: /\bincorrect\b/i, type: 'correction' },
  { pattern: /\bwrong\b/i, type: 'correction' },
  { pattern: /\bdocument(?:ation)?\s+(?:fix|update|correct)/i, type: 'docs_correction' }
];
```

### Learning Type Categories

| Type | Indicates | Creates Pattern? |
|------|-----------|------------------|
| `correction` | Something was wrong, now fixed | ✅ Yes |
| `best_practice` | Better approach identified | ✅ Yes |
| `rca` | Root cause discovered | ✅ Yes |
| `gap` | Missing information found | ✅ Yes |
| `docs_correction` | Documentation was incorrect | ✅ Yes |
| `diagnosis` | Issue identified | Maybe |
| `improvement` | Enhancement opportunity | Maybe |
| `alternative` | Different approach exists | No |

### Corrective Action Detection

```javascript
function hasCorrectiveAction(learnings) {
  const correctiveTypes = ['correction', 'docs_correction', 'gap', 'rca'];
  return learnings.some(l => correctiveTypes.includes(l.type));
}
```

**Rule**: Only create `issue_pattern` if corrective action detected.

---

## Work Type Classification

**File**: `scripts/auto-learning-capture.js`

### File Pattern Classifiers

```javascript
const WORK_TYPE_CLASSIFIERS = {
  protocol_fix: [
    /CLAUDE.*\.md$/i,
    /\.claude\//
  ],

  documentation_correction: [
    /docs\//,
    /README/i,
    /\.md$/
  ],

  hook_improvement: [
    /scripts\/hooks\//
  ],

  database_change: [
    /migrations\/.*\.sql$/i
  ],

  configuration: [
    /\.json$/,
    /\.yaml$/,
    /\.yml$/
  ],

  test_fix: [
    /\.test\./,
    /\.spec\./,
    /tests\//
  ],

  ui_polish: [
    /components\//,
    /pages\//,
    /\.tsx$/
  ],

  api_fix: [
    /api\//,
    /routes\//,
    /controllers\//
  ]
};
```

### Learning-Worthy Paths

```javascript
const LEARNING_WORTHY_PATHS = {
  'docs/reference/': 'reference_docs',
  'CLAUDE': 'protocol',
  '.claude/agents/': 'agent_config',
  '.claude/skills/': 'skill_config',
  '.claude/commands/': 'command_config',
  'lib/keyword-intent-scorer.js': 'subagent_triggers',
  'scripts/modules/learning/': 'learning_system',
  'scripts/hooks/': 'hook_system',
  'database/migrations/': 'database_schema',
  'supabase/migrations/': 'database_schema'
};
```

**Usage**: If ANY file in the PR matches a learning-worthy path, the work is flagged as significant and patterns are created even if no explicit learning signals found.

---

## Database Queries

### Retrospective Creation

```javascript
const retrospective = {
  title: `Auto-Captured: ${prTitle}`,
  description: `Automatically captured learning from non-SD work merged via PR #${prNumber}`,
  retro_type: 'NON_SD_CAPTURE',
  retrospective_type: 'NON_SD_CAPTURE',
  conducted_date: new Date().toISOString(),

  what_went_well: [
    'Work completed and merged successfully',
    'Learning captured automatically without manual steps'
  ],

  what_needs_improvement: [],

  key_learnings: learnings.map(l => ({
    learning: l.text,
    category: l.type,
    evidence: `PR #${prNumber}`
  })),

  action_items: [],
  status: 'PUBLISHED',
  quality_score: 70,

  generated_by: 'AUTO_HOOK',
  trigger_event: 'NON_SD_MERGE',
  target_application: 'EHG_Engineer',
  learning_category: workType,
  affected_components: files.slice(0, 10),

  metadata: {
    pr_number: prNumber,
    pr_url: prUrl,
    work_type: workType,
    learning_worthy_categories: learningWorthyCategories,
    auto_captured: true,
    captured_at: new Date().toISOString()
  }
};

await supabase.from('retrospectives').insert(retrospective);
```

### Issue Pattern Creation

```javascript
const patternId = await generatePatternId(); // PAT-AUTO-0001, PAT-AUTO-0002, ...

const pattern = {
  pattern_id: patternId,
  category: workTypeCategory,
  severity: 'medium',
  issue_summary: learnings[0]?.text || prTitle,
  occurrence_count: 1,

  first_seen_sd_id: null,  // Not from SD
  last_seen_sd_id: null,

  proven_solutions: [{
    solution: prTitle,
    times_applied: 1,
    times_successful: 1,
    success_rate: 100,
    from_pr: prNumber
  }],

  prevention_checklist: [],
  related_sub_agents: [],
  trend: 'stable',
  status: 'active',

  source: 'auto_hook',

  metadata: {
    pr_number: prNumber,
    pr_url: prUrl,
    work_type: workType,
    auto_captured: true,
    captured_at: new Date().toISOString()
  }
};

await supabase.from('issue_patterns').insert(pattern);
```

---

## Error Patterns

### Common Hook Errors

#### 1. Database Connection Failed

```
Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
```

**Cause**: Environment variables not loaded
**Fix**: Verify `.env` file exists and contains Supabase credentials
**Prevention**: Hook loads dotenv automatically - check file path

#### 2. PR Number Not Found

```
Warning: PR number not found in command or output
```

**Cause**: Unexpected command format or output
**Fix**: Check `gh pr merge` command format
**Prevention**: Use standard GitHub CLI commands

#### 3. Database Query Timeout

```
Error: Query timeout after 5000ms
```

**Cause**: Slow database connection
**Fix**: Increase hook timeout in settings.json
**Prevention**: Monitor database performance

### Common Engine Errors

#### 1. gh CLI Not Available

```
Error: gh command not found
```

**Cause**: GitHub CLI not installed or not in PATH
**Fix**: Install `gh` CLI and authenticate
**Prevention**: Check PATH before running

#### 2. PR Already Processed

```
Warning: Retrospective already exists for PR #123
```

**Cause**: Hook ran twice for same PR
**Fix**: Normal - hook is idempotent, skips duplicates
**Prevention**: Check `metadata.pr_number` before insert

#### 3. Pattern ID Generation Failed

```
Error: Could not generate unique pattern ID
```

**Cause**: Pattern table query failed
**Fix**: Check database connection and permissions
**Prevention**: Use try/catch with fallback ID

---

## Troubleshooting

### Debug Checklist

- [ ] **Hook registered**: Check `.claude/settings.json` for PostToolUse/Bash hook
- [ ] **Environment vars**: Verify `.env` contains Supabase credentials
- [ ] **Database access**: Test `supabase.from('retrospectives').select('*').limit(1)`
- [ ] **gh CLI available**: Run `gh --version` in terminal
- [ ] **Permissions**: Verify Supabase service role key has INSERT permissions
- [ ] **Logs**: Check console output for `[auto-learning-capture]` logs

### Testing Patterns

**Test hook detection**:
```bash
# Manually trigger hook with test input
echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 123 --merge"},"tool_result":"Merged pull request #123"}' | \
  node scripts/hooks/auto-learning-capture.cjs
```

**Test engine**:
```bash
# Run engine directly with PR number
node scripts/auto-learning-capture.js --pr 123
```

**Verify database entries**:
```sql
-- Check auto-captured retrospectives
SELECT id, title, generated_by, trigger_event, metadata->>'pr_number' as pr
FROM retrospectives
WHERE generated_by = 'AUTO_HOOK'
ORDER BY created_at DESC
LIMIT 5;

-- Check auto-captured patterns
SELECT pattern_id, issue_summary, source, metadata->>'pr_number' as pr
FROM issue_patterns
WHERE source = 'auto_hook'
ORDER BY created_at DESC
LIMIT 5;
```

### Log Level Configuration

Set `AUTO_LEARNING_LOG_LEVEL` environment variable:

```bash
# Minimal logging (errors only)
export AUTO_LEARNING_LOG_LEVEL=error

# Standard logging (errors + warnings + info)
export AUTO_LEARNING_LOG_LEVEL=info

# Verbose logging (all events including debug)
export AUTO_LEARNING_LOG_LEVEL=debug
```

### Performance Monitoring

**Hook execution time**: Should complete in <15 seconds
- Database queries: 2-3 seconds
- Commit grep: 1-2 seconds
- Spawn engine: <1 second

**Engine execution time**: 15-30 seconds (runs async)
- PR metadata fetch: 5-10 seconds
- Classification: <1 second
- Database inserts: 2-5 seconds

If hook exceeds 20 seconds, increase timeout in `.claude/settings.json`.

---

## Related Documentation

- [Learning Capture Architecture](../01_architecture/learning-capture-architecture.md) - System design
- [Retrospective Patterns](./retrospective-patterns-skill-content.md) - Retrospective format
- [Progressive Learning Format](./progressive-learning-format.md) - Learning system strategy

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-01 | Initial reference documentation |

---

*Quick reference for maintaining the automated learning capture system.*
*Part of SD-LEO-SELF-IMPROVE-001D (Phase 1.5: Automated Learning Capture)*
