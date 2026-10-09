import * as d3 from "d3";

export function createStackedAreaChart(svgSelector, data) {
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
        .range(["#e50914", "#221f1f"]); // Rouge et Noir/Gris Netflix

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
        const legendRow = legend.append("g")
            .attr("transform", `translate(0, ${i * 20})`);

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
            .text(key === "MOVIE" ? "Films" : "Séries");
    });
    addHoverEffect(g, formattedData, xScale, width, height);
}

function addHoverEffect(g, formattedData, xScale, width, height) {
    // Ligne verticale de repère
    const hoverLine = g.append("line")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#ccc")
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
    g.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .on("pointerenter pointermove", function(event) {
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
            tooltipTextYear.text(`Année : ${d.year}`);
            let total = d.MOVIE + d.SHOW;
            let pctMovie = total > 0 ? ((d.MOVIE / total) * 100).toFixed(1) : 0;
            let pctShow = total > 0 ? ((d.SHOW / total) * 100).toFixed(1) : 0;

            tooltipTextMovies.text(`Films : ${pctMovie}% (${d.MOVIE})`);
            tooltipTextShows.text(`Séries : ${pctShow}% (${d.SHOW})`);

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
        .on("pointerleave", function() {
            hoverLine.style("opacity", 0);
            tooltipGroup.style("opacity", 0);
        });
}