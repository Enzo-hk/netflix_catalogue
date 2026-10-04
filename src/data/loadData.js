// Loads the clean data table produced by scripts/preprocess.js (run `npm run preprocess` first).
// Each title has: show_id, type, title, directors[], cast[], countries[], main_country,
// date_added, year_added, release_year, rating, age_group, genre_families[], is_international,
// duration_minutes, seasons, imdb_score, imdb_votes, budget, revenue, production_country_count, cast_size.

import * as d3 from "d3";

export async function loadNetflixData() {
    return d3.json("/data/preprocessed/titles.json");
}
