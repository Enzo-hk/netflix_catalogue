// Example of how we could use the other files to organize the code (this is just an example,
// you can change it if you want):

import { loadNetflixData, loadPersonNetwork, importCatalogue } from "./data/loadData.js";
import { mergeTitles } from "./data/pipeline.js";
import { createDatasetPanel } from "./components/dataset-panel.js";
import { createBeeswarm } from "./visualizations/beeswarm.js";
import { createStackedAreaChart } from "./visualizations/stacked-area-chart.js";
import { createChoropleth } from "./visualizations/choropleth.js";
import { createParallelCoordinates } from "./visualizations/parallel-coordinates.js";
import { createSunburst } from "./visualizations/sunburst.js";
import { applyFilters, createFilterState } from "./data/filters.js";
import { createFilterPanel } from "./components/filter-panel.js";
import { createTabList } from "./components/tab-list.js";
import { createNetworkExplorer } from "./components/network-explorer.js";

async function main() {
    const [defaultData, network] = await Promise.all([loadNetflixData(), loadPersonNetwork()]);
    let data = defaultData;
    setupVisualizationToggles();
    console.log("Data loaded:", data);

    // Coordinated views: one shared filter state, every view shows the same subset of titles
    const filters = createFilterState();
    createFilterPanel("#filter-panel", data, filters);
    createNetworkExplorer(network, data, filters);
    const tabLists = setupTabLists();

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
        onSelect: (selection) => showCatalogueSelection(tabLists.sunburst, selection),
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
            beeswarm: () => createBeeswarm(titles, {
                selectedType: current.type,
                onSelectType: setType,
                onSelect: (title) => showTitle(tabLists.beeswarm, title),
            }),
            stacked: () => createStackedAreaChart("#stacked-area-chart", stackedTitles, {
                yearRange: [current.yearFrom, current.yearTo],
                onSelectYears: (yearFrom, yearTo) => filters.set({ yearFrom, yearTo }),
                selectedType: current.type,
                onSelectType: setType,
                onSelectYear: (year) => showYear(tabLists.stacked, stackedTitles, year),
            }),
            choropleth: () => createChoropleth(mapTitles, {
                selectedCountry: current.country,
                onSelectCountry: (country) => {
                    filters.set({ country });
                    showCountry(tabLists.choropleth, mapTitles, country);
                },
            }),
            parallel: () => createParallelCoordinates("#parallel-coordinates", titles, {
                selectedType: current.type,
                onSelectType: setType,
                onFilterChange: (visibleTitles) => showTypeTabs(tabLists.parallel, visibleTitles),
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

    // Change of dataset: the imported CSV goes through the data pipeline (src/data/pipeline.js),
    // then the filters are reset and every view is redrawn with the new titles.
    const DEFAULT_NAME = "Netflix (default)";
    let datasetName = DEFAULT_NAME;

    function setData(titles, name) {
        data = titles;
        datasetName = name;
        createFilterPanel("#filter-panel", data, filters); // its menus (countries, genres, years) come from the data
        Object.values(tabLists).forEach((tabList) => tabList.setTabs([]));
        filters.reset(); // -> renderViews with the new data
    }

    createDatasetPanel("#dataset-panel", {
        name: DEFAULT_NAME,
        count: data.length,
        onImport: async (file, mode) => {
            const { titles, report } = await importCatalogue(file);
            if (!titles.length) throw new Error("no valid title in this file");
            if (mode === "update") {
                const { titles: merged, added, updated } = mergeTitles(data, titles);
                setData(merged, `${datasetName} + ${file.name}`);
                return { name: datasetName, count: merged.length, report, added, updated };
            }
            setData(titles, file.name);
            return { name: datasetName, count: titles.length, report };
        },
        onReset: () => {
            setData(defaultData, DEFAULT_NAME);
            return { name: DEFAULT_NAME, count: data.length };
        },
    });
}

function setupTabLists() {
    const visualizations = [
        ["beeswarm", "Beeswarm tabs"],
        ["stacked", "Stacked area chart tabs"],
        ["choropleth", "Choropleth tabs"],
        ["parallel", "Parallel coordinates tabs"],
        ["sunburst", "Sunburst tabs"]
    ];
    return Object.fromEntries(visualizations.map(([key, label]) => {
        const containerId = `tabs-${key}`;
        const container = document.getElementById(containerId);
        return [key, createTabList(container, { label })];
    }));
}

function renderTitleList(panel, titles, {
    heading,
    description,
    collapsibleDescriptions = true
} = {}) {
    panel.replaceChildren();
    if (heading) {
        const title = document.createElement("h3");
        title.textContent = heading;
        panel.append(title);
    }
    if (description) {
        const text = document.createElement("p");
        text.textContent = description;
        panel.append(text);
    }
    const list = document.createElement("ol");
    titles.forEach((title) => {
        const item = document.createElement("li");
        const titleLabel = document.createElement("span");
        titleLabel.textContent = title.title;
        item.append(titleLabel);

        const meta = document.createElement("span");
        meta.className = "tab-list__meta";
        meta.textContent = formatTitleMetadata(title);
        item.append(meta);

        if (title.description) {
            const titleDescription = document.createElement("span");
            titleDescription.className = "tab-list__description";
            titleDescription.textContent = title.description;
            item.append(titleDescription);

            if (collapsibleDescriptions) {
                titleDescription.classList.add("tab-list__description--collapsed");
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "tab-list__description-toggle";
                toggle.textContent = "Show more";
                toggle.setAttribute("aria-expanded", "false");
                toggle.addEventListener("click", () => {
                    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
                    titleDescription.classList.toggle("tab-list__description--collapsed", isExpanded);
                    toggle.setAttribute("aria-expanded", String(!isExpanded));
                    toggle.textContent = isExpanded ? "Show more" : "Show less";
                });
                item.append(toggle);
            }
        }
        list.append(item);
    });
    panel.append(list);
}

function formatTitleMetadata(title) {
    const year = title.release_year ?? "Unknown year";
    const duration = title.duration_minutes
        ? `${title.duration_minutes} min`
        : title.seasons
            ? `${title.seasons} season${title.seasons > 1 ? "s" : ""}`
            : "Unknown duration";
    const score = title.imdb_score != null
        ? `IMDb ${Number(title.imdb_score).toFixed(1)}`
        : "IMDb N/A";
    return `${year} · ${duration} · ${score}`;
}

function showTitle(tabList, title) {
    tabList.setTabs([{
        id: "description",
        label: "Description",
        render: (panel) => {
            const heading = document.createElement("h3");
            heading.textContent = title.title;
            const metadata = document.createElement("p");
            metadata.className = "tab-list__meta";
            metadata.textContent = formatTitleMetadata(title);
            const description = document.createElement("p");
            description.textContent = title.description || "No description available.";
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "tab-list__description-toggle";
            toggle.textContent = "Show more";
            toggle.setAttribute("aria-expanded", "false");

            const descriptionIsLong = description.textContent.length > 180;
            if (descriptionIsLong) {
                description.className = "tab-list__description tab-list__description--collapsed";
                toggle.addEventListener("click", () => {
                    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
                    description.classList.toggle("tab-list__description--collapsed", isExpanded);
                    toggle.setAttribute("aria-expanded", String(!isExpanded));
                    toggle.textContent = isExpanded ? "Show more" : "Show less";
                });
            } else {
                toggle.hidden = true;
            }

            panel.replaceChildren(heading, metadata, description, toggle);
        }
    }]);
}

function showYear(tabList, data, year) {
    const titles = data.filter((title) => Number(title.release_year) === year);
    showTypeTabs(tabList, titles, {
        heading: `Released in ${year}`,
        description: `${titles.length} title${titles.length === 1 ? "" : "s"}`
    });
}

function showCountry(tabList, data, country) {
    const aliases = { USA: "United States", England: "United Kingdom", "Republic of Serbia": "Serbia", "United Republic of Tanzania": "Tanzania" };
    const sourceCountry = aliases[country] ?? country;
    const titles = data.filter((title) => title.countries.includes(sourceCountry));
    showTypeTabs(tabList, titles, {
        heading: country,
        description: `${titles.length} title${titles.length === 1 ? "" : "s"}`
    });
}

function showTypeTabs(tabList, titles, options = {}) {
    tabList.setTabs(["Movie", "TV Show"].map((type) => ({
        id: type.toLowerCase().replace(" ", "-"),
        label: type === "Movie" ? "Movie" : "TV Show",
        render: (panel) => {
            const typeTitles = titles.filter((title) => title.type === type);
            renderTitleList(panel, typeTitles, {
                ...options,
                heading: options.heading ?? type,
                description: `${typeTitles.length} title${typeTitles.length === 1 ? "" : "s"}`
            });
        }
    })));
}

function showCatalogueSelection(tabList, selection) {
    if (!selection) return;
    tabList.setTabs([{
        id: "catalogue-titles",
        label: "Titles",
        render: (panel) => renderTitleList(panel, selection.titles, {
            heading: `${selection.genre} · ${selection.age}`,
            description: `${selection.type} · ${selection.titles.length} titles`
        })
    }]);
}

function setupVisualizationToggles() {
    const beeswarmCheckbox = document.getElementById("toggle-beeswarm");
    const stackedCheckbox = document.getElementById("toggle-stacked");
    const choroplethCheckbox = document.getElementById("toggle-choropleth");
    const parallelCheckbox = document.getElementById("toggle-parallel");
    const sunburstCheckbox = document.getElementById("toggle-sunburst");
    const networkCheckbox = document.getElementById("toggle-network");

    const beeswarmSection = document.getElementById("section-beeswarm");
    const stackedSection = document.getElementById("section-stacked");
    const choroplethSection = document.getElementById("section-choropleth");
    const parallelSection = document.getElementById("section-parallel");
    const sunburstSection = document.getElementById("section-sunburst");
    const networkSection = document.getElementById("section-network");

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

    networkCheckbox.addEventListener("change", (e) => {
        networkSection.classList.toggle("is-hidden", !e.target.checked);
    });
}

main();