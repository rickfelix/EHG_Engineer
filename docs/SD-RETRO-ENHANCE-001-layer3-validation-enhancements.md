# Layer 3 Validation Enhancements
## SD-RETRO-ENHANCE-001 Checkpoint 3: US-006

**Purpose**: Application-level validation for retrospective quality enforcement

**File**: `scripts/generate-comprehensive-retrospective.js`

**Status**: Enhancement specification (to be implemented)

---

## Required Enhancements

### 1. Enhanced `validateRetrospective()` Function

Add validation for new Checkpoint 1 fields:

```javascript
/**
 * Enhanced validation for SD-RETRO-ENHANCE-001
 * Layer 3: Application-level validation before database insert
 *
 * Validates:
 * - All Checkpoint 1 fields (target_application, learning_category, code traceability)
 * - Quality score requirements
 * - Required fields for PUBLISHED status
 * - Business rules (APPLICATION_ISSUE → affected_components, CRITICAL/HIGH → tags)
 */
function validateRetrospective(retrospective) {
  const errors = [];
  const warnings = [];

  // ========================================================================
  // Existing Validations (keep all current checks)
  // ========================================================================

  // [All existing validation code lines 186-218 remains unchanged]

  // ========================================================================
  // NEW: Checkpoint 1 Field Validations
  // ========================================================================

  // Validate target_application (required, must be valid value)
  if (!retrospective.target_application) {
    errors.push('target_application is required');
  } else if (!['EHG_engineer', 'EHG'].includes(retrospective.target_application) &&
             !retrospective.target_application.startsWith('venture_')) {
    errors.push(`target_application must be 'EHG_engineer', 'EHG', or 'venture_*' (got: ${retrospective.target_application})`);
  }

  // Validate learning_category (required, must be valid category)
  const validCategories = [
    'APPLICATION_ISSUE',
    'PROCESS_IMPROVEMENT',
    'TESTING_STRATEGY',
    'DATABASE_SCHEMA',
    'DEPLOYMENT_ISSUE',
    'PERFORMANCE_OPTIMIZATION',
    'USER_EXPERIENCE',
    'SECURITY_VULNERABILITY',
    'DOCUMENTATION'
  ];

  if (!retrospective.learning_category) {
    errors.push('learning_category is required');
  } else if (!validCategories.includes(retrospective.learning_category)) {
    errors.push(`learning_category must be one of: ${validCategories.join(', ')}`);
  }

  // Validate applies_to_all_apps consistency with learning_category
  if (retrospective.learning_category === 'PROCESS_IMPROVEMENT' &&
      retrospective.applies_to_all_apps !== true) {
    warnings.push('PROCESS_IMPROVEMENT category should have applies_to_all_apps = true (will be auto-corrected by trigger)');
  }

  // Validate code traceability arrays (must be arrays, even if empty)
  const arrayFields = ['related_files', 'related_commits', 'related_prs', 'affected_components', 'tags'];

  for (const field of arrayFields) {
    if (retrospective[field] !== undefined && !Array.isArray(retrospective[field])) {
      errors.push(`${field} must be an array (got: ${typeof retrospective[field]})`);
    }
  }

  // Business Rule: APPLICATION_ISSUE must have affected_components
  if (retrospective.learning_category === 'APPLICATION_ISSUE') {
    if (!retrospective.affected_components || retrospective.affected_components.length === 0) {
      errors.push('APPLICATION_ISSUE retrospectives must have at least one affected_component');
    }
  }

  // Business Rule: CRITICAL/HIGH severity must have tags
  if (retrospective.severity_level && ['CRITICAL', 'HIGH'].includes(retrospective.severity_level)) {
    if (!retrospective.tags || retrospective.tags.length === 0) {
      errors.push('CRITICAL and HIGH severity retrospectives must have at least one tag');
    }
  }

  // Validate related_files format (basic extension check)
  if (retrospective.related_files && retrospective.related_files.length > 0) {
    const invalidFiles = retrospective.related_files.filter(file =>
      !file.match(/\.(js|ts|jsx|tsx|json|sql|md|yml|yaml|css|html|py|sh)$/)
    );

    if (invalidFiles.length > 0) {
      warnings.push(`Potentially invalid file paths (no valid extension): ${invalidFiles.join(', ')}`);
    }
  }

  // Validate related_commits format (basic SHA pattern check)
  if (retrospective.related_commits && retrospective.related_commits.length > 0) {
    const invalidCommits = retrospective.related_commits.filter(commit =>
      !commit.match(/^[0-9a-f]{7,40}$/)
    );

    if (invalidCommits.length > 0) {
      warnings.push(`Potentially invalid commit SHAs: ${invalidCommits.join(', ')}`);
    }
  }

  // ========================================================================
  // NEW: PUBLISHED Status Requirements
  // ========================================================================

  if (retrospective.status === 'PUBLISHED') {
    // PUBLISHED must have embeddings (enforced by database constraint too)
    if (!retrospective.content_embedding) {
      errors.push('PUBLISHED retrospectives must have content_embedding (run generate-retrospective-embeddings.js first)');
    }

    // PUBLISHED must have quality_score >= 70
    if (!retrospective.quality_score || retrospective.quality_score < 70) {
      errors.push(`PUBLISHED retrospectives must have quality_score >= 70 (current: ${retrospective.quality_score || 0})`);
    }

    // PUBLISHED must have non-empty key_learnings
    if (!retrospective.key_learnings ||
        (typeof retrospective.key_learnings === 'string' && retrospective.key_learnings.trim().length === 0) ||
        (Array.isArray(retrospective.key_learnings) && retrospective.key_learnings.length === 0)) {
      errors.push('PUBLISHED retrospectives must have non-empty key_learnings');
    }

    // PUBLISHED must have non-empty action_items
    if (!retrospective.action_items ||
        (typeof retrospective.action_items === 'string' && retrospective.action_items.trim().length === 0) ||
        (Array.isArray(retrospective.action_items) && retrospective.action_items.length === 0)) {
      errors.push('PUBLISHED retrospectives must have non-empty action_items');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

### 2. Enhanced Retrospective Object Population

Add field population logic after line 352:

```javascript
  const retrospective = {
    // ... existing fields (lines 316-351) ...
    performance_impact: handoffInsights.patterns.find(p => p.includes('ms')) || 'Standard',

    // ========================================================================
    // NEW: Checkpoint 1 Fields (SD-RETRO-ENHANCE-001)
    // ========================================================================

    // Target application (inferred from SD context)
    target_application: 'EHG_engineer',  // Default for LEO Protocol retrospectives

    // Learning category (inferred from SD characteristics)
    learning_category: inferLearningCategory(sd, handoffInsights),

    // Auto-populated by trigger, but set explicitly for clarity
    applies_to_all_apps: false,  // Will be set to true by trigger if PROCESS_IMPROVEMENT

    // Code traceability (extract from handoff documents)
    related_files: extractRelatedFiles(handoffInsights),
    related_commits: extractRelatedCommits(handoffInsights),
    related_prs: extractRelatedPRs(sd),
    affected_components: extractAffectedComponents(handoffInsights, sd),
    tags: generateTags(sd, handoffInsights),

    // Embedding (initially null, populated by generate-retrospective-embeddings.js)
    content_embedding: null
  };
