/**
 * Genesis Virtual Bunker - Simulation Supabase Client
 *
 * Returns a mock Supabase client that doesn't connect to real database.
 * All operations return mock data.
 *
 * @module lib/mock/simulation-supabase-client
 * Part of SD-GENESIS-V31-MASON-FIREWALL
 */

import { assertMockMode } from './firewall.js';

/**
 * Mock data storage for simulation.
 * Tables can be seeded with test data.
 */
const mockTables = new Map();

/**
 * Create a mock table client that simulates Supabase table operations.
 *
 * @param {string} tableName - The table name
 * @returns {Object} Mock table client with Supabase-like API
 */
function mockTableClient(tableName) {
  // Initialize table if not exists
  if (!mockTables.has(tableName)) {
    mockTables.set(tableName, []);
  }

  let filters = [];
  let _selectColumns = '*';
  let orderConfig = null;
  let limitCount = null;
  let singleMode = false;

  const builder = {
    select(columns = '*') {
      _selectColumns = columns;
      return builder;
    },

    insert(data) {
      const rows = Array.isArray(data) ? data : [data];
      const table = mockTables.get(tableName);
      const inserted = rows.map(row => ({
        id: row.id || crypto.randomUUID(),
        ...row,
        created_at: row.created_at || new Date().toISOString(),
      }));
      table.push(...inserted);
      return {
        select() {
          return {
            single() {
              return Promise.resolve({ data: inserted[0], error: null });
            },
            then(resolve) {
              resolve({ data: inserted, error: null });
            }
          };
        },
        then(resolve) {
          resolve({ data: inserted, error: null });
        }
      };
    },

    update(data) {
      return {
        eq(column, value) {
          const table = mockTables.get(tableName);
          const index = table.findIndex(row => row[column] === value);
          if (index >= 0) {
            table[index] = { ...table[index], ...data };
            return Promise.resolve({ data: table[index], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        match(criteria) {
          const table = mockTables.get(tableName);
          const updated = [];
          table.forEach((row, index) => {
            if (Object.entries(criteria).every(([k, v]) => row[k] === v)) {
              table[index] = { ...row, ...data };
              updated.push(table[index]);
            }
          });
          return Promise.resolve({ data: updated, error: null });
        }
      };
    },

    delete() {
      return {
        eq(column, value) {
          const table = mockTables.get(tableName);
          const index = table.findIndex(row => row[column] === value);
          if (index >= 0) {
            const deleted = table.splice(index, 1);
            return Promise.resolve({ data: deleted[0], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        match(criteria) {
          const table = mockTables.get(tableName);
          const deleted = [];
          for (let i = table.length - 1; i >= 0; i--) {
            if (Object.entries(criteria).every(([k, v]) => table[i][k] === v)) {
              deleted.push(...table.splice(i, 1));
            }
          }
          return Promise.resolve({ data: deleted, error: null });
        }
      };
    },

    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return builder;
    },

    neq(column, value) {
      filters.push({ type: 'neq', column, value });
      return builder;
    },

    ilike(column, value) {
      filters.push({ type: 'ilike', column, value });
      return builder;
    },

    in(column, values) {
      filters.push({ type: 'in', column, values });
      return builder;
    },

    order(column, options = {}) {
      orderConfig = { column, ascending: options.ascending !== false };
      return builder;
    },

    limit(count) {
      limitCount = count;
      return builder;
    },

    single() {
      singleMode = true;
      return builder;
    },

    then(resolve) {
      let results = [...mockTables.get(tableName)];

      // Apply filters
      for (const filter of filters) {
        switch (filter.type) {
          case 'eq':
            results = results.filter(r => r[filter.column] === filter.value);
            break;
          case 'neq':
            results = results.filter(r => r[filter.column] !== filter.value);
            break;
          case 'ilike': {
            const pattern = filter.value.replace(/%/g, '.*').toLowerCase();
            const regex = new RegExp(pattern);
            results = results.filter(r => regex.test(String(r[filter.column]).toLowerCase()));
            break;
          }
          case 'in':
            results = results.filter(r => filter.values.includes(r[filter.column]));
            break;
        }
      }

      // Apply order
      if (orderConfig) {
        results.sort((a, b) => {
          const aVal = a[orderConfig.column];
          const bVal = b[orderConfig.column];
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return orderConfig.ascending ? cmp : -cmp;
        });
      }

      // Apply limit
      if (limitCount !== null) {
        results = results.slice(0, limitCount);
      }

      // Return single or array
      if (singleMode) {
        resolve({ data: results[0] || null, error: null });
      } else {
        resolve({ data: results, error: null });
      }
    }
  };

  return builder;
}

/**
 * Create a mock auth client that simulates Supabase auth.
 *
 * @returns {Object} Mock auth client
 */
function mockAuthClient() {
  let currentUser = null;

  return {
    getUser() {
      return Promise.resolve({
        data: { user: currentUser },
        error: null
      });
    },

    getSession() {
      return Promise.resolve({
        data: {
          session: currentUser ? {
            user: currentUser,
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Date.now() + 3600000,
          } : null
        },
        error: null
      });
    },

    signInWithPassword({ email, password: _password }) {
      // Accept any credentials in mock mode
      currentUser = {
        id: crypto.randomUUID(),
        email,
        created_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        role: 'authenticated',
      };
      return Promise.resolve({
        data: { user: currentUser, session: { user: currentUser } },
        error: null
      });
    },

    signOut() {
      currentUser = null;
      return Promise.resolve({ error: null });
    },

    onAuthStateChange(_callback) {
      // Return mock unsubscribe
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      };
    },

    // Mock user for testing
    _setMockUser(user) {
      currentUser = user;
    }
  };
}

/**
 * Get a simulation Supabase client.
 * This client operates entirely in memory and doesn't connect to any database.
 *
 * @returns {Object} Mock Supabase client
 * @throws {Error} If mock mode is not enabled
 */
export function getSimulationClient() {
  assertMockMode();

  return {
    from: (tableName) => mockTableClient(tableName),
    auth: mockAuthClient(),

    // Utility methods for testing
    _seedTable(tableName, data) {
      mockTables.set(tableName, Array.isArray(data) ? [...data] : [data]);
    },

    _clearTable(tableName) {
      mockTables.set(tableName, []);
    },

    _clearAll() {
      mockTables.clear();
    },

    _getTableData(tableName) {
      return mockTables.get(tableName) || [];
    }
  };
}

/**
 * Seed mock tables with test data.
 *
 * @param {Object} seedData - Object mapping table names to arrays of rows
 */
export function seedMockData(seedData) {
  for (const [tableName, rows] of Object.entries(seedData)) {
    mockTables.set(tableName, Array.isArray(rows) ? [...rows] : [rows]);
  }
}

/**
 * Clear all mock data.
 */
export function clearMockData() {
  mockTables.clear();
}

export default {
  getSimulationClient,
  seedMockData,
  clearMockData,
};
