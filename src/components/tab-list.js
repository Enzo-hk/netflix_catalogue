export function createTabList(container, { label = "Visualization tabs" } = {}) {
    container.replaceChildren();

    const tabList = document.createElement("div");
    tabList.className = "tab-list";

    const tabs = document.createElement("div");
    tabs.className = "tab-list__tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", label);

    const panel = document.createElement("div");
    panel.className = "tab-list__panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-live", "polite");
    panel.textContent = "Select an element to see its details.";

    tabList.append(tabs, panel);
    container.append(tabList);

    function setTabs(definitions, activeId = definitions[0]?.id) {
        tabs.replaceChildren();
        panel.replaceChildren();

        if (!definitions.length) {
            panel.textContent = "Select an element to see its details.";
            return;
        }

        definitions.forEach((definition) => {
            const button = document.createElement("button");
            button.className = "tab-list__tab";
            button.type = "button";
            button.id = `${definition.id}-tab`;
            button.textContent = definition.label;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(definition.id === activeId));
            button.addEventListener("click", () => {
                setTabs(definitions, definition.id);
            });
            tabs.append(button);
        });

        const activeDefinition = definitions.find(({ id }) => id === activeId) ?? definitions[0];
        panel.id = `${activeDefinition.id}-panel`;
        activeDefinition.render(panel);
    }

    return { element: tabList, panel, setTabs };
}
