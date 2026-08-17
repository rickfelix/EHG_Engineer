# .gitattributes EOL Census — SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001

Generated: 2026-08-17T05:38:22.136Z (EXEC-phase re-measurement, TR-2)

Total tracked files: 18119

## Candidate extensions for `eol=lf` (FR-2, Phase 1)

| ext | total | crlf | mixed | lf | binary-index | verdict |
|---|---|---|---|---|---|---|
| .yml | 210 | 0 | 0 | 210 | 0 | OK |
| .yaml | 31 | 0 | 0 | 31 | 0 | OK |
| .mmd | 47 | 0 | 0 | 47 | 0 | OK |
| .ps1 | 20 | 0 | 0 | 20 | 0 | OK |
| .partial | 17 | 0 | 0 | 17 | 0 | OK |
| .csv | 17 | 0 | 0 | 17 | 0 | OK |
| .patch | 14 | 0 | 0 | 2 | 0 | OK |
| .txt | 13 | 0 | 0 | 12 | 0 | OK |
| .intoto | 13 | 0 | 0 | 13 | 0 | OK |
| .gitkeep | 5 | 0 | 0 | 1 | 0 | OK |
| .map | 4 | 0 | 0 | 0 | 0 | OK |
| .tsx | 3 | 0 | 0 | 3 | 0 | OK |
| .example | 3 | 0 | 0 | 3 | 0 | OK |
| .css | 2 | 0 | 0 | 2 | 0 | OK |
| .template | 1 | 0 | 0 | 1 | 0 | OK |

All candidate extensions are 0 crlf / 0 mixed — safe to pin `eol=lf`.

## Candidate extensions for `binary` mark (FR-2, Phase 1)

| ext | total | binary-index (i/-text) |
|---|---|---|
| .png | 127 | 127 |
| .webm | 4 | 4 |
| .pptx | 1 | 1 |
| .docx | 1 | 1 |
| .gz | 1 | 1 |

## NUL-byte / binary-index exposure via existing pins (danger class)

Files where the index state is `-text` (git's own binary-content detection) AND the resolved attribute set forces `eol=lf` — these are exposed to a forced-renormalize rewrite of binary content.

| path | index | attr |
|---|---|---|
| lib/income/first-revenue-rollup-aggregator.js | -text | text eol=lf |
| tests/unit/solomon-advisory-no-literal-nul.test.js | -text | text eol=lf |

## Open-PR conflict surface

45 open PR(s) scanned.

No open PR touches `.gitattributes` or any file whose extension is in this SD's candidate list.

## Full per-extension breakdown

| ext | total | crlf | mixed | lf | binary-index |
|---|---|---|---|---|---|
| .js | 8605 | 1 | 3 | 8599 | 2 |
| .md | 3801 | 69 | 195 | 3536 | 1 |
| .sql | 1898 | 0 | 2 | 1896 | 0 |
| .mjs | 1818 | 0 | 0 | 1818 | 0 |
| .cjs | 594 | 0 | 0 | 594 | 0 |
| .json | 580 | 20 | 0 | 556 | 0 |
| .yml | 210 | 0 | 0 | 210 | 0 |
| .ts | 172 | 76 | 0 | 96 | 0 |
| .png | 127 | 0 | 0 | 0 | 127 |
| .mmd | 47 | 0 | 0 | 47 | 0 |
| .sh | 45 | 5 | 0 | 40 | 0 |
| .yaml | 31 | 0 | 0 | 31 | 0 |
| .html | 29 | 1 | 0 | 27 | 0 |
| .(none) | 24 | 0 | 0 | 12 | 0 |
| .ps1 | 20 | 0 | 0 | 20 | 0 |
| .partial | 17 | 0 | 0 | 17 | 0 |
| .csv | 17 | 0 | 0 | 17 | 0 |
| .patch | 14 | 0 | 0 | 2 | 0 |
| .txt | 13 | 0 | 0 | 12 | 0 |
| .intoto | 13 | 0 | 0 | 13 | 0 |
| .gitignore | 6 | 2 | 0 | 4 | 0 |
| .gitkeep | 5 | 0 | 0 | 1 | 0 |
| .webm | 4 | 0 | 0 | 0 | 4 |
| .map | 4 | 0 | 0 | 0 | 0 |
| .example | 3 | 0 | 0 | 3 | 0 |
| .tsx | 3 | 0 | 0 | 3 | 0 |
| .err | 2 | 0 | 0 | 2 | 0 |
| .css | 2 | 0 | 0 | 2 | 0 |
| .claude | 1 | 0 | 0 | 1 | 0 |
| .gitattributes | 1 | 0 | 0 | 1 | 0 |
| .gitmessage | 1 | 0 | 0 | 1 | 0 |
| .pid | 1 | 0 | 0 | 0 | 0 |
| .npmrc | 1 | 0 | 0 | 1 | 0 |
| .pem | 1 | 0 | 0 | 1 | 0 |
| .sha256 | 1 | 0 | 0 | 1 | 0 |
| .pptx | 1 | 0 | 0 | 0 | 1 |
| .docx | 1 | 0 | 0 | 0 | 1 |
| .gz | 1 | 0 | 0 | 0 | 1 |
| .py | 1 | 0 | 0 | 1 | 0 |
| .bak | 1 | 0 | 0 | 1 | 0 |
| .template | 1 | 0 | 0 | 1 | 0 |
| .toml | 1 | 1 | 0 | 0 | 0 |
| .jsonl | 1 | 0 | 0 | 1 | 0 |
