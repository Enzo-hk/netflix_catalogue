// Zoomable sunburst of the catalogue structure: Type -> Genre family -> Age group.

// User tasks: A5 "Identify family friendly titles" and B5 "Identify saturated markets and underserved niches".

// Visual mapping:
//   ring  <- hierarchy level (centre = current focus, then up to 3 rings)
//   angle <- number of titles (Q)
//   hue   <- genre family (C), the same hue for movies and TV shows so both types can be compared
//   luminance <- age group (O), light = young audience (Kids) to dark = adult audience
// View transformation: click an arc to zoom in, click the centre to zoom out, hover for details,
// click an age group to list its titles (details on demand).

// A title with several genres is counted once in each of its genres, so arc angles show the
// volume of each genre; the counts displayed in the centre and the tooltip are unique titles.

import * as d3 from "d3"; //manipuler les donnes et de creer la visualisation
import { createTitleCard } from "../components/tooltip.js"; // carte d'un titre, la meme que dans le beeswarm

//=========Constantes===================
const AGE_ORDER = ["Kids", "Older Kids", "Teens", "Adults", "Unrated"]; // odre d age qui doivent appraraitre used for trier les trier les groupes dans le Sunburst 
const AGE_LUMINANCE = { "Kids": 88, "Older Kids": 74, "Teens": 60, "Adults": 45 };//coder l age with luminance
const UNRATED_COLOR = "#c9c9c9"; //cas de pas d age renseigne
const TYPE_COLOR = { "Movie": "#3f3f46", "TV Show": "#71717a" };
const RINGS = 4;          // centre + type + genre + age group =- max de niveaux visibles
const SIZE = 640; // taille globale du graphique SVG
const RADIUS = SIZE / (2 * RINGS); //rayon of each anneau (+/- 80 pixels par anneau)
const MAX_LISTED_TITLES = 50;//si on clique sur un groupe d age , le nb max de titres affiches dans la liste 

//(formattage des valeurs)
const formatCount = d3.format(",");
const formatPercent = d3.format(".1%");
const formatScore = d3.format(".1f");  // the source has float noise such as 8.199999999999998

// ---------------------------------------------------------------------------
// Transformation : Data table -> hierarchy  
// ---------------------------------------------------------------------------

export function buildHierarchy(titles) {
    const rows = titles.flatMap((title) =>
        title.genre_families.map((genre) => ({ type: title.type, genre, age: title.age_group, title })));

    const grouped = d3.group(rows, (r) => r.type, (r) => r.genre, (r) => r.age);
    const root = d3.hierarchy(["Catalogue", grouped], ([, value]) => (value instanceof Map ? [...value] : null))
        .sum(([, value]) => (Array.isArray(value) ? value.length : 0))
        .sort((a, b) => (a.depth === 3
            ? AGE_ORDER.indexOf(a.data[0]) - AGE_ORDER.indexOf(b.data[0])
            : b.value - a.value));

    // Unique titles per node (a multi-genre title must not be counted twice in "Movie")
    root.eachAfter((node) => {
        if (!node.children) {
            // no children: an age group (array of rows), or an empty catalogue when no title matches the filters
            node.titles = Array.isArray(node.data[1]) ? node.data[1].map((row) => row.title) : [];
        } else {
            const unique = new Map();
            for (const child of node.children) for (const t of child.titles) unique.set(t.show_id, t);
            node.titles = [...unique.values()];
        }
    });
    return root;
}

function genreColors(root) {
    const totals = d3.rollup(root.descendants().filter((d) => d.depth === 2), (v) => d3.sum(v, (d) => d.value), (d) => d.data[0]);
    const genres = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
    // Hues spaced by the golden angle so that genres of similar size (often neighbours) get very
    // different hues; constant luminance, because luminance is reserved for the age group.
    return d3.scaleOrdinal(genres, genres.map((_, i) => d3.hcl((20 + i * 137.508) % 360, 50, 62).formatHex()));
}

const pathOf = (node) => node.ancestors().reverse().map((d) => d.data[0]);

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

