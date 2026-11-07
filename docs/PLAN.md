# Plan

## The problem

A general contractor in Ontario can't let a subcontractor on site until the paperwork is in order. Someone collects the same documents from every electrician, plumber, and HVAC company. They read every answer, and they send it back when something is missing or expired. It's slow, repetitive reading, and a missed expiry date is a real liability.

## What we build

A small request tracker. A reviewer opens a case for a subcontractor, and the app creates the checklist for that trade. The subcontractor answers each request. The reviewer accepts each answer or sends it back with questions.

AI triage helps with the reading. It checks one answer against the request it answers and drafts a note: is it complete, what's wrong (with the exact words it's based on), and what to ask next. Hard rules in code check the note. The reviewer always makes the decision.

### Who uses it

- **Reviewer:** the general contractor's compliance person.
- **Subcontractor:** answers the requests. In this build, the reviewer types the answer on their behalf in a form clearly labeled as the subcontractor's side.

### Checklist per trade

| Request | Trades |
| --- | --- |
| WSIB clearance certificate | All |
| Certificate of commercial general liability insurance | All |
| COR certificate, or a written health and safety program | All |
| ESA Licensed Electrical Contractor number | Electrical |

### Request workflow

`Open` → `Responded` → `Accepted`, or `Changes requested` → `Responded` again.

## Acceptance criteria

Status: all met. Tests, the mock eval, and the Docker checks cover them. Criterion 17 proves itself on the first push to GitHub.

1. A reviewer can create a case with a company name, a trade, a contact email, and an owner.
2. The app creates the checklist for the trade. An electrical case gets 4 requests. Other trades get 3.
3. A response moves a request from `Open` or `Changes requested` to `Responded`.
4. A reviewer can accept a request only when it is `Responded`. The service refuses every other state.
5. A reviewer can request changes on a `Responded` request. A note is required.
6. Each review records the reviewer name, the note, the response, and the triage run the reviewer saw.
7. The case page shows progress (accepted out of total) and lists requests that wait on changes as blockers.
8. The request page shows a timeline of responses, triage runs, and reviews.
9. AI triage returns completeness (`complete`, `partial`, or `insufficient`), a summary, extracted facts, flags with quotes, and follow-up questions.
10. The triage output is validated against a schema. A run that fails validation, times out, or errors is saved as failed, with the error.
11. Rules run after the model:
    - An expiry date before today sets completeness to `partial` at most and adds an `EXPIRED` flag.
    - A flag whose quote is not in the response is dropped and counted.
    - The response is capped at 8,000 characters, and the run records the cut.
12. Rules never raise completeness.
13. Triage never changes a request's status.
14. Each run stores the model, the prompt version, tokens, cost, latency, and the exact input.
15. The app runs with `AI_MODE=mock` and no API key.
16. `docker compose up` starts the app with its data on a named volume. The data survives a restart.
17. CI runs lint, typecheck, tests, the mock eval, and the build on every push.

## Out of scope

These go under "next steps" in the README: document uploads, login and roles, a subcontractor portal with emails, a public API, browser tests, Postgres, multiple companies, and cloud deployment.

## How the plan evolved

- **v0, a first draft from another AI model.** A vendor qualification portal, an agent loop with two tools, streaming, Prisma, one Playwright test, Next.js 15. Kept: the human decides, a mock model for tests, Docker, CI. Changed: the draft used AI SDK 4 calls (`maxSteps`, `toDataStreamResponse`) that don't exist in version 7. `npm install prisma` now installs an 8.0 release candidate. The agent loop called the same tools in the same order every time. Nothing evaluated the AI.
- **v1, the first plan.** A vendor portal for a golf club, one structured call with rules on top, Drizzle, 17 commits, 6 to 10 hours. Research checked every version by reading the published packages.
- **v2, after gathering the full requirements.** The core pattern is request, response, review, and response triage fits it directly, so the AI now checks each answer against its request. The domain moved to construction subcontractor prequalification, with the facts checked against sources. A scope critique cut the build to a slice of about 2.5 hours. Approvals went from 17 to 4 gates.
- **v3, decisions locked.** The Vercel AI SDK, a 3-hour budget of active time with a hard stop at 3.5 hours, and an independent review by a second AI model at the end.

The step-by-step runbook is `docs/tasks/prequal-tracker-execution-plan.html`.
