import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.require = require;
await import('./dbexec.bundle.mjs');
