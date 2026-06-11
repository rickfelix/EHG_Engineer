/** A01: stateless_shared_services — Domain services are stateless, reusable workers loading context on demand. */
export default {
  id: 'A01', name: 'stateless_shared_services',
  checks: [
    { id: 'A01-C1', label: 'VentureContextManager exports createVentureContextManager',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/venture-context-manager.js', exportName: 'createVentureContextManager' } },
    { id: 'A01-C2', label: 'No singleton pattern in domain services',
      type: 'anti_pattern', weight: 30,
      params: { glob: 'lib/eva/services/**/*.js', pattern: '_singleton|getInstance|let\\s+instance', maxMatches: 0 } },
    { id: 'A01-C3', label: 'Service index re-exports multiple service modules',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/services/index.js', pattern: 'export.*from|import.*Service' } },
    { id: 'A01-C4', label: 'Stage templates are stateless functions (no class state)',
      type: 'anti_pattern', weight: 20,
      params: { glob: 'lib/eva/stage-templates/stage-*.js', pattern: 'this\\.|new\\s+Stage|class\\s+Stage', maxMatches: 2 } },
  ],
};
