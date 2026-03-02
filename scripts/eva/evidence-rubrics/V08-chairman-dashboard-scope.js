/** V08: chairman_dashboard_scope — EHG App limited to Chairman governance; no per-stage GUI data entry. */
export default {
  id: 'V08', name: 'chairman_dashboard_scope',
  checks: [
    { id: 'V08-C1', label: 'Scope validation enforcer exports validateScope',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/scope-validation-enforcer.js', exportName: 'validateScope' } },
    { id: 'V08-C2', label: 'Never-autonomous registry exports checkAutonomousAllowed',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/never-autonomous-registry.js', exportName: 'checkAutonomousAllowed' } },
    { id: 'V08-C3', label: 'V08 scope auth scorer produces deterministic score',
      type: 'file_exists', weight: 20,
      params: { glob: 'scripts/eva/v08-scope-auth-scorer.js' } },
    { id: 'V08-C4', label: 'Never-autonomous registry exports enforceAutonomousCheck',
      type: 'export_exists', weight: 30,
      params: { module: 'lib/eva/never-autonomous-registry.js', exportName: 'enforceAutonomousCheck' } },
  ],
};
