const fs = require('fs');
const p = 'scripts/section-file-mapping.json';
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
m['CLAUDE_EXEC_MANUAL.md'].sections = m['CLAUDE_EXEC_MANUAL.md'].sections.filter((s) => s !== 'auto_merge_workflow');
delete m['CLAUDE_EXEC_MANUAL.md']._move_justification.auto_merge_workflow;
if (!m['CLAUDE_EXEC.md'].sections.includes('auto_merge_workflow')) {
  const i = m['CLAUDE_EXEC.md'].sections.indexOf('exec_completion_merge_requirement');
  m['CLAUDE_EXEC.md'].sections.splice(i + 1, 0, 'auto_merge_workflow');
}
m['CLAUDE_EXEC_MANUAL.md']._allow_list_note += ' auto_merge_workflow STAYS in CLAUDE_EXEC.md: tests/unit/lint/gh-merge-guard-lint.test.js pins its id=306 --auto command text and gh-merge-guard-exempt pragma inside CLAUDE_EXEC.md (SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001 FR-3), and it is the sanctioned merge path rather than pure reference.';
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
console.log('EXEC has auto_merge_workflow:', m['CLAUDE_EXEC.md'].sections.includes('auto_merge_workflow'), '| MANUAL count', m['CLAUDE_EXEC_MANUAL.md'].sections.length);
