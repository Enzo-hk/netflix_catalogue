import * as d3 from "d3";

const COLORS = {
    actor: "#e50914",
    director: "#ff8a8f",
    selected: "#ffffff",
};

export function createPersonNetwork(selector, onSelect) {
    const width = 1000;
    const height = 680;
    const svg = d3.select(selector)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();

    const viewport = svg.append("g").attr("class", "person-network__viewport");
    const linksLayer = viewport.append("g").attr("class", "person-network__links");
    const nodesLayer = viewport.append("g").attr("class", "person-network__nodes");
    const zoom = d3.zoom()
        .scaleExtent([0.2, 4])
        .on("zoom", (event) => viewport.attr("transform", event.transform));
    svg.call(zoom).on("dblclick.zoom", null);

    const tooltip = d3.select("#person-network-tooltip");
    let simulation = null;
    let currentCenterId = null;

    function positionTooltip(event) {
        tooltip
            .style("display", "grid")
            .style("left", `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 250))}px`)
            .style("top", `${Math.max(8, event.clientY - 58)}px`);
    }

    function showTooltip(event, person) {
        tooltip.selectAll("*").remove();
        tooltip.append("strong").text(person.name);
        tooltip.append("span").text(`${capitalize(person.type)} · ${person.titleCount} title(s)`);
        positionTooltip(event);
    }

    function update(graph, centerId) {
        simulation?.stop();
        if (currentCenterId !== centerId) {
            svg.call(zoom.transform, d3.zoomIdentity);
            currentCenterId = centerId;
        }

        const nodes = graph.nodes.map((person) => ({ ...person }));
        const nodeById = new Map(nodes.map((person) => [person.id, person]));
        const links = graph.edges.map((edge) => ({
            ...edge,
            source: nodeById.get(edge.source),
            target: nodeById.get(edge.target),
        })).filter((edge) => edge.source && edge.target);

        const degree = new Map(nodes.map((person) => [person.id, 0]));
        for (const edge of links) {
            degree.set(edge.source.id, degree.get(edge.source.id) + 1);
            degree.set(edge.target.id, degree.get(edge.target.id) + 1);
        }
        const labels = new Set(
            [...nodes]
                .sort((a, b) => degree.get(b.id) - degree.get(a.id))
                .slice(0, 24)
                .map((person) => person.id)
        );

        const link = linksLayer.selectAll("line")
            .data(links, (edge) => `${edge.type}:${edge.source.id}:${edge.target.id}`)
            .join("line")
            .attr("class", "person-network__link")
            .attr("stroke-width", (edge) => Math.min(5, 1 + Math.log2(edge.weight)))
            .attr("stroke-opacity", (edge) => Math.min(0.85, 0.24 + Math.log2(edge.weight) * 0.12));

        const node = nodesLayer.selectAll("g.person-network__node")
            .data(nodes, (person) => person.id)
            .join((enter) => {
                const group = enter.append("g").attr("class", "person-network__node");
                group.append("circle");
                group.append("text").attr("class", "person-network__label");
                return group;
            })
            .attr("class", "person-network__node")
            .classed("is-selected", (person) => person.id === centerId)
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-label", (person) => `Explore ${person.name}, ${person.type}`)
            .on("click", (_event, person) => onSelect(person))
            .on("keydown", (event, person) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(person);
                }
            })
            .on("pointerenter", (event, person) => {
                const neighbors = new Set([person.id]);
                for (const edge of links) {
                    if (edge.source.id === person.id) neighbors.add(edge.target.id);
                    if (edge.target.id === person.id) neighbors.add(edge.source.id);
                }
                node.classed("is-dimmed", (other) => !neighbors.has(other.id));
                link.classed("is-dimmed", (edge) =>
                    edge.source.id !== person.id && edge.target.id !== person.id);
                node.select("text").classed("is-hovered", (other) => other.id === person.id);
                showTooltip(event, person);
            })
            .on("pointermove", (event) => positionTooltip(event))
            .on("pointerleave", () => {
                node.classed("is-dimmed", false).select("text").classed("is-hovered", false);
                link.classed("is-dimmed", false);
                tooltip.style("display", "none");
            })
            .call(d3.drag()
                .on("start", (event, person) => {
                    if (!event.active) simulation.alphaTarget(0.25).restart();
                    person.fx = person.x;
                    person.fy = person.y;
                })
                .on("drag", (event, person) => {
                    person.fx = event.x;
                    person.fy = event.y;
                })
                .on("end", (event, person) => {
                    if (!event.active) simulation.alphaTarget(0);
                    person.fx = null;
                    person.fy = null;
                }));

        node.select("circle")
            .attr("r", (person) => Math.max(5, Math.min(14, 5 + Math.sqrt(person.titleCount))))
            .attr("fill", (person) => COLORS[person.type])
            .attr("stroke", (person) => person.id === centerId ? COLORS.selected : "#181818")
            .attr("stroke-width", (person) => person.id === centerId ? 4 : 1.5);
        node.select("text")
            .attr("class", (person) =>
                `person-network__label${person.id === centerId || nodes.length <= 50 || labels.has(person.id) ? " is-visible" : ""}`)
            .attr("x", 10)
            .attr("y", 4)
            .text((person) => person.name);

        if (!nodes.length) {
            simulation = null;
            currentCenterId = null;
            return;
        }

        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id((person) => person.id)
                .distance((edge) => Math.max(45, 100 - Math.log2(edge.weight) * 8))
                .strength(0.35))
            .force("charge", d3.forceManyBody().strength(-180))
            .force("x", d3.forceX(width / 2)
                .strength((person) => person.id === centerId ? 0.2 : 0.025))
            .force("y", d3.forceY(height / 2)
                .strength((person) => person.id === centerId ? 0.2 : 0.025))
            .force("collide", d3.forceCollide((person) =>
                Math.max(7, Math.min(16, 5 + Math.sqrt(person.titleCount))) + 4))
            .on("tick", () => {
                link
                    .attr("x1", (edge) => edge.source.x)
                    .attr("y1", (edge) => edge.source.y)
                    .attr("x2", (edge) => edge.target.x)
                    .attr("y2", (edge) => edge.target.y);
                node.attr("transform", (person) => `translate(${person.x},${person.y})`);
            });
    }

    function clear() {
        simulation?.stop();
        simulation = null;
        linksLayer.selectAll("*").remove();
        nodesLayer.selectAll("*").remove();
        tooltip.style("display", "none");
    }

    return {
        update,
        clear,
        destroy() {
            clear();
            svg.on(".zoom", null);
            svg.selectAll("*").remove();
        },
    };
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}