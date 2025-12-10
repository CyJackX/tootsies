type ToggleElement = HTMLElement & {
  dataset: DOMStringMap;
};

type PanelElement = HTMLElement & {
  dataset: DOMStringMap;
};

type ToggleGalleryConfig = {
  toggleSelector: string;
  panelSelector: string;
  activeClass?: string;
  getTarget?: (toggle: ToggleElement) => string | undefined | null;
  matchPanel?: (panel: PanelElement, target: string) => boolean;
  onShowPanel?: (panel: PanelElement, target: string) => void;
};

const defaultGetTarget = (toggle: ToggleElement) => toggle.dataset?.target;

const defaultMatchPanel = (panel: PanelElement, target: string) =>
  panel.dataset?.album === target;

const defaultOnShowPanel = (panel: PanelElement) => {
  const swiperRoot = panel.querySelector<HTMLElement>(".swiper");
  const swiperInstance = (swiperRoot as any)?.swiper;
  if (swiperInstance?.update) {
    swiperInstance.update();
  }
};

export function initToggleGallery({
  toggleSelector,
  panelSelector,
  activeClass = "is-active",
  getTarget = defaultGetTarget,
  matchPanel = defaultMatchPanel,
  onShowPanel = defaultOnShowPanel,
}: ToggleGalleryConfig) {
  if (typeof document === "undefined") return;

  const toggles = Array.from(
    document.querySelectorAll<ToggleElement>(toggleSelector)
  );
  const panels = Array.from(
    document.querySelectorAll<PanelElement>(panelSelector)
  );

  if (!toggles.length || !panels.length) {
    return;
  }

  const activate = (nextToggle: ToggleElement) => {
    const target = getTarget(nextToggle);
    if (!target) return;

    toggles.forEach((toggle) => {
      const isActive = toggle === nextToggle;
      toggle.classList.toggle(activeClass, isActive);
      toggle.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    panels.forEach((panel) => {
      const matches = matchPanel(panel, target);
      panel.toggleAttribute("hidden", !matches);
      if (matches) {
        onShowPanel(panel, target);
      }
    });
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => activate(toggle));
  });

  // Ensure the initially marked toggle/panel are synchronized.
  const initiallyActive =
    toggles.find((toggle) => toggle.classList.contains(activeClass)) ??
    toggles[0];

  if (initiallyActive) {
    activate(initiallyActive);
  }
}

