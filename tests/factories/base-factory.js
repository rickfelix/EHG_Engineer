/**
 * Base Factory - Foundation for test data factories
 *
 * Part of Phase 1 Testing Infrastructure (B1.2)
 * Provides builder pattern and cleanup tracking for test data
 */

import { getSupabaseClient } from '../helpers/database-helpers.js';

/**
 * Base Factory class with common patterns
 */
export class BaseFactory {
  constructor() {
    this.attributes = {};
    this.createdRecords = [];
    this.supabase = getSupabaseClient();
  }

  /**
   * Set attributes using fluent API
   * @param {string} key - Attribute key
   * @param {any} value - Attribute value
   * @returns {this}
   */
  set(key, value) {
    this.attributes[key] = value;
    return this;
  }

  /**
   * Set multiple attributes at once
   * @param {Object} attributes - Attributes object
   * @returns {this}
   */
  setAttributes(attributes) {
    Object.assign(this.attributes, attributes);
    return this;
  }

  /**
   * Get current attribute value
   * @param {string} key - Attribute key
   * @returns {any}
   */
  get(key) {
    return this.attributes[key];
  }

  /**
   * Generate random string
   * @param {number} length - String length
   * @returns {string}
   */
  randomString(length = 8) {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  /**
   * Generate unique identifier
   * @param {string} prefix - ID prefix
   * @returns {string}
   */
  uniqueId(prefix = 'test') {
    const timestamp = Date.now();
    const random = this.randomString(6);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Pick random item from array
   * @param {Array} array - Array to pick from
   * @returns {any}
   */
  pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Generate random integer between min and max (inclusive)
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number}
   */
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random date within range
   * @param {number} daysAgo - Days in the past
   * @param {number} daysAhead - Days in the future
   * @returns {Date}
   */
  randomDate(daysAgo = 30, daysAhead = 30) {
    const now = Date.now();
    const range = (daysAgo + daysAhead) * 24 * 60 * 60 * 1000;
    const offset = (Math.random() * range) - (daysAgo * 24 * 60 * 60 * 1000);
    return new Date(now + offset);
  }

  /**
   * Track created record for cleanup
   * @param {string} table - Table name
   * @param {string} id - Record ID
   */
  trackRecord(table, id) {
    this.createdRecords.push({ table, id });
  }

  /**
   * Clean up all tracked records
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Delete in reverse order (respects foreign keys)
    for (let i = this.createdRecords.length - 1; i >= 0; i--) {
      const { table, id } = this.createdRecords[i];
      try {
        await this.supabase.from(table).delete().eq('id', id);
      } catch (error) {
        console.warn(`Failed to cleanup ${table}:${id}:`, error.message);
      }
    }
    this.createdRecords = [];
  }

  /**
   * Reset factory to initial state
   * @returns {this}
   */
  reset() {
    this.attributes = {};
    return this;
  }

  /**
   * Clone factory with current attributes
   * @returns {BaseFactory}
   */
  clone() {
    const factory = new this.constructor();
    factory.attributes = { ...this.attributes };
    return factory;
  }
}

/**
 * Sequence generator for unique values
 */
export class Sequence {
  constructor(prefix = 'item', start = 1) {
    this.prefix = prefix;
    this.current = start;
  }

  /**
   * Get next value in sequence
   * @returns {string}
   */
  next() {
    return `${this.prefix}-${this.current++}`;
  }

  /**
   * Reset sequence to start
   */
  reset() {
    this.current = 1;
  }
}

/**
 * Trait system for reusable attribute sets
 */
export class TraitManager {
  constructor() {
    this.traits = new Map();
  }

  /**
   * Define a trait
   * @param {string} name - Trait name
   * @param {Object|Function} attributes - Attributes or function returning attributes
   */
  define(name, attributes) {
    this.traits.set(name, attributes);
  }

  /**
   * Apply trait to factory
   * @param {BaseFactory} factory - Factory instance
   * @param {string} name - Trait name
   * @returns {BaseFactory}
   */
  apply(factory, name) {
    const trait = this.traits.get(name);
    if (!trait) {
      throw new Error(`Trait '${name}' not found`);
    }

    const attributes = typeof trait === 'function' ? trait() : trait;
    factory.setAttributes(attributes);
    return factory;
  }

  /**
   * Check if trait exists
   * @param {string} name - Trait name
   * @returns {boolean}
   */
  has(name) {
    return this.traits.has(name);
  }
}

/**
 * Realistic data generators
 */
export const DataGenerators = {
  /**
   * Generate realistic title
   * @param {string} prefix - Title prefix
   * @returns {string}
   */
  title(prefix = 'Feature') {
    const subjects = ['User', 'System', 'Dashboard', 'Report', 'Interface', 'API', 'Data'];
    const actions = ['Management', 'Integration', 'Enhancement', 'Optimization', 'Automation'];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    return `${prefix}: ${subject} ${action}`;
  },

  /**
   * Generate realistic description
   * @param {number} sentences - Number of sentences
   * @returns {string}
   */
  description(sentences = 2) {
    const templates = [
      'This feature will improve user experience by providing better functionality.',
      'The system will be enhanced to support additional use cases.',
      'Implementation will follow best practices and design patterns.',
      'This change addresses key stakeholder requirements.',
      'The enhancement will increase efficiency and reduce manual work.',
    ];

    return templates
      .slice(0, sentences)
      .map(t => t)
      .join(' ');
  },

  /**
   * Generate realistic email
   * @param {string} name - Name for email
   * @returns {string}
   */
  email(name = 'test') {
    const domains = ['example.com', 'test.com', 'demo.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const random = Math.random().toString(36).substring(2, 6);
    return `${name.toLowerCase().replace(/\s+/g, '.')}.${random}@${domain}`;
  },

  /**
   * Generate realistic name
   * @returns {string}
   */
  name() {
    const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller'];
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${first} ${last}`;
  },

  /**
   * Generate realistic markdown content
   * @param {number} paragraphs - Number of paragraphs
   * @returns {string}
   */
  markdown(paragraphs = 3) {
    const sections = [
      '## Overview\n\nThis section provides an overview of the feature and its purpose.',
      '## Requirements\n\n- Requirement 1: Key functionality\n- Requirement 2: Performance criteria\n- Requirement 3: Integration needs',
      '## Implementation\n\nThe implementation will follow a phased approach:\n\n1. Phase 1: Core functionality\n2. Phase 2: Integration\n3. Phase 3: Testing and deployment',
    ];

    return sections.slice(0, paragraphs).join('\n\n');
  },

  /**
   * Generate realistic JSON object
   * @param {string} type - Object type
   * @returns {Object}
   */
  jsonObject(type = 'config') {
    const templates = {
      config: {
        enabled: true,
        timeout: 30000,
        retries: 3,
        options: { debug: false },
      },
      metadata: {
        created_by: 'test-user',
        version: '1.0.0',
        tags: ['test', 'automated'],
      },
      requirements: {
        performance: { responseTime: '<200ms', uptime: '99.9%' },
        security: { authentication: 'required', encryption: 'AES-256' },
      },
    };

    return templates[type] || {};
  },
};
