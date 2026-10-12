// Shared filter state of the coordinated views.
//
// The filters live in ONE place. Any part of the app can change them (the filter bar today,
// the views themselves later: click on a country, brush on a period, click on a genre...),
// and every view is redrawn with the same subset of titles.
//
//   const filters = createFilterState();
//   filters.on("views", (current) => redraw(applyFilters(data, current)));
//   filters.set({ country: "France" });
//
// Common filters (meaningful for the 5 views): type, release year range, country,
// genre family, age group.

import * as d3 from "d3";

export const AGE_GROUPS = ["Kids", "Older Kids", "Teens", "Adults", "Unrated"];

export const DEFAULT_FILTERS = {
    type: "",          // "" = all, "Movie" or "TV Show"
    yearFrom: null,    // release_year >= yearFrom
    yearTo: null,      // release_year <= yearTo
    country: "",       // one of title.countries
    genre: "",         // one of title.genre_families
    ageGroup: "",      // title.age_group
};

export function applyFilters(titles, filters) {
    const { type, yearFrom, yearTo, country, genre, ageGroup } = filters;
    return titles.filter((t) =>
        (!type || t.type === type)
        && (yearFrom == null || t.release_year >= yearFrom)
        && (yearTo == null || t.release_year <= yearTo)
        && (!country || t.countries.includes(country))
        && (!genre || t.genre_families.includes(genre))
        && (!ageGroup || t.age_group === ageGroup));
}

// Human-readable list of the active filters, used for the "chips" of the filter bar
export function describeFilters(filters) {
    const active = [];
    if (filters.type) active.push({ keys: ["type"], label: filters.type });
    if (filters.yearFrom != null || filters.yearTo != null) {
        active.push({ keys: ["yearFrom", "yearTo"], label: `${filters.yearFrom ?? "…"} – ${filters.yearTo ?? "…"}` });
    }
    if (filters.country) active.push({ keys: ["country"], label: filters.country });
    if (filters.genre) active.push({ keys: ["genre"], label: filters.genre });
    if (filters.ageGroup) active.push({ keys: ["ageGroup"], label: filters.ageGroup });
    return active;
}

export function createFilterState() {
    let current = { ...DEFAULT_FILTERS };
    const dispatch = d3.dispatch("change");

    const notify = () => dispatch.call("change", null, { ...current });

    return {
        get: () => ({ ...current }),
        // filters.set({ country: "France" }) changes only the given filters
        set(patch) {
            const next = { ...current, ...patch };
            if (Object.keys(next).every((key) => next[key] === current[key])) return;
            current = next;
            notify();
        },
        reset() {
            current = { ...DEFAULT_FILTERS };
            notify();
        },
        // several listeners can subscribe, each with its own name: on("views", fn), on("panel", fn)
        on(name, listener) {
            dispatch.on(`change.${name}`, listener);
        },
    };
}
