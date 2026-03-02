/** A04: event_rounds_priority_queue_work_routing — Tri-modal work routing: Events, Rounds, Priority Queue. */
export default {
  id: 'A04', name: 'event_rounds_priority_queue_work_routing',
  checks: [
    { id: 'A04-C1', label: 'Rounds scheduler exports registerRound',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/rounds-scheduler.js', exportName: 'registerRound' } },
    { id: 'A04-C2', label: 'Event bus exports initializeEventBus',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/event-bus/index.js', exportName: 'initializeEventBus' } },
    { id: 'A04-C3', label: 'Urgency scorer exports calculateUrgencyScore for prioritization',
      type: 'export_exists', weight: 25,
      params: { module: 'scripts/modules/auto-proceed/urgency-scorer.js', exportName: 'calculateUrgencyScore' } },
    { id: 'A04-C4', label: 'Run-rounds CLI executes registered rounds',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/eva/run-rounds.js', pattern: 'listRounds|runRound|rounds-scheduler' } },
  ],
};
