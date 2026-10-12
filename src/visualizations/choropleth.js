import * as d3 from "d3";
import { statsByCountry } from "../data/processData.js";

function drawLegend(svg, colorScale, centerX, y) {
    const domain = colorScale.domain();
    const items = [
        { label: "0", color: "lightgrey" },
        ...domain.map((t, i) => ({
            label: i < domain.length - 1 ? `${t}–${domain[i + 1] - 1}` : `${t}+`,
            color: colorScale(t)
        }))
    ];
    const swatchWidth = 55;
    const x = centerX - (items.length * swatchWidth) / 2;

    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${x},${y})`);

    legend.append("text")
        .attr("y", -8)
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .style("fill", "white")
        .text("Number of films produced");

    const item = legend.selectAll("g")
        .data(items)
        .join("g")
        .attr("transform", (d, i) => `translate(${i * swatchWidth},0)`);

    item.append("rect")
        .attr("width", swatchWidth)
        .attr("height", 12)
        .attr("fill", d => d.color)
        .style("opacity", .8);

    item.append("text")
        .attr("x", swatchWidth / 2)
        .attr("y", 26)
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "white")
        .text(d => d.label);
}

export function createChoropleth(data, { onSelectCountry } = {}) {
    console.log("createChoropleth called with", data.length, "titles");

    const svg = d3.select("#choropleth"),
        width = +svg.attr("width"),
        height = +svg.attr("height");

    // Map and projection
    const path = d3.geoPath();
    const projection = d3.geoMercator()
        .scale(160)
        .center([5, 40])
        .translate([width / 2, height / 2]);

    // Data mapping by country name → { total, topYear, topYearCount, genres }
    const countryStats = statsByCountry(data);
    console.log("countryStats (top 10 by titles):", [...countryStats.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10));

    // Colour scale
    const countryData = new Map();
    const colorScale = d3.scaleThreshold()
        .domain([1, 10, 50, 100, 500, 1000])
        .range(d3.schemeReds[7]);

    // Create tooltip: a single hidden <div> reused for every country
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "choropleth-tooltip")
        .style("opacity", 0);

    // Load external data
    Promise.all([
        d3.json("public/data/raw/world_countries.geojson")
        ]).then(function (loadData) {
            let topo = loadData[0];
            console.log("GeoJSON loaded with", topo.features.length, "features"); // TODO: remove all console logs later
            console.log("First 5 feature IDs:", topo.features.slice(0, 5).map(f => f.id || f.properties?.name));

            // Event handlers for mouse actions
            let mouseOver = function (event, d) {
                d3.selectAll(".Country")
                    .transition()
                    .duration(200)
                    .style("opacity", .5)
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style("opacity", 1)
                    .style("stroke", "brown") // TODO: maybe remove border later?

                // Display tooltip: name, title count, most active year and the top 5 genres
                const s = d.stats;
                const genreLines = s
                    ? s.genres.slice(0, 5).map(g => `${g.genre}: ${g.pct.toFixed(0)}%`).join("<br>")
                    : "";
                tooltip
                    .style("opacity", 1)
                    .html(s
                        ? `<strong>${d.properties.name}</strong><br>
                           Titles: ${s.total}<br>
                           Most active year: ${s.topYear} (${s.topYearCount} titles)<br>
                           <em>Top 5 Genres</em><br>${genreLines}`
                        : `<strong>${d.properties.name}</strong><br>No titles`);
            }

            // Keep the tooltip next to the cursor
            let mouseMove = function (event) {
                tooltip
                    .style("left", (event.pageX + 12) + "px")
                    .style("top", (event.pageY - 28) + "px");
            }

            // Hide the tooltip when the cursor leaves the country
            let mouseLeave = function (event, d) {
                d3.selectAll(".Country")
                    .transition()
                    .duration(200)
                    .style("opacity", .8)
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style("stroke", "transparent")
                tooltip.style("opacity", 0);
            }

            // Draw the choropleth map
            svg.append("g")
                .selectAll("path")
                .data(topo.features)
                .enter()
                .append("path")
                // draw each country
                .attr("d", d3.geoPath()
                    .projection(projection)
                )
                // set the color of each country
                .attr("fill", function (d) {
                    // Attach the country's stats to the tooltip (0/undefined if it has no titles)
                    d.stats = countryStats.get(d.properties.name);
                    d.total = d.stats ? d.stats.total : 0;
                    console.log(d.properties.name, "→", d.total); 
                    return d.total ? colorScale(d.total) : "darkgrey";
                })
                .style("stroke", "transparent")
                .attr("class", function (d) { return "Country" })
                .style("opacity", .8)
                .on("mouseover", mouseOver)
                .on("mousemove", mouseMove)
                .on("mouseleave", mouseLeave)
                .on("click", (event, feature) => onSelectCountry?.(feature.properties.name))

                drawLegend(svg, colorScale, width / 2 + 50, height - 40);
        })

}