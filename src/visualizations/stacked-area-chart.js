import * as d3 from "d3";

// Shared filters (coordinated views), all optional:
//   yearRange: [from, to] shown as a brush selection, onSelectYears(from, to) when the user brushes a period
//   selectedType: "Movie" | "TV Show" | "", onSelectType(type) when a legend item is clicked
export function createStackedAreaChart(svgSelector, data, { yearRange = [null, null], onSelectYears, onSelectYear, selectedType = "", onSelectType } = {}) {
    // 1. Sélectionner le SVG existant et le vider
    const svg = d3.select(svgSelector);
    svg.selectAll("*").remove();

    // 2. Dimensions et marges
    const margin = { top: 30, right: 100, bottom: 40, left: 50 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Adjuster le viewBox pour la réactivité
    svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

    // 3. Groupe principal avec marges
    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 4. Agrégation des données
    const nestedData = d3.rollup(
        data,
        v => ({
            MOVIE: v.filter(d => d.type === "Movie").length,
            SHOW: v.filter(d => d.type === "TV Show").length
        }),
        d => d.release_year
    );

    const formattedData = Array.from(nestedData, ([year, counts]) => ({
        year: +year,
        MOVIE: counts.MOVIE,
        SHOW: counts.SHOW
    }))
    .filter(d => d.year && d.year >= 2000)
    .sort((a, b) => a.year - b.year);

    const keys = ["MOVIE", "SHOW"];

    // 5. Genération du Stack
    const stack = d3.stack().keys(keys);
    const series = stack(formattedData);

    // 6. Échelles (Scales)
    const xScale = d3.scaleLinear()
        .domain(d3.extent(formattedData, d => d.year))
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(series, d => d3.max(d, d => d[1]))])
        .nice()
        .range([height, 0]);

const colorScale = d3.scaleOrdinal()
        .domain(keys)
        .range(["#e50914", "#e2e8f0"]);

    // 7. Générateur d'aires
    const area = d3.area()
        .x(d => xScale(d.data.year))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    // 8. Dessiner les aires (dans g)
    g.selectAll(".layer")
        .data(series)
        .join("path")
        .attr("class", "layer")
        .attr("fill", d => colorScale(d.key))
        .attr("d", area)
        .attr("opacity", 0.85);

    // 9. Axes (dans g)
    g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

    g.append("g")
        .call(d3.axisLeft(yScale));

    // 10. Légende (dans g)
    const legend = g.append("g")
        .attr("transform", `translate(${width + 15}, 10)`);

    keys.forEach((key, i) => {
        // click on a legend item -> shared type filter (click again to remove it)
        const type = key === "MOVIE" ? "Movie" : "TV Show";
        const legendRow = legend.append("g")
            .attr("transform", `translate(0, ${i * 20})`)
            .style("cursor", onSelectType ? "pointer" : null)
            .style("opacity", selectedType && selectedType !== type ? 0.35 : 1)
            .on("click", () => onSelectType?.(selectedType === type ? "" : type));

        legendRow.append("rect")
            .attr("width", 12)
            .attr("height", 12)
            .attr("fill", colorScale(key));

        legendRow.append("text")
            .attr("x", 20)
            .attr("y", 10)
            .attr("text-anchor", "start")
            .style("font-size", "12px")
            .style("fill", "currentColor")
            .text(key === "MOVIE" ? "Movie" : "TV Show");
    });
    addHoverEffect(g, formattedData, xScale, width, height, { yearRange, onSelectYears, onSelectYear });
}

// Brush on the x axis -> shared year filter. Returns the brush group, which also receives the hover events.
function addYearBrush(g, xScale, width, height, yearRange, onSelectYears) {
    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("end", (event) => {
            if (!event.sourceEvent) return; // moved by the code below, not by the user
            if (!event.selection) return onSelectYears(null, null);
            const [from, to] = event.selection.map((x) => Math.round(xScale.invert(x)));
            onSelectYears(from, to);
        });
    const brushGroup = g.append("g").attr("class", "stacked-brush").call(brush);

    // show the current year filter as a selection
    const [minYear, maxYear] = xScale.domain();
    const [from, to] = yearRange;
    if ((from != null || to != null) && (from ?? minYear) <= maxYear && (to ?? maxYear) >= minYear) {
        brushGroup.call(brush.move, [
            xScale(Math.max(from ?? minYear, minYear)),
            xScale(Math.min(to ?? maxYear, maxYear)),
        ]);
    }
    return brushGroup;
}

function addHoverEffect(g, formattedData, xScale, width, height, { yearRange, onSelectYears, onSelectYear } = {}) {
    // Ligne verticale de repère
    const hoverLine = g.append("line")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#000000")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 4")
        .style("opacity", 0);

    // Conteneur de la Tooltip
    const tooltipGroup = g.append("g")
        .style("opacity", 0)
        .style("pointer-events", "none");

    const tooltipBg = tooltipGroup.append("rect")
        .attr("fill", "rgba(0, 0, 0, 0.85)")
        .attr("rx", 5)
        .attr("ry", 5);

    const tooltipTextYear = tooltipGroup.append("text")
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("y", 15);

    const tooltipTextMovies = tooltipGroup.append("text")
        .attr("fill", "#e50914")
        .attr("font-size", "11px")
        .attr("y", 32);

    const tooltipTextShows = tooltipGroup.append("text")
        .attr("fill", "#aaa")
        .attr("font-size", "11px")
        .attr("y", 47);

    const bisectYear = d3.bisector(d => d.year).center;

    // Rectangle overlay pour capturer les mouvements de la souris
    // (with the shared filters, the brush plays this role so that hover and brush both work)
    const overlay = onSelectYears
        ? addYearBrush(g, xScale, width, height, yearRange, onSelectYears)
        : g.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", "none")
            .attr("pointer-events", "all");

    overlay
        .on("pointerenter.hover pointermove.hover", function(event) {
            const [mouseX] = d3.pointer(event);
            const xYear = xScale.invert(mouseX);
            const index = bisectYear(formattedData, xYear);
            const d = formattedData[index];

            if (!d) return;

            const posX = xScale(d.year);

            // Mettre à jour la ligne verticale
            hoverLine
                .attr("x1", posX)
                .attr("x2", posX)
                .style("opacity", 1);

            // Mettre à jour les textes
            tooltipTextYear.text(`Year: ${d.year}`);
            let total = d.MOVIE + d.SHOW;
            let pctMovie = total > 0 ? ((d.MOVIE / total) * 100).toFixed(1) : 0;
            let pctShow = total > 0 ? ((d.SHOW / total) * 100).toFixed(1) : 0;

            tooltipTextMovies.text(`Movies: ${pctMovie}% (${d.MOVIE})`);
            tooltipTextShows.text(`TV shows: ${pctShow}% (${d.SHOW})`);

            // Repositionnement dynamique
            const tooltipX = posX > width - 130 ? posX - 135 : posX + 10;
            const tooltipY = 20;

            tooltipGroup
                .attr("transform", `translate(${tooltipX}, ${tooltipY})`)
                .style("opacity", 1);

            tooltipBg
                .attr("x", -5)
                .attr("y", 0)
                .attr("width", 130)
                .attr("height", 55);
        })
        .on("click", function(event) {
            const [mouseX] = d3.pointer(event);
            const index = bisectYear(formattedData, xScale.invert(mouseX));
            if (formattedData[index]) onSelectYear?.(formattedData[index].year);
        })
        .on("pointerleave", function() {
            hoverLine.style("opacity", 0);
            tooltipGroup.style("opacity", 0);
        });
}