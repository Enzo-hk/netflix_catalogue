import * as d3 from "d3";

// Shared filters (coordinated views), optional: selectedType + onSelectType(type) when a legend item is clicked
export function createBeeswarm(data, { selectedType = "", onSelectType, onSelect } = {}) {

    const svg = d3.select("#beeswarm");
    svg.selectAll("*").remove(); // redrawn when the shared filters change
    const searchInput = d3.select("#person-search");
    const suggestions = d3.select("#person-suggestions");
    const resultCount = d3.select("#beeswarm-result-count");

    const width = 900;
    const height = 600;

    const margin = {
        top: 30,
        right: 30,
        bottom: 50,
        left: 50
    };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg
        .attr("width", width)
        .attr("height", height);

    const chart = svg
        .append("g")
        .attr(
            "transform",
            `translate(${margin.left}, ${margin.top})`
        );

    // --------------------
    // Scales
    // --------------------

    const x = d3.scaleLinear()
        .domain([0, 10])
        .range([0, innerWidth]);

    const color = d3.scaleOrdinal()
        .domain(["Movie", "TV Show"])
        .range(["#e50914", "#5646c0"]);

    const maxVotes = d3.max(data, d => Number(d.imdb_votes) || 0) || 1;

    // --------------------
    // Axis
    // --------------------

    chart
        .append("g")
        .attr(
            "transform",
            `translate(0, ${innerHeight})`
        )
        .call(d3.axisBottom(x));

    chart
        .append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 40)
        .attr("text-anchor", "middle")
        .attr("fill", "#ffffff") // Couleur blanche pour la visibilité
        .text("IMDb score");

    // --------------------
    // Legend
    // --------------------

    const legend = svg
        .append("g")
        .attr("transform", `translate(${width -100}, 20)`);

    ["Movie", "TV Show"].forEach((type, i) => {

        // click on a legend item -> shared type filter (click again to remove it)
        const item = legend
            .append("g")
            .attr("transform", `translate(0, ${i * 25})`)
            .style("cursor", onSelectType ? "pointer" : null)
            .style("opacity", selectedType && selectedType !== type ? 0.35 : 1)
            .on("click", () => onSelectType?.(selectedType === type ? "" : type));

        item
            .append("circle")
            .attr("r", 6)
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("fill", color(type));

        item
            .append("text")
            .attr("x", 12)
            .attr("y", 5)
            .attr("fill", "#ffffff") // Couleur blanche pour Movie et TV Show
            .text(type);
    });

    // --------------------
    // Nodes
    // --------------------

    const nodes = data
        .filter(d => d.imdb_score != null && Number.isFinite(Number(d.imdb_score)))
        .map(d => ({
            ...d,
            x: x(Number(d.imdb_score)),
            y: innerHeight / 2,
            radius: 2,
            people: [
                ...(Array.isArray(d.cast) ? d.cast : []),
                ...(Array.isArray(d.directors) ? d.directors : [])
            ]
        }));

    // --------------------
    // Circles
    // --------------------

    const circles = chart
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("fill", d => color(d.type));

    function layoutNodes(visibleNodes) {
        const visibleSet = new Set(visibleNodes);
        circles.style("display", d => visibleSet.has(d) ? null : "none");

        if (visibleNodes.length === 0) {
            return;
        }

        const sizeFactor = Math.sqrt(nodes.length / visibleNodes.length);
        const maxRadius = Math.min(32, 13 * sizeFactor);
        const radiusScale = d3.scaleSqrt()
            .domain([0, maxVotes])
            .range([maxRadius * (2 / 13), maxRadius]);

        visibleNodes.forEach(node => {
            node.radius = radiusScale(Number(node.imdb_votes) || 0);
            node.x = x(Number(node.imdb_score));
            node.y = innerHeight / 2;
            node.vx = 0;
            node.vy = 0;
        });

        const numberOfTicks = Math.max(
            30,
            Math.min(80, Math.floor(40000 / visibleNodes.length))
        );
        const collisionIterations = visibleNodes.length > 1000 ? 1
            : visibleNodes.length > 500 ? 2 : 3;
        const simulation = d3.forceSimulation(visibleNodes)
            .force("x", d3.forceX(d => x(Number(d.imdb_score))).strength(0.8))
            .force("y", d3.forceY(innerHeight / 2).strength(0.01))
            .force(
                "collide",
                d3.forceCollide(d => d.radius + 4.5).strength(0.9).iterations(1)
            )
            .stop();

        for (let i = 0; i < numberOfTicks; i++) {
            simulation.tick();
        }

        visibleNodes.forEach(node => {
            node.x = Math.max(node.radius, Math.min(innerWidth - node.radius, node.x));
            node.y = Math.max(node.radius, Math.min(innerHeight - node.radius, node.y));
        });

        circles
            .filter(d => visibleSet.has(d))
            .attr("r", d => d.radius)
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    }

    // --------------------
    // Tooltip
    // --------------------

    const tooltip = d3.select("#beeswarm-tooltip");

    function positionTooltip(event) {
        const tooltipBounds = tooltip.node().getBoundingClientRect();
        const gap = 8;
        const left = Math.max(
            gap,
            Math.min(event.clientX + gap, window.innerWidth - tooltipBounds.width - gap)
        );
        const top = Math.max(gap, event.clientY - tooltipBounds.height - gap);

        tooltip
            .style("left", `${left}px`)
            .style("top", `${top}px`);
    }

    const people = Array.from(new Set(
        nodes.flatMap(d => d.people)
            .filter(name => typeof name === "string" && name.trim())
    )).sort((a, b) => a.localeCompare(b));

    const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    function updateFilter() {
        const query = searchInput.property("value").trim();
        const pattern = query ? new RegExp(escapeRegex(query), "i") : null;
        const visibleNodes = pattern
            ? nodes.filter(d => d.people.some(name => pattern.test(name)))
            : nodes;

        layoutNodes(visibleNodes);
        resultCount.text(`Showing ${visibleNodes.length} of ${nodes.length} titles`);

        const matchingPeople = [];
        if (pattern) {
            for (const name of people) {
                if (pattern.test(name)) {
                    matchingPeople.push(name);
                    if (matchingPeople.length === 20) {
                        break;
                    }
                }
            }
        }

        suggestions.selectAll("option")
            .data(matchingPeople)
            .join("option")
            .attr("value", name => name);
    }

    let filterTimeout;
    searchInput.on("input", () => {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(updateFilter, 100);
    });
    updateFilter();

    circles
        .on("mouseover", (event, d) => {

            tooltip
                .style("display", "block")
                .html(`
                    <strong>${d.title}</strong>
                    <div><span class="tooltip-label">IMDb score</span>
                        <span class="tooltip-score">${d.imdb_score ?? "N/A"}</span>
                    </div>
                    <div><span class="tooltip-label">Votes:</span>
                        ${d.imdb_votes ?? "N/A"}
                    </div>
                    <div><span class="tooltip-label">Type:</span>
                        ${d.type ?? "Unknown"}
                    </div>
                    <div><span class="tooltip-label">Directors:</span>
                        ${d.directors?.length > 0 ? d.directors : "Unknown"}
                    </div>
                    <div><span class="tooltip-label">Cast:</span>
                        ${d.cast?.length > 0 ? d.cast : "Unknown"}
                    </div>
                `)
            positionTooltip(event);
        })
        .on("mousemove", positionTooltip)
        .on("mouseout", () => {
            tooltip
                .style("display", "none");
        })
        .on("click", (event, d) => {
            onSelect?.(d);
        });
}