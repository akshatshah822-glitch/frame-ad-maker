<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (Akshat)

- Never merge a pull request and never deploy. Stop at "PR ready to merge" and let me press merge.
- Never print, echo or log an API key, token or secret, not even partially.
- Never change an existing database schema, validator or environment variable unless I explicitly ask in that message.
- The ad/film generation path and the exam-question video path are separate. When working on one, do not touch the other.
- Never report "done". Always paste the raw command output, the URL or the error as proof.
- When adding a new required field, step or validation, also state what happens to records created before it existed: migrate, default, or make optional.
- Any fallback or degraded path must log which path actually ran, so a silent failure is visible.
- Every narration script must be grammar-checked before it is saved or used.
- The narration script is written from the brief, not from the storyboard. Shot and camera descriptions are never spoken copy.
- Work on a fresh branch off origin/main. One change per pull request.
