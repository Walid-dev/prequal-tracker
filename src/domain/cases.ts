// Cases: open one for a subcontractor (with its checklist), list them with progress, and read one.
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  type CaseRow,
  cases,
  type RequestRow,
  requests,
  TRADES,
} from "@/db/schema";
import { checklistFor } from "./checklists";

export const NewCaseSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, { error: "Enter the company's legal name." })
    .max(120, { error: "Keep the name under 120 characters." }),
  trade: z.enum(TRADES, { error: "Pick a trade." }),
  contactEmail: z.email({ error: "Enter a valid email address." }),
  owner: z
    .string()
    .trim()
    .min(2, { error: "Enter the reviewer's name." })
    .max(80, { error: "Keep the name under 80 characters." }),
});

export type NewCase = z.infer<typeof NewCaseSchema>;

export type CaseSummary = CaseRow & {
  total: number;
  accepted: number;
  blocked: number;
};

/** Creates a case and its checklist requests in one transaction. Returns the new case id. */
export function createCase(db: Db, input: NewCase): number {
  return db.transaction((tx) => {
    const created = tx
      .insert(cases)
      .values(input)
      .returning({ id: cases.id })
      .get();
    const items = checklistFor(input.trade).map((item) => ({
      ...item,
      caseId: created.id,
    }));
    tx.insert(requests).values(items).run();
    return created.id;
  });
}

/** Lists every case, newest first, with how many requests are accepted and how many wait on changes. */
export function listCases(db: Db): CaseSummary[] {
  return db
    .select({
      id: cases.id,
      companyName: cases.companyName,
      trade: cases.trade,
      contactEmail: cases.contactEmail,
      owner: cases.owner,
      createdAt: cases.createdAt,
      total: sql<number>`count(${requests.id})`,
      accepted: sql<number>`coalesce(sum(${requests.status} = 'accepted'), 0)`,
      blocked: sql<number>`coalesce(sum(${requests.status} = 'changes_requested'), 0)`,
    })
    .from(cases)
    .leftJoin(requests, eq(requests.caseId, cases.id))
    .groupBy(cases.id)
    .orderBy(desc(cases.createdAt), desc(cases.id))
    .all();
}

/** Returns one case with its requests in checklist order, or undefined if it doesn't exist. */
export function getCase(
  db: Db,
  id: number,
): { case: CaseRow; requests: RequestRow[] } | undefined {
  const found = db.select().from(cases).where(eq(cases.id, id)).get();
  if (!found) return undefined;
  const items = db
    .select()
    .from(requests)
    .where(eq(requests.caseId, id))
    .orderBy(asc(requests.id))
    .all();
  return { case: found, requests: items };
}
