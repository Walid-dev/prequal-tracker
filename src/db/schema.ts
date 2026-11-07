// The database tables, defined once in TypeScript. drizzle-kit turns changes here into SQL migrations.
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const TRADES = [
  "electrical",
  "plumbing",
  "mechanical",
  "hvac",
  "general",
] as const;
export const REQUEST_KINDS = [
  "wsib_clearance",
  "cgl_insurance",
  "safety_program",
  "esa_licence",
] as const;
export const REQUEST_STATUSES = [
  "open",
  "responded",
  "changes_requested",
  "accepted",
] as const;
export const REVIEW_ACTIONS = ["accept", "request_changes"] as const;
export const COMPLETENESS = ["complete", "partial", "insufficient"] as const;
export const AI_MODES = ["mock", "live"] as const;

export type Trade = (typeof TRADES)[number];
export type RequestKind = (typeof REQUEST_KINDS)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export type Completeness = (typeof COMPLETENESS)[number];

/** A "created at" column that the app fills in when a row is inserted. */
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/** One subcontractor being prequalified. */
export const cases = sqliteTable("cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  trade: text("trade", { enum: TRADES }).notNull(),
  contactEmail: text("contact_email").notNull(),
  owner: text("owner").notNull(),
  createdAt: createdAt(),
});

/** One item on a case's checklist, such as "WSIB clearance certificate". */
export const requests = sqliteTable(
  "requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id),
    kind: text("kind", { enum: REQUEST_KINDS }).notNull(),
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    status: text("status", { enum: REQUEST_STATUSES })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("requests_case_idx").on(t.caseId)],
);

/** One answer from the subcontractor. A resubmission is a new row. Rows are never edited. */
export const responses = sqliteTable(
  "responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id")
      .notNull()
      .references(() => requests.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("responses_request_idx").on(t.requestId)],
);

/** One AI triage of one response, kept as an audit record. Rows are never edited. */
export const triageRuns = sqliteTable(
  "triage_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    responseId: integer("response_id")
      .notNull()
      .references(() => responses.id),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    // What the model said, and the final result after the rules. Both are empty when the run failed.
    modelCompleteness: text("model_completeness", { enum: COMPLETENESS }),
    completeness: text("completeness", { enum: COMPLETENESS }),
    result: text("result", { mode: "json" }).$type<unknown>(),
    // The exact text sent to the model, so every run can be explained later.
    input: text("input").notNull(),
    inputTruncated: integer("input_truncated", { mode: "boolean" })
      .notNull()
      .default(false),
    mode: text("mode", { enum: AI_MODES }).notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: real("cost_usd"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("triage_runs_response_idx").on(t.responseId)],
);

/** One reviewer decision on a response. Rows are never edited. */
export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id")
      .notNull()
      .references(() => requests.id),
    responseId: integer("response_id")
      .notNull()
      .references(() => responses.id),
    // The triage run the reviewer saw when deciding, if there was one.
    triageRunId: integer("triage_run_id").references(() => triageRuns.id),
    action: text("action", { enum: REVIEW_ACTIONS }).notNull(),
    reviewer: text("reviewer").notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_request_idx").on(t.requestId)],
);

export type CaseRow = typeof cases.$inferSelect;
export type RequestRow = typeof requests.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type TriageRunRow = typeof triageRuns.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
