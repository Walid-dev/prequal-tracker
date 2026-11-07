# Review findings

Reviewed the working tree against [the brief](brief.md), including the README, design page, application code, tests, evaluation, migrations, Docker, and CI. Findings: **1 high, 5 medium, 1 low**. Recommendation: request changes.

Review confidence: **92%**. Ship confidence: **60%**. The workflow and AI findings below were reproduced with in-memory SQLite databases and mock models using the installed dependencies. The production build remains unverified because this environment blocks Turbopack's local worker port; no live API calls or Docker runtime checks were performed.

## Checks

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed. |
| `npm run lint` | Passed; 51 files checked. |
| `npm run typecheck` | Passed. |
| `npm test` | Passed; 38 tests across 9 files. |
| `npm run eval` | Passed; 8/8 mock cases, $0.0000. |
| `npm run db:check` | Passed. |
| `npm run build` | Attempted twice, including with escalated permissions. Both stopped at Turbopack's CSS worker with `binding to a port: Operation not permitted`. This is an environment limitation, not evidence of a repository defect. |

Checks ran with `AI_MODE=mock`; builds additionally used `DATABASE_PATH=:memory:` and `SEED_DEMO_DATA=false`. The initial sandboxed eval launcher could not create its IPC socket; both the direct runner and the subsequently retried npm command passed. No paid eval was run. Reproduction scripts ran from standard input and did not add test files.

## R1 · high · A stale review accepts an answer the reviewer never saw