```

### 3. Helper Functions for Field Extraction

Add these functions before `generateComprehensiveRetrospective()`:

```javascript
/**
 * Infer learning category from SD characteristics
 */
function inferLearningCategory(sd, insights) {
  const title = sd.title.toLowerCase();
  const description = (sd.description || '').toLowerCase();
  const challenges = insights.challenges.join(' ').toLowerCase();

  // Pattern matching for category inference
  if (title.includes('process') || title.includes('workflow') || description.includes('automation')) {
    return 'PROCESS_IMPROVEMENT';
  }
  if (title.includes('test') || title.includes('qa') || challenges.includes('test')) {
    return 'TESTING_STRATEGY';
  }
  if (title.includes('database') || title.includes('schema') || title.includes('migration')) {
    return 'DATABASE_SCHEMA';
  }
  if (title.includes('deploy') || title.includes('ci/cd') || title.includes('pipeline')) {
    return 'DEPLOYMENT_ISSUE';
  }
  if (title.includes('performance') || title.includes('optimization') || challenges.includes('slow')) {
    return 'PERFORMANCE_OPTIMIZATION';
  }
  if (title.includes('security') || title.includes('auth') || challenges.includes('vulnerability')) {
    return 'SECURITY_VULNERABILITY';
  }
  if (title.includes('doc') || title.includes('documentation')) {
    return 'DOCUMENTATION';
  }
  if (title.includes('ui') || title.includes('ux') || title.includes('user')) {
    return 'USER_EXPERIENCE';
  }

  // Default to APPLICATION_ISSUE
  return 'APPLICATION_ISSUE';
}

/**
 * Extract related files from handoff insights
 */
function extractRelatedFiles(insights) {
  const files = new Set();
  const filePattern = /\b[\w\-./]+\.(js|ts|jsx|tsx|json|sql|md|yml|yaml|css|html|py|sh)\b/g;

  // Search all insight text for file paths
  const allText = [
    ...insights.achievements,
    ...insights.challenges,
    ...insights.learnings,
    ...insights.patterns
  ].join(' ');

  const matches = allText.match(filePattern);
  if (matches) {
    matches.forEach(file => files.add(file));
  }

  return Array.from(files).slice(0, 20);  // Limit to 20 files
}

/**
 * Extract related commits from handoff insights
 */
function extractRelatedCommits(insights) {
  const commits = new Set();
  const commitPattern = /\b[0-9a-f]{7,40}\b/g;

  const allText = [
    ...insights.patterns
  ].join(' ');

  const matches = allText.match(commitPattern);
  if (matches) {
    matches.forEach(commit => commits.add(commit));
  }

  return Array.from(commits).slice(0, 10);  // Limit to 10 commits
}

/**
 * Extract related PRs from SD
 */
function extractRelatedPRs(sd) {
  // Try to find PR references in SD description or title
  const text = `${sd.title} ${sd.description || ''}`;
  const prPattern = /#(\d+)|pull\/(\d+)/g;
  const prs = new Set();

  let match;
  while ((match = prPattern.exec(text)) !== null) {
    const prNum = match[1] || match[2];
    prs.add(`#${prNum}`);
  }

  return Array.from(prs);
}

/**
 * Extract affected components from insights
 */
function extractAffectedComponents(insights, sd) {
  const components = new Set();

  // Common component patterns
  const componentKeywords = [
    'Authentication', 'Database', 'API', 'UI', 'Frontend', 'Backend',
    'Dashboard', 'Settings', 'Profile', 'Navigation', 'Search',
    'Analytics', 'Reporting', 'Export', 'Import', 'Notifications'
  ];

  const allText = [
    sd.title,
    sd.description || '',
    ...insights.achievements,
    ...insights.challenges
  ].join(' ');

  componentKeywords.forEach(keyword => {
    if (allText.toLowerCase().includes(keyword.toLowerCase())) {
      components.add(keyword);
    }
  });

  return Array.from(components).slice(0, 10);  // Limit to 10 components
}

/**
 * Generate tags from SD and insights
 */
function generateTags(sd, insights) {
  const tags = new Set();

  // Severity-based tags
  if (sd.priority >= 90) {
    tags.add('critical');
  } else if (sd.priority >= 70) {
    tags.add('high-priority');
  }

  // Technology tags (from file paths)
  const files = extractRelatedFiles(insights);
  if (files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'))) {
    tags.add('react');
  }
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.js'))) {
    tags.add('typescript');
  }
  if (files.some(f => f.endsWith('.sql'))) {
    tags.add('database');
  }
  if (files.some(f => f.includes('test'))) {
    tags.add('testing');
  }

  // Pattern-based tags
  if (insights.patterns.some(p => p.toLowerCase().includes('performance'))) {
    tags.add('performance');
  }
  if (insights.challenges.some(c => c.toLowerCase().includes('error'))) {
    tags.add('bug-fix');
  }

  return Array.from(tags).slice(0, 10);  // Limit to 10 tags
}
```

---

## Implementation Steps

1. **Update `validateRetrospective()` function** (lines 182-224)
   - Add Checkpoint 1 field validations
   - Add business rule checks
   - Add PUBLISHED status requirements
   - Return both errors AND warnings

2. **Add helper functions** (before line 229)
   - `inferLearningCategory()`
   - `extractRelatedFiles()`
   - `extractRelatedCommits()`
   - `extractRelatedPRs()`
   - `extractAffectedComponents()`
   - `generateTags()`

3. **Update retrospective object** (lines 315-352)
   - Add new Checkpoint 1 fields using helper functions
   - Set content_embedding to null (populated later by embedding script)

4. **Update validation usage** (lines 355-366)
   - Display warnings in addition to errors
   - Log field values for debugging

5. **Test validation**
   - Test with APPLICATION_ISSUE without affected_components (should fail)
   - Test with CRITICAL severity without tags (should fail)
   - Test with invalid target_application (should fail)
   - Test with PUBLISHED status but quality_score < 70 (should fail)

---

## Testing Checklist

- [ ] Validation catches missing target_application
- [ ] Validation catches invalid learning_category
- [ ] Validation catches APPLICATION_ISSUE without affected_components
- [ ] Validation catches CRITICAL/HIGH without tags
- [ ] Validation catches PUBLISHED without embeddings
- [ ] Validation catches PUBLISHED with quality_score < 70
- [ ] Helper functions correctly extract files, commits, PRs
- [ ] Helper functions correctly infer learning_category
- [ ] Retrospective object includes all new fields
- [ ] Warnings are displayed but don't block insert

---

## Next Steps

After implementing Layer 3:
1. Test application-level validation with various scenarios
2. Implement Layer 4 (CI/CD workflow)
3. Integration test all 4 layers together
4. Update session summary with Layer 3 completion

---

**Status**: Specification complete, ready for implementation
**Estimated LOC**: ~300 lines (enhancements + helpers)
**Risk**: LOW - additive changes, no breaking modifications
