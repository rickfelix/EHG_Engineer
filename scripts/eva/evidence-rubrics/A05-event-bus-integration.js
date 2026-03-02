/** A05: event_bus_integration — Services emit standardized events to EVA event bus after DB writes. */
export default {
  id: 'A05', name: 'event_bus_integration',
  checks: [
    { id: 'A05-C1', label: 'Event bus with handler registry exists',
      type: 'file_exists', weight: 20,
      params: { glob: 'lib/eva/event-bus/handler-registry.js' } },
    { id: 'A05-C2', label: 'Event router dispatches events to handlers',
      type: 'file_exists', weight: 20,
      params: { glob: 'lib/eva/event-bus/event-router.js' } },
    { id: 'A05-C3', label: 'Multiple event handler implementations exist',
      type: 'file_count', weight: 30,
      params: { glob: 'lib/eva/event-bus/handlers/*.js', minCount: 10 } },
    { id: 'A05-C4', label: 'Event handlers cover lifecycle events (stage-completed, gate-evaluated)',
      type: 'code_pattern', weight: 30,
      params: { glob: 'lib/eva/event-bus/handlers/*.js', pattern: 'stage.completed|gate.evaluated|decision.submitted|venture.created', minMatches: 3 } },
  ],
};
