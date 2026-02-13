require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateStories() {
  // Story 1: Event Bus Subscriber Registration
  const story1AC = [
    {
      id: 'AC-1-1',
      scenario: 'Idempotent subscriber registration at startup',
      given: 'The EVA server has started with the event bus feature flag enabled',
      when: 'The startup registration module runs',
      then: 'Exactly one subscriber per event type (stage.completed, decision.submitted, gate.evaluated) is registered, verified by querying the internal subscriber registry count',
      is_boilerplate: false
    },
    {
      id: 'AC-1-2',
      scenario: 'Handler invocation within latency threshold',
      given: 'Subscribers are registered and a stage.completed event is published via OrchestratorTracer.emitEvent()',
      when: 'The event is received by the event bus',
      then: 'The corresponding stage.completed handler is invoked within 1 second, confirmed by checking the eva_event_ledger for a processing record with the matching eventId',
      is_boilerplate: false
    },
    {
      id: 'AC-1-3',
      scenario: 'Server restart does not duplicate subscribers',
      given: 'The EVA server has already registered subscribers for all 3 event types',
      when: 'The server restarts (simulating hot-reload in dev)',
      then: 'The subscriber count per event type remains exactly 1, not 2, confirming idempotent registration',
      is_boilerplate: false
    },
    {
      id: 'AC-1-4',
      scenario: 'Feature flag OFF prevents registration',
      given: 'The event bus feature flag is set to OFF',
      when: 'The server starts up',
      then: 'No subscribers are registered and publishing events results in zero handler invocations',
      is_boilerplate: false
    }
  ];

  const story1GWT = [
    {
      given: 'The EVA server has started with the event bus feature flag enabled',
      when: 'The startup registration module runs',
      then: 'Exactly one subscriber per event type (stage.completed, decision.submitted, gate.evaluated) is registered'
    },
    {
      given: 'Subscribers are registered and a stage.completed event is published',
      when: 'The event is received by the event bus',
      then: 'The corresponding handler is invoked within 1 second'
    },
    {
      given: 'The EVA server has already registered subscribers for all 3 event types',
      when: 'The server restarts',
      then: 'The subscriber count per event type remains exactly 1 (idempotent)'
    },
    {
      given: 'The event bus feature flag is set to OFF',
      when: 'The server starts up',
      then: 'No subscribers are registered and events result in zero handler invocations'
    }
  ];

  const { error: e1 } = await supabase
    .from('user_stories')
    .update({
      title: 'Register event bus subscribers for stage, decision, and gate events at startup',
      user_role: 'EVA system operator',
      user_want: 'event bus subscribers for stage.completed, decision.submitted, and gate.evaluated to be registered idempotently at application startup',
      user_benefit: 'emitted events are processed automatically without duplicate handling in hot-reload or multi-instance scenarios',
      acceptance_criteria: story1AC,
      given_when_then: story1GWT,
    })
    .eq('id', 'b7f8d244-42ee-4c19-aeb3-0d0a63d32e97');

  console.log('Story 1 updated:', e1 ? e1.message : 'OK');

  // Story 2: Domain service routing with idempotency
  const story2AC = [
    {
      id: 'AC-2-1',
      scenario: 'stage.completed triggers next-stage evaluation',
      given: 'A venture exists with a completed stage and a valid next stage defined',
      when: 'A stage.completed event with ventureId and stageId is published',
      then: 'The stage progression service is called exactly once with the correct ventureId and stageId, and the eva_event_ledger records status=success',
      is_boilerplate: false
    },
    {
      id: 'AC-2-2',
      scenario: 'decision.submitted triggers venture unblocking',
      given: 'A venture has a pending chairman decision with a known decisionId',
      when: 'A decision.submitted event with ventureId and decisionId is published',
      then: 'The venture unblocking service is called exactly once with the correct identifiers, and the handler logs the outcome (unblocked or no_change)',
      is_boilerplate: false
    },
    {
      id: 'AC-2-3',
      scenario: 'gate.evaluated routes proceed/block/kill correctly',
      given: 'Three gate.evaluated events are prepared with outcomes proceed, block, and kill respectively',
      when: 'Each event is published sequentially',
      then: 'Proceed invokes the progression service, block invokes the blocking service with reason string, and kill invokes the termination service with audit log entry',
      is_boilerplate: false
    },
    {
      id: 'AC-2-4',
      scenario: 'Duplicate event delivery is idempotent',
      given: 'A decision.submitted event with eventId=EVT-123 has already been processed successfully',
      when: 'The same event (identical eventId) is delivered a second time',
      then: 'The unblocking service is NOT called again, the handler logs duplicate_event, and the ledger still shows a single successful processing record',
      is_boilerplate: false
    }
  ];

  const story2GWT = [
    {
      given: 'A venture exists with a completed stage and a valid next stage defined',
      when: 'A stage.completed event with ventureId and stageId is published',
      then: 'The stage progression service is called exactly once with correct identifiers'
    },
    {
      given: 'A venture has a pending chairman decision with a known decisionId',
      when: 'A decision.submitted event with ventureId and decisionId is published',
      then: 'The venture unblocking service is called exactly once'
    },
    {
      given: 'Three gate.evaluated events are prepared with outcomes proceed, block, and kill',
      when: 'Each event is published sequentially',
      then: 'Proceed calls progression, block calls blocking with reason, kill calls termination with audit log'
    },
    {
      given: 'A decision.submitted event has already been processed successfully',
      when: 'The same event is delivered a second time',
      then: 'The service is NOT called again and the handler logs duplicate_event'
    }
  ];

  const { error: e2 } = await supabase
    .from('user_stories')
    .update({
      title: 'Route each event type to the correct domain service with idempotent processing',
      user_role: 'EVA pipeline orchestrator',
      user_want: 'each key event type (stage.completed, decision.submitted, gate.evaluated) to invoke the correct domain service action and persist expected state transitions',
      user_benefit: 'the event-driven architecture automates venture lifecycle management without duplicate side effects',
      acceptance_criteria: story2AC,
      given_when_then: story2GWT,
    })
    .eq('id', 'd7ed263e-c09c-4166-a61b-5788aae74617');

  console.log('Story 2 updated:', e2 ? e2.message : 'OK');

  // Story 3: Retry, DLQ, and observability
  const story3AC = [
    {
      id: 'AC-3-1',
      scenario: 'Transient failure retries with exponential backoff',
      given: 'The stage progression service is temporarily unavailable (mocked to fail twice then succeed)',
      when: 'A stage.completed event is published',
      then: 'The handler retries up to 3 times with exponential backoff (base 250ms, multiplier 2), succeeds on third attempt, ledger records attempts=3 status=success',
      is_boilerplate: false
    },
    {
      id: 'AC-3-2',
      scenario: 'Non-retryable errors route directly to DLQ',
      given: 'A stage.completed event is published with a missing required ventureId field',
      when: 'The handler validates the payload',
      then: 'The event is immediately routed to the DLQ table without retries, with reason=validation_error and attemptCount=1',
      is_boilerplate: false
    },
    {
      id: 'AC-3-3',
      scenario: 'Exhausted retries land in DLQ with full context',
      given: 'The stage progression service fails with a transient error on all 3 retry attempts',
      when: 'All retry attempts are exhausted',
      then: 'A DLQ entry is created with: eventId, eventType, payload, errorMessage, attemptCount=3, firstSeenAt, lastAttemptAt, status=dead',
      is_boilerplate: false
    },
    {
      id: 'AC-3-4',
      scenario: 'DLQ replay reprocesses events after fix',
      given: 'An event exists in the DLQ due to transient downstream failure and the downstream is now healthy',
      when: 'An admin triggers replay for the DLQ entry',
      then: 'The event is reprocessed, domain service invoked, DLQ record status changes to replayed, ledger records successful processing',
      is_boilerplate: false
    }
  ];

  const story3GWT = [
    {
      given: 'The stage progression service is temporarily unavailable (fails twice then succeeds)',
      when: 'A stage.completed event is published',
      then: 'The handler retries with exponential backoff and succeeds on the third attempt'
    },
    {
      given: 'An event is published with missing required ventureId field',
      when: 'The handler validates the payload',
      then: 'The event is routed to DLQ without retries, reason=validation_error'
    },
    {
      given: 'A transient error persists through all 3 retry attempts',
      when: 'All retries are exhausted',
      then: 'A DLQ entry is created with eventId, eventType, payload, errorMessage, attemptCount=3, status=dead'
    },
    {
      given: 'A DLQ event exists and the downstream service is now healthy',
      when: 'An admin triggers replay',
      then: 'The event is reprocessed successfully and the DLQ record status becomes replayed'
    }
  ];

  const { error: e3 } = await supabase
    .from('user_stories')
    .update({
      title: 'Retry transient failures with exponential backoff and capture permanent failures in DLQ with replay',
      user_role: 'EVA system operator',
      user_want: 'transient handler failures to be retried automatically (max 3 attempts with exponential backoff) and permanent failures captured in a dead-letter queue with replay capability',
      user_benefit: 'event processing is resilient and failed events can be investigated and reprocessed without data loss',
      acceptance_criteria: story3AC,
      given_when_then: story3GWT,
    })
    .eq('id', '3f3ed11e-1b1b-4f14-bcad-10baf5c74a58');

  console.log('Story 3 updated:', e3 ? e3.message : 'OK');
}

updateStories();
