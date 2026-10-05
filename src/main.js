// Example of how we could use the other files to organize the code (this is just an example,
// you can change it if you want):

import { loadNetflixData } from "./data/loadData.js";
import { createBeeswarm } from "./visualizations/beeswarm.js";
import { createStackedAreaChart } from "./visualizations/stacked-area-chart.js";

async function main() {
    const data = await loadNetflixData();
    setupVisualizationToggles();
    console.log("Data loaded:", data);
    createBeeswarm(data);
    createStackedAreaChart("#stacked-area-chart", data);
}

function setupVisualizationToggles() {
    const beeswarmCheckbox = document.getElementById("toggle-beeswarm");
    const stackedCheckbox = document.getElementById("toggle-stacked");

    const beeswarmSection = document.getElementById("section-beeswarm");
    const stackedSection = document.getElementById("section-stacked");

    beeswarmCheckbox.addEventListener("change", (e) => {
        beeswarmSection.classList.toggle("is-hidden", !e.target.checked);
    });

    stackedCheckbox.addEventListener("change", (e) => {
        stackedSection.classList.toggle("is-hidden", !e.target.checked);
    });
}

main();