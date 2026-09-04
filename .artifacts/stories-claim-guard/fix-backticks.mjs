import fs from 'node:fs';
const f = new URL('./insert-stories.mjs', import.meta.url);
let src = fs.readFileSync(f, 'utf8');
const bt = String.fromCharCode(96);
const before = src;
src = src.replace(bt + 'git init' + bt, "'git init'")
         .replace(bt + 'git checkout -b <branch>' + bt, "'git checkout -b <branch>'")
         .replace(bt + 'match(WORKTREE_PATH_RE)' + bt, "'match(WORKTREE_PATH_RE)'");
if (src === before) { console.error('NO CHANGE'); process.exit(1); }
fs.writeFileSync(f, src, 'utf8');
console.log('patched');