**Where:** [src/domain/requests.ts:102](../../src/domain/requests.ts#L102), [src/domain/requests.ts:123](../../src/domain/requests.ts#L123); [src/app/requests/actions.ts:65](../../src/app/requests/actions.ts#L65).

```ts
        requestId,
        responseId: latest.id,
        triageRunId: run?.responseId === latest.id ? run.id : null,
        action: input.action,
```

**What is wrong:** The review form submits no response ID, and `reviewRequest` selects whichever answer is latest when the submission arrives. If response B replaces response A while A's review page is open, submitting that page records the decision against B. An A-specific triage run is silently discarded instead of causing the stale submission to fail.

**Why it matters:** A reviewer can accept an unseen replacement answer, including one correcting a previously valid certificate to say it has expired. The audit trail then states that B was reviewed, and the accepted request refuses further answers.

**Suggested fix:** Include the displayed response ID in the review input and compare it with the latest response inside the existing transaction; reject a mismatch and require a refresh. Add a regression case that loads A, submits B, then attempts to review A, both with and without triage.

**Concept:** Optimistic concurrency control checks that the record a user saw is still current when their decision is saved.

**Checked:** Reproduced A → triage A → load detail → submit B → accept using A's triage ID. The stored review had `responseId: 2`, `triageRunId: null`, and status `accepted`; the transaction protects the writes but does not validate the displayed version. **Confidence: 100%.**

## R2 · medium · An error finish reason is saved as a successful triage

**Where:** [src/ai/triage/triage.ts:126](../../src/ai/triage/triage.ts#L126); [src/domain/triage.ts:76](../../src/domain/triage.ts#L76).

```ts
  if (raw === "refusal")
    return "The model declined to answer. Review this answer by hand.";
  if (reason === "length")
    return "The model's answer was cut off at its length limit. Review this answer by hand.";
  if (reason === "content-filter")
    return "A content filter stopped the answer. Review this answer by hand.";
  return undefined;
```

**What is wrong:** `finishProblem` treats every finish outside its three checks as normal, including `error` and `other`. With schema-valid JSON, the installed AI SDK returns that output, and this code returns `ok: true`.

**Why it matters:** A failed generation can be persisted and displayed as a valid, complete assessment with no error, violating the requirement that every failed call becomes a failed run.

**Suggested fix:** Accept only the expected normal finish reason (`stop`) and fail closed for other reasons. Add mock-model tests for valid JSON accompanied by an error or unknown finish, including assertions on the persisted run.

**Concept:** Fail-closed validation requires a known success condition rather than assuming everything outside a short error list succeeded.

**Checked:** Passed valid JSON with `finishReason: { unified: "error", raw: "error" }` through `triageLatestAnswer`; the saved row had `status: "ok"`, `completeness: "complete"`, and `error: null`. Existing tests cover a thrown provider error, which takes a different path; the README/design claim of covering every failure path is therefore too broad. **Confidence: 100%.**

## R3 · medium · A partially read answer can receive a complete assessment

**Where:** [src/ai/triage/prompt.ts:66](../../src/ai/triage/prompt.ts#L66), [src/ai/triage/triage.ts:99](../../src/ai/triage/triage.ts#L99).

```ts
  const truncated = answer.length > MAX_ANSWER_CHARS;
  const body = truncated ? answer.slice(0, MAX_ANSWER_CHARS) : answer;
  return { text: `<answer>\n${body}\n</answer>`, truncated };
```

**What is wrong:** Answers may contain 20,000 characters, but only the first 8,000 reach the model. `message.truncated` is recorded as metadata and never constrains completeness, so a result based on the prefix can remain `complete` for the entire answer.

**Why it matters:** A correction, expiry date, or qualification in the omitted tail is never evaluated. The reviewer receives a green completeness rating even though the model did not read the contradictory material.

**Suggested fix:** Process the full accepted answer or prevent truncated input from receiving a complete rating, with a clear rule note requiring review of the remainder. Add a boundary test with a disqualifying statement after character 8,000.

**Concept:** Lossy input processing needs an explicit uncertainty result when omitted content could change the decision.

**Checked:** An 8,745-character answer ended with a statement that the clearance expired on `2026-10-31`. The captured model prompt omitted that statement, while `runTriage` returned `ok: true`, `inputTruncated: true`, `complete`, and no rule notes. The panel's truncation metadata discloses the cut but does not correct the rating; running rules on the full text cannot recover a date absent from the extracted facts. **Confidence: 100%.**

## R4 · medium · The expiry rule reintroduces an ungrounded quote

**Where:** [src/ai/triage/rules.ts:78](../../src/ai/triage/rules.ts#L78).

```ts
  if (expiry && facts.expiryDate && facts.expiryDate < today) {
    if (!hasFlag("expired")) {
      flags.push({ code: "expired", quote: facts.expiryDate, byRule: true });
    }
```

**What is wrong:** Quote grounding runs only on the model's initial flags. The expiry rule subsequently trusts the model's extracted date and adds it as a quote without checking its source. It can even recreate an expired flag that the preceding grounding check just dropped.

**Why it matters:** A hallucinated date becomes an apparently code-verified expiry warning and a follow-up demanding a replacement document, even when the answer states a future expiry. The final result violates the promise that flag quotes are supported by the answer.

**Suggested fix:** Require source evidence for extracted dates and validate that evidence before using the date in a rule-generated flag or question. Preserve the source wording separately from the normalized date so human-readable dates remain supported.

**Concept:** Provenance validation must apply to derived evidence as well as the original model output.

**Checked:** Used an answer containing only `2027-08-31`, with the model claiming `2026-10-31` in both facts and an expired flag. The initial flag was dropped, then the same unsupported date reappeared in an `expired` flag marked `byRule: true` and in a follow-up question. **Confidence: 100%.**

## R5 · medium · An invalid expiry date is removed while complete is retained

**Where:** [src/ai/triage/rules.ts:72](../../src/ai/triage/rules.ts#L72); [src/ai/triage/rules.test.ts:82](../../src/ai/triage/rules.test.ts#L82).

```ts
  if (facts.expiryDate && !expiry) {
    notes.push(
      `Ignored an expiry date that isn't a real YYYY-MM-DD date: "${facts.expiryDate}".`,
    );
    facts.expiryDate = null;
  }
```

**What is wrong:** When a supplied expiry fails calendar validation, the rule clears the fact but keeps the model's completeness. An answer whose only expiry is `2026-02-31` can therefore finish as complete, with no flag or follow-up question.

**Why it matters:** The code has established that the required date is unusable, yet the final rating still says all requirements are satisfied. The current unit test explicitly expects this incorrect complete rating, so it protects the failure rather than detecting it.

**Suggested fix:** Cap completeness at partial when a supplied expiry is invalid and add a grounded warning or question requesting a real date. Update the existing test to assert the stricter result and cover malformed date strings as well as impossible calendar dates.

**Concept:** Semantic validation must affect the decision when it invalidates evidence required for that decision.

**Checked:** A complete model output with `expiryDate: "2026-02-31"` and matching answer text returned `facts.expiryDate: null`, `complete`, no flags, and no questions. The rule note acknowledges the bad date but does not change that result. **Confidence: 99%.**

## R6 · medium · The flag limit can erase rule-generated safety warnings

**Where:** [src/ai/triage/rules.ts:133](../../src/ai/triage/rules.ts#L133).

```ts
    flags: unique.slice(0, MAX_FLAGS),
```

**What is wrong:** Rule-generated expiry and suspicious-instruction flags are appended after the model flags, then the combined list is cut to eight. Eight distinct grounded model flags consume every slot, removing the warnings added by code.

**Why it matters:** A known expired document can lose its entire visible expiry warning. When completeness is already partial and a follow-up already exists, the expiry branch adds neither a rule note nor an expiry question, so the reviewer receives no indication that code detected expiry.

**Suggested fix:** Reserve space for rule-generated warnings or prioritize them before applying the display limit. Add a test with eight grounded model flags and an expired date, plus a corresponding suspicious-instruction case.

**Concept:** Priority-aware truncation preserves critical warnings when a bounded list contains information of different importance.

**Checked:** Reproduced with eight distinct grounded flags, partial completeness, an expiry of `2026-10-31`, and one existing generic question. The returned result had eight model flags, no expired flag, no rule notes, and only the generic question; schema validation imposes no smaller flag-array limit. **Confidence: 100%.**

## R7 · low · The seed command ignores the local database configuration

**Where:** [package.json:18](../../package.json#L18); [scripts/seed.ts:6](../../scripts/seed.ts#L6).

```json
    "seed": "tsx scripts/seed.ts",
```

**What is wrong:** The seed command never loads `.env.local`, whereas the Next.js app does. Setting the documented `DATABASE_PATH` only in that file makes seeding and the app use different databases.

**Why it matters:** Following the local setup instructions with a customized database path reports successful seeding, but the app opens an empty database and shows no demo cases; the seed data was written to the default path instead.

**Suggested fix:** Load `.env.local` before opening the seed database, using an environment-file option or explicit environment loading. Verify that the seed command and Next.js resolve the same customized path.

**Concept:** Configuration drift occurs when tools operating on the same data load different settings.

**Checked:** Traced `npm run seed` through `scripts/seed.ts` and `getDb`; none loads an environment file, and `getDb` falls back to `./data/app.db`. The live eval script explicitly loads `.env.local`, confirming that this behavior is not supplied globally by npm or tsx; the local secret file was not read. **Confidence: 99%.**

## Areas without additional findings

- **Workflow and data integrity:** No additional findings. Acceptance without a response and submissions after acceptance are rejected in domain code. Production status updates are confined to `src/domain`; response, triage-run, and review writes are insert-only. Case creation, answer/status writes, and review/status writes use transactions.
- **Security:** No additional findings in server-action payload schemas, rendering, committed credentials, or Docker secret exclusions. The answer is sent as user data, the model receives no tools, and React renders submitted/model text without raw HTML insertion. Prompt-injection handling remains heuristic; no live robustness claim was tested.
- **Architecture and cost controls:** No additional findings. The AI directory has no direct database/domain imports, completeness caps never raise the model's rating, mock mode is the default, and the reviewed tests/CI do not call a paid API.
- **Tests and docs:** No additional findings beyond the regression gaps and overbroad failure-coverage claim described above. The documented test count and eval totals agree with the repository; the historical live results were inspected, not rerun.
- **Docker and CI:** No additional findings from static review of the default configuration. Docker execution and a successful production build remain unverified for the reasons recorded under Checks.

External work trackers and the skill's unrelated multi-repository map were not applicable to this repository-wide local brief. Only this findings file was added; pre-existing working-tree changes were preserved.

## Resolution

All seven findings were reproduced and fixed on the `fix/review` branch. Each fix comes with a test that fails without it.

| ID | Fix | Commit | Test |
| --- | --- | --- | --- |
| R1 | The review form sends the answer it showed. The service refuses the decision if a newer answer arrived. | `508d380` | `src/domain/requests.test.ts`: "refuses a decision on an answer that is no longer the latest" |
| R2 | Only a normal stop counts as a result. Any other finish becomes a failed run. | `a7872a7` | `src/ai/triage/triage.test.ts`: "fails closed when the call ends with an error or an unknown reason" |
| R3 | Answers are sent up to the form's 20,000-character limit. A cut answer is capped at partial. | `a7872a7` | `src/ai/triage/triage.test.ts`: "caps an answer too long to send in full at partial" |
| R4 | The model returns the exact words behind the expiry date (prompt `triage-v2`). A date counts only when those words are in the answer. | `a7872a7` | `src/ai/triage/rules.test.ts`: "ignores an expiry date whose words are not in the answer" |
| R5 | An invalid or unsupported expiry date caps the result at partial and asks for a real date. | `a7872a7` | `src/ai/triage/rules.test.ts`: "caps an answer at partial when the expiry date isn't a real date" |
| R6 | Rule flags come before model flags, so the flag cap never removes them. | `a7872a7` | `src/ai/triage/rules.test.ts`: "keeps rule flags when the model already returned the maximum number of flags" |
| R7 | The seed command loads `.env.local` when it exists. | `360d628` | Checked by running the command with and without the file. |

After the fixes: lint, typecheck, 46 tests, and the mock eval (8 of 8) pass.