// onFocusChange(path, { zoomOut }): called when the user zooms or selects an age group,
// path = ["Movie"], ["Movie", "Drama"] or ["Movie", "Drama", "Kids"] -> shared filters type / genre / age group
export function createSunburst(container, titles, { onSelect, onFocusChange } = {}) {
    const root = d3.select(container).classed("sunburst", true).html("");

    // etat qui doit survivre a un nouveau dessin
    const view = { hierarchy: null, zoom: null, focus: null };
    let selectedLeafPath = null;   // "Catalogue|Movie|Drama|Kids" quand un groupe d'age est selectionne
    let lastSignature = "";        // pour ne pas redessiner si les donnees n'ont pas change

    const chart = root.append("div").attr("class", "sunburst__chart");
    const breadcrumb = chart.append("nav").attr("class", "sunburst__breadcrumb").attr("aria-label", "Current level");
    const svg = chart.append("svg")
        .attr("viewBox", [-SIZE / 2, -SIZE / 2, SIZE, SIZE])
        .attr("role", "img")
        .attr("aria-label", "Sunburst of the Netflix catalogue: type, genre family and age group");
    const legend = chart.append("div").attr("class", "sunburst__legend");
    const details = root.append("aside").attr("class", "sunburst__details");
    const titleCard = createTitleCard(); // s'affiche au survol d'un titre de la liste

    function render(data) {
        svg.selectAll("*").remove();
        selectedLeafPath = null;
        const hierarchy = buildHierarchy(data);
        d3.partition().size([2 * Math.PI, hierarchy.height + 1])(hierarchy);
        hierarchy.each((d) => { d.current = d; });

        const color = genreColors(hierarchy);
        const fill = (d) => {
            if (d.depth === 1) return TYPE_COLOR[d.data[0]] ?? "#888";
            const genre = d.depth === 2 ? d.data[0] : d.parent.data[0];
            if (d.depth === 2) return color(genre);
            if (!(d.data[0] in AGE_LUMINANCE)) return UNRATED_COLOR;
            const lab = d3.lab(color(genre));
            lab.l = AGE_LUMINANCE[d.data[0]];
            return lab.formatHex();
        };

        const arc = d3.arc()
            .startAngle((d) => d.x0)
            .endAngle((d) => d.x1)
            .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.004))
            .padRadius(RADIUS * 1.5)
            .innerRadius((d) => d.y0 * RADIUS)
            .outerRadius((d) => Math.max(d.y0 * RADIUS, d.y1 * RADIUS - 1));

        const path = svg.append("g")
            .selectAll("path")
            .data(hierarchy.descendants().slice(1))
            .join("path")
            .attr("class", "sunburst__arc")
            .attr("fill", fill)
            .attr("fill-opacity", (d) => (arcVisible(d.current) ? 1 : 0))
            .attr("pointer-events", (d) => (arcVisible(d.current) ? "auto" : "none"))
            .attr("d", (d) => arc(d.current))
            .on("click", (event, d) => (d.children ? zoom(d) : select(d)))
            .on("mouseenter", (event, d) => showTooltip(event, d))
            .on("mousemove", (event) => titleCard.move(event))
            .on("mouseleave", () => titleCard.hide());

        const label = svg.append("g")
            .attr("class", "sunburst__labels")
            .attr("pointer-events", "none")
            .attr("text-anchor", "middle")
            .selectAll("text")
            .data(hierarchy.descendants().slice(1))
            .join("text")
            .attr("dy", "0.35em")
            .attr("fill", (d) => (d3.lab(fill(d)).l > 60 ? "#1f1f1f" : "#ffffff"))
            .attr("fill-opacity", (d) => +labelVisible(d.current))
            .attr("transform", (d) => labelTransform(d.current))
            .text((d) => shorten(d.data[0]));

        const centre = svg.append("g").attr("class", "sunburst__centre").on("click", (event) => {
            const focus = centre.datum();
            if (focus.parent) zoom(focus.parent);
        });
        centre.append("circle").attr("r", RADIUS - 2);
        const centreName = centre.append("text").attr("class", "sunburst__centre-name").attr("dy", "-0.3em");
        const centreCount = centre.append("text").attr("class", "sunburst__centre-count").attr("dy", "1.1em");

        // silent = zoom demande par les filtres partages (pas par un clic) : on ne previent personne
        function zoom(focus, { duration = 750, silent = false } = {}) {
            const zoomOut = focus.depth < (centre.datum()?.depth ?? 0);
            hierarchy.each((d) => {
                d.target = {
                    x0: Math.max(0, Math.min(1, (d.x0 - focus.x0) / (focus.x1 - focus.x0))) * 2 * Math.PI,
                    x1: Math.max(0, Math.min(1, (d.x1 - focus.x0) / (focus.x1 - focus.x0))) * 2 * Math.PI,
                    y0: Math.max(0, d.y0 - focus.depth),
                    y1: Math.max(0, d.y1 - focus.depth),
                };
            });
            const t = svg.transition().duration(duration);
            path.transition(t)
                .tween("data", (d) => {
                    const i = d3.interpolate(d.current, d.target);
                    return (time) => { d.current = i(time); };
                })
                .filter(function (d) { return +this.getAttribute("fill-opacity") || arcVisible(d.target); })
                .attr("fill-opacity", (d) => (arcVisible(d.target) ? 1 : 0))
                .attr("pointer-events", (d) => (arcVisible(d.target) ? "auto" : "none"))
                .attrTween("d", (d) => () => arc(d.current));
            label.filter(function (d) { return +this.getAttribute("fill-opacity") || labelVisible(d.target); })
                .transition(t)
                .attr("fill-opacity", (d) => +labelVisible(d.target))
                .attrTween("transform", (d) => () => labelTransform(d.current));
            setFocus(focus);
            if (!silent) {
                // clic de l'utilisateur -> filtres partages (zoomer en arriere retire les niveaux du dessous)
                selectedLeafPath = null;
                showDetails(null);
                onFocusChange?.(pathOf(focus).slice(1), { zoomOut });
            }
        }

        function setFocus(focus) {
            centre.datum(focus).classed("is-zoomed", Boolean(focus.parent));
            centreName.text(shorten(focus.data[0], 16));
            centreCount.text(`${formatCount(focus.titles.length)} titles`);
            breadcrumb.selectAll("*").remove();
            focus.ancestors().reverse().forEach((node, i, list) => {
                if (i > 0) breadcrumb.append("span").attr("class", "sunburst__separator").text("›");
                const isLast = i === list.length - 1;
                breadcrumb.append(isLast ? "span" : "button")
                    .attr("class", isLast ? "sunburst__crumb is-current" : "sunburst__crumb")
                    .text(node.data[0])
                    .on("click", isLast ? null : () => zoom(node));
            });
        }

        // survol d'un arc -> meme carte que celle du beeswarm, version "groupe de titres"
        function showTooltip(event, d) {
            const scores = d.titles.map((t) => t.imdb_score).filter((s) => s != null);
            const rows = [
                ["Titles:", formatCount(d.titles.length)],
                [`Share of ${d.parent.data[0]}:`, formatPercent(d.value / d.parent.value)],
            ];
            if (d.depth > 1) rows.push(["Share of catalogue:", formatPercent(d.value / hierarchy.value)]);
            titleCard.showSummary(event, {
                heading: pathOf(d).slice(1).join(" › "),
                score: scores.length ? d3.mean(scores) : null,  // moyenne des titres qui ont un score
                rows,
                hint: d.children ? "Click to zoom in" : "Click to list the titles",
            });
        }

        renderLegend(legend, color(hierarchy.children?.[0]?.children?.[0]?.data[0]));
        setFocus(hierarchy);
        showDetails(null);

        view.hierarchy = hierarchy;
        view.zoom = zoom;
        view.focus = () => centre.datum();
    }

    // clic sur un groupe d'age : liste des titres + filtre "Audience" (un 2e clic l'enleve)
    function select(leaf, { silent = false } = {}) {
        const fullPath = pathOf(leaf);
        if (!silent && selectedLeafPath === fullPath.join("|")) {
            selectedLeafPath = null;
            showDetails(null);
            onFocusChange?.(fullPath.slice(1, -1), { zoomOut: true });
            return;
        }
        selectedLeafPath = fullPath.join("|");
        const [, type, genre, age] = fullPath;
        showDetails({ type, genre, age, titles: leaf.titles });
        onSelect?.({ type, genre, age, titles: leaf.titles });
        if (!silent) onFocusChange?.(fullPath.slice(1), { zoomOut: false });
    }

    // les filtres partages ont change ailleurs (barre, autre vue) : zoomer sur le bon arc
    function applyFocus(path, duration) {
        if (!view.hierarchy.children) return; // aucun titre : rien a zoomer
        let node = view.hierarchy;
        for (const name of path) {
            const child = node.children?.find((c) => c.data[0] === name);
            if (!child) break;
            node = child;
        }
        const target = node.children ? node : node.parent; // un groupe d'age ne peut pas etre le centre
        if (target !== view.focus()) view.zoom(target, { duration, silent: true });
        if (!node.children) {
            if (selectedLeafPath !== pathOf(node).join("|")) select(node, { silent: true });
        } else if (selectedLeafPath) {
            selectedLeafPath = null;
            showDetails(null);
        }
    }

    // appele par main.js a chaque changement des filtres partages
    function update(data, { focus = [] } = {}) {
        const signature = `${data.length}|${data[0]?.show_id}|${data.at(-1)?.show_id}`;
        const changed = signature !== lastSignature;
        if (changed) {
            lastSignature = signature;
            render(data);
        }
        applyFocus(focus, changed ? 0 : 750);
    }

    function showDetails(selection) {
        details.selectAll("*").remove();
        if (!selection) {
            details.append("p").attr("class", "sunburst__hint")
                .text("Click an age group (outer ring) to list its titles. Click a genre or a type to zoom in, and the centre to zoom out.");
            return;
        }
        const { type, genre, age, titles: selected } = selection;
        const sorted = [...selected].sort((a, b) =>
            d3.descending(a.imdb_score ?? -1, b.imdb_score ?? -1) || d3.ascending(a.title, b.title));

        details.append("h3").text(`${genre} · ${age}`);
        details.append("p").attr("class", "sunburst__subtitle")
            .text(`${type} · ${formatCount(selected.length)} titles, best rated first`);
        const list = details.append("ol").attr("class", "sunburst__list");
        const item = list.selectAll("li").data(sorted.slice(0, MAX_LISTED_TITLES)).join("li");
        item.append("span").attr("class", "sunburst__title").text((t) => t.title);
        item.append("span").attr("class", "sunburst__meta").text((t) => [
            t.release_year,
            t.duration_minutes ? `${t.duration_minutes} min` : t.seasons ? `${t.seasons} season${t.seasons > 1 ? "s" : ""}` : null,
            t.imdb_score != null ? `IMDb ${formatScore(t.imdb_score)}` : null,
        ].filter(Boolean).join(" · "));
        // survol d'un titre -> meme carte que dans les autres visualisations
        item.on("mouseenter", (event, t) => titleCard.show(event, t))
            .on("mousemove", (event) => titleCard.move(event))
            .on("mouseleave", () => titleCard.hide());
        if (sorted.length > MAX_LISTED_TITLES) {
            details.append("p").attr("class", "sunburst__more")
                .text(`+ ${formatCount(sorted.length - MAX_LISTED_TITLES)} more titles`);
        }
    }

    update(titles);
    return { update };
}

// ---------------------------------------------------------------------------

function arcVisible(d) {
    return d.y1 <= RINGS && d.y0 >= 1 && d.x1 > d.x0;
}

function labelVisible(d) {
    return d.y1 <= RINGS && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.06;
}

function labelTransform(d) {
    const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI);
    const y = ((d.y0 + d.y1) / 2) * RADIUS;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
}

function shorten(text, max = 13) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderLegend(legend, sampleColor = "#e50914") {
    legend.selectAll("*").remove();
    legend.append("span").attr("class", "sunburst__legend-title").text("Outer ring – audience:");
    for (const age of AGE_ORDER) {
        let swatch = UNRATED_COLOR;
        if (age in AGE_LUMINANCE) {
            const lab = d3.lab(sampleColor);
            lab.l = AGE_LUMINANCE[age];
            swatch = lab.formatHex();
        }
        const entry = legend.append("span").attr("class", "sunburst__legend-item");
        entry.append("i").style("background", swatch);
        entry.append("span").text(age);
    }
}
