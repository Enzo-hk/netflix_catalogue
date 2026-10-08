// Example of how we could use the other files to organize the code (this is just an example,
// you can change it if you want):

import { loadNetflixData } from "./data/loadData.js";
import { createBeeswarm } from "./visualizations/beeswarm.js";
import { createStackedAreaChart } from "./visualizations/stacked-area-chart.js";
import { createChoropleth } from "./visualizations/choropleth.js";
import { createParallelCoordinates } from "./visualizations/parallel-coordinates.js";

async function main() {
    const data = await loadNetflixData();
    setupVisualizationToggles();
    console.log("Data loaded:", data);
    createBeeswarm(data);
    createStackedAreaChart("#stacked-area-chart", data);
    createChoropleth(data);
    createParallelCoordinates("#parallel-coordinates", data);
}

function setupVisualizationToggles() {
    const beeswarmCheckbox = document.getElementById("toggle-beeswarm");
    const stackedCheckbox = document.getElementById("toggle-stacked");
    const choroplethCheckbox = document.getElementById("toggle-choropleth");
    const parallelCheckbox = document.getElementById("toggle-parallel");
    
    const beeswarmSection = document.getElementById("section-beeswarm");
    const stackedSection = document.getElementById("section-stacked");
    const choroplethSection = document.getElementById("section-choropleth");
    const parallelSection = document.getElementById("section-parallel");

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
}

main();