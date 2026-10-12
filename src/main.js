// Example of how we could use the other files to organize the code (this is just an example,
// you can change it if you want):

import { loadNetflixData } from "./data/loadData.js";
import { createBeeswarm } from "./visualizations/beeswarm.js";
import { createStackedAreaChart } from "./visualizations/stacked-area-chart.js";
import { createChoropleth } from "./visualizations/choropleth.js";
import { createParallelCoordinates } from "./visualizations/parallel-coordinates.js";
import { createSunburst } from "./visualizations/sunburst.js";
import { createTabList } from "./components/tab-list.js";

async function main() {
    const data = await loadNetflixData();
    setupVisualizationToggles();
    console.log("Data loaded:", data);
    const tabLists = setupTabLists();
    createBeeswarm(data, { onSelect: (title) => showTitle(tabLists.beeswarm, title) });
    createStackedAreaChart("#stacked-area-chart", data, {
        onSelectYear: (year) => showYear(tabLists.stacked, data, year)
    });
    createChoropleth(data, {
        onSelectCountry: (country) => showCountry(tabLists.choropleth, data, country)
    });
    createParallelCoordinates("#parallel-coordinates", data, {
        onFilterChange: (titles) => showTypeTabs(tabLists.parallel, titles)
    });
    createSunburst("#sunburst", data, {
        onSelect: (selection) => showCatalogueSelection(tabLists.sunburst, selection)
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
                toggle.textContent = "Afficher plus";
                toggle.setAttribute("aria-expanded", "false");
                toggle.addEventListener("click", () => {
                    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
                    titleDescription.classList.toggle("tab-list__description--collapsed", isExpanded);
                    toggle.setAttribute("aria-expanded", String(!isExpanded));
                    toggle.textContent = isExpanded ? "Afficher plus" : "Réduire";
                });
                item.append(toggle);
            }
        }
        list.append(item);
    });
    panel.append(list);
}

function formatTitleMetadata(title) {
    const year = title.release_year ?? "Année inconnue";
    const duration = title.duration_minutes
        ? `${title.duration_minutes} min`
        : title.seasons
            ? `${title.seasons} saison${title.seasons > 1 ? "s" : ""}`
            : "Durée inconnue";
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
            description.textContent = title.description || "Description indisponible.";
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "tab-list__description-toggle";
            toggle.textContent = "Afficher plus";
            toggle.setAttribute("aria-expanded", "false");

            const descriptionIsLong = description.textContent.length > 180;
            if (descriptionIsLong) {
                description.className = "tab-list__description tab-list__description--collapsed";
                toggle.addEventListener("click", () => {
                    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
                    description.classList.toggle("tab-list__description--collapsed", isExpanded);
                    toggle.setAttribute("aria-expanded", String(!isExpanded));
                    toggle.textContent = isExpanded ? "Afficher plus" : "Réduire";
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
        heading: `Sorties de ${year}`,
        description: `${titles.length} titre(s)`
    });
}

function showCountry(tabList, data, country) {
    const aliases = { USA: "United States", England: "United Kingdom", "Republic of Serbia": "Serbia", "United Republic of Tanzania": "Tanzania" };
    const sourceCountry = aliases[country] ?? country;
    const titles = data.filter((title) => title.countries.includes(sourceCountry));
    showTypeTabs(tabList, titles, {
        heading: country,
        description: `${titles.length} titre(s)`
    });
}

function showTypeTabs(tabList, titles, options = {}) {
    tabList.setTabs(["Movie", "TV Show"].map((type) => ({
        id: type.toLowerCase().replace(" ", "-"),
        label: type === "Movie" ? "Movie" : "TV Show",
        render: (panel) => renderTitleList(panel, titles.filter((title) => title.type === type), {
            ...options,
            heading: options.heading ?? type,
            description: options.description ?? ""
        })
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