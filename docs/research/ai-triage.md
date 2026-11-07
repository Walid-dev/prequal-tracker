# Research: AI response triage

Before building the triage module, a multi-agent research pass checked current guidance on the design. Searches covered vendor docs, OWASP, and recent papers. Each claim was challenged by three independent verifiers, and a claim was dropped when two of them refuted it. 24 of 25 checked claims survived. This note lists what was found and what it changed.

## What it confirmed

- **One structured call, no tools.** The task is bounded and its path is fixed, which is the case where a single call beats an agent. Source: [Building effective agents](https://www.anthropic.com/research/building-effective-agents).
- **Prompt injection can't be fully prevented.** Delimiters, spotlighting, and instructions to ignore embedded text lower attack rates on fixed test sets, but adaptive attackers get through. Design for the case where an injection succeeds. Sources: [OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/), [Spotlighting](https://arxiv.org/abs/2403.14720), [adaptive attacks](https://arxiv.org/abs/2510.09023), [instruction hierarchy](https://arxiv.org/abs/2404.13208).
- **A small eval is a regression check, not proof of robustness.** It shows the pipeline handles known cases. It can't show that a motivated attacker fails, or that accuracy holds on unseen answers. Sources: [arXiv 2505.14534](https://arxiv.org/abs/2505.14534), [arXiv 2510.09023](https://arxiv.org/abs/2510.09023).

## What it changed

| Finding | Change in `src/ai/triage` |
| --- | --- |
| Constrained decoding keeps output on-schema in most cases, but every vendor still says to validate in the app. "Always valid, no retries" is marketing. ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs), [Google](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)) | Every answer is validated with Zod. A failure is saved as a failed run. |
| Refusals, cut-offs, and content filters can return output that doesn't match the schema. | `triage.ts` checks how the call ended before reading the result. Each case becomes a failed run that says to review by hand. |
| Vendors don't guarantee the capitalization of enum values. | List values are lowercase, and our check lower-cases the model's values first (`schema.ts`). |
| Keep the schema small and flat. Enforce bounds, lengths, and date logic in code. | Dates come back as text, and code parses them. Lengths and counts are capped in `rules.ts`. |
| A schema makes the model fill every field, so give it a way to say the answer is unusable. | `insufficient` is defined as "can't support a decision; use this instead of guessing". |
| Put the instructions and request details in the system message and the untrusted text in a separate user message. This gives partial separation, not a guarantee. | The answer goes alone in the user message, inside `<answer>` tags. Our rules and the request go in the system instructions. |
| Keyword filters help with logging and review, but they are not a security control. | A phrase check flags steering wording for the reviewer and caps the result at partial. It never blocks the call. |

## Gaps

The verified evidence was thin on eval metrics and said nothing about model choice, cost, or per-run logging. Those parts of the design rest on our own judgment and on the eval's measured numbers, not on this research.
