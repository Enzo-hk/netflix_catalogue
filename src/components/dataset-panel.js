// Dataset panel: shows which dataset is displayed and lets the user change it.
//   - "Replace dataset…": import a CSV that replaces the current titles
//   - "Add update…": import a CSV whose titles are added to / replace (same show_id) the current ones
//   - "Back to default": the Netflix catalogue again
// The imported file goes through the data pipeline (src/data/pipeline.js); the panel only shows
// the pipeline report. main.js decides what to do with the new titles.

import * as d3 from "d3";
import { REQUIRED_COLUMNS } from "../data/pipeline.js";

const formatCount = d3.format(",");

// onImport(file, mode) -> Promise<{ name, count, report, added?, updated? }>, mode = "replace" | "update"
// onReset() -> { name, count }
export function createDatasetPanel(container, { name, count, onImport, onReset }) {
    const panel = d3.select(container).classed("dataset-panel", true).html("");

    const current = panel.append("div").attr("class", "dataset-panel__current");
    const actions = panel.append("div").attr("class", "dataset-panel__actions");
    const status = panel.append("p").attr("class", "dataset-panel__status").attr("aria-live", "polite");
    panel.append("p").attr("class", "dataset-panel__help")
        .text(`CSV in the Kaggle Netflix format, with the columns: ${REQUIRED_COLUMNS.join(", ")}.`);

    const fileInput = panel.append("input")
        .attr("type", "file")
        .attr("accept", ".csv,text/csv")
        .attr("hidden", true);
    let mode = "replace";

    const button = (label, onClick) => actions.append("button")
        .attr("type", "button")
        .attr("class", "dataset-panel__button")
        .text(label)
        .on("click", onClick);

    button("Replace dataset", () => { mode = "replace"; fileInput.node().click(); });
    button("Add update", () => { mode = "update"; fileInput.node().click(); });
    // always visible, disabled while the default dataset is displayed
    let isDefault = true;
    const reset = button("Back to default", () => {
        const result = onReset();
        showCurrent(result.name, result.count);
        setStatus("Default dataset restored.");
        isDefault = true;
        reset.property("disabled", true).attr("title", "The default dataset is already displayed");
    }).property("disabled", true).attr("title", "The default dataset is already displayed");

    fileInput.on("change", async (event) => {
        const file = event.target.files[0];
        event.target.value = ""; // the same file can be chosen again
        if (!file) return;
        setStatus(`Running the pipeline on ${file.name}… (the first import also loads the IMDb data, a few seconds)`);
        actions.selectAll("button").property("disabled", true); // one import at a time
        try {
            const result = await onImport(file, mode);
            showCurrent(result.name, result.count);
            setStatus(describe(file.name, result));
            isDefault = false;
        } catch (error) {
            setStatus(`${file.name} was not imported: ${error.message}`, true);
        } finally {
            actions.selectAll("button").property("disabled", false);
            reset.property("disabled", isDefault).attr("title", isDefault ? "The default dataset is already displayed" : null);
        }
    });

    function showCurrent(datasetName, titleCount) {
        current.html("");
        current.append("span").attr("class", "dataset-panel__label").text("Dataset");
        current.append("strong").text(datasetName);
        current.append("span").text(`${formatCount(titleCount)} titles`);
    }

    function setStatus(text, isError = false) {
        status.text(text).classed("is-error", isError);
    }

    showCurrent(name, count);
}

// One sentence summarising the pipeline report
function describe(fileName, { report, added, updated }) {
    const parts = [`${fileName}: ${formatCount(report.rows)} rows → ${formatCount(report.titles)} titles`];
    if (added != null) parts.push(`${formatCount(added)} new, ${formatCount(updated)} updated`);
    const { count, duplicates, reasons } = report.rejected;
    if (count) {
        const detail = Object.entries(reasons).map(([reason, n]) => `${reason}: ${n}`).join(", ");
        parts.push(`${formatCount(count)} rows rejected (${detail})`);
    }
    if (duplicates) parts.push(`${formatCount(duplicates)} duplicated rows merged`);
    parts.push(`IMDb score found for ${report.join.with_imdb_score_pct}% of the titles`);
    return `${parts.join(" · ")}.`;
}
