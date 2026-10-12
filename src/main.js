// Example of how we could use the other files to organize the code (this is just an example,
// you can change it if you want):

import { loadNetflixData } from "./data/loadData.js";
import { createBeeswarm } from "./visualizations/beeswarm.js";
import { createStackedAreaChart } from "./visualizations/stacked-area-chart.js";
import { createChoropleth } from "./visualizations/choropleth.js";
import { createParallelCoordinates } from "./visualizations/parallel-coordinates.js";
import { createSunburst } from "./visualizations/sunburst.js";
import { applyFilters, createFilterState } from "./data/filters.js";
import { createFilterPanel } from "./components/filter-panel.js";

async function main() {
    const data = await loadNetflixData();
    setupVisualizationToggles();
    console.log("Data loaded:", data);

    // Coordinated views: one shared filter state, every view shows the same subset of titles
    const filters = createFilterState();
    createFilterPanel("#filter-panel", data, filters);

    // Every view can also SET the common filters it shows, and the filters accumulate:
    //   map: country · sunburst: type, genre, age group · stacked chart: years (brush), type (legend)
    //   beeswarm, parallel coordinates: type (legend)
    const setType = (type) => filters.set({ type });

    // sunburst: zooming in sets the levels of the path, zooming out removes the levels below
    const sunburst = createSunburst("#sunburst", data, {
        onFocusChange: (path, { zoomOut }) => {
            const patch = {};
            ["type", "genre", "ageGroup"].forEach((key, i) => {
                if (i < path.length) patch[key] = path[i];
                else if (zoomOut) patch[key] = "";
            });
            filters.set(patch);
        },
    });

    function renderViews(current) {
        const titles = applyFilters(data, current);

        // A view that sets a filter by selecting inside it is not filtered by that filter:
        // it keeps the other choices visible and highlights the selected one.
        const mapTitles = applyFilters(data, { ...current, country: "" });
        const stackedTitles = applyFilters(data, { ...current, yearFrom: null, yearTo: null });

        // sunburst: type > genre > age group is shown by zooming, the other filters filter its data
        const focus = [];
        if (current.type) {
            focus.push(current.type);
            if (current.genre) {
                focus.push(current.genre);
                if (current.ageGroup) focus.push(current.ageGroup);
            }
        }
        const sunburstTitles = applyFilters(data, {
            ...current,
            type: "",
            genre: focus.length > 1 ? "" : current.genre,
            ageGroup: focus.length > 2 ? "" : current.ageGroup,
        });

        // one view failing (e.g. no title left) must not stop the others
        const views = {
            beeswarm: () => createBeeswarm(titles, { selectedType: current.type, onSelectType: setType }),
            stacked: () => createStackedAreaChart("#stacked-area-chart", stackedTitles, {
                yearRange: [current.yearFrom, current.yearTo],
                onSelectYears: (yearFrom, yearTo) => filters.set({ yearFrom, yearTo }),
                selectedType: current.type,
                onSelectType: setType,
            }),
            choropleth: () => createChoropleth(mapTitles, {
                selectedCountry: current.country,
                onSelectCountry: (country) => filters.set({ country }),
            }),
            parallel: () => createParallelCoordinates("#parallel-coordinates", titles, {
                selectedType: current.type,
                onSelectType: setType,
            }),
            sunburst: () => sunburst.update(sunburstTitles, { focus }),
        };
        for (const [name, render] of Object.entries(views)) {
            try {
                render();
            } catch (error) {
                console.error(`${name} could not be drawn with ${titles.length} titles`, error);
            }
        }
    }

    renderViews(filters.get());
    filters.on("views", renderViews);
}

function setupVisualizationToggles() {
    const beeswarmCheckbox = document.getElementById("toggle-beeswarm");
    const stackedCheckbox = document.getElementById("toggle-stacked");
    const choroplethCheckbox = document.getElementById("toggle-choropleth");
    const parallelCheckbox = document.getElementById("toggle-parallel");
    const sunburstCheckbox = document.getElementById("toggle-sunburst");

    const beeswarmSection = document.getElementById("section-beeswarm");
    const stackedSection = document.getElementById("section-stacked");
    const choroplethSection = document.getElementById("section-choropleth");
    const parallelSection = document.getElementById("section-parallel");
    const sunburstSection = document.getElementById("section-sunburst");

    beeswarmCheckbox.addEventListener("change", (e) => {
        beeswarmSection.classList.toggle("is-hidden", !e.target.checked);
    });

    stackedCheckbox.addEventListener("change", (e) => {
        stackedSection.classList.toggle("is-hidden", !e.target.checked);
    });

    choroplethCheckbox.addEventListener("change", (e) => {
        choroplethSection.classList.toggle("is-hidden", !e.target.checked);
    });

     parallelCheckbox.addEventListener("change", (e) => {
        parallelSection.classList.toggle("is-hidden", !e.target.checked);
    });

    sunburstCheckbox.addEventListener("change", (e) => {
        sunburstSection.classList.toggle("is-hidden", !e.target.checked);
    });
}

main();