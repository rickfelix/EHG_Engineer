/**
 * Unit Tests for Language Parsers
 *
 * SD: SD-SEMANTIC-SEARCH-001
 * Story: US-001 - Natural Language Code Search
 */

import { describe, it, expect } from '@jest/globals';
import { parseCodeEntities, parseTypeScriptJavaScript, parseSQL } from '../../scripts/modules/language-parsers.js';

describe('Language Parsers', () => {
  describe('parseTypeScriptJavaScript()', () => {
    it('should extract function declarations', () => {
      const code = `
export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
      `;

      const entities = parseTypeScriptJavaScript(code, 'javascript', 'utils/math.js');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'function',
        entityName: 'calculateTotal',
        params: 'items'
      });
    });

    it('should extract arrow functions', () => {
      const code = `
export const handleClick = async (event) => {
  event.preventDefault();
  await submitForm();
};
      `;

      const entities = parseTypeScriptJavaScript(code, 'typescript', 'handlers.ts');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'function',
        entityName: 'handleClick',
        params: 'event'
      });
    });

    it('should extract class declarations', () => {
      const code = `
export class UserService extends BaseService {
  constructor() {
    super();
  }
}
      `;

      const entities = parseTypeScriptJavaScript(code, 'typescript', 'services/user.ts');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'class',
        entityName: 'UserService'
      });
    });

    it('should extract React components', () => {
      const code = `
/**
 * Button component with click handler
 */
export const Button = (props) => {
  const handleClick = () => {};

  return (
    <button onClick={handleClick}>
      {props.children}
    </button>
  );
};
      `;

      const entities = parseTypeScriptJavaScript(code, 'tsx', 'components/Button.tsx');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'component',
        entityName: 'Button',
        params: 'props'
      });
      expect(entities[0].description).toContain('Button component');
    });

    it('should extract interfaces', () => {
      const code = `
export interface UserProps {
  name: string;
  email: string;
  role: 'admin' | 'user';
}
      `;

      const entities = parseTypeScriptJavaScript(code, 'typescript', 'types/user.ts');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'interface',
        entityName: 'UserProps'
      });
    });

    it('should extract type aliases', () => {
      const code = `
export type Status = 'pending' | 'active' | 'completed';
      `;

      const entities = parseTypeScriptJavaScript(code, 'typescript', 'types/status.ts');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'type',
        entityName: 'Status'
      });
    });

    it('should extract JSDoc comments', () => {
      const code = `
/**
 * Calculate the sum of an array of numbers
 * @param {number[]} numbers - Array of numbers to sum
 * @returns {number} The total sum
 */
function sum(numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}
      `;

      const entities = parseTypeScriptJavaScript(code, 'javascript', 'math.js');

      expect(entities).toHaveLength(1);
      expect(entities[0].description).toContain('Calculate the sum');
      expect(entities[0].description).toContain('@param');
      expect(entities[0].description).toContain('@returns');
    });

    it('should handle multiple entities in one file', () => {
      const code = `
export class Database {
  connect() {}
}

export function query(sql) {
  return Database.execute(sql);
}

export const config = {
  host: 'localhost',
  port: 5432
};
      `;

      const entities = parseTypeScriptJavaScript(code, 'typescript', 'db.ts');

      expect(entities.length).toBeGreaterThanOrEqual(2);
      const classEntity = entities.find(e => e.entityType === 'class');
      const functionEntity = entities.find(e => e.entityType === 'function');

      expect(classEntity).toBeDefined();
      expect(functionEntity).toBeDefined();
      expect(classEntity.entityName).toBe('Database');
      expect(functionEntity.entityName).toBe('query');
    });
  });

  describe('parseSQL()', () => {
    it('should extract CREATE FUNCTION statements', () => {
      const code = `
-- Calculate user score
CREATE OR REPLACE FUNCTION calculate_score(user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN 100;
END;
$$ LANGUAGE plpgsql;
      `;

      const entities = parseSQL(code, 'sql', 'functions/score.sql');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'function',
        entityName: 'calculate_score'
      });
      expect(entities[0].description).toContain('Calculate user score');
    });

    it('should extract CREATE TABLE statements', () => {
      const code = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
      `;

      const entities = parseSQL(code, 'sql', 'migrations/create_users.sql');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'table',
        entityName: 'users'
      });
      expect(entities[0].description).toContain('Users table');
    });

    it('should extract CREATE VIEW statements', () => {
      const code = `
-- Active users view
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM users WHERE status = 'active';
      `;

      const entities = parseSQL(code, 'sql', 'views/active_users.sql');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        entityType: 'view',
        entityName: 'active_users'
      });
      expect(entities[0].description).toContain('Active users view');
    });

    it('should extract SQL comments', () => {
      const code = `
-- This function calculates the total
-- It takes user_id as parameter
-- Returns the sum as INTEGER
CREATE FUNCTION get_total(user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN 0;
END;
$$ LANGUAGE plpgsql;
      `;

      const entities = parseSQL(code, 'sql', 'functions/total.sql');

      expect(entities).toHaveLength(1);
      expect(entities[0].description).toContain('calculates the total');
      expect(entities[0].description).toContain('user_id as parameter');
    });
  });

  describe('parseCodeEntities()', () => {
    it('should dispatch to TypeScript parser for .ts files', async () => {
      const code = 'export function test() {}';
      const entities = await parseCodeEntities(code, 'typescript', 'test.ts');

      expect(entities).toHaveLength(1);
      expect(entities[0].entityType).toBe('function');
    });

    it('should dispatch to JavaScript parser for .js files', async () => {
      const code = 'const test = () => {}';
      const entities = await parseCodeEntities(code, 'javascript', 'test.js');

      expect(entities).toHaveLength(1);
      expect(entities[0].entityType).toBe('function');
    });

    it('should dispatch to SQL parser for .sql files', async () => {
      const code = 'CREATE FUNCTION test() RETURNS INTEGER AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';
      const entities = await parseCodeEntities(code, 'sql', 'test.sql');

      expect(entities).toHaveLength(1);
      expect(entities[0].entityType).toBe('function');
    });

    it('should return empty array for unsupported languages', async () => {
      const code = 'some python code';
      const entities = await parseCodeEntities(code, 'python', 'test.py');

      expect(entities).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code gracefully', async () => {
      const entities = await parseCodeEntities('', 'typescript', 'empty.ts');
      expect(entities).toEqual([]);
    });

    it('should handle code with no extractable entities', () => {
      const code = `
const x = 1;
const y = 2;
console.log(x + y);
      `;

      const entities = parseTypeScriptJavaScript(code, 'javascript', 'constants.js');
      expect(entities).toEqual([]);
    });

    it('should handle malformed code without throwing', () => {
      const code = 'function incomplete(';

      expect(() => {
        parseTypeScriptJavaScript(code, 'javascript', 'malformed.js');
      }).not.toThrow();
    });
  });
});
