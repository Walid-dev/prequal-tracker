// Runs once when the server starts: brings the database up to date and, when asked, adds the demo cases.
export async function register() {
  // The edge runtime can't open files, so this only runs in the Node.js server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./db/client");
  const { runMigrations } = await import("./db/migrate");
  const db = getDb();
  runMigrations(db);
  if (process.env.SEED_DEMO_DATA === "true") {
    const { seedDemoData } = await import("./domain/seed");
    seedDemoData(db);
  }
}
