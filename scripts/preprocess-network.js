// Derive the actor/director collaboration network from the processed title table.
//
//   npm run preprocess
//
// Reads public/data/preprocessed/titles.json
// Writes public/data/preprocessed/network.json

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "public/data/preprocessed/titles.json");
const OUTPUT = join(ROOT, "public/data/preprocessed/network.json");

function normalisePersonName(name) {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function uniquePeople(values) {
    const people = new Map();
    if (!Array.isArray(values)) return people;

    for (const value of values) {
        if (typeof value !== "string") continue;
        const name = value.replace(/\s+/g, " ").trim();
        if (!name) continue;

        const key = normalisePersonName(name);
        if (!people.has(key)) {
            people.set(key, {
                key,
                name,
            });
        }
    }
    return people;
}

export function buildPersonNetwork(titles) {
    if (!Array.isArray(titles)) {
        throw new TypeError("The processed titles dataset must be an array.");
    }

    const nodesByPerson = new Map();
    const edgesByKey = new Map();

    function ensureNode(person, type, filmId) {
        let entry = nodesByPerson.get(person.key);
        if (!entry) {
            const id = `p${nodesByPerson.size.toString(36)}`;
            entry = {
                node: { id, name: person.name, type, titleCount: 0 },
                filmIds: new Set(),
            };
            nodesByPerson.set(person.key, entry);
        }

        if (type === "actor") entry.node.type = "actor";
        entry.filmIds.add(filmId);
        return entry.node;
    }

    function addEdge(source, target, type, filmId) {
        if (source === target) return;

        if (type === "actor-actor" && source > target) {
            [source, target] = [target, source];
        }
        const key = JSON.stringify([type, source, target]);
        let edge = edgesByKey.get(key);
        if (!edge) {
            edge = { source, target, type, films: new Set() };
            edgesByKey.set(key, edge);
        }
        edge.films.add(filmId);
    }

    for (const title of titles) {
        const filmId = title?.show_id == null ? "" : String(title.show_id).trim();
        if (!filmId) continue;

        const actors = uniquePeople(title?.cast);
        const directors = uniquePeople(title?.directors);
        const actorIds = [...actors.values()]
            .map((person) => ensureNode(person, "actor", filmId).id);
        const directorIds = [...directors.values()]
            .map((person) => ensureNode(person, "director", filmId).id);

        for (const actorId of actorIds) {
            for (const directorId of directorIds) {
                addEdge(actorId, directorId, "actor-director", filmId);
            }
        }

        for (let i = 0; i < actorIds.length; i++) {
            for (let j = i + 1; j < actorIds.length; j++) {
                addEdge(actorIds[i], actorIds[j], "actor-actor", filmId);
            }
        }
    }

    const nodes = [...nodesByPerson.values()].map(({ node, filmIds }) => ({
        ...node,
        titleCount: filmIds.size,
    }));
    const edges = [...edgesByKey.values()].map(({ films, ...edge }) => {
        const sharedFilms = [...films];
        return { ...edge, weight: sharedFilms.length, films: sharedFilms };
    });

    return { nodes, edges };
}

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
