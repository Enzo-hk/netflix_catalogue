// Data pipeline, step (1) "data transformation": raw CSV files -> one clean data table (1 row per title).
//
//   npm run preprocess
//
// Reads  public/data/raw/*.csv
// Writes public/data/preprocessed/titles.json   (array of titles, used by every view)
//        public/data/preprocessed/summary.json  (counts, join match rates, category orders)
//
// Steps: 1. clean  2. join (IMDb scores + IMDb movies)  3. derive  4. pre-classify.
// Filtering and aggregation are NOT done here: they happen in the browser (d3.rollup),
// so that every view can react to the shared filters.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "public/data/raw");
const OUT = join(ROOT, "public/data/preprocessed");

// ---------------------------------------------------------------------------
// Pre-classification tables
// ---------------------------------------------------------------------------

// 14 rating codes -> 4 ordered age groups (users think "who can watch this?", not "TV-Y7-FV")
export const AGE_GROUPS = ["Kids", "Older Kids", "Teens", "Adults", "Unrated"];
const AGE_GROUP = {
    "TV-Y": "Kids", "TV-G": "Kids", "G": "Kids",
    "TV-Y7": "Older Kids", "TV-Y7-FV": "Older Kids", "TV-PG": "Older Kids", "PG": "Older Kids",
    "TV-14": "Teens", "PG-13": "Teens",
    "TV-MA": "Adults", "R": "Adults", "NC-17": "Adults",
    "NR": "Unrated", "UR": "Unrated",
};

// 42 Netflix tags -> 21 genre families. Netflix names the same genre differently for movies
// and TV shows ("Dramas" vs "TV Dramas"); without this step the two types can't be compared.
const GENRE_FAMILY = {
    "Dramas": "Drama", "TV Dramas": "Drama",
    "Comedies": "Comedy", "TV Comedies": "Comedy",
    "Stand-Up Comedy": "Stand-Up & Talk", "Stand-Up Comedy & Talk Shows": "Stand-Up & Talk",
    "Action & Adventure": "Action & Adventure", "TV Action & Adventure": "Action & Adventure",
    "Thrillers": "Thriller & Mystery", "TV Thrillers": "Thriller & Mystery", "TV Mysteries": "Thriller & Mystery",
    "Crime TV Shows": "Crime",
    "Horror Movies": "Horror", "TV Horror": "Horror",
    "Romantic Movies": "Romance", "Romantic TV Shows": "Romance",
    "Sci-Fi & Fantasy": "Sci-Fi & Fantasy", "TV Sci-Fi & Fantasy": "Sci-Fi & Fantasy",
    "Documentaries": "Documentary", "Docuseries": "Documentary", "Science & Nature TV": "Documentary",
    "Children & Family Movies": "Kids & Family", "Kids' TV": "Kids & Family",
    "Teen TV Shows": "Teen",
    "Anime Features": "Anime", "Anime Series": "Anime",
    "Reality TV": "Reality",
    "Music & Musicals": "Music",
    "Sports Movies": "Sports",
    "Classic Movies": "Classic & Cult", "Cult Movies": "Classic & Cult", "Classic & Cult TV": "Classic & Cult",
    "Independent Movies": "Independent",
    "LGBTQ Movies": "LGBTQ",
    "Faith & Spirituality": "Faith & Spirituality",
};
// These tags say *where* a title comes from, not *what* it is: kept as a flag, not as a genre.
const REGION_TAGS = new Set(["International Movies", "International TV Shows", "British TV Shows",
    "Korean TV Shows", "Spanish-Language TV Shows"]);
