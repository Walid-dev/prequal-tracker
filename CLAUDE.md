# Prequal Tracker: agent rules

A subcontractor prequalification tracker with AI response triage. Take-home build.

Where things live:
- Spec, acceptance criteria, and how the plan evolved: `docs/PLAN.md`.
- Steps and their status: `docs/tasks/prequal-tracker-execution-plan.html`.
- Decisions: `docs/decisions.md`. Read it before you propose a change.
- Time log and how AI output was verified: `docs/process.md`.

## Stack

Versions are pinned exactly. Do not upgrade them.

- Node 22 and npm.
- Next.js 16.4.5 (App Router), React 19, TypeScript 5.
- Tailwind CSS 4. Biome for lint and format.
- SQLite with Drizzle ORM 0.45.4 and better-sqlite3 13. Use drizzle-kit for migrations.
- Vercel AI SDK: `ai` 7.0.164 and `@ai-sdk/anthropic` 4.x. Zod 4.
- Vitest for tests. tsx for scripts.

## Current API notes

These notes were checked on 2026-11-07 against the published packages. Older examples on the web use APIs that no longer exist.

AI SDK 7:
- Call `generateText` with `output: Output.object({ schema })`. Read `result.output`.
- Use `instructions`, not `system`.
- Do not use `maxSteps`, `experimental_output`, `generateObject`, or `toDataStreamResponse`. They are removed or deprecated.
- Read tokens from `result.usage.inputTokens` and `result.usage.outputTokens`.
- For tests, use `MockLanguageModelV4` from `ai/test`. A result needs `content`, `finishReason: { unified, raw }`, `usage` in the V4 nested shape, and `warnings: []`.

Next.js 16:
- `params` and `searchParams` are Promises. Await them.
- Pages that read the database must render on each request. The root layout sets `export const dynamic = "force-dynamic"`.
- In a server action, call `redirect()` after `revalidatePath()` and outside `try`/`catch`.

Drizzle:
- Open the database lazily with `getDb()`. Never open it at module top level, because `next build` imports route modules.
- `migrate(db, { migrationsFolder })` needs the config argument in 0.45.

## Architecture rules

- `src/ai/triage` is self-contained. It never imports from `src/db` or `src/domain`.
- Only `src/domain` changes a request's status. The triage service inserts triage runs and nothing else.
- Rules after the model can lower completeness. They never raise it.
- `AI_MODE=mock` is the default. Tests and CI never call a paid API.
- Paid model calls need the owner's OK first, with a cost quote.

## Code style

- Start every file with a short header comment in plain words: what the file is for.
- Give every exported function a one-line comment in plain words.
- Write comments about purpose. Do not restate each line.
- Use named exports, kebab-case file names, and strict TypeScript. Do not use `any`.

## Commands

- Run `npm run lint`, `npm run typecheck`, and `npm test` before every commit. All three must pass.
- `npm run eval` runs the eval in mock mode. `npm run eval:live` is paid: run it only with the owner's OK.

## Git

- Use Conventional Commits: `type(scope): summary`.
- Use one branch per gate (`feat/core`, `feat/triage`, `feat/proof`). Merge into `main` with `--no-ff`.
- Run `git status --short` before every commit. The staged files must match the commit.
- Never push. The owner pushes.

## Docker

- Other projects on the same machine may use Docker too.
- Run only `docker compose` commands in this folder.
- Never prune, reset, or remove anything that is not named `prequal-tracker`.

## Secrets

- Keys live in `.env.local` only. Never read it, print it, or commit it.
