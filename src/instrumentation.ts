// Runs once when the server starts: brings the database up to date before the first request.
export async function register() {
  // The edge runtime can't open files, so this only runs in the Node.js server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./db/client");
  const { runMigrations } = await import("./db/migrate");
  runMigrations(getDb());
}
