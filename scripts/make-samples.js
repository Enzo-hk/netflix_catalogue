// Creates example CSV files to demonstrate "change the dataset" (dataset panel of the app):
//
//   node scripts/make-samples.js
//
//   samples/netflix_until_2020.csv     titles added to Netflix until 2020  -> "Replace dataset…"
//   samples/netflix_update_2021.csv    titles added in 2021                -> "Add update…" on top of the previous one
//   samples/catalogue_with_errors.csv  100 titles with a few broken rows   -> rows rejected by the pipeline validation
//
// The rows are copied from public/data/raw/netflix_titles.csv, unchanged except the broken rows.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "samples");

const rows = parse(readFileSync(join(ROOT, "public/data/raw/netflix_titles.csv")), { columns: true });
const columns = Object.keys(rows[0]);

const quote = (value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const toCsv = (list) => [columns.join(","), ...list.map((row) => columns.map((c) => quote(row[c] ?? "")).join(","))].join("\n");

const yearAdded = (row) => Number(/(\d{4})\s*$/.exec(row.date_added ?? "")?.[1]) || null;

const until2020 = rows.filter((row) => yearAdded(row) !== 2021);
const update2021 = rows.filter((row) => yearAdded(row) === 2021);

const withErrors = rows.slice(0, 100).map((row) => ({ ...row }));
withErrors[3].title = "";               // missing title
withErrors[10].type = "Film";           // unknown type
withErrors[20].release_year = "unknown"; // invalid year
withErrors[30].show_id = "";            // missing id
withErrors.push({ ...withErrors[0] });  // duplicated row (same show_id)

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "netflix_until_2020.csv"), toCsv(until2020));
writeFileSync(join(OUT, "netflix_update_2021.csv"), toCsv(update2021));
writeFileSync(join(OUT, "catalogue_with_errors.csv"), toCsv(withErrors));

console.log(`netflix_until_2020.csv: ${until2020.length} rows`);
console.log(`netflix_update_2021.csv: ${update2021.length} rows`);
console.log(`catalogue_with_errors.csv: ${withErrors.length} rows (4 broken + 1 duplicate)`);
