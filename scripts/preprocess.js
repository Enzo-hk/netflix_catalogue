// Runs the data pipeline on the default dataset (Netflix) and writes the clean data table.
//
//   npm run preprocess        (also run automatically before `npm run dev`)
//
// Reads  public/data/raw/*.csv
// Writes public/data/preprocessed/titles.json   (array of titles, used by every view)
//        public/data/preprocessed/summary.json  (pipeline report: rejected rows, join match rates, counts)
//
// The pipeline itself (validate, clean, join, derive, pre-classify) is in src/data/pipeline.js:
// the browser uses the same code when the user imports another dataset.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { runPipeline } from "../src/data/pipeline.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "public/data/raw");
const OUT = join(ROOT, "public/data/preprocessed");

const readCsv = (file) => parse(readFileSync(join(RAW, file)), { columns: true, skip_empty_lines: true, trim: true });

const { titles, report } = runPipeline({
    catalogue: readCsv("netflix_titles.csv"),
    imdbScores: readCsv("Netflix TV Shows and Movies.csv"),
    imdbMovies: readCsv("imdb_movies.csv"),
    source: "netflix_titles.csv",
});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "titles.json"), JSON.stringify(titles));
writeFileSync(join(OUT, "summary.json"), JSON.stringify(report, null, 2));

console.log(`${titles.length} titles -> ${join("public/data/preprocessed", "titles.json")}`);
console.log(JSON.stringify({ rejected: report.rejected, ...report.join }, null, 2));
