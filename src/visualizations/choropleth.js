import * as d3 from "d3";
import { countTitlesByCountry } from "../data/processData.js";

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

export function createChoropleth(data) {
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

    // Data and color scale
    const titlesByCountry = countTitlesByCountry(data);
    console.log("titlesByCountry counts:", [...titlesByCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

    const countryData = new Map();
    const colorScale = d3.scaleThreshold()
        .domain([1, 10, 50, 100, 500, 1000])
        .range(d3.schemeReds[7]);

    // Load external data and boot
    Promise.all([
        d3.json("public/data/raw/world_countries.geojson")
        ]).then(function (loadData) {
            let topo = loadData[0];
            console.log("GeoJSON loaded with", topo.features.length, "features");
            console.log("First 5 feature IDs:", topo.features.slice(0, 5).map(f => f.id || f.properties?.name));

            let mouseOver = function (d) {
                d3.selectAll(".Country")
                    .transition()
                    .duration(200)
                    .style("opacity", .5)
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style("opacity", 1)
                    .style("stroke", "brown") // maybe remove border later?
            }

            let mouseLeave = function (d) {
                d3.selectAll(".Country")
                    .transition()
                    .duration(200)
                    .style("opacity", .8)
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style("stroke", "transparent")
            }

            // Draw the map
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
                    d.total = titlesByCountry.get(d.properties.name) || 0;
                    console.log(d.properties.name, "→", d.total);
                    return d.total ? colorScale(d.total) : "lightgrey";
                })
                .style("stroke", "transparent")
                .attr("class", function (d) { return "Country" })
                .style("opacity", .8)
                .on("mouseover", mouseOver)
                .on("mouseleave", mouseLeave)
                drawLegend(svg, colorScale, width / 2 + 50, height - 40);
        })

}