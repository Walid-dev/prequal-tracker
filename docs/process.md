# Process

How this was built with AI agents: how it was planned, steered, and verified. The build used Claude Code. I made the decisions and approved each gate.

## Time log

The work can pause between gates and resume later, so this log records active time, not clock times. Planning is reported separately from the build.

| Phase | Active time |
| --- | --- |
| Planning (requirements, research, plan v0 to v3) | about 2 h, over two sessions |
| Build, gate 1: plan | about 15 min |
| Build, gate 2: core app | |
| Build, gate 3: AI module | |
| Build, gate 4: proof and docs | |
| Independent review | |

## How it was planned

1. **Gather the context.** I collected the requirements and a first draft plan from another AI model. I asked Claude Code for an honest review of that draft instead of running it.
2. **Research before deciding.** A research workflow read the real published packages (Next.js, AI SDK, Prisma, Drizzle) instead of trusting memory. A critic agent then stress-tested the design.
3. **Rewrite when the facts change.** With the full requirements gathered, the plan was rewritten around their core pattern (v2). Three outside AI reviews were weighed point by point, and their factual claims were checked against sources.
4. **Lock and sequence.** Decisions were locked (v3), and an execution plan set out every commit with its files, its check, and its message.

`docs/PLAN.md` shows how the plan evolved from v0 to v3.

## How the agent was steered

- `CLAUDE.md` holds the project rules: pinned versions, current API notes, architecture boundaries, code style, and Docker safety.
- The build runs in 4 gates. At each gate I read the diffs and the commit messages before anything is committed.
- Paid model calls need my OK and a cost quote first.
- A second AI model reviews the finished repo before it's shared.

## How the work is verified

- Before every commit: lint, typecheck, and tests.
- Each step has a check written so it can fail. See the execution plan.
- The AI feature has an eval with labels committed before the first live run.

## How AI output was verified

Every plan, claim, and change the AI produced was checked before it was kept. A few examples:

- **Library versions were checked, not assumed.** A first draft from another AI model used AI SDK 4 calls (`maxSteps`, `toDataStreamResponse()`) that no longer exist in version 7. Reading the published type files caught it before any code was written. `CLAUDE.md` now lists the current calls.
- **Package tags were checked.** `npm install prisma` resolves to an 8.0 release candidate where SQLite is experimental. That finding led to Drizzle.
- **Outside claims were source-checked.** Two claims from AI reviews, a company founding year and a "standard" insurance limit, had no source behind them and were left out.

## Transcript excerpts

Added at the end of the build.
