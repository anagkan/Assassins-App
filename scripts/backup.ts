/**
 * Online, consistent SQLite backup (safe while the app is running).
 *   node scripts/backup.cjs <destination-file>
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const dest = process.argv[2];
if (!dest) {
  console.error("Usage: backup <destination-file>");
  process.exit(1);
}
const src = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "assassins.db");
fs.mkdirSync(path.dirname(dest), { recursive: true });
new Database(src, { readonly: true, fileMustExist: true })
  .backup(dest)
  .then(() => console.log(`Backed up ${src} -> ${dest}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
