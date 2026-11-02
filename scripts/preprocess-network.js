// Derive the actor/director collaboration network from the processed title table.
//
//   npm run preprocess
//
// Reads public/data/preprocessed/titles.json
// Writes public/data/preprocessed/network.json
//
// The network builder lives in src/data/person-network.js so the browser can rebuild it for imported datasets.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPersonNetwork } from "../src/data/person-network.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "public/data/preprocessed/titles.json");
const OUTPUT = join(ROOT, "public/data/preprocessed/network.json");

export { buildPersonNetwork };

function main() {
    const titles = JSON.parse(readFileSync(INPUT, "utf8"));
    const network = buildPersonNetwork(titles);
    writeFileSync(OUTPUT, JSON.stringify(network));
    console.log(
        `${network.nodes.length} people and ${network.edges.length} collaborations -> ${join("public/data/preprocessed", "network.json")}`
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
