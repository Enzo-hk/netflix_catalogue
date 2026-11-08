import * as d3 from "d3";

// Parallel coordinates: one axis per numeric column, one line per title
// User tasks: B4 (what goes with success) and A3 (find top-rated titles)
// Lines are drawn on a canvas (fast), axes and filters in SVG

// Axes from left to right (log = true for columns with a few huge values)
// zeroIsMissing: 0 means "unknown" in the data, not a real 0
const AXES = [
    { key: "imdb_score",       label: "IMDb score",     log: false },
    { key: "imdb_votes",       label: "IMDb votes",     log: true  },
    { key: "budget",           label: "Budget ($)",     log: true  },
    { key: "revenue",          label: "Revenue ($)",    log: true  },
    { key: "duration_minutes", label: "Duration (min)", log: false },
    { key: "cast_size",        label: "Cast size",      log: false, zeroIsMissing: true },
    { key: "production_country_count", label: "Countries", log: false, zeroIsMissing: true },
];

// Films in Netflix red, series in teal (colour-blind safe pair)
const TYPE_COLORS = { "Movie": "#E50914", "TV Show": "#0E9AA7" };

// Line opacity: no filter / inside the filters / outside the filters
const OPACITY_DEFAULT = 0.15;
const OPACITY_SELECTED = 0.6;
const OPACITY_FADED = 0.02;

// Light grey for the hovered line and the filter boxes
const HOVER_COLOR = "#e1d7d7";

// Half-width of the draggable zone around each axis, in px
const DRAG_ZONE = 18;

// Value as a number, or null if missing
function getValue(row, key) {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") return null;
    const number = +raw;
    return Number.isFinite(number) ? number : null;
}

// Value of a title on one axis, 0 counts as missing when the axis says so
function axisValue(row, axis) {
    const value = getValue(row, axis.key);
    if (axis.zeroIsMissing && value === 0) return null;
    return value;
}

// Ticks 1, 10, 100... inside [min, max], for log axes
function powersOfTen([min, max]) {
    const ticks = [];
    for (let p = 1; p <= max; p *= 10) {
        if (p >= min) ticks.push(p);
    }
    return ticks;
}

// 150000000 -> "150M", missing -> "no data"
function formatNumber(value) {
    if (value === null || value === undefined) return "no data";
    return d3.format(".3~s")(value).replace("G", "B");
}

// Same as formatNumber, with a $ in front
function formatMoney(value) {
    return value === null || value === undefined ? "no data" : "$" + formatNumber(value);
}

// Filter boxes kept as values (axis key -> [top value, bottom value]),
// so they come back when a shared filter redraws the chart
const savedRanges = new Map();

