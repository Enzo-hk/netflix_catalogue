// Filter bar of the coordinated views: the common filters, the number of matching titles,
// the active filters (removable one by one) and a reset button.
// It only reads and writes the shared filter state (src/data/filters.js): it never redraws
// the views itself, main.js does it when the state changes.

import * as d3 from "d3";
import { AGE_GROUPS, applyFilters, describeFilters } from "../data/filters.js";

const formatCount = d3.format(",");

export function createFilterPanel(container, titles, filters) {
    const panel = d3.select(container).classed("filter-panel", true).html("");

    // Options come from the data, sorted by number of titles so the most common come first
    const byCount = (values) => [...d3.rollup(values, (v) => v.length, (d) => d)]
        .sort((a, b) => d3.descending(a[1], b[1]))
        .map(([value]) => value);
    const countries = byCount(titles.flatMap((t) => t.countries));
    const genres = byCount(titles.flatMap((t) => t.genre_families));
    const [minYear, maxYear] = d3.extent(titles, (t) => t.release_year);

    const controls = panel.append("div").attr("class", "filter-panel__controls");

    const type = addSelect(controls, "Type", "All types", ["Movie", "TV Show"],
        (value) => filters.set({ type: value }));
    const yearFrom = addYear(controls, "From", minYear, maxYear,
        (value) => filters.set({ yearFrom: value }));
    const yearTo = addYear(controls, "To", minYear, maxYear,
        (value) => filters.set({ yearTo: value }));
    const country = addSelect(controls, "Country", "All countries", countries,
        (value) => filters.set({ country: value }));
    const genre = addSelect(controls, "Genre", "All genres", genres,
        (value) => filters.set({ genre: value }));
    const ageGroup = addSelect(controls, "Audience", "All audiences", AGE_GROUPS,
        (value) => filters.set({ ageGroup: value }));

    const summary = panel.append("div").attr("class", "filter-panel__summary");
    const count = summary.append("output").attr("class", "filter-panel__count").attr("aria-live", "polite");
    const chips = summary.append("div").attr("class", "filter-panel__chips");
    summary.append("span").attr("class", "filter-panel__tip")
        .text("Tip: you can also set these filters by clicking in the visualisations below.");
    const resetButton = summary.append("button").attr("type", "button").attr("class", "filter-panel__reset")
        .text("Reset filters")
        .on("click", () => filters.reset());

    // Keep the controls in sync with the state (it can also be changed from a view later)
    function render(current) {
        type.property("value", current.type);
        yearFrom.property("value", current.yearFrom ?? "");
        yearTo.property("value", current.yearTo ?? "");
        country.property("value", current.country);
        genre.property("value", current.genre);
        ageGroup.property("value", current.ageGroup);

        const matching = applyFilters(titles, current).length;
        count.text(`Showing ${formatCount(matching)} of ${formatCount(titles.length)} titles`);

        const active = describeFilters(current);
        resetButton.property("disabled", active.length === 0);

        chips.selectAll("button")
            .data(active, (d) => d.keys.join())
            .join("button")
            .attr("type", "button")
            .attr("class", "filter-panel__chip")
            .attr("title", "Remove this filter")
            .text((d) => `${d.label} ✕`)
            .on("click", (event, d) => filters.set(Object.fromEntries(
                d.keys.map((key) => [key, key.startsWith("year") ? null : ""]))));
    }

    filters.on("panel", render);
    render(filters.get());
}

function addSelect(parent, label, allLabel, options, onChange) {
    const field = parent.append("label").attr("class", "filter-panel__field");
    field.append("span").text(label);
    const select = field.append("select").on("change", (event) => onChange(event.target.value));
    select.append("option").attr("value", "").text(allLabel);
    select.selectAll("option.value").data(options).join("option")
        .attr("class", "value")
        .attr("value", (d) => d)
        .text((d) => d);
    return select;
}

function addYear(parent, label, min, max, onChange) {
    const field = parent.append("label").attr("class", "filter-panel__field filter-panel__field--year");
    field.append("span").text(label);
    return field.append("input")
        .attr("type", "number")
        .attr("min", min)
        .attr("max", max)
        .attr("placeholder", label === "From" ? min : max)
        .on("change", (event) => {
            const value = event.target.value === "" ? null : Math.round(Number(event.target.value));
            onChange(Number.isFinite(value) ? value : null);
        });
}
