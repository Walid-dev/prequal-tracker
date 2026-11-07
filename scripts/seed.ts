// Adds the demo cases to the local database: `npm run seed`. Does nothing if cases already exist.
import { getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seedDemoData } from "@/domain/seed";

const db = getDb();
runMigrations(db);
console.log(
  seedDemoData(db)
    ? "Demo cases added."
    : "Cases already exist, nothing added.",
);
