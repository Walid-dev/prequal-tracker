# Review findings

## Follow-up, 2026-11-07 · `c750aec`

**Not all resolved.** R1, R2, R3, R5, and R7 are addressed. R4 and R6 remain partly fixed; two new low-severity findings are below. Recommendation: request changes. Review confidence: **95%**; ship confidence: **70%**. The fixes were traced through their callers and checked with mock models and in-memory SQLite; the remaining guardrail failures were reproduced independently.

Install, lint, typecheck, **46 tests**, migration check, and the mock eval (**8/8**, $0) passed. The eval was run directly with `node --import tsx evals/run.ts`. The build still encounters the environment's Turbopack worker-port restriction. No paid calls or application-database writes were made.

### R4 · medium · Standing: the quoted date need not match the extracted date

**Where:** [src/ai/triage/rules.ts:82](../../src/ai/triage/rules.ts#L82).

```ts
    } else if (!inAnswer(facts.expiryQuote)) {
```

**What is wrong:** The new check proves the quote exists, but never checks that it states `expiryDate`.

**Why it matters:** Answer and quote `Expires 2026-10-31`, combined with a model-extracted date of `2027-08-31`, produce `complete` with no flags or rule notes. Reversing the dates produces a false expired warning quoting the future date.

**Suggested fix:** Parse the date supported by the source quote and compare it with the extracted date; cap at partial when they disagree or the relationship cannot be verified. Test both mismatch directions.

**Concept:** Evidence must support the claimed value, not merely appear in the source.

**Checked:** Reproduced both directions through `applyRules`, and the false complete result through `runTriage` with schema-valid mock output. The existing R4 test covers an absent quote only. **Confidence: 100%.**

### R6 · medium · Standing: an existing model warning bypasses priority handling

**Where:** [src/ai/triage/rules.ts:92](../../src/ai/triage/rules.ts#L92), [src/ai/triage/rules.ts:110](../../src/ai/triage/rules.ts#L110), [src/ai/triage/rules.ts:146](../../src/ai/triage/rules.ts#L146).

```ts
      if (!grounded.some((flag) => flag.code === "expired")) {
```

**What is wrong:** A grounded model warning prevents creation of its priority rule flag, even when that model warning is beyond the eight-item limit. The same condition exists for suspicious instructions.

**Why it matters:** Eight ordinary flags followed by an expired or suspicious-instruction flag still lose the safety warning. With partial completeness and an existing generic question, both reproduced cases also have no corresponding rule note.

**Suggested fix:** Prioritize warnings confirmed by rules even when the model already supplied them. Test both safety codes in the ninth model-flag position.

**Concept:** Deduplication must preserve priority across the final bounded list.

**Checked:** Independently reproduced expiry and steering cases; each lost its warning and returned no rule notes. The new test covers only a warning absent from the model output. **Confidence: 100%.**

### R8 · low · New: the truncation integration test passes for the wrong reason

**Where:** [src/ai/triage/triage.test.ts:163](../../src/ai/triage/triage.test.ts#L163).

```ts
    const complete = JSON.stringify({
      ...JSON.parse(VALID),
      completeness: "complete",
      flags: [],
    });
```

**What is wrong:** The synthetic answer omits the expiry quote inherited from `VALID`. Unsupported expiry therefore lowers the result to partial independently of truncation.

**Why it matters:** Removing the truncation argument passed to `applyRules` leaves this integration test passing. R3's implementation is fixed, but this test does not protect that wiring.

**Suggested fix:** Use null expiry facts or a quote actually present in the synthetic answer, and assert the truncation rule note.

**Concept:** A false-positive test reaches the expected result through an unrelated branch.

**Checked:** Applied the exact fixture with truncation explicitly false; it still returned partial because the expiry quote was unsupported. Separately verified the actual truncation fix with neutral facts. **Confidence: 100%.**

### R9 · low · New: the documented live eval command uses a rejected model ID

**Where:** [README.md:105](../../README.md#L105); [src/ai/triage/model.ts:35](../../src/ai/triage/model.ts#L35).

```bash
npm run eval:live -- --models=claude-sonnet-5 --runs=2 --out=docs/eval/report.md   # paid
```

**What is wrong:** The new provider registry requires `provider:model`, but this command still overrides the default with an unprefixed ID.

**Why it matters:** Following the README generates failed runs instead of evaluating a model.

**Suggested fix:** Change the example to `--models=anthropic:claude-sonnet-5`.

**Checked:** Called the configuration resolver with the documented ID; it throws the `provider:model` validation error before any network call. The eval runner passes the supplied ID unchanged. **Confidence: 100%.**

## Initial review (historical)

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

**Current status:** Addressed in the follow-up above.

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

**Current status:** Addressed in the follow-up above.

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

**Current status:** Implementation addressed; see R8 for the integration-test gap.

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

**Current status:** Partly fixed; R4 remains standing as described in the follow-up above.

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

**Current status:** Addressed in the follow-up above.

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

**Current status:** Partly fixed; R6 remains standing as described in the follow-up above.

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

**Current status:** Addressed; the command now loads `.env.local` when present. The application database was not reseeded during this follow-up.

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

## Submitted fixes

Fixes for all seven findings were submitted on the `fix/review` branch. The table records those changes and their associated checks; the independent follow-up above identifies which findings are resolved and which remain open.

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

## Follow-up fixes

Fixes for the four follow-up findings, on the same branch. Each new test fails on the code before its fix and passes after it.

| ID | Fix | Commit | Test |
| --- | --- | --- | --- |
| R4 | An expiry date counts only when its quote states that same date. For a range, the latest date in the quote counts. Written dates such as "October 31, 2026" are read too. A mismatch caps the result at partial and asks to confirm the date. | `543f003` | `src/ai/triage/rules.test.ts`: "ignores an expiry date that its quote doesn't state, in both directions (R4)" and "reads a written date in the quote, and uses the latest date of a range (R4)" |
| R6 | A rule always adds its own flag for an expired date or steering wording, even when the model flagged it too, and notes "Confirmed by rule". Rule flags go first, then the model's safety flags, then the rest. The cap never removes a safety warning. | `f8984f5` | `src/ai/triage/rules.test.ts`: "keeps a safety warning the model listed ninth, and notes that the rule confirmed it (R6)" and "puts a model-only safety flag ahead of ordinary flags (R6)" |
| R8 | The truncation test uses neutral facts and checks the truncation note. It fails when the truncation flag is not passed to the rules. | `c329da0` | `src/ai/triage/triage.test.ts`: "caps an answer too long to send in full at partial (R3)" |
| R9 | The README command uses `--models=anthropic:claude-sonnet-5`. | `70b245d` | Checked by hand: the model resolver accepts the new ID and rejects the old one, with no network call. |

After the follow-up fixes: lint, typecheck, 50 tests, the migration check, the mock eval (8 of 8), and the build pass.
