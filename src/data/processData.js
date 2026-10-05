import * as d3 from "d3";

// FUNCTION: clean country names and count titles by country
// Netflix spelling → map (GeoJSON) spelling
const NAME_ALIASES = {
    "United States": "USA",
    "United Kingdom": "England",
    "Serbia": "Republic of Serbia",
    "Tanzania": "United Republic of Tanzania",
};

export function countTitlesByCountry(titles) {
    return d3.rollup(
        titles.flatMap(t => t.countries),
        v => v.length,
        name => NAME_ALIASES[name] ?? name
    );
}