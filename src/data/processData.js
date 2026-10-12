import * as d3 from "d3";

// FUNCTION: clean country names and count titles by country
// Netflix spelling → map (GeoJSON) spelling
const NAME_ALIASES = {
    "United States": "USA",
    "United Kingdom": "England",
    "Serbia": "Republic of Serbia",
    "Tanzania": "United Republic of Tanzania",
};

// map (GeoJSON) spelling → Netflix spelling, used when a country is clicked on the map
export function toNetflixCountryName(geoName) {
    const entry = Object.entries(NAME_ALIASES).find(([, alias]) => alias === geoName);
    return entry ? entry[0] : geoName;
}

export function countTitlesByCountry(titles) {
    return d3.rollup(
        titles.flatMap(t => t.countries),
        v => v.length,
        name => NAME_ALIASES[name] ?? name
    );
}

// FUNCTION: generate tooltip summary per-country (title count, most active release year, genre shares)
// RETURNS: dictionary mapping country name → { total, topYear, topYearCount, genres }
export function statsByCountry(titles) {
    // One row per (country, title) pair, using the map's spelling of the country
    const rows = titles.flatMap(t =>
        t.countries.map(c => ({ country: NAME_ALIASES[c] ?? c, title: t }))
    );

    return d3.rollup(rows, group => {
        const list = group.map(r => r.title);

        // Most active year = release year with the most titles
        const perYear = d3.rollup(list, v => v.length, t => t.release_year);
        const [topYear, topYearCount] = d3.greatest(perYear, ([, n]) => n);

        // Genre shares/top genres (each genre tag counts once), most dominant first
        const genreTags = list.flatMap(t => t.genre_families);
        const genres = d3.rollups(genreTags, v => v.length, g => g)
            .map(([genre, n]) => ({ genre, pct: n / genreTags.length * 100 }))
            .sort((a, b) => b.pct - a.pct);

        return { total: list.length, topYear, topYearCount, genres };
    }, r => r.country);
}

