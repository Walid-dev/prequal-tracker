// Health check for Docker and monitoring: answers ok when the database responds.
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

/** Returns 200 {"ok":true} when a trivial query works, or 503 {"ok":false} when it doesn't. */
export function GET() {
  try {
    getDb().run(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("health check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
