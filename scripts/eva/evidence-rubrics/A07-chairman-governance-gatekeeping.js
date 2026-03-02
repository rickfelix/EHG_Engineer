/** A07: chairman_governance_gatekeeping — Chairman-only governance via dashboard decision queue; no timeouts. */
export default {
  id: 'A07', name: 'chairman_governance_gatekeeping',
  checks: [
    { id: 'A07-C1', label: 'Chairman decision watcher polls for pending decisions',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/chairman-decision-watcher.js', pattern: 'pending|poll|watch|queue' } },
    { id: 'A07-C2', label: 'No timeout enforcement on chairman decisions',
      type: 'anti_pattern', weight: 25,
      params: { glob: 'lib/eva/chairman-decision-watcher.js', pattern: 'setTimeout.*reject|deadline.*expire|autoApprove.*timeout', maxMatches: 0 } },
    { id: 'A07-C3', label: 'Chairman override tracker provides absolute authority',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/stage-zero/chairman-override-tracker.js', pattern: 'override|authority|veto' } },
    { id: 'A07-C4', label: 'Chairman governance panels module exists',
      type: 'file_exists', weight: 15,
      params: { glob: 'lib/eva/chairman-governance-panels.js' } },
    { id: 'A07-C5', label: 'Chairman decisions recorded in database',
      type: 'db_row_exists', weight: 10,
      params: { table: 'chairman_decisions' } },
  ],
};
