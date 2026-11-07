# Decision log

One entry per decision: the date it was locked, the decision, why, and what we rejected. Newest on top.

## Decided

- **2026-11-07 · Independent review by a second AI model before sharing.**
  Why: the model that wrote the code shouldn't be the only one that reviews it. A different model (Codex) reviews the finished repo, and each finding is fixed in its own commit or answered in writing.

- **2026-11-07 · Build budget of 3 hours of active time, hard stop at 3.5 hours, stated in the README.**
  Why: the assignment tests scoping ("pick a small slice and do it well"). A working, tested slice answers that better than a polished product. The work can pause between gates. Only active time counts, and the README states the total.
  Rejected: a strict 2 hours (no live eval), and a polished build of 6 to 10 hours.

- **2026-11-07 · Vercel AI SDK 7 with the Anthropic provider.**
  Why: it matches the Next.js stack, ships mock models for tests, and switches provider in one line.
  Rejected: the official Anthropic SDK. It means one fewer layer, but we'd write our own mock, and it's less familiar to Next.js teams.
  Risk: the AI SDK's API changed a lot between versions 4 and 7. Exact pins and the API notes in `CLAUDE.md` contain it.

- **2026-11-07 · Mock fixtures include deliberate model mistakes.**
  Why: the stored mock answers for the eval cases include an expired date marked complete and a made-up quote. CI then proves the rules catch them, not only the happy path.

- **2026-11-07 · Feature branch per gate, merged with `--no-ff`, local only.**
  Why: the assignment lists branches and pull requests. Merge commits keep the branches visible in the history. The owner pushes from their own account.

- **2026-11-07 · Construction subcontractor prequalification.**
  Why: it matches the assignment's pattern of request, response, and review. Jonas grew from construction and club management. In Ontario, the hiring contractor must collect a WSIB clearance from each subcontractor it hires directly.
  Rejected: a golf club vendor portal. Club procurement has light compliance, so AI triage would feel bolted on.

- **2026-11-07 · Response triage: one structured call, rules on top.**
  Why: the model needs exactly two inputs, the request and the response, and code already has both. A tool loop would add cost, latency, and ways to fail (a step cap with no answer, a failed tool the model ignores).
  Rejected: an agent with tools. Revisit when lookups depend on what the model finds, such as reading an uploaded PDF only when the text answer is vague.

- **2026-11-07 · Rules after the model can lower completeness, never raise it.**
  Why: hard facts (dates, quotes) are checked in code, so the model can't talk its way past them. The page shows what the rules changed.

- **2026-11-07 · Text responses only.**
  Why: text proves the triage logic. Uploads add storage, scanning, and size limits.
  Next step: PDF uploads. Claude can read PDFs directly.

- **2026-11-07 · No login. The reviewer types a name.**
  Next step: SSO, with reviewer and subcontractor roles.

- **2026-11-07 · No Playwright.**
  Why: a Vitest flow test covers the same path at service level in a fraction of the time.
  Next step: one browser test of the main path.

- **2026-11-07 · Drizzle with better-sqlite3, SQL migrations applied at startup.**
  Why: migrations are plain SQL files in git, and nothing extra ships in the Docker image.
  Rejected: Prisma. Its `latest` tag is an 8.0 release candidate where SQLite is experimental. The stable 7.x line needs a config file, a driver adapter, and a 229 MB CLI plus a native engine inside the image.

- **2026-11-07 · SQLite.**
  Why: zero setup for whoever runs the demo. The database is one file on a volume.
  Rejected for now: Postgres. The README covers the path to it.

- **2026-11-07 · npm.**
  Why: it ships with Node, and it was verified with better-sqlite3 inside Docker.
  Rejected: pnpm, because it blocks native install scripts by default.

- **2026-11-07 · Docker on Debian bookworm, non-root, data on a named volume.**
  Why: the better-sqlite3 prebuilt binary needs glibc 2.34 or newer. The full image has the build tools npm expects at install.
  Rejected: alpine.

- **2026-11-07 · No streaming.**
  Why: the result is a structured note, not a chat. A short wait with a clear pending state is fine, and saved runs give an audit trail.

## Pending

- **Default model.** The eval at step 10 compares Haiku 4.5, Sonnet 5, and Opus 5. The owner picks from the numbers. Until then the default is `claude-opus-5`.
