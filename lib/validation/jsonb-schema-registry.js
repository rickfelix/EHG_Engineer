/**
 * JsonbSchemaRegistry — A02 JSONB Validation Layer
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 *
 * Registry-based JSONB field validation for LEO Protocol tables.
 * Prevents JSON.stringify strings from being stored in JSONB columns
 * and provides pre-insert validation + read-back verification.
 */

export class JsonbSchemaRegistry {
  constructor() {
    /** @type {Map<string, Map<string, object>>} table → field → schema */
    this.schemas = new Map();

    /** @type {number|null} */
    this._loadedAt = null;
  }

  /**
   * Register a JSONB field schema for a table
   * @param {string} table - Table name (e.g., 'strategic_directives_v2')
   * @param {string} field - JSONB column name (e.g., 'success_criteria')
   * @param {object} schema - Schema definition
   * @param {string} schema.type - Expected top-level type: 'array' | 'object'
   * @param {boolean} [schema.required] - Whether the field is required
   * @param {object} [schema.items] - Schema for array items (when type='array')
   * @param {object} [schema.properties] - Schema for object properties (when type='object')
   * @param {number} [schema.minItems] - Minimum array length
   */
  register(table, field, schema) {
    if (!table || typeof table !== 'string') {
      throw new Error(`Table name must be a non-empty string, got: ${table}`);
    }
    if (!field || typeof field !== 'string') {
      throw new Error(`Field name must be a non-empty string, got: ${field}`);
    }
    if (!schema || typeof schema !== 'object') {
      throw new Error(`Schema must be an object, got: ${typeof schema}`);
    }

    if (!this.schemas.has(table)) {
      this.schemas.set(table, new Map());
    }
    this.schemas.get(table).set(field, { ...schema, _registeredAt: Date.now() });
  }

  /**
   * Validate a single field value against its registered schema
   * @param {string} table
   * @param {string} field
   * @param {*} value
   * @returns {{valid: boolean, errors: string[], sanitized: *}}
   */
  validateField(table, field, value) {
    const tableSchemas = this.schemas.get(table);
    if (!tableSchemas || !tableSchemas.has(field)) {
      return { valid: true, errors: [], sanitized: value };
    }

    const schema = tableSchemas.get(field);
    const errors = [];
    let sanitized = value;

    // Check for JSON.stringify'd strings (PAT-JSONB-STRING-TYPE)
    if (typeof value === 'string') {
      try {
        sanitized = JSON.parse(value);
        errors.push(`${field}: received string instead of ${schema.type} — auto-parsed (PAT-JSONB-STRING-TYPE)`);
      } catch {
        errors.push(`${field}: received unparseable string, expected ${schema.type}`);
        return { valid: false, errors, sanitized: value };
      }
    }

    // Null/undefined check
    if (sanitized == null) {
      if (schema.required) {
        errors.push(`${field}: required field is null/undefined`);
        return { valid: false, errors, sanitized };
      }
      return { valid: true, errors, sanitized };
    }

    // Type validation
    if (schema.type === 'array') {
      if (!Array.isArray(sanitized)) {
        errors.push(`${field}: expected array, got ${typeof sanitized}`);
        return { valid: false, errors, sanitized };
      }

      if (schema.minItems && sanitized.length < schema.minItems) {
        errors.push(`${field}: array has ${sanitized.length} items, minimum is ${schema.minItems}`);
      }

      // Validate array items (only when schema defines required properties)
      if (schema.items && sanitized.length > 0) {
        const hasProperties = schema.items.properties && Object.keys(schema.items.properties).length > 0;
        if (hasProperties) {
          for (let i = 0; i < sanitized.length; i++) {
            const item = sanitized[i];
            const itemErrors = this._validateObject(item, schema.items, `${field}[${i}]`);
            errors.push(...itemErrors);
          }
        }
      }
    } else if (schema.type === 'object') {
      if (typeof sanitized !== 'object' || Array.isArray(sanitized)) {
        errors.push(`${field}: expected object, got ${Array.isArray(sanitized) ? 'array' : typeof sanitized}`);
        return { valid: false, errors, sanitized };
      }

      if (schema.properties) {
        const propErrors = this._validateObject(sanitized, schema, field);
        errors.push(...propErrors);
      }
    }

    const blockingErrors = errors.filter(e => !e.includes('auto-parsed'));
    return { valid: blockingErrors.length === 0, errors, sanitized };
  }

  /**
   * Validate all registered JSONB fields for a table row
   * @param {string} table
   * @param {object} data - Row data to validate
   * @returns {{valid: boolean, errors: string[], warnings: string[], sanitized: object}}
   */
  validate(table, data) {
    const tableSchemas = this.schemas.get(table);
    if (!tableSchemas) {
      return { valid: true, errors: [], warnings: ['No schemas registered for table: ' + table], sanitized: data };
    }

    const allErrors = [];
    const warnings = [];
    const sanitized = { ...data };

    for (const [field, schema] of tableSchemas) {
      if (!(field in data) && schema.required) {
        allErrors.push(`${field}: required field is missing`);
        continue;
      }
      if (!(field in data)) continue;

      const result = this.validateField(table, field, data[field]);
      sanitized[field] = result.sanitized;

      const autoParseWarnings = result.errors.filter(e => e.includes('auto-parsed'));
      const blockingErrors = result.errors.filter(e => !e.includes('auto-parsed'));

      warnings.push(...autoParseWarnings);
      allErrors.push(...blockingErrors);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings,
      sanitized,
    };
  }

  /**
   * Check if a table has registered schemas
   * @param {string} table
   * @returns {boolean}
   */
  has(table) {
    return this.schemas.has(table) && this.schemas.get(table).size > 0;
  }

  /**
   * Get all registered table names
   * @returns {string[]}
   */
  getRegisteredTables() {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get all registered fields for a table
   * @param {string} table
   * @returns {string[]}
   */
  getFieldsForTable(table) {
    const tableSchemas = this.schemas.get(table);
    return tableSchemas ? Array.from(tableSchemas.keys()) : [];
  }

  /**
   * Get registration statistics
   * @returns {object}
   */
  getStats() {
    const stats = {
      totalTables: this.schemas.size,
      totalFields: 0,
      byTable: {},
    };

    for (const [table, fields] of this.schemas) {
      stats.totalFields += fields.size;
      stats.byTable[table] = fields.size;
    }

    return stats;
  }

  /**
   * Clear all registered schemas
   */
  clear() {
    this.schemas.clear();
    this._loadedAt = null;
  }

  /**
   * Validate an object against a schema with properties
   * @private
   */
  _validateObject(obj, schema, prefix) {
    const errors = [];

    if (typeof obj !== 'object' || obj === null) {
      errors.push(`${prefix}: expected object, got ${obj === null ? 'null' : typeof obj}`);
      return errors;
    }

    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.required && !(prop in obj)) {
          errors.push(`${prefix}.${prop}: required property missing`);
        }
        if (prop in obj && propSchema.type) {
          const actual = typeof obj[prop];
          if (propSchema.type === 'array' && !Array.isArray(obj[prop])) {
            errors.push(`${prefix}.${prop}: expected array, got ${actual}`);
          } else if (propSchema.type !== 'array' && actual !== propSchema.type) {
            errors.push(`${prefix}.${prop}: expected ${propSchema.type}, got ${actual}`);
          }
        }
      }
    }

    return errors;
  }
}
