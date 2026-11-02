import * as d3 from "d3";
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

const DEFAULT_PERSON_NAME = "Leonardo DiCaprio";

// onPersonChange(person, filteredTitles) is called after every redraw; person is null when nobody is selected
export function createNetworkExplorer(network, titles, filters, { onPersonChange } = {}) {
    const input = document.getElementById("network-person-search");
    const suggestions = document.getElementById("network-person-suggestions");
    const searchButton = document.getElementById("network-search-button");
    const backButton = document.getElementById("network-back-button");
    const status = document.getElementById("network-status");
    const graph = createPersonNetwork("#person-network", selectFromGraph);
    const history = [];
    let people;
    let peopleByName;
    let selectedPerson;
    let suggestionTimer;
    useData(network, titles);

    // Swaps in a new network/title table (e.g. after a dataset import). Does not redraw by itself.
    function useData(nextNetwork, nextTitles) {
        network = nextNetwork;
        titles = nextTitles;
        people = [...network.nodes].sort((a, b) => a.name.localeCompare(b.name));
        peopleByName = new Map(people.map((person) => [normalizeName(person.name), person]));

        // Node ids are rebuilt with the network, so keep the selection by name; otherwise fall back
        // to the default person, then to the person with the most titles in this dataset.
        const previousName = selectedPerson?.name;
        selectedPerson = (previousName && peopleByName.get(normalizeName(previousName)))
            ?? peopleByName.get(normalizeName(DEFAULT_PERSON_NAME))
            ?? d3.greatest(people, (person) => person.titleCount)
            ?? null;
        history.length = 0;
        backButton.disabled = true;
        input.value = selectedPerson?.name ?? "";
        suggestions.replaceChildren();
    }

    function render() {
        if (!selectedPerson) {
            graph.clear();
            status.textContent = "Search for an actor or director to explore their direct collaborations.";
            onPersonChange?.(null, []);
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
        // Let the side panel list this person's titles (same filtered subset as the graph)
        onPersonChange?.(selectedPerson, filteredTitles);
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
        // The caller redraws afterwards (main.js resets the filters, which triggers render)
        setData: useData,
        destroy() {
            clearTimeout(suggestionTimer);
            graph.destroy();
        },
    };
}
