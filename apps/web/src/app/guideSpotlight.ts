import type { GuideStep } from "./guideSteps";

const GUIDE_SPOTLIGHT_CLASSES = [
  "relative",
  "z-[60]",
  "scale-[1.01]",
  "ring-2",
  "ring-orange-400/70",
  "shadow-2xl",
  "shadow-orange-500/20",
];

export function clearGuideSpotlight() {
  document.querySelectorAll("[data-guide-active='true']").forEach((element) => {
    element.classList.remove(...GUIDE_SPOTLIGHT_CLASSES);
    element.removeAttribute("data-guide-active");
  });
}

function findCardByText(text: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll("section, aside, div")) as HTMLElement[];

  const matches = candidates.filter((element) => {
    const className = `${element.className}`;
    const isGuidePanel = Boolean(element.closest("[data-guide-panel='true']"));
    const isCardLike =
      className.includes("rounded-2xl") ||
      className.includes("rounded-[24px]") ||
      className.includes("rounded-[28px]") ||
      className.includes("rounded-xl") ||
      element.tagName.toLowerCase() === "section" ||
      element.tagName.toLowerCase() === "aside";

    return (
      !isGuidePanel &&
      isCardLike &&
      element.offsetParent !== null &&
      Boolean(element.textContent?.includes(text))
    );
  });

  return (
    matches.sort(
      (first, second) => first.getBoundingClientRect().height - second.getBoundingClientRect().height
    )[0] ?? null
  );
}

export function getGuideStepElement(step: GuideStep): HTMLElement | null {
  if (step.targetId) {
    const byId = document.getElementById(step.targetId);
    if (byId) return byId;
  }

  if (step.targetText) {
    return findCardByText(step.targetText);
  }

  return null;
}

export function applyGuideSpotlight(target: HTMLElement | null) {
  clearGuideSpotlight();

  if (!target) return;

  target.setAttribute("data-guide-active", "true");
  target.classList.add(...GUIDE_SPOTLIGHT_CLASSES);
}
