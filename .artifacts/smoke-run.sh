set -u
export CLAUDE_SESSION_ID=fa09a46d-5b8e-4642-ae63-f1dce3f87fb1
OUT=.artifacts/testing-evidence/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B-smoke.txt
SCRATCH="C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/fa09a46d-5b8e-4642-ae63-f1dce3f87fb1/scratchpad/michael-render"
mkdir -p "$SCRATCH"
: > "$OUT"
echo "# runner: scripts smoke, HEAD=$(git rev-parse HEAD) at $(date -u +%FT%TZ)" >> "$OUT"
r(){ echo "\$ node $*" >> "$OUT"; node "$@" 2>&1 | grep -v "injected env" >> "$OUT"; echo "exit=${PIPESTATUS[0]}" >> "$OUT"; }
r scripts/michael-rules-load.mjs --json
r scripts/michael-rules-render.mjs --json --out-dir "$SCRATCH"
r scripts/michael/autonomy-read.mjs --json
r scripts/michael/retention.mjs --json
r scripts/michael/rule-encode.mjs --domain gmail --key k --text t --source terminal:smoke --json
r scripts/michael/closure-add.mjs --domain gmail --key k --topic t --text tx --source terminal:smoke --json
r scripts/michael/capture.mjs --text x --json
r scripts/michael/feedback-append.mjs --landed x --json
r scripts/michael/gmail-act.mjs --thread x --archive --json
r scripts/michael/todoist-act.mjs complete --task x --dry-run --json
echo "# lints" >> "$OUT"
for L in secdef-execute-revoke rls-anon-tenant-predicate eol-renormalization alter-default-override count-truncation-diff workflow-path-filter; do
  echo "\$ node scripts/lint/$L-lint.mjs" >> "$OUT"; node scripts/lint/$L-lint.mjs 2>&1 | tail -2 >> "$OUT"; echo "exit=${PIPESTATUS[0]}" >> "$OUT"
done
echo "\$ node scripts/check-workflow-yaml.mjs .github/workflows/michael-retention-cron.yml" >> "$OUT"
node scripts/check-workflow-yaml.mjs .github/workflows/michael-retention-cron.yml 2>&1 | tail -2 >> "$OUT"; echo "exit=${PIPESTATUS[0]}" >> "$OUT"
