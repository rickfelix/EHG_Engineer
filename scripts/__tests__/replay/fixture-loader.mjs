import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSanitized } from './sanitization-checker.mjs';

const REQUIRED_FIELDS = ['input', 'v1_output', 'validator_result', 'captured_at', 'sanitized'];

export class FixtureShapeError extends Error {
  constructor(message, fixturePath) {
    super(`${fixturePath}: ${message}`);
    this.name = 'FixtureShapeError';
    this.fixturePath = fixturePath;
  }
}

export async function loadFixture(fixturePath) {
  const raw = await fs.readFile(fixturePath, 'utf8');
  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch (err) {
    throw new FixtureShapeError(`invalid JSON: ${err.message}`, fixturePath);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in fixture)) {
      throw new FixtureShapeError(`missing required field: ${field}`, fixturePath);
    }
  }
  if (typeof fixture.sanitized !== 'boolean') {
    throw new FixtureShapeError(`'sanitized' must be boolean, got ${typeof fixture.sanitized}`, fixturePath);
  }
  if (fixture.sanitized !== true) {
    throw new FixtureShapeError(`fixture is not marked sanitized=true; refusing to load (FR-2 AC-2)`, fixturePath);
  }
  assertSanitized(fixture, fixturePath);
  return fixture;
}

export async function loadFixturesForScript(scriptName, goldenRoot) {
  const dir = path.join(goldenRoot, scriptName);
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const jsonFiles = entries.filter(e => e.endsWith('.json') && e !== 'schema.json');
  return Promise.all(jsonFiles.map(f => loadFixture(path.join(dir, f))));
}