// Called from main.js
// Shared filters (coordinated views), optional: selectedType + onSelectType(type) when a legend item is clicked
export function createParallelCoordinates(svgSelector, data, { selectedType = "", onSelectType, onFilterChange } = {}) {


    // 1. Clear the SVG
    const svg = d3.select(svgSelector);
    svg.selectAll("*").remove();

    // 2. Size and margins
    const margin = { top: 75, right: 40, bottom: 40, left: 40 };
    const width = 900 - margin.left - margin.right;
    const height = 480 - margin.top - margin.bottom;

    svg.attr("viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const plotHeight = height - 40;  // bottom of the real values
    const noDataY = height - 10;     // where missing values go

    // 3. Keep only titles with an IMDb score
    const rows = data.filter(d => getValue(d, "imdb_score") !== null);

    // 4. Scales
    // x: position of each axis
    const x = d3.scalePoint()
        .domain(AXES.map(axis => axis.key))
        .range([0, width]);

    // y: one scale per axis, since units differ
    const y = {};

    AXES.forEach(axis => {
        const values = rows
            .map(d => axisValue(d, axis))
            .filter(v => v !== null);

        if (values.length === 0) {
            console.warn(`No values found for "${axis.key}", check the column name`);
        }

        const scale = axis.log ? d3.scaleSymlog() : d3.scaleLinear();
        scale.domain(d3.extent(values))
             .range([plotHeight, 0]);  // big values at the top
        if (!axis.log) scale.nice();

        y[axis.key] = scale;
    });

    // Height of a title on an axis, or the "no data" strip
    function yPosition(d, axis) {
        const value = axisValue(d, axis);
        return value === null ? noDataY : y[axis.key](value);
    }

    // 5. Compute every line's points once
    const axisX = AXES.map(axis => x(axis.key));
    const positions = new Map(
        rows.map(d => [d, AXES.map(axis => yPosition(d, axis))])
    );

    // 6. Canvas for the lines, inside the SVG so it scales with it
    const pixelRatio = window.devicePixelRatio || 1;

    const canvas = g.append("foreignObject")
        .attr("width", width)
        .attr("height", height)
        .append("xhtml:canvas")
        .attr("width", width * pixelRatio)  // real pixels
        .attr("height", height * pixelRatio)
        .style("width", `${width}px`)       // displayed size
        .style("height", `${height}px`)
        .style("display", "block");

    const ctx = canvas.node().getContext("2d");
    ctx.scale(pixelRatio, pixelRatio);

    // Paint a list of titles with one opacity
    function paintLines(titles, opacity, context = ctx) {
        context.globalAlpha = opacity;
        context.lineWidth = 1;
        titles.forEach(d => {
            const ys = positions.get(d);
            context.strokeStyle = TYPE_COLORS[d.type] || "#999";
            context.beginPath();
            context.moveTo(axisX[0], ys[0]);
            for (let i = 1; i < ys.length; i++) {
                context.lineTo(axisX[i], ys[i]);
            }
            context.stroke();
        });
    }

    // Paint all lines once into a hidden canvas, reused on every redraw
    function makeLayer(opacity) {
        const layer = document.createElement("canvas");
        layer.width = width * pixelRatio;
        layer.height = height * pixelRatio;
        const layerCtx = layer.getContext("2d");
        layerCtx.scale(pixelRatio, pixelRatio);
        paintLines(rows, opacity, layerCtx);
        return layer;
    }
    const allLinesLayer = makeLayer(OPACITY_DEFAULT);
    const fadedLinesLayer = makeLayer(OPACITY_FADED);

    let visibleTitles = rows;
    // The list on the right is slow to rebuild: only update it when a box is released
    let listNeedsUpdate = true;

    // Redraw: copy a ready layer, then paint only the selected lines
    function drawLines() {
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 1;

        if (selections.size === 0) {
            visibleTitles = rows;
            ctx.drawImage(allLinesLayer, 0, 0, width, height);
        } else {
            visibleTitles = rows.filter(d => isSelected(d));
            ctx.drawImage(fadedLinesLayer, 0, 0, width, height);
            paintLines(visibleTitles, OPACITY_SELECTED);
        }

        updateFilterInfo();
        if (listNeedsUpdate) {
            listNeedsUpdate = false;
            // Best score first in the list on the right (task A3), on a copy so the chart's order stays the same
            onFilterChange?.([...visibleTitles].sort((a, b) => b.imdb_score - a.imdb_score));
        }
    }

    // Layer between the canvas and the axes, used by the hover code
    const hoverLayer = g.append("g");

    // 7. Axes
    const axisGroups = g.selectAll(".pc-axis")
        .data(AXES)
        .join("g")
        .attr("class", "pc-axis")
        .attr("transform", axis => `translate(${x(axis.key)},0)`);

    axisGroups.each(function (axis) {
        const axisGenerator = d3.axisLeft(y[axis.key])
            .tickSizeOuter(0);  // no extra tick at the ends

        if (axis.log) {
            axisGenerator
                .tickValues(powersOfTen(y[axis.key].domain()))
                .tickFormat(formatNumber);
        } else {
            axisGenerator.ticks(5);
        }

        d3.select(this).call(axisGenerator);
    });

    // Grey band showing where you can drag
    axisGroups.insert("rect", ":first-child")
        .attr("class", "pc-drag-zone")
        .attr("x", -DRAG_ZONE)
        .attr("width", DRAG_ZONE * 2)
        .attr("height", plotHeight)
        .attr("rx", 4);

    // Axis title
    axisGroups.append("text")
        .attr("y", -15)
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .style("font-weight", "bold")
        .style("fill", "currentColor")
        .text(axis => axis.label);

    // "no data" label
    axisGroups.append("text")
        .attr("y", noDataY + 16)
        .attr("x", -6)
        .attr("text-anchor", "middle")
        .style("font-size", "9px")
        .style("fill", "#999")
        .text("no data");

    // 8. Brushing (filter boxes on the axes)

    // Active filters: axis index -> [top px, bottom px]
    const selections = new Map();

    const brush = d3.brushY()
        .extent([[-DRAG_ZONE, 0], [DRAG_ZONE, plotHeight]])
        .handleSize(12)  // thicker edges, easier to resize
        .on("start brush end", function (event, axis) {
            const i = AXES.indexOf(axis);

            if (event.selection) {
                selections.set(i, event.selection);
                const [top, bottom] = event.selection;
                savedRanges.set(axis.key, [y[axis.key].invert(top), y[axis.key].invert(bottom)]);
            } else {
                selections.delete(i);
                savedRanges.delete(axis.key);
            }

            updateRangeLabels(i, event.selection); 

            if (event.type === "end") 
                listNeedsUpdate = true;  // box released 
            scheduleDraw();
        });

    const brushGroups = axisGroups.append("g")
        .attr("class", "pc-brush")
        .call(brush);

    // Filter box style
    brushGroups.selectAll(".selection")
        .attr("fill", HOVER_COLOR)
        .attr("fill-opacity", 0.08)
        .attr("stroke", HOVER_COLOR)
        .attr("stroke-width", 1.5)
        .attr("rx", 3);

    // Darker band on mouse over
    // selectAll, not select: select would overwrite data the brush needs
    brushGroups.selectAll(".overlay")
        .on("pointerenter.zone", function () {
            d3.select(this.parentNode.parentNode).select(".pc-drag-zone").classed("is-active", true);
        })
        .on("pointerleave.zone", function () {
            d3.select(this.parentNode.parentNode).select(".pc-drag-zone").classed("is-active", false);
        });

    // Range values shown next to each box
    const rangeLabels = axisGroups.append("g")
        .style("pointer-events", "none")
        .style("display", "none");
    rangeLabels.append("text").attr("class", "pc-range-label range-top");
    rangeLabels.append("text").attr("class", "pc-range-label range-bottom");
    rangeLabels.selectAll("text")
        .attr("x", DRAG_ZONE + 4);

    // Pixel -> readable data value on an axis
    function valueAt(axis, pixel) {
        const value = y[axis.key].invert(pixel);
        if (axis.log) 
            return formatNumber(value);
        // IMDb score keeps 1 decimal, the other axes are whole numbers
        return axis.key === "imdb_score" ? String(Math.round(value * 10) / 10) : String(Math.round(value));
    }

    // Update the two labels of one axis
    function updateRangeLabels(i, selection) {
        const labels = rangeLabels.filter((axis, index) => index === i);
        if (!selection) {
            labels.style("display", "none");
            return;
        }
        const [top, bottom] = selection;
        labels.style("display", null);
        labels.select(".range-top").attr("y", top + 4).text(valueAt(AXES[i], top));
        labels.select(".range-bottom").attr("y", bottom + 4).text(valueAt(AXES[i], bottom));
    }

    // True if the title is inside every filter box
    function isSelected(d) {
        const ys = positions.get(d);
        for (const [i, [top, bottom]] of selections) {
            if (ys[i] < top || ys[i] > bottom) return false;
        }
        return true;
    }

    // Redraw at most once per frame
    let pendingFrame = null;
    function scheduleDraw() {
        if (pendingFrame) return;
        pendingFrame = requestAnimationFrame(() => {
            pendingFrame = null;
            drawLines();
        });
    }

    // 9. Hover: find the closest line, highlight it, show its details

    // Invisible rectangle catching the mouse
    const mouseCatcher = hoverLayer.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all");

    // Hovered line: white outline, dark line, a dot on each axis
    const highlight = g.append("g")
        .style("pointer-events", "none")
        .style("display", "none");
    const highlightOutline = highlight.append("path")
        .attr("fill", "none")
        .attr("stroke", "#fff")
        .attr("stroke-width", 6);
    const highlightLine = highlight.append("path")
        .attr("fill", "none")
        .attr("stroke", HOVER_COLOR)
        .attr("stroke-width", 3);
    const highlightDots = highlight.selectAll("circle")
        .data(AXES)
        .join("circle")
        .attr("r", 4)
        .attr("fill", HOVER_COLOR)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);

    // Hover card: an HTML div on the page, styled like the beeswarm card
    d3.selectAll(".pc-tooltip").remove();  // old card if the chart is redrawn
    const tooltip = d3.select("body").append("div")
        .attr("class", "pc-tooltip")
        .style("display", "none");

    const tooltipTitle = tooltip.append("div")
        .attr("class", "pc-tooltip__title");

    // "Film, released 2019"
    const tooltipType = tooltip.append("div");

    // IMDb score in a yellow badge, then the votes
    const scoreRow = tooltip.append("div");
    scoreRow.append("span")
        .attr("class", "pc-tooltip__label")
        .text("IMDb: ");
    const tooltipScore = scoreRow.append("span")
        .attr("class", "pc-tooltip__score");
    const tooltipVotes = scoreRow.append("span");

    const tooltipRows = tooltip.append("div");

    // Visible title whose line is closest to the mouse, max 6px away
    function findClosestTitle(mouseX, mouseY) {
        // Axis just left of the mouse
        let i = d3.bisectRight(axisX, mouseX) - 1;
        i = Math.max(0, Math.min(i, AXES.length - 2));
        // 0 on that axis, 1 on the next one
        const t = (mouseX - axisX[i]) / (axisX[i + 1] - axisX[i]);

        let closest = null;
        let closestDistance = 6;
        for (const d of visibleTitles) {
            const ys = positions.get(d);
            const lineY = ys[i] + t * (ys[i + 1] - ys[i]);  // line height at the mouse
            const distance = Math.abs(lineY - mouseY);
            if (distance < closestDistance) {
                closest = d;
                closestDistance = distance;
            }
        }
        return closest;
    }

    function showTooltip(d, event) {
        tooltipTitle.text(d.title);
        tooltipType.text(`${d.type === "Movie" ? "Film" : "Series"}, released ${d.release_year}`);
        tooltipScore.text(d.imdb_score);
        tooltipVotes.text(` (${formatNumber(d.imdb_votes)} votes)`);

        // Grey label, white value
        const rows = [
            ["Budget", formatMoney(d.budget)],
            ["Revenue", formatMoney(d.revenue)],
            ["Duration", d.duration_minutes != null ? Math.round(d.duration_minutes) + " min"
                : d.seasons ? `${d.seasons} season${d.seasons > 1 ? "s" : ""}` : "no data"],
            ["Cast size", d.cast_size || "no data"],
            ["Countries", d.production_country_count || "no data"],
        ];
        tooltipRows.selectAll("div")
            .data(rows)
            .join("div")
            .html(([label, value]) => `<span class="pc-tooltip__label">${label}:</span> ${value}`);

        // Show it first, then measure it
        tooltip.style("display", null);
        const box = tooltip.node().getBoundingClientRect();

        // Above right of the mouse, flipped when it would leave the window
        const left = event.clientX + box.width + 20 > window.innerWidth
            ? event.clientX - box.width - 15
            : event.clientX + 15;
        const top = event.clientY - box.height - 15 < 0
            ? event.clientY + 15
            : event.clientY - box.height - 15;
        tooltip.style("left", `${left}px`).style("top", `${top}px`);
    }

    mouseCatcher
        .on("pointermove", function (event) {
            const [mouseX, mouseY] = d3.pointer(event, g.node());
            const d = findClosestTitle(mouseX, mouseY);

            if (!d) {
                highlight.style("display", "none");
                tooltip.style("display", "none");
                return;
            }
            const points = axisX.map((px, i) => [px, positions.get(d)[i]]);
            highlightOutline.attr("d", d3.line()(points));
            highlightLine.attr("d", d3.line()(points));
            highlightDots
                .attr("cx", (axis, i) => points[i][0])
                .attr("cy", (axis, i) => points[i][1]);
            highlight.style("display", null);
            showTooltip(d, event);
        })
        .on("pointerleave", () => {
            highlight.style("display", "none");
            tooltip.style("display", "none");
        });

    // 10. Help text, counter, reset button, empty message
    g.append("text")
        .attr("y", -52)
        .attr("class", "pc-help")
        .text("Drag on an axis to filter. Drag the box to move it, or its edges to resize.");

    const counter = g.append("text")
        .attr("class", "pc-counter")
        .attr("y", height + 28);

    const resetButton = g.append("text")
        .attr("x", width)
        .attr("y", height + 28)
        .attr("text-anchor", "end")
        .attr("class", "pc-reset")
        .text("Reset all filters")
        .on("click", () => {
            // Removing each box clears its filter
            brushGroups.each(function () {
                d3.select(this).call(brush.move, null);
            });
        });

    const emptyMessage = g.append("text")
        .attr("x", width / 2)
        .attr("y", plotHeight / 2)
        .attr("text-anchor", "middle")
        .attr("class", "pc-empty")
        .text("No titles match all filters. Widen a box or reset.");

    // Runs after every redraw
    function updateFilterInfo() {
        emptyMessage.style("display", visibleTitles.length === 0 ? null : "none");

        // e.g. "IMDb score 6.2 to 8.5, Revenue ($) 10M to 1B"
        const filters = [...selections].map(([i, [top, bottom]]) =>
            `${AXES[i].label} ${valueAt(AXES[i], bottom)} to ${valueAt(AXES[i], top)}`);

        counter.text(
            `Showing ${visibleTitles.length.toLocaleString()} of ${rows.length.toLocaleString()} titles` +
            (filters.length ? `  |  Filters: ${filters.join(", ")}` : ""));
        resetButton.style("display", selections.size > 0 ? null : "none");
    }

    // 11. Legend
    const legend = g.append("g")
        .attr("transform", `translate(${width - 140}, -62)`);

    Object.entries(TYPE_COLORS).forEach(([type, color], i) => {
        // click on a legend item -> shared type filter (click again to remove it)
        const item = legend.append("g")
            .attr("transform", `translate(${i * 70}, 0)`)
            .style("cursor", onSelectType ? "pointer" : null)
            .style("opacity", selectedType && selectedType !== type ? 0.35 : 1)
            .on("click", () => onSelectType?.(selectedType === type ? "" : type));

        item.append("rect")
            .attr("width", 12)
            .attr("height", 12)
            .attr("fill", color);

        item.append("text")
            .attr("x", 16)
            .attr("y", 10)
            .attr("class", "pc-legend-label")
            .text(type === "Movie" ? "Movie" : "TV Show");
    });

    // Put back the boxes from before the redraw
    brushGroups.each(function (axis) {
        const range = savedRanges.get(axis.key);
        if (!range) return;
        const top = Math.max(0, y[axis.key](range[0]));
        const bottom = Math.min(plotHeight, y[axis.key](range[1]));
        if (bottom - top > 1) d3.select(this).call(brush.move, [top, bottom]);
    });

    // First draw
    drawLines();
}
