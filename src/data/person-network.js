const networkIndexes = new WeakMap();
const MAX_VISIBLE_EDGES = 2000;

function getAdjacency(network) {
    let index = networkIndexes.get(network);
    if (index) return index;

    const adjacency = new Map();
    for (const edge of network.edges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
        adjacency.get(edge.source).push(edge);
        adjacency.get(edge.target).push(edge);
    }
    index = {
        adjacency,
        nodesById: new Map(network.nodes.map((node) => [node.id, node])),
    };
    networkIndexes.set(network, index);
    return index;
}

export function extractPersonNeighborhood(network, centerId, titles, depth = 1) {
    const maxDepth = Number.isFinite(depth) ? Math.min(1, Math.max(0, Math.floor(depth))) : 1;
    const titleIds = new Set(titles.map(({ show_id }) => show_id));
    const { adjacency, nodesById } = getAdjacency(network);
    if (!nodesById.has(centerId)) {
        return {
            nodes: [],
            edges: [],
            totalNodes: 0,
            totalEdges: 0,
            truncatedNodes: 0,
            truncatedEdges: 0,
        };
    }

    const distance = new Map([[centerId, 0]]);
    const edgeWeights = new Map();
    const activeWeight = (edge) => {
        if (!edgeWeights.has(edge)) {
            edgeWeights.set(edge, edge.films.reduce(
                (count, filmId) => count + Number(titleIds.has(filmId)),
                0
            ));
        }
        return edgeWeights.get(edge);
    };
    const queue = [centerId];
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        const currentDepth = distance.get(current);
        if (currentDepth >= maxDepth) continue;

        for (const edge of adjacency.get(current) ?? []) {
            if (!activeWeight(edge)) continue;
            const neighbor = edge.source === current ? edge.target : edge.source;
            if (distance.has(neighbor)) continue;
            distance.set(neighbor, currentDepth + 1);
            queue.push(neighbor);
        }
    }

    const visibleIds = new Set(distance.keys());

    const candidateEdges = [];
    const seenEdges = new Set();
    for (const id of visibleIds) {
        for (const edge of adjacency.get(id) ?? []) {
            if (seenEdges.has(edge) || !visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
            seenEdges.add(edge);
            const weight = activeWeight(edge);
            if (weight) candidateEdges.push({ edge, weight });
        }
    }
    candidateEdges.sort((a, b) => {
        const aIsDirect = a.edge.source === centerId || a.edge.target === centerId;
        const bIsDirect = b.edge.source === centerId || b.edge.target === centerId;
        return Number(bIsDirect) - Number(aIsDirect) || b.weight - a.weight;
    });
    const visibleEdges = candidateEdges.slice(0, MAX_VISIBLE_EDGES).map(({ edge, weight }) => ({
        ...edge,
        weight,
        films: edge.films.filter((filmId) => titleIds.has(filmId)),
    }));

    return {
        nodes: [...visibleIds].map((id) => nodesById.get(id)),
        edges: visibleEdges,
        totalNodes: distance.size,
        totalEdges: candidateEdges.length,
        truncatedNodes: 0,
        truncatedEdges: candidateEdges.length - visibleEdges.length,
    };
}

// Builds the actor/director collaboration network from a title table.
// Used by scripts/preprocess-network.js for the default catalogue, and in the browser for imported datasets.
export function normalisePersonName(name) {
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
