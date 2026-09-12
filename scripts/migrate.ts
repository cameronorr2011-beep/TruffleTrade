import { getDb } from "../core/db";

const db = getDb();
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
  .all() as { name: string }[];
console.log(
  `[migrate] ledger ready at ${process.env.SQLITE_PATH ?? "data/truffletrade.sqlite3"} — tables: ${tables.map((t) => t.name).join(", ")}`,
);
