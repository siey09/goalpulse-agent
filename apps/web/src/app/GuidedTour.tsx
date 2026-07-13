import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { GuideStep } from "./guideSteps";

export interface GuidedTourProps {
  steps: GuideStep[];
  stepIndex: number;
  position: { top: number; left: number };
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function GuidedTour({ steps, stepIndex, position, onBack, onNext, onClose }: GuidedTourProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const progress = steps.length ? ((stepIndex + 1) / steps.length) * 100 : 0;

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        event.preventDefault();
        onBack();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onBack, onClose, onNext, stepIndex]);

  if (!step) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="GoalPulse product tour"
        aria-describedby="goalpulse-tour-detail"
        tabIndex={-1}
        data-guide-panel="true"
        className="fixed inset-x-3 bottom-3 z-[70] max-h-[calc(100vh-24px)] overflow-y-auto rounded-2xl border border-accent/35 bg-surface-1/98 p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur-xl outline-none sm:inset-x-auto sm:bottom-auto sm:w-[min(390px,calc(100vw-36px))]"
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-200">
              Product tour
            </p>
            <h2 className="mt-1 font-display text-base font-bold text-white">GoalPulse decision loop</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product tour"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white/5 text-stone-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
          <span className="font-mono font-semibold text-white">{stepIndex + 1} of {steps.length}</span>
          <span className="text-stone-400">Ingest → Detect → Explain → Verify</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8"
          role="progressbar"
          aria-label="Tour progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-4 border-l-2 border-accent pl-3">
          <p className="text-sm font-semibold text-white">{step.title}</p>
          <p id="goalpulse-tour-detail" className="mt-1 text-xs leading-5 text-stone-300">
            {step.detail}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg px-3 text-xs font-medium text-stone-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={stepIndex === 0}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 text-xs font-semibold text-stone-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label={isLastStep ? "Finish tour" : "Next"}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-canvas transition-colors hover:bg-accent-soft"
            >
              {isLastStep ? "Finish" : "Next"}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
