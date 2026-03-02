/** V08: chairman_dashboard_scope — EHG App limited to Chairman governance; no per-stage GUI data entry. */
export default {
  id: 'V08', name: 'chairman_dashboard_scope',
  checks: [
    { id: 'V08-C1', label: 'Scope validation enforcer module exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/scope-validation-enforcer.js' } },
    { id: 'V08-C2', label: 'Never-autonomous registry blocks unauthorized operations',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/never-autonomous-registry.js' } },
    { id: 'V08-C3', label: 'V08 scope auth scorer produces deterministic score',
      type: 'file_exists', weight: 25,
      params: { glob: 'scripts/eva/v08-scope-auth-scorer.js' } },
    { id: 'V08-C4', label: 'Scope validation has blocking enforcement mode',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/scope-validation-enforcer.js', pattern: 'blocking|enforce|deny' } },
  ],
};
