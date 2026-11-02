// Data pipeline, step (1) "data transformation": raw CSV rows -> one clean data table (1 row per title).
//
// Shared by the Node script (scripts/preprocess.js, default dataset) and by the browser
// (import of a new dataset by the user), so that any data goes through the SAME pipeline.
// No Node or DOM API here: input = arrays of CSV rows (objects with string values).
//
// Steps: 0. validate  1. clean  2. join (IMDb scores + IMDb movies)  3. derive  4. pre-classify.
// Filtering and aggregation are NOT done here: they happen in the browser (d3.rollup),
// so that every view can react to the shared filters.

// Columns every catalogue must have (Kaggle "Netflix Movies and TV Shows" format)
export const REQUIRED_COLUMNS = ["show_id", "type", "title", "director", "cast", "country",
    "date_added", "release_year", "rating", "duration", "listed_in", "description"];

const TYPES = new Set(["Movie", "TV Show"]);

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

const splitList = (value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);

const toNumber = (value) => {
    const n = Number(value);
    return value === "" || value == null || Number.isNaN(n) ? null : n;
};

// every value trimmed, so that files exported by different tools give the same result
const trimRow = (row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim(), typeof value === "string" ? value.trim() : value]));

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
    const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec((value ?? "").trim());  // some dates are quoted with a leading space
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

const percent = (part, total) => (total ? Math.round((1000 * part) / total) / 10 : 0);

function countBy(items, keyOf) {
    const counts = {};
    for (const item of items) for (const key of [].concat(keyOf(item))) counts[key] = (counts[key] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

// ---------------------------------------------------------------------------
// 0. Validate
// ---------------------------------------------------------------------------

export function missingColumns(columns) {
    const present = new Set(columns.map((c) => c.trim()));
    return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}

// reason why a row cannot be used, or null if it is valid
function rejectReason(row) {
    if (!row.show_id) return "missing show_id";
    if (!row.title) return "missing title";
    if (!TYPES.has(row.type)) return "type is not Movie / TV Show";
    if (toNumber(row.release_year) == null) return "invalid release_year";
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

// Netflix IMDb Scores: MOVIE / SHOW, imdb_score, imdb_votes (movies and TV shows)
function buildScoresIndex(rows) {
    const typeOf = { MOVIE: "Movie", SHOW: "TV Show" };
    return buildIndex(
        rows.filter((r) => toNumber(r.imdb_score) != null),
        (r) => [`${normaliseTitle(r.title)}|${typeOf[r.type]}`],
        (r) => toNumber(r.release_year),
        (a, b) => (toNumber(a.imdb_votes) ?? 0) > (toNumber(b.imdb_votes) ?? 0),
    );
}

// Values with decimals (e.g. 175,269,998.8 repeated 143 times) are imputed estimates
// in this dataset, not real figures: they are treated as missing. 0 also means "unknown".
const realAmount = (value) => {
    const n = toNumber(value);
    return n == null || n <= 0 || !Number.isInteger(n) ? null : n;
};

// IMDb Movies: budget_x, revenue (movies only), release date as "MM/DD/YYYY"
function buildMoviesIndex(rows) {
    return buildIndex(
        rows,
        (r) => [...new Set([normaliseTitle(r.names), normaliseTitle(r.orig_title)])],
        (r) => toNumber(/(\d{4})$/.exec(r.date_x)?.[1]),
        (a, b) => realAmount(a.budget_x) != null && realAmount(b.budget_x) == null,
    );
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
// Whole pipeline
// ---------------------------------------------------------------------------

// catalogue: CSV rows of the catalogue; imdbScores / imdbMovies: CSV rows of the 2 IMDb datasets.
// Returns { titles, report }. Throws an Error if required columns are missing.
export function runPipeline({ catalogue, imdbScores = [], imdbMovies = [], source = "" }) {
    const columns = catalogue.columns ?? Object.keys(catalogue[0] ?? {});
    const missing = missingColumns(columns);
    if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}`);

    // 0. validate: invalid rows are rejected and counted, duplicated show_id keep the last row
    const rejected = {};
    const byId = new Map();
    for (const raw of catalogue) {
        const row = trimRow(raw);
        const reason = rejectReason(row);
        if (reason) rejected[reason] = (rejected[reason] ?? 0) + 1;
        else byId.set(row.show_id, row);
    }

    const scores = buildScoresIndex(imdbScores.map(trimRow));
    const movies = buildMoviesIndex(imdbMovies.map(trimRow));

    const titles = [...byId.values()]
        .map(clean)
        .map((t) => joinExternal(t, scores, movies))
        .map(derive);

    const moviesOnly = titles.filter((t) => t.type === "Movie");
    const withScore = titles.filter((t) => t.has_imdb_score).length;
    const report = {
        generated_at: new Date().toISOString(),
        source,
        rows: catalogue.length,
        titles: titles.length,
        rejected: {
            count: Object.values(rejected).reduce((sum, n) => sum + n, 0),
            duplicates: catalogue.length - titles.length - Object.values(rejected).reduce((sum, n) => sum + n, 0),
            reasons: rejected,
        },
        by_type: countBy(titles, (t) => t.type),
        join: {
            imdb_scores_source_rows: imdbScores.length,
            imdb_movies_source_rows: imdbMovies.length,
            with_imdb_score: withScore,
            with_imdb_score_pct: percent(withScore, titles.length),
            movies_matched_in_imdb_movies: moviesOnly.filter((t) => t.has_imdb_movie).length,
            movies_with_budget: moviesOnly.filter((t) => t.budget != null).length,
            movies_with_revenue: moviesOnly.filter((t) => t.revenue != null).length,
        },
        age_groups: AGE_GROUPS,
        by_age_group: countBy(titles, (t) => t.age_group),
        by_genre_family: countBy(titles, (t) => t.genre_families),
    };
    return { titles, report };
}

// Update: titles of `update` replace the titles of `current` with the same show_id, new ones are added
export function mergeTitles(current, update) {
    const byId = new Map(current.map((t) => [t.show_id, t]));
    let added = 0;
    let updated = 0;
    for (const title of update) {
        if (byId.has(title.show_id)) updated += 1;
        else added += 1;
        byId.set(title.show_id, title);
    }
    return { titles: [...byId.values()], added, updated };
}
