# Review brief

An independent review of this repository by a second AI model: Codex, with GPT Sol 6.1 at extra high reasoning. The code was written with Claude Code. This brief says what to look at and how to report.

## What the repo is

A subcontractor prequalification tracker. Each case is a checklist of document requests. A subcontractor answers each request, and a reviewer accepts the answer or sends it back. AI triage reads one answer against its request and drafts a note. Rules in code check the note, and the reviewer always decides.

Start with [README.md](../../README.md) and the design page, `docs/tasks/prequal-tracker-design.html`.

## Run the checks

No API key is needed. Everything runs in mock mode.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run eval        # mock mode, free
npm run build
```

Do not run `npm run eval:live`. It calls a paid API.

## What to review

1. **Workflow rules** (`src/domain/requests.ts`): a request can't be accepted without a response, an accepted request takes no new answers, and every status change goes through the domain code.
2. **AI guardrails** (`src/ai/triage`): the rules after the model only make a result stricter, quotes are checked against the answer, expiry dates are checked in code, and every failed call becomes a failed run. Look for any path where a wrong result could look valid.
3. **Security:** prompt injection through an answer, input validation in the server actions, secrets in the repo or the Docker image, and anything rendered unescaped.
4. **Data integrity:** `responses`, `triage_runs`, and `reviews` are insert-only. The triage service never writes a request's status. Multi-step writes use transactions.
5. **Tests:** gaps that matter, and tests that would pass for the wrong reason.
6. **Docs:** claims in the README, the design page, or the eval report that don't match the code.
7. **Docker and CI:** anything that would fail on a fresh machine or in GitHub Actions.

## Rules the code must hold

- `src/ai/triage` never imports from `src/db` or `src/domain`.
- Only `src/domain` changes a request's status.
- Rules after the model can lower completeness, never raise it.
- `AI_MODE=mock` is the default, and tests and CI never call a paid API.

## Deliberately out of scope

Document uploads, login and roles, a subcontractor portal, a public API, browser tests in CI, Postgres, and multiple companies. These are listed as next steps in the README. Don't report them as findings.

## How to report

Write the findings to `docs/review/findings.md`, one entry per finding:

- **ID** (R1, R2, ...) and **severity**: high, medium, or low.
- **Where:** `file:line`.
- **What is wrong:** stated as a fact.
- **Why it matters:** the concrete failure it causes.
- **Suggested fix:** one or two sentences.

Skip style comments unless they hide a bug. If an area has no findings, say so in one line.
