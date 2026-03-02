/** A04: event_rounds_priority_queue_work_routing — Tri-modal work routing: Events, Rounds, Priority Queue. */
export default {
  id: 'A04', name: 'event_rounds_priority_queue_work_routing',
  checks: [
    { id: 'A04-C1', label: 'Rounds scheduler exists for routine work',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/rounds-scheduler.js' } },
    { id: 'A04-C2', label: 'Event bus handles urgent events',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/event-bus/index.js' } },
    { id: 'A04-C3', label: 'Priority queue or urgency scorer for planned work',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/modules/auto-proceed/urgency-scorer.js', pattern: 'urgency|priority|score' } },
    { id: 'A04-C4', label: 'Run-rounds CLI executes registered rounds',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/eva/run-rounds.js', pattern: 'round|execute|run' } },
  ],
};
