// Shared title card: the details shown when the user hovers a movie or TV show.
// Same content and look as the beeswarm card (title, IMDb score, votes, type, directors, cast),
// so a title is described the same way in every visualisation.
//
//   const card = createTitleCard();
//   element.on("mouseenter", (event, title) => card.show(event, title))
//          .on("mousemove", (event) => card.move(event))
//          .on("mouseleave", () => card.hide());

import * as d3 from "d3";

const GAP = 8;

const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const listOrUnknown = (names) => (names?.length > 0 ? names.map(escapeHtml).join(", ") : "Unknown");

export function createTitleCard() {
    const card = d3.select("body").append("div").attr("class", "title-card");

    function move(event) {
        const bounds = card.node().getBoundingClientRect();
        const left = Math.max(GAP, Math.min(event.clientX + GAP, window.innerWidth - bounds.width - GAP));
        const top = Math.max(GAP, event.clientY - bounds.height - GAP);
        card.style("left", `${left}px`).style("top", `${top}px`);
    }

    function show(event, title) {
        card.style("display", "block").html(`
            <strong>${escapeHtml(title.title)}</strong>
            <div><span class="title-card__label">IMDb score</span>
                <span class="title-card__score">${title.imdb_score != null ? d3.format(".1f")(title.imdb_score) : "N/A"}</span>
            </div>
            <div><span class="title-card__label">Votes:</span> ${title.imdb_votes ?? "N/A"}</div>
            <div><span class="title-card__label">Type:</span> ${escapeHtml(title.type ?? "Unknown")}</div>
            <div><span class="title-card__label">Directors:</span> ${listOrUnknown(title.directors)}</div>
            <div><span class="title-card__label">Cast:</span> ${listOrUnknown(title.cast)}</div>
        `);
        move(event);
    }

    // Same card for a group of titles (e.g. an arc of the sunburst, a country of the map):
    // { heading, score, scoreLabel, rows: [[label, value], ...], hint }
    function showSummary(event, { heading, score = null, scoreLabel = "Avg IMDb score", rows = [], hint = "" }) {
        card.style("display", "block").html(`
            <strong>${escapeHtml(heading)}</strong>
            ${score != null ? `<div><span class="title-card__label">${escapeHtml(scoreLabel)}</span>
                <span class="title-card__score">${d3.format(".1f")(score)}</span></div>` : ""}
            ${rows.map(([label, value]) => `<div><span class="title-card__label">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`).join("")}
            ${hint ? `<div class="title-card__hint">${escapeHtml(hint)}</div>` : ""}
        `);
        move(event);
    }

    function hide() {
        card.style("display", "none");
    }

    return { show, showSummary, move, hide };
}
