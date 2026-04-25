<!-- reasoning_effort: low -->

# Read Full Skill

Read a file completely by paginating through `Read` tool calls when the file exceeds the per-call 25,000-token cap.

## When to use

- Any file whose name contains `CLAUDE` (protocol files must be read end-to-end per CLAUDE_CORE.md:98).
- Any file where a previous `Read` returned the error `exceeds maximum allowed tokens (25000)`.
- Any markdown/code file where a partial read would miss critical rules.

## When NOT to use

- Files under ~25k tokens — plain `Read` works in one call.
- Log files where sampling is acceptable — plain `Read` with `limit` parameter is fine.

## Context (why this skill exists)

Claude Code's `Read` tool has a hard-coded 25,000-token cap **per call** (see upstream issues #40357, #14888, #15687). This cap is **independent of the model's context window** (e.g. 1M tokens on Opus 4.7). The error `exceeds maximum allowed tokens (25000)` means the single call is too large — it does NOT mean the conversation context is exhausted. Misinterpreting this error leads sessions to silently partial-read protocol files, which is the leading cause of LEO compliance drift.

Bash `cat` is not an acceptable fallback — its output cap (~30k chars) is tighter than `Read`'s and truncates silently.

## Instructions

Parse `$ARGUMENTS` for the file path.

1. **Resolve the path.** If it's a bare filename, use Glob to find it. If multiple matches exist, list them and ask the user to disambiguate.

2. **First read.** Call `Read(file_path)` with no `offset`/`limit`. If it succeeds, return the content verbatim and stop.

3. **On the 25k error**, paginate with `Read(file_path, offset=N, limit=1500)`:
   - Start at `offset=1`, then `offset=1501`, `offset=3001`, and so on.
   - Stop when a call returns fewer than `limit` lines (end of file reached).
   - If any chunk still hits the 25k cap, halve `limit` to 750 and restart that chunk.

4. **Stitch output.** Print each chunk under a header `--- chunk N (lines X-Y) ---`. After the final chunk, print `TOTAL_LINES=<count>`.

5. **Never substitute** Bash `cat`, `head`, `tail`, or Grep as a workaround for full-file reading. Use Grep only for targeted lookups, not comprehension.

## Arguments

- `$1` — file path (absolute preferred; bare filename auto-resolved via Glob).

## Examples

- `/read-full CLAUDE_CORE.md` — paginate through the phase-loaded core rules file.
- `/read-full "/c/path/with spaces/big-file.md"` — absolute path with spaces (quote it).
