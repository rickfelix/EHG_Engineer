#!/usr/bin/env node

/**
 * Context7 Circuit Breaker
 * SD-KNOWLEDGE-001: US-004 Circuit Breaker Resilience
 *
 * State machine for Context7 MCP service health monitoring:
 * - CLOSED: Service healthy, requests allowed
 * - OPEN: Service failing, requests blocked
 * - HALF_OPEN: Recovery test, single request allowed
 *
 * Thresholds:
 * - Opens after 3 consecutive failures
 * - Recovers after 1 hour
 * - Resets failure count on success
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const FAILURE_THRESHOLD = 3;
const RECOVERY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

class CircuitBreaker {
  constructor(serviceName = 'context7') {
    this.serviceName = serviceName;
  }

  /**
   * Get current circuit breaker state
   */
  async getState() {
    const { data, error } = await supabase
      .from('system_health')
      .select('*')
      .eq('service_name', this.serviceName)
      .single();

    if (error) {
      console.error('❌ Failed to get circuit state:', error.message);
      // Default to OPEN on error (fail-safe)
      return { circuit_breaker_state: 'open', failure_count: FAILURE_THRESHOLD };
    }

    return data;
  }

  /**
   * Check if circuit allows requests
   */
  async allowRequest() {
    const state = await this.getState();

    if (state.circuit_breaker_state === 'closed') {
      return true; // Service healthy
    }

    if (state.circuit_breaker_state === 'open') {
      // Check if recovery window has passed
      const lastFailure = new Date(state.last_failure_at);
      const now = new Date();
      const timeSinceFailure = now - lastFailure;

      if (timeSinceFailure >= RECOVERY_WINDOW_MS) {
        // Transition to HALF_OPEN for recovery test
        await this.transitionTo('half-open');
        console.log('🔄 Circuit OPEN → HALF_OPEN (recovery test)');
        return true; // Allow single test request
      }

      return false; // Still in failure state
    }

    if (state.circuit_breaker_state === 'half-open') {
      return true; // Allow single test request
    }

    return false;
  }

  /**
   * Record successful request
   */
  async recordSuccess() {
    const state = await this.getState();

    if (state.circuit_breaker_state === 'half-open') {
      // Recovery test succeeded, close circuit
      await this.transitionTo('closed');
      console.log('✅ Circuit HALF_OPEN → CLOSED (recovery successful)');
    }

    // Reset failure count
    const { error } = await supabase
      .from('system_health')
      .update({
        failure_count: 0,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('service_name', this.serviceName);

    if (error) {
      console.error('❌ Failed to record success:', error.message);
    }
  }

  /**
   * Record failed request
   */
  async recordFailure() {
    const state = await this.getState();
    const newFailureCount = state.failure_count + 1;

    if (state.circuit_breaker_state === 'half-open') {
      // Recovery test failed, reopen circuit
      await this.transitionTo('open');
      console.log('❌ Circuit HALF_OPEN → OPEN (recovery failed)');
    } else if (newFailureCount >= FAILURE_THRESHOLD && state.circuit_breaker_state === 'closed') {
      // Threshold exceeded, open circuit
      await this.transitionTo('open');
      console.log(`❌ Circuit CLOSED → OPEN (${newFailureCount} failures)`);
    }

    // Increment failure count
    const { error } = await supabase
      .from('system_health')
      .update({
        failure_count: newFailureCount,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('service_name', this.serviceName);

    if (error) {
      console.error('❌ Failed to record failure:', error.message);
    }
  }

  /**
   * Transition circuit to new state
   */
  async transitionTo(newState) {
    const { error } = await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: newState,
        updated_at: new Date().toISOString()
      })
      .eq('service_name', this.serviceName);

    if (error) {
      console.error(`❌ Failed to transition to ${newState}:`, error.message);
    }
  }

  /**
   * Get circuit state for logging/monitoring
   */
  async getStateForLogging() {
    const state = await this.getState();
    return state.circuit_breaker_state;
  }
}

export default CircuitBreaker;

// CLI for testing
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const command = process.argv[2];
  const breaker = new CircuitBreaker();

  if (command === 'status') {
    const state = await breaker.getState();
    console.log('🔍 Circuit Breaker Status');
    console.log('========================');
    console.log(`State: ${state.circuit_breaker_state}`);
    console.log(`Failures: ${state.failure_count}/${FAILURE_THRESHOLD}`);
    console.log(`Last Failure: ${state.last_failure_at || 'N/A'}`);
    console.log(`Last Success: ${state.last_success_at || 'N/A'}`);
  } else if (command === 'allow') {
    const allowed = await breaker.allowRequest();
    console.log(allowed ? '✅ Request allowed' : '❌ Request blocked');
  } else if (command === 'success') {
    await breaker.recordSuccess();
    console.log('✅ Success recorded');
  } else if (command === 'failure') {
    await breaker.recordFailure();
    console.log('❌ Failure recorded');
  } else if (command === 'reset') {
    await breaker.transitionTo('closed');
    await breaker.recordSuccess();
    console.log('🔄 Circuit breaker reset to CLOSED');
  } else {
    console.log('Context7 Circuit Breaker');
    console.log('========================');
    console.log('Commands:');
    console.log('  status   - Show current state');
    console.log('  allow    - Check if requests allowed');
    console.log('  success  - Record successful request');
    console.log('  failure  - Record failed request');
    console.log('  reset    - Reset to CLOSED state');
  }
}
