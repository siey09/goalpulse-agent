import { useEffect, useRef, useState } from "react";
import type { ReplayBacktest } from "../types";
import { GUIDE_STEPS } from "./guideSteps";
import {
  applyGuideSpotlight,
  clearGuideSpotlight,
  getGuideStepElement,
} from "./guideSpotlight";
import type { DestinationId } from "./navigation";

const GUIDE_PROGRESS_KEY = "goalpulse-product-tour-step";
const DEFAULT_POSITION = { top: 16, left: 16 };
const TARGET_RETRY_DELAY_MS = 120;
const TARGET_RETRY_LIMIT = 25;

export interface UseProductTourOptions {
  destination: DestinationId;
  onDestinationChange: (destination: DestinationId) => void;
  replayBacktestReady: boolean;
  isReplayRunning: boolean;
  onRunReplayBacktest: () => void | Promise<ReplayBacktest | void>;
}

function getPanelPosition(target: HTMLElement | null) {
  const panelWidth = Math.min(390, window.innerWidth - 24);
  const panelHeight = 320;
  const margin = 18;

  if (!target) {
    return {
      top: margin,
      left: Math.max(margin, window.innerWidth - panelWidth - margin),
    };
  }

  const rect = target.getBoundingClientRect();
  const canPlaceRight = rect.right + margin + panelWidth <= window.innerWidth;
  const canPlaceLeft = rect.left - margin - panelWidth >= margin;
  const left = canPlaceRight
    ? rect.right + margin
    : canPlaceLeft
      ? rect.left - panelWidth - margin
      : Math.max(margin, window.innerWidth - panelWidth - margin);
  const centeredTop = rect.top + rect.height / 2 - panelHeight / 2;
  const top = Math.min(
    Math.max(margin, centeredTop),
    Math.max(margin, window.innerHeight - panelHeight - margin)
  );

  return { top, left };
}

export function useProductTour({
  destination,
  onDestinationChange,
  replayBacktestReady,
  isReplayRunning,
  onRunReplayBacktest,
}: UseProductTourOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const onRunReplayBacktestRef = useRef(onRunReplayBacktest);

  onRunReplayBacktestRef.current = onRunReplayBacktest;

  const currentStep = GUIDE_STEPS[stepIndex];

  useEffect(() => {
    if (!isOpen || !currentStep) return;

    clearGuideSpotlight();

    if (currentStep.requiresReplayBacktest && !replayBacktestReady && !isReplayRunning) {
      void onRunReplayBacktestRef.current();
    }

    let attempts = 0;
    let timeout: number;

    const locateTarget = () => {
      const target = getGuideStepElement(currentStep);

      if (target) {
        target.scrollIntoView?.({ behavior: "smooth", block: "center" });
        applyGuideSpotlight(target);
        setPosition(getPanelPosition(target));
        window.localStorage.setItem(GUIDE_PROGRESS_KEY, String(stepIndex));
        return;
      }

      if (attempts >= TARGET_RETRY_LIMIT) {
        const nextIndex = stepIndex + 1;
        if (nextIndex < GUIDE_STEPS.length) {
          const nextStep = GUIDE_STEPS[nextIndex];
          setStepIndex(nextIndex);
          if (nextStep.destination !== destination) onDestinationChange(nextStep.destination);
        } else {
          setIsOpen(false);
          setStepIndex(0);
          setPosition(DEFAULT_POSITION);
          window.localStorage.removeItem(GUIDE_PROGRESS_KEY);
        }
        return;
      }

      attempts += 1;
      timeout = window.setTimeout(locateTarget, TARGET_RETRY_DELAY_MS);
    };

    timeout = window.setTimeout(locateTarget, 220);

    return () => window.clearTimeout(timeout);
  }, [currentStep, destination, isOpen, isReplayRunning, onDestinationChange, replayBacktestReady, stepIndex]);

  useEffect(() => () => clearGuideSpotlight(), []);

  function goToStep(nextIndex: number) {
    const boundedIndex = Math.min(Math.max(0, nextIndex), GUIDE_STEPS.length - 1);
    const nextStep = GUIDE_STEPS[boundedIndex];
    setStepIndex(boundedIndex);
    if (nextStep.destination !== destination) {
      onDestinationChange(nextStep.destination);
    }
  }

  function start() {
    const savedStep = Number(window.localStorage.getItem(GUIDE_PROGRESS_KEY));
    const initialStep = Number.isInteger(savedStep) && savedStep >= 0 && savedStep < GUIDE_STEPS.length
      ? savedStep
      : 0;
    setIsOpen(true);
    goToStep(initialStep);
  }

  function next() {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= GUIDE_STEPS.length) {
      close();
      return;
    }
    goToStep(nextIndex);
  }

  function back() {
    goToStep(stepIndex - 1);
  }

  function close() {
    clearGuideSpotlight();
    setIsOpen(false);
    setStepIndex(0);
    setPosition(DEFAULT_POSITION);
    window.localStorage.removeItem(GUIDE_PROGRESS_KEY);
  }

  return {
    steps: GUIDE_STEPS,
    isOpen,
    stepIndex,
    position,
    currentStep,
    start,
    next,
    back,
    close,
  };
}
