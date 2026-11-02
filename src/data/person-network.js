const networkIndexes = new WeakMap();
const MAX_VISIBLE_NODES = 400;
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

export function extractPersonNeighborhood(network, centerId, titles, depth = 2) {
    const maxDepth = Number.isFinite(depth) ? Math.min(2, Math.max(0, Math.floor(depth))) : 2;
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

    const directIds = [...distance]
        .filter(([, nodeDepth]) => nodeDepth === 1)
        .map(([id]) => id);
    const depthTwoScores = new Map();
    for (const id of directIds) {
        for (const edge of adjacency.get(id) ?? []) {
            const neighbor = edge.source === id ? edge.target : edge.source;
            if (distance.get(neighbor) !== 2) continue;
            const weight = activeWeight(edge);
            if (weight) depthTwoScores.set(neighbor, (depthTwoScores.get(neighbor) ?? 0) + weight);
        }
    }

    const maxVisibleNodes = Math.max(MAX_VISIBLE_NODES, directIds.length + 1);
    const visibleIds = new Set([centerId, ...directIds]);
    const depthTwoIds = [...depthTwoScores.keys()]
        .sort((a, b) =>
            depthTwoScores.get(b) - depthTwoScores.get(a)
            || nodesById.get(b).titleCount - nodesById.get(a).titleCount
            || nodesById.get(a).name.localeCompare(nodesById.get(b).name));
    for (const id of depthTwoIds.slice(0, maxVisibleNodes - visibleIds.size)) {
        visibleIds.add(id);
    }

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
        truncatedNodes: distance.size - visibleIds.size,
        truncatedEdges: candidateEdges.length - visibleEdges.length,
    };
}