const GENERIC_TAGS = new Set(["Movies", "TV Shows"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const readCsv = (file) => parse(readFileSync(join(RAW, file)), { columns: true, skip_empty_lines: true, trim: true });

const splitList = (value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);

const toNumber = (value) => {
    const n = Number(value);
    return value === "" || value == null || Number.isNaN(n) ? null : n;
};

// "Blood & Water" and "blood and water!" must give the same key
const normaliseTitle = (title) => title
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // remove accents
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const MONTHS = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6,
    August: 7, September: 8, October: 9, November: 10, December: 11 };

// "September 25, 2021" -> "2021-09-25" (parsed by hand: Date() parsing of this format is not portable)
function parseNetflixDate(value) {
    const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(value.trim());  // some dates are quoted with a leading space
    if (!m || !(m[1] in MONTHS)) return null;
    return `${m[3]}-${String(MONTHS[m[1]] + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// Index rows by "key|year" so that a title can be looked up with a ±1 year tolerance
function buildIndex(rows, keyOf, yearOf, better) {
    const index = new Map();
    for (const row of rows) {
        const year = yearOf(row);
        if (year == null) continue;
        for (const key of keyOf(row)) {
            const id = `${key}|${year}`;
            const current = index.get(id);
            if (!current || better(row, current)) index.set(id, row);
        }
    }
    return index;
}

function lookup(index, key, year) {
    for (const y of [year, year - 1, year + 1]) {
        const hit = index.get(`${key}|${y}`);
        if (hit) return hit;
    }
    return null;
}

// ---------------------------------------------------------------------------
// 1. Clean
// ---------------------------------------------------------------------------

function clean(row) {
    let { rating, duration } = row;
    // 3 titles have their duration shifted into the rating column ("74 min")
    if (/\bmin\b/.test(rating)) {
        duration = rating;
        rating = "";
    }
    const dateAdded = parseNetflixDate(row.date_added);
    return {
        show_id: row.show_id,
        type: row.type,
        title: row.title,
        directors: splitList(row.director),
        cast: splitList(row.cast),
        countries: splitList(row.country),
        date_added: dateAdded,
        year_added: dateAdded ? Number(dateAdded.slice(0, 4)) : null,
        release_year: toNumber(row.release_year),
        rating: rating || "NR",
        duration_minutes: toNumber(/(\d+)\s*min/.exec(duration)?.[1]),
        seasons: toNumber(/(\d+)\s*Season/.exec(duration)?.[1]),
        tags: splitList(row.listed_in),
        description: row.description,
    };
}

// ---------------------------------------------------------------------------
// 2. Join
// ---------------------------------------------------------------------------

function buildScoresIndex() {
    // Netflix IMDb Scores: MOVIE / SHOW, imdb_score, imdb_votes (movies and TV shows)
    const rows = readCsv("Netflix TV Shows and Movies.csv");
    const typeOf = { MOVIE: "Movie", SHOW: "TV Show" };
    const index = buildIndex(
        rows.filter((r) => toNumber(r.imdb_score) != null),
        (r) => [`${normaliseTitle(r.title)}|${typeOf[r.type]}`],
        (r) => toNumber(r.release_year),
        (a, b) => (toNumber(a.imdb_votes) ?? 0) > (toNumber(b.imdb_votes) ?? 0),
    );
    return { index, size: rows.length };
}

// Values with decimals (e.g. 175,269,998.8 repeated 143 times) are imputed estimates
// in this dataset, not real figures: they are treated as missing. 0 also means "unknown".
const realAmount = (value) => {
    const n = toNumber(value);
    return n == null || n <= 0 || !Number.isInteger(n) ? null : n;
};

function buildMoviesIndex() {
    // IMDb Movies: budget_x, revenue (movies only), release date as "MM/DD/YYYY"
    const rows = readCsv("imdb_movies.csv");
    const index = buildIndex(
        rows,
        (r) => [...new Set([normaliseTitle(r.names), normaliseTitle(r.orig_title)])],
        (r) => toNumber(/(\d{4})$/.exec(r.date_x)?.[1]),
        (a, b) => realAmount(a.budget_x) != null && realAmount(b.budget_x) == null,
    );
    return { index, size: rows.length };
}

function joinExternal(title, scores, movies) {
    const key = normaliseTitle(title.title);
    const score = lookup(scores, `${key}|${title.type}`, title.release_year);
    const movie = title.type === "Movie" ? lookup(movies, key, title.release_year) : null;
    return {
        ...title,
        imdb_score: score ? toNumber(score.imdb_score) : null,
        imdb_votes: score ? toNumber(score.imdb_votes) : null,
        budget: movie ? realAmount(movie.budget_x) : null,
        revenue: movie ? realAmount(movie.revenue) : null,
        has_imdb_score: Boolean(score),
        has_imdb_movie: Boolean(movie),
    };
}

// ---------------------------------------------------------------------------
// 3. Derive + 4. Pre-classify
// ---------------------------------------------------------------------------

function derive(title) {
    const genreFamilies = [...new Set(title.tags
        .filter((t) => !REGION_TAGS.has(t) && !GENERIC_TAGS.has(t))
        .map((t) => GENRE_FAMILY[t] ?? t))].sort();
    return {
        ...title,
        main_country: title.countries[0] ?? "Unknown",
        production_country_count: title.countries.length,
        cast_size: title.cast.length,
        age_group: AGE_GROUP[title.rating] ?? "Unrated",
        genre_families: genreFamilies.length ? genreFamilies : ["Other"],
        is_international: title.tags.some((t) => REGION_TAGS.has(t)),
    };
}

// ---------------------------------------------------------------------------

function percent(part, total) {
    return Math.round((1000 * part) / total) / 10;
}

function countBy(items, keyOf) {
    const counts = {};
    for (const item of items) for (const key of [].concat(keyOf(item))) counts[key] = (counts[key] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function main() {
    const scores = buildScoresIndex();
    const movies = buildMoviesIndex();

    const titles = readCsv("netflix_titles.csv")
        .map(clean)
        .map((t) => joinExternal(t, scores.index, movies.index))
        .map(derive);

    const moviesOnly = titles.filter((t) => t.type === "Movie");
    const summary = {
        generated_at: new Date().toISOString(),
        titles: titles.length,
        by_type: countBy(titles, (t) => t.type),
        join: {
            imdb_scores_source_rows: scores.size,
            imdb_movies_source_rows: movies.size,
            with_imdb_score: titles.filter((t) => t.has_imdb_score).length,
            with_imdb_score_pct: percent(titles.filter((t) => t.has_imdb_score).length, titles.length),
            movies_matched_in_imdb_movies: moviesOnly.filter((t) => t.has_imdb_movie).length,
            movies_with_budget: moviesOnly.filter((t) => t.budget != null).length,
            movies_with_revenue: moviesOnly.filter((t) => t.revenue != null).length,
        },
        age_groups: AGE_GROUPS,
        by_age_group: countBy(titles, (t) => t.age_group),
        by_genre_family: countBy(titles, (t) => t.genre_families),
    };

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "titles.json"), JSON.stringify(titles));
    writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

    console.log(`${titles.length} titles -> ${join("public/data/preprocessed", "titles.json")}`);
    console.log(JSON.stringify(summary.join, null, 2));
}

main();
