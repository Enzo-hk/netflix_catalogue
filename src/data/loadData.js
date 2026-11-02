// Loads the clean data table produced by scripts/preprocess.js (run `npm run preprocess` first).
// Each title has: show_id, type, title, directors[], cast[], countries[], main_country,
// date_added, year_added, release_year, rating, age_group, genre_families[], is_international,
// duration_minutes, seasons, imdb_score, imdb_votes, budget, revenue, production_country_count, cast_size.

import * as d3 from "d3";
import { runPipeline } from "./pipeline.js";

export async function loadNetflixData() {
    return d3.json("/data/preprocessed/titles.json");
}

// The IMDb datasets used by the join step, loaded once when the first file is imported
let externalData;
function loadExternalData() {
    externalData ??= Promise.all([
        d3.csv(encodeURI("/data/raw/Netflix TV Shows and Movies.csv")),
        d3.csv("/data/raw/imdb_movies.csv"),
    ]);
    return externalData;
}

// Import of a CSV chosen by the user: it goes through the same pipeline as the default dataset
// (validate, clean, join IMDb, derive, pre-classify). Returns { titles, report }.
export async function importCatalogue(file) {
    const text = (await file.text()).replace(/^﻿/, ""); // remove the BOM added by Excel
    const catalogue = d3.csvParse(text);
    if (!catalogue.length) throw new Error("The file is empty");
    const [imdbScores, imdbMovies] = await loadExternalData();
    return runPipeline({ catalogue, imdbScores, imdbMovies, source: file.name });
}
