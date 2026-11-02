import { applyFilters } from "../data/filters.js";
import { extractPersonNeighborhood } from "../data/person-network.js";
import { createPersonNetwork } from "../visualizations/network.js";

function normalizeName(name) {
    return name.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function createNetworkExplorer(network, titles, filters) {
    const input = document.getElementById("network-person-search");
    const suggestions = document.getElementById("network-person-suggestions");
    const searchButton = document.getElementById("network-search-button");
    const backButton = document.getElementById("network-back-button");
    const status = document.getElementById("network-status");
    const people = [...network.nodes].sort((a, b) => a.name.localeCompare(b.name));
    const peopleByName = new Map(people.map((person) => [normalizeName(person.name), person]));
    const graph = createPersonNetwork("#person-network", selectFromGraph);
    const history = [];
    let selectedPerson = null;
    let suggestionTimer;

    function render() {
        if (!selectedPerson) {
            graph.clear();
            status.textContent = "Search for an actor or director to explore their direct collaborations.";
            return;
        }

        const filteredTitles = applyFilters(titles, filters.get());
        const neighborhood = extractPersonNeighborhood(
            network,
            selectedPerson.id,
            filteredTitles,
            1
        );
        graph.update(neighborhood, selectedPerson.id);
        const directConnections = neighborhood.edges.filter((edge) =>
            edge.source === selectedPerson.id || edge.target === selectedPerson.id).length;
        const capNotice = neighborhood.truncatedNodes || neighborhood.truncatedEdges
            ? ` · readability cap: ${neighborhood.truncatedNodes} people and ${neighborhood.truncatedEdges} links omitted`
            : "";
        status.textContent = `${selectedPerson.name} · ${neighborhood.nodes.length} people · ${directConnections} direct collaborations · depth 1 · ${filteredTitles.length} titles after filters${capNotice}`;
    }

    function selectPerson(person, addToHistory = true) {
        if (selectedPerson?.id === person.id) {
            render();
            return;
        }
        if (selectedPerson && addToHistory) history.push(selectedPerson);
        selectedPerson = person;
        input.value = person.name;
        backButton.disabled = history.length === 0;
        render();
    }

    function selectFromGraph(person) {
        selectPerson(person);
    }

    function search() {
        const person = peopleByName.get(normalizeName(input.value));
        if (!person) {
            status.textContent = "Choose an actor or director from the name suggestions.";
            return;
        }
        selectPerson(person);
    }

    function updateSuggestions() {
        const query = normalizeName(input.value);
        const matches = query
            ? people.filter((person) => normalizeName(person.name).includes(query)).slice(0, 15)
            : [];
        suggestions.replaceChildren(...matches.map((person) => {
            const option = document.createElement("option");
            option.value = person.name;
            return option;
        }));
    }

    input.addEventListener("input", () => {
        clearTimeout(suggestionTimer);
        suggestionTimer = setTimeout(updateSuggestions, 100);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") search();
    });
    searchButton.addEventListener("click", search);
    backButton.addEventListener("click", () => {
        const previous = history.pop();
        if (!previous) return;
        selectedPerson = previous;
        input.value = previous.name;
        backButton.disabled = history.length === 0;
        render();
    });
    filters.on("network", render);
    render();

    return {
        destroy() {
            clearTimeout(suggestionTimer);
            graph.destroy();
        },
    };
}
