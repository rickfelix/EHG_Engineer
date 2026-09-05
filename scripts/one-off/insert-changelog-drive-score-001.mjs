import fs from 'node:fs';
import path from 'node:path';

const changelogPath = path.resolve('CHANGELOG.md');
const entryPath = path.resolve(
  'C:\\Users\\rickf\\AppData\\Local\\Temp\\claude\\C--Users-rickf-Projects--EHG-EHG-Engineer\\a1d6d6cf-4e4c-455a-b5bd-6066cae77c32\\scratchpad\\changelog-drive-score-entry.md',
);

const changelog = fs.readFileSync(changelogPath, 'utf8');
const entry = fs.readFileSync(entryPath, 'utf8').trimEnd();

const marker = '## 2026-09-05\n\n### Bugfix\n\n';
const idx = changelog.indexOf(marker);
if (idx === -1) {
  console.error('MARKER NOT FOUND -- CHANGELOG.md structure changed, aborting.');
  process.exit(1);
}
const insertAt = idx + marker.length;
const updated = changelog.slice(0, insertAt) + entry + '\n\n' + changelog.slice(insertAt);

fs.writeFileSync(changelogPath, updated);
console.log('CHANGELOG.md updated: drive-score gradient entry inserted under 2026-09-05 / Bugfix.');
