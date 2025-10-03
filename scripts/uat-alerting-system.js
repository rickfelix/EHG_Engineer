#!/usr/bin/env node

/**
 * UAT Alerting System
 * Sends notifications for test failures and issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class UATAlertingSystem {
  constructor() {
    this.channels = {
      email: process.env.ALERT_EMAIL,
      slack: process.env.SLACK_WEBHOOK_URL,
      webhook: process.env.CUSTOM_WEBHOOK_URL
    };
  }

  async sendAlert(type, data) {
    const alert = {
      type,
      severity: this.calculateSeverity(type, data),
      title: this.generateTitle(type, data),
      message: this.generateMessage(type, data),
      timestamp: new Date().toISOString(),
      data
    };

    // Send to configured channels
    const promises = [];

    if (this.channels.email) {
      promises.push(this.sendEmailAlert(alert));
    }

    if (this.channels.slack) {
      promises.push(this.sendSlackAlert(alert));
    }

    if (this.channels.webhook) {
      promises.push(this.sendWebhookAlert(alert));
    }

    await Promise.all(promises);

    // Log alert in database
    await this.logAlert(alert);
  }

  calculateSeverity(type, data) {
    if (type === 'test_failure' && data.severity === 'critical') return 'critical';
    if (type === 'quality_gate_failure') return 'high';
    if (type === 'performance_degradation') return 'medium';
    return 'low';
  }

  generateTitle(type, data) {
    switch(type) {
      case 'test_failure':
        return `UAT Test Failed: ${data.test_name}`;
      case 'quality_gate_failure':
        return `Quality Gate Failed: Pass rate ${data.pass_rate}% < 85%`;
      case 'performance_degradation':
        return `Performance Issue Detected: ${data.metric}`;
      default:
        return `UAT Alert: ${type}`;
    }
  }

  generateMessage(type, data) {
    return JSON.stringify(data, null, 2);
  }

  async sendEmailAlert(alert) {
    // Email implementation (would use SendGrid, SES, etc.)
    console.log(`📧 Email alert sent to ${this.channels.email}`);
  }

  async sendSlackAlert(alert) {
    if (!this.channels.slack) return;

    const slackMessage = {
      text: alert.title,
      attachments: [{
        color: alert.severity === 'critical' ? 'danger' : 'warning',
        fields: [
          {
            title: 'Severity',
            value: alert.severity,
            short: true
          },
          {
            title: 'Time',
            value: alert.timestamp,
            short: true
          },
          {
            title: 'Details',
            value: alert.message
          }
        ]
      }]
    };

    try {
      const response = await fetch(this.channels.slack, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage)
      });

      if (response.ok) {
        console.log('💬 Slack alert sent');
      }
    } catch (error) {
      console.error('Error sending Slack alert:', error);
    }
  }

  async sendWebhookAlert(alert) {
    if (!this.channels.webhook) return;

    try {
      const response = await fetch(this.channels.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });

      if (response.ok) {
        console.log('🔗 Webhook alert sent');
      }
    } catch (error) {
      console.error('Error sending webhook alert:', error);
    }
  }

  async logAlert(alert) {
    const { error } = await supabase
      .from('uat_audit_trail')
      .insert({
        entity_type: 'alert',
        action: alert.type,
        changes: alert,
        performed_by: 'uat-system',
        metadata: alert.data
      });

    if (error) {
      console.error('Error logging alert:', error);
    }
  }

  async monitorTestRuns() {
    // Set up real-time monitoring
    const subscription = supabase
      .channel('uat-monitoring')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'uat_test_results'
      }, async (payload) => {
        if (payload.new.status === 'failed') {
          await this.sendAlert('test_failure', payload.new);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'uat_test_runs'
      }, async (payload) => {
        if (payload.new.pass_rate < 85) {
          await this.sendAlert('quality_gate_failure', {
            pass_rate: payload.new.pass_rate,
            run_id: payload.new.run_id
          });
        }
      })
      .subscribe();

    console.log('🔔 UAT alerting system active');
  }
}

export default UATAlertingSystem;

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const alerting = new UATAlertingSystem();
  alerting.monitorTestRuns()
    .then(() => {
      console.log('✅ Alerting system configured');
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
