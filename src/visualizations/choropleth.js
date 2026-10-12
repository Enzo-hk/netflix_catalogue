import * as d3 from "d3";
import { countTitlesByCountry } from "../data/processData.js";

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
                .on("click", (event, feature) => onSelectCountry?.(feature.properties.name))

        })

}