const db = require('/mnt/c/_EHG/EHG_Engineer/lib/supabase-connection.js');

async function createSD() {
  const client = await db.createDatabaseClient('engineer', {verify: true});

  const sd = {
    id: 'SD-A11Y-FEATURE-BRANCH-001',
    sd_key: 'SD-A11Y-FEATURE-BRANCH-001',
    title: 'Feature Branch Accessibility Cleanup',
    category: 'bug_fix',
    status: 'pending_approval',
    current_phase: 'LEAD',
    priority: 'high',
    description: `Fix 135 jsx-a11y linting errors accumulated on feat/SD-VWC-INTUITIVE-FLOW-001 branch, blocking CI/CD pipeline for multiple SDs.

**Root Cause:** Multiple SDs (SD-RECONNECT-011, SD-VIF-REFINE-001, SD-AGENT-ADMIN-002, SD-PHASE4-001) introduced accessibility violations on shared feature branch without fixing them.

**Impact:** Blocks merge of SD-VWC-INTUITIVE-FLOW-001 Checkpoint 3 despite CP3 work being fully compliant.

**Affected Components:** 15+ files including AnalyticsDashboard, AudioPlayer, chairman components, AIDocVisualizer, security cards, etc.`,

    rationale: `Multiple SDs added work to feat/SD-VWC-INTUITIVE-FLOW-001 branch without fixing accessibility violations, accumulating 135 jsx-a11y errors. This blocks CI/CD pipeline for all work on the branch, including completed and compliant Checkpoint 3 deliverables. A dedicated SD is needed to systematically address these violations (6-8 hours estimated) rather than expanding CP3 scope by 10x.`,

    scope: `**IN SCOPE:**
- Fix 1 critical parsing error in AnalyticsDashboard.tsx
- Fix 50+ jsx-a11y keyboard accessibility violations
- Fix 40+ jsx-a11y form label violations
- Fix 5 jsx-a11y media caption violations
- Fix 40+ jsx-a11y interactive element violations
- Verify 0 jsx-a11y errors after fixes
- Run full unit test suite (no regressions)

**OUT OF SCOPE:**
- TypeScript 'any' type warnings
- React hooks exhaustive-deps warnings
- Code refactoring beyond accessibility fixes`,

    sequence_rank: 1000,
    target_application: 'EHG',
    created_by: 'PLAN-AGENT'
  };

  const query = `
    INSERT INTO strategic_directives_v2 (
      id, sd_key, title, category, status, current_phase, priority, description,
      rationale, scope, sequence_rank, target_application, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, created_at;
  `;

  const result = await client.query(query, [
    sd.id, sd.sd_key, sd.title, sd.category, sd.status, sd.current_phase, sd.priority,
    sd.description, sd.rationale, sd.scope, sd.sequence_rank, sd.target_application, sd.created_by
  ]);

  await client.end();

  console.log('\n✅ New SD Created for A11Y Cleanup');
  console.log(`   ID: ${result.rows[0].id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Priority: ${sd.priority}`);
  console.log(`   Status: ${sd.status}`);
  console.log(`   Estimated: 6-8 hours`);
  console.log(`   Errors to fix: 135 jsx-a11y violations`);
}

createSD().catch(console.error);
