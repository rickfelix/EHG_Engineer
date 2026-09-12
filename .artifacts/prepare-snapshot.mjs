import { readFileSync } from 'node:fs';
import MemoryManager from '../lib/context/memory-manager.js';

const text = readFileSync(new URL('./pre-compaction-snapshot.txt', import.meta.url), 'utf8');
const memory = new MemoryManager();
await memory.updateSectionVerified('Pre-Compaction Snapshot', text);
console.log('PREPARE: write verified');
