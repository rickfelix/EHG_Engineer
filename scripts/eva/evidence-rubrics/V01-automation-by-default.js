/** V01: automation_by_default — Stages execute autonomously; human intervention is the exception. */
export default {
  id: 'V01', name: 'automation_by_default',
  checks: [
    { id: 'V01-C1', label: 'AUTO-PROCEED state management module exists',
      type: 'file_count', weight: 25,
      params: { glob: 'scripts/modules/auto-proceed/*.js', minCount: 2 } },
    { id: 'V01-C2', label: 'Stage execution engine runs stages without manual confirmation',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/stage-execution-engine.js', pattern: 'executeStage|runStage' } },
    { id: 'V01-C3', label: 'Stage templates have deterministic execute functions',
      type: 'file_count', weight: 25,
      params: { glob: 'lib/eva/stage-templates/stage-*.js', minCount: 20 } },
    { id: 'V01-C4', label: 'Auto-proceed state persisted to file or DB',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/modules/auto-proceed/*.js', pattern: 'writeFileSync|supabase|persist' } },
  ],
};
