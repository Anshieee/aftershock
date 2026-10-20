import { useState } from 'react';
import { Button, IconButton } from './ui';
import { IconClose, IconGuide, IconPlay, IconSkip } from './Icons';
import { useStore } from '../state/store';

interface GuideStep {
  title: string;
  body: string;
  /** What the guide does when the step is shown. */
  action?: 'reveal-direct' | 'reveal-indirect' | 'open-graph' | 'none';
}

const STEPS: GuideStep[] = [
  {
    title: 'A paper with a prepared investigation',
    body:
      'This is a fictional manuscript. Its findings are prepared sample data — nothing here has been analysed by a service. I can point out where to look.',
    action: 'none',
  },
  {
    title: 'Marks in the margin',
    body:
      'Coloured underlines mark the passages where the evidence behind a claim may need a human look. That passage is one of them.',
    action: 'reveal-direct',
  },
  {
    title: 'Plain language first',
    body:
      'Selecting a passage opens the evidence panel. It starts with what the issue is, in ordinary words — no graph vocabulary needed.',
    action: 'none',
  },
  {
    title: 'One level deeper, if you want it',
    body:
      '“The evidence relationship” adds the publication, the notice and how the two are connected. “Provenance and records” adds the raw source pointers.',
    action: 'none',
  },
  {
    title: 'The network',
    body:
      'The graph shows every record this investigation contains — nothing is hidden behind a click. Open it to see how the pieces connect.',
    action: 'open-graph',
  },
  {
    title: 'A human decides',
    body:
      'Back in the reader, record what you decide. A decision is a workflow state: it never certifies a claim, and it never changes the manuscript.',
    action: 'reveal-direct',
  },
];

export function Guide({
  onReveal,
  onOpenGraph,
}: {
  onReveal: (findingId: string) => void;
  onOpenGraph: () => void;
}) {
  const { state, dispatch } = useStore();
  const [expanded, setExpanded] = useState(false);

  const step = STEPS[Math.min(state.guideStep, STEPS.length - 1)]!;
  const last = state.guideStep >= STEPS.length - 1;

  const runAction = (action: GuideStep['action']) => {
    if (action === 'reveal-direct') onReveal('finding-direct-support');
    if (action === 'reveal-indirect') onReveal('finding-indirect-dependency');
    if (action === 'open-graph') onOpenGraph();
  };

  if (!state.guideActive && !state.guideCompleted) {
    return (
      <div className="absolute bottom-4 left-4 z-30">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'guide-start' });
            setExpanded(true);
          }}
          className="flex h-8 items-center gap-1.5 rounded-full border border-ink-border bg-paper-raised/95 px-3 text-2xs font-medium text-ink-muted shadow-lift-2 backdrop-blur transition-colors duration-150 hover:border-brand-line hover:text-brand-deep"
        >
          <IconGuide size={14} />
          Take a quick tour
        </button>
      </div>
    );
  }

  if (state.guideCompleted) {
    return (
      <div className="absolute bottom-4 right-4 z-30 max-w-[320px] rounded-lg border border-ink-border bg-paper-raised/95 p-3 shadow-lift-2 backdrop-blur">
        <p className="text-sm font-medium text-ink">That is the whole loop</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          The manuscript stays open. Upload a paper of your own, or keep exploring the example.
        </p>
        <div className="mt-2.5 flex gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => dispatch({ type: 'guide-start' })}>
            Restart tour
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => dispatch({ type: 'guide-stop' })}
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-30 w-[min(330px,calc(100vw-2rem))] rounded-lg border border-brand-line bg-paper-raised/97 shadow-lift-3 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-ink-border px-3 py-2">
        <IconGuide size={14} className="text-brand" />
        <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand-deep">
          Guided example
        </span>
        <span className="meta ml-auto">
          {state.guideStep + 1} / {STEPS.length}
        </span>
        <IconButton label="Hide the guide" onClick={() => setExpanded(false)}>
          <IconClose size={12} />
        </IconButton>
      </div>

      {expanded ? (
        <div className="px-3 py-3">
          <p className="font-display text-[0.9375rem] font-semibold leading-5 text-ink">{step.title}</p>
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">{step.body}</p>
          <div className="mt-3 flex items-center gap-1.5">
            <Button
              size="xs"
              variant="primary"
              onClick={() => {
                if (last) {
                  dispatch({ type: 'guide-complete' });
                  return;
                }
                const next = state.guideStep + 1;
                dispatch({ type: 'guide-step', step: next });
                runAction(STEPS[next]?.action);
              }}
            >
              {last ? 'Finish' : 'Next'}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                if (state.guideStep === 0) {
                  dispatch({ type: 'guide-stop' });
                  return;
                }
                const previous = state.guideStep - 1;
                dispatch({ type: 'guide-step', step: previous });
              }}
            >
              Back
            </Button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'guide-stop' })}
              className="ml-auto inline-flex items-center gap-1 text-2xs text-ink-soft transition-colors hover:text-ink"
            >
              <IconSkip size={11} />
              Skip
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <IconPlay size={12} className="text-brand" />
          <span className="text-xs text-ink-muted">{step.title}</span>
        </button>
      )}
    </div>
  );
}
