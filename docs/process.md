# Process

How this was built with AI agents: how it was planned, steered, and verified. The build used Claude Code. I made the decisions and approved each gate.

## Time log

The work can pause between gates and resume later, so this log records active time, not clock times. Planning is reported separately from the build.

| Phase | Active time |
| --- | --- |
| Planning (requirements, research, plan v0 to v3) | about 2 h, over two sessions |
| Research: AI triage best practices (multi-agent, verified) | about 20 min |
| Build, gate 1: plan | about 15 min |
| Build, gate 2: core app | about 30 min |
| Build, gate 3: AI module | about 15 min |
| Build, gate 4: proof and docs | about 40 min |
| Independent review (second model, then fixes) | about 45 min |

## How it was planned

1. **Gather the context.** I collected the requirements and a first draft plan from another AI model. I asked Claude Code for an honest review of that draft instead of running it.
2. **Research before deciding.** A research workflow read the real published packages (Next.js, AI SDK, Prisma, Drizzle) instead of trusting memory. A critic agent then stress-tested the design.
3. **Rewrite when the facts change.** With the full requirements gathered, the plan was rewritten around their core pattern (v2). Three outside AI reviews were weighed point by point, and their factual claims were checked against sources.
4. **Research before the AI module.** A multi-agent research pass checked current guidance on structured output, prompt injection, and grounding. Each claim was challenged by three verifiers. It confirmed the one-call design and changed five details: see `docs/research/ai-triage.md`.
5. **Lock and sequence.** Decisions were locked (v3), and an execution plan set out every commit with its files, its check, and its message.

`docs/PLAN.md` shows how the plan evolved from v0 to v3.

## How the agent was steered

- `CLAUDE.md` holds the project rules: pinned versions, current API notes, architecture boundaries, code style, and Docker safety.
- The build runs in 4 gates. At each gate I read the diffs and the commit messages before anything is committed.
- Paid model calls need my OK and a cost quote first.
- A second AI model (Codex, GPT Sol 6.1) reviews the finished repo before it's shared, against a written brief (`docs/review/brief.md`).

## How the work is verified

- Before every commit: lint, typecheck, and tests.
- Each step has a check written so it can fail. See the execution plan.
- The AI feature has an eval with labels committed before the first live run.

## How AI output was verified

Every plan, claim, and change the AI produced was checked before it was kept. A few examples:

- **Library versions were checked, not assumed.** A first draft from another AI model used AI SDK 4 calls (`maxSteps`, `toDataStreamResponse()`) that no longer exist in version 7. Reading the published type files caught it before any code was written. `CLAUDE.md` now lists the current calls.
- **Package tags were checked.** `npm install prisma` resolves to an 8.0 release candidate where SQLite is experimental. That finding led to Drizzle.
- **Outside claims were source-checked.** Two claims from AI reviews, a company founding year and a "standard" insurance limit, had no source behind them and were left out.
- **A second model reviewed the whole repo.** Codex (GPT Sol 6.1) worked from a written brief and reproduced each finding before reporting it. It reviewed the whole repo, then re-checked each round of fixes. All ten findings were fixed. Each code fix has a test that fails without it. The two command fixes (seed and README) were checked by hand.
- **The model was chosen by measurement.** The eval ran 8 labelled cases twice on three models, with the labels committed first. Sonnet 5 and Haiku 4.5 passed every case. Opus 5 was stricter than the request on one case. Sonnet 5 became the default.
- **Browser checks backed up the unit tests.** A real browser drove every form. It caught a dropdown that lost its value after a validation error, which was fixed in the same step.

## Plan changes during the build

- **Step 2:** no placeholder test. Real tests start in step 3. The page check used the production build's rendered output instead of a dev server.
- **Step 3 to step 6:** the demo seed moved to step 6, because it needs the checklists (step 5) and real answers (step 6).
- **Step 8:** the plan said "Request changes" would open with the AI's questions filled in. The note box is shared with Accept, so a pre-filled note could be saved by mistake. One click now inserts the questions instead.
- **Step 6:** the eight sample answers live in one file, `src/samples/answers.ts`. The demo seed uses them now; the mock model (step 7) and the eval (step 9) will reuse the same texts.

## Steering, in practice

- **Review before running.** The first draft plan from another AI model was reviewed, not executed. The review found outdated SDK calls and a missing evaluation, and the plan was rebuilt.
- **Research before the AI module.** Building waited for a verified research pass on structured output, prompt injection, and grounding. Five design details changed as a result.
- **Gates, not autopilot.** Each gate ended with diffs and commit messages for review, and nothing was committed without a go-ahead. Paid model calls came with a cost quote first.
- **Rules in writing.** `CLAUDE.md` kept the agent on current APIs, clear module boundaries, plain-language comments, and safe commands. Each new lesson became a rule there.
