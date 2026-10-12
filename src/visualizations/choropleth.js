import * as d3 from "d3";
import { countTitlesByCountry, toNetflixCountryName } from "../data/processData.js";

// selectedCountry: the shared "country" filter (Netflix spelling), highlighted on the map
// onSelectCountry(name): called when a country is clicked ("" when the selected one is clicked again)
export function createChoropleth(data, { selectedCountry = "", onSelectCountry } = {}) {
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
            svg.selectAll("*").remove(); // redrawn when the shared filters change
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

            // the selected country keeps a white border
            const isSelected = (d) => selectedCountry && toNetflixCountryName(d.properties.name) === selectedCountry;
            const restingStroke = (d) => (isSelected(d) ? "#ffffff" : "transparent");

            let mouseLeave = function (event, d) {
                d3.selectAll(".Country")
                    .transition()
                    .duration(200)
                    .style("opacity", .8)
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style("stroke", restingStroke(d))
            }

            // click on a country -> shared country filter (click again to remove it)
            let click = function (event, d) {
                if (!onSelectCountry || !d.total) return;
                const name = toNetflixCountryName(d.properties.name);
                onSelectCountry(name === selectedCountry ? "" : name);
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
                .style("stroke", restingStroke)
                .style("stroke-width", (d) => (isSelected(d) ? 2 : 1))
                .style("cursor", (d) => (onSelectCountry && d.total ? "pointer" : "default"))
                .attr("class", function (d) { return "Country" })
                .style("opacity", .8)
                .on("mouseover", mouseOver)
                .on("mouseleave", mouseLeave)
                .on("click", click)

        })

}