import axios from 'axios';
import { EventEmitter } from 'events';
import pRetry from 'p-retry';

class StorySubAgent extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      enabled: process.env.FEATURE_STORY_AGENT === 'true',
      apiUrl: process.env.GOVERNANCE_API_URL || 'http://localhost:3000',
      retryMax: parseInt(process.env.STORY_AGENT_RETRY_MAX) || 3,
      timeoutMs: parseInt(process.env.STORY_AGENT_TIMEOUT_MS) || 5000,
      ...config
    };

    this.processedEvents = new Set(); // Idempotency tracking
  }

  async initialize() {
    if (!this.config.enabled) {
      console.log('STORY sub-agent disabled by feature flag');
      return;
    }

    // Subscribe to events
    this.on('story.create', this.handleStoryCreate.bind(this));
    this.on('story.verify', this.handleStoryVerify.bind(this));

    console.log('STORY sub-agent initialized');
  }

  async handleStoryCreate(event) {
    const eventId = event.id || `${event.sd_key}-${event.timestamp}`;

    // Idempotency check
    if (this.processedEvents.has(eventId)) {
      console.log(`Event ${eventId} already processed, skipping`);
      return;
    }

    try {
      const result = await pRetry(
        async () => {
          const response = await axios.post(
            `${this.config.apiUrl}/api/stories/generate`,
            {
              sd_key: event.payload.sd_key,
              prd_id: event.payload.prd_id,
              mode: event.payload.mode || 'create'
            },
            {
              timeout: this.config.timeoutMs,
              headers: {
                'X-Event-ID': eventId,
                'X-Correlation-ID': event.correlationId
              }
            }
          );
          return response.data;
        },
        {
          retries: this.config.retryMax,
          onFailedAttempt: error => {
            console.log(`Retry ${error.attemptNumber} failed: ${error.message}`);
          }
        }
      );

      this.processedEvents.add(eventId);

      // Emit success event
      this.emit('story.created', {
        ...event,
        result,
        timestamp: new Date().toISOString()
      });

      console.log(`Stories generated for ${event.payload.sd_key}:`, result);
    } catch (error) {
      console.error('Failed to generate stories:', error);

      // Send to DLQ if available
      this.emit('story.create.failed', {
        event,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleStoryVerify(event) {
    const eventId = event.id || `verify-${event.story_key}-${event.timestamp}`;

    if (this.processedEvents.has(eventId)) {
      console.log(`Event ${eventId} already processed, skipping`);
      return;
    }

    try {
      const result = await pRetry(
        async () => {
          const response = await axios.post(
            `${this.config.apiUrl}/api/stories/verify`,
            event.payload,
            {
              timeout: this.config.timeoutMs,
              headers: {
                'X-Event-ID': eventId,
                'X-Source': 'ci-system'
              }
            }
          );
          return response.data;
        },
        {
          retries: this.config.retryMax
        }
      );

      this.processedEvents.add(eventId);

      // Check if all stories for SD are complete
      await this.checkReleaseGate(event.payload.story_keys[0].split(':')[0]);

      console.log('Stories verified:', result);
    } catch (error) {
      console.error('Failed to verify stories:', error);

      this.emit('story.verify.failed', {
        event,
        error: error.message
      });
    }
  }

  async checkReleaseGate(sdKey) {
    try {
      const response = await axios.get(
        `${this.config.apiUrl}/api/stories/gate/${sdKey}`
      );

      const gate = response.data;

      // Publish gate status
      this.emit('gate.story.release', {
        sd_key: sdKey,
        ready: gate.ready,
        total_stories: gate.total_stories,
        passing: gate.passing_count,
        failing: gate.failing_count,
        not_run: gate.not_run_count,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to check release gate:', error);
    }
  }

  // Cleanup for graceful shutdown
  async shutdown() {
    this.removeAllListeners();
    this.processedEvents.clear();
    console.log('STORY sub-agent shut down');
  }
}

export default StorySubAgent;