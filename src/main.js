// Example of how we could use the other files to organize the code (this is just an example,
// you can change it if you want):

import { loadNetflixData } from "./data/loadData.js";
import { createBeeswarm } from "./visualizations/beeswarm.js";

async function main() {
    const data = await loadNetflixData();

    createBeeswarm(data);
}

main();