// onClose(): optional, called after the ✕ button empties the panel (e.g. to deselect what filled it)
export function createTabList(container, { label = "Visualization tabs", onClose } = {}) {
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

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "tab-list__close";
    closeButton.textContent = "✕";
    closeButton.title = "Close";
    closeButton.setAttribute("aria-label", "Close details");
    closeButton.addEventListener("click", () => {
        setTabs([]);
        onClose?.();
    });

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
        tabs.append(closeButton);

        const activeDefinition = definitions.find(({ id }) => id === activeId) ?? definitions[0];
        panel.id = `${activeDefinition.id}-panel`;
        activeDefinition.render(panel);
    }

    return { element: tabList, panel, setTabs };
}
