import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Chip, IconButton, Segmented, Sheet } from '../components/ui';
import {
  IconChevronRight,
  IconGraph,
  IconLayers,
  IconZoomIn,
  IconZoomOut,
} from '../components/Icons';
import { PdfViewer, type PdfViewerHandle, type ResolvedAnchor } from '../components/PdfViewer';
import { ReflowReader } from '../components/ReflowReader';
import { EvidenceInspector } from '../components/EvidenceInspector';
import { Guide } from '../components/Guide';
import { useStore, revealedFindings } from '../state/store';
import { anchorSpecs, documentById, findings as allFindings } from '../fixtures';
import { findingTone } from '../lib/findings';

const ANALYSIS_STAGES = [
  'Reading the manuscript structure',
  'Locating cited passages',
  'Matching references to publication records',
  'Checking publication records for status notices',
  'Preparing example findings',
];

const REVEAL_ORDER = [
  'finding-direct-support',
  'finding-indirect-dependency',
  'finding-historical-mention',
  'finding-unresolved-reference',
  'finding-no-notice',
  'finding-method-reuse',
  'finding-shared-dataset',
];

const REVEAL_TIMINGS = [900, 1650, 2400, 3100, 3800, 4450, 5000];

export default function ReaderPage() {
  const { documentId = 'doc-demo-manuscript' } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  const [resolved, setResolved] = useState<ResolvedAnchor[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const document = documentById.get(documentId);
  const documentFindings = useMemo(
    () => allFindings.filter((f) => f.documentId === documentId),
    [documentId],
  );
  const revealed = useMemo(
    () => revealedFindings({ ...state, activeDocumentId: documentId }),
    [state, documentId],
  );
  const selectedFinding =
    documentFindings.find((finding) => finding.id === state.selectedFindingId) ?? null;

  /* ---- Mobile defaults to the reflowed reader ------------------------
   *
   * The original PDF keeps its exact layout, which is right on a desktop
   * and unreadably small on a phone. The reflowed mode is the default
   * there; the original stays one tap away.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    if (narrow && state.readerMode === 'original') {
      dispatch({ type: 'set-reader-mode', mode: 'reflow' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Progressive reveal of the prepared example findings ----------
   *
   * The timers are owned by a ref so that a re-render (or the phase change
   * they themselves cause) never cancels the sequence half way through.
   */
  const analysisStartedFor = useRef<string | null>(null);
  useEffect(() => {
    if (analysisStartedFor.current === documentId) return undefined;
    analysisStartedFor.current = documentId;
    dispatch({ type: 'start-analysis' });
    const timers: number[] = [];
    ANALYSIS_STAGES.forEach((_, index) => {
      timers.push(
        window.setTimeout(() => dispatch({ type: 'set-analysis-stage', index }), index * 780),
      );
    });
    REVEAL_ORDER.forEach((findingId, index) => {
      const finding = allFindings.find((f) => f.id === findingId);
      if (!finding || finding.documentId !== documentId) return;
      timers.push(
        window.setTimeout(
          () => dispatch({ type: 'reveal-finding', findingId }),
          REVEAL_TIMINGS[index] ?? 5200,
        ),
      );
    });
    timers.push(
      window.setTimeout(
        () =>
          dispatch({ type: 'set-analysis-stage', index: ANALYSIS_STAGES.length, phase: 'complete' }),
        5400,
      ),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      // Allow the sequence to start again if the view remounts (React's
      // development double-mount does exactly this).
      analysisStartedFor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  /* ---- Anchors handed to the PDF viewer ---------------------------- */
  const anchorRequests = useMemo(
    () =>
      revealed
        .filter((finding) => finding.anchorId)
        .map((finding) => {
          const anchor = anchorSpecs.find((a) => a.id === finding.anchorId);
          if (!anchor) return null;
          return {
            id: finding.id,
            phrase: anchor.phrase,
            tone: findingTone(finding),
            label: finding.title,
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null),
    [revealed],
  );

  const selectFinding = (findingId: string) => {
    dispatch({ type: 'select-finding', findingId });
    setInspectorOpen(true);
    window.setTimeout(() => viewerRef.current?.scrollToAnchor(findingId), 60);
  };

  const currentFindingIndex = revealed.findIndex(
    (finding) => finding.id === state.selectedFindingId,
  );
  const hasPrevious = currentFindingIndex > 0;
  const hasNext =
    currentFindingIndex >= 0 && currentFindingIndex < revealed.length - 1;

  const stepFinding = (direction: 1 | -1) => {
    if (revealed.length === 0) return;
    const base = currentFindingIndex < 0 ? (direction === 1 ? -1 : 0) : currentFindingIndex;
    const next = base + direction;
    if (next < 0 || next >= revealed.length) return;
    selectFinding(revealed[next]!.id);
  };

  const openGraph = (findingId: string) => {
    dispatch({ type: 'select-finding', findingId });
    navigate(`/i/${documentId}/graph`);
  };

  const openRevisions = (findingId: string) => {
    dispatch({ type: 'select-finding', findingId });
    navigate(`/i/${documentId}/evidence?focus=${findingId}`);
  };

  const isSample = document?.isSample ?? false;
  const hasFile = isSample || state.sourceIsUpload;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- Toolbar ------------------------------------------------ */}
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-ink-border bg-paper-raised px-2.5 sm:px-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate font-display text-[0.8125rem] font-semibold text-ink">
                {document?.title ?? 'Document'}
              </h1>
              {document?.isSample ? (
                <Chip tone="brand" className="hidden shrink-0 sm:inline-flex">
                  Example
                </Chip>
              ) : null}
            </div>
            <p className="meta mt-0.5 truncate">
              {state.sourceIsUpload
                ? `${state.sourceName} · opened locally, not analysed`
                : `${document?.fileName ?? ''} · ${document?.venue ?? ''} ${document?.year ?? ''}`}
            </p>
          </div>

          <div className="hidden items-center gap-1 md:flex">
            <Segmented
              label="Reading mode"
              value={state.readerMode}
              onChange={(mode) => dispatch({ type: 'set-reader-mode', mode })}
              options={[
                { value: 'original', label: 'Original' },
                { value: 'reflow', label: 'Reflowed' },
              ]}
            />
          </div>

          {/* Analysis status */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setStatusOpen((value) => !value)}
              aria-expanded={statusOpen}
              className="flex h-7 items-center gap-1.5 rounded-md border border-ink-border bg-paper-deep px-2 text-2xs font-medium text-ink-muted transition-colors duration-150 hover:border-ink-soft/50 hover:text-ink"
            >
              {state.analysisPhase === 'complete' ? (
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sage" />
              ) : (
                <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-amber" />
              )}
              <span className="hidden sm:inline">
                {state.analysisPhase === 'complete'
                  ? 'Example findings ready'
                  : 'Preparing example findings…'}
              </span>
              <span className="sm:hidden">
                {state.analysisPhase === 'complete' ? 'Ready' : 'Preparing…'}
              </span>
            </button>
            {statusOpen ? (
              <div className="absolute right-0 top-[34px] z-40 w-[290px] animate-fade-rise rounded-lg border border-ink-border bg-paper-raised p-3 shadow-lift-3">
                <p className="eyebrow">Example investigation</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  The stages below are a simulation. No analysis of this document has been performed
                  and no service was contacted.
                </p>
                <ol className="mt-2.5 space-y-1.5">
                  {ANALYSIS_STAGES.map((stage, index) => {
                    const done = state.analysisStageIndex > index;
                    const current = state.analysisStageIndex === index;
                    return (
                      <li key={stage} className="flex items-start gap-2 text-xs">
                        <span
                          aria-hidden="true"
                          className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                            done ? 'bg-sage' : current ? 'animate-pulse-dot bg-amber' : 'bg-ink-border'
                          }`}
                        />
                        <span className={done || current ? 'text-ink' : 'text-ink-soft'}>{stage}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="meta mt-2.5 border-t border-ink-border pt-2">
                  {revealed.length} of {documentFindings.length} example findings revealed
                </p>
              </div>
            ) : null}
          </div>

          {/* Finding navigation */}
          {revealed.length > 0 ? (
            <div className="hidden items-center gap-0.5 sm:flex">
              <IconButton
                label="Previous finding"
                disabled={!hasPrevious}
                onClick={() => stepFinding(-1)}
              >
                <IconChevronRight size={14} className="rotate-180" />
              </IconButton>
              <span className="meta w-[52px] text-center tabular-nums">
                {currentFindingIndex < 0 ? '—' : currentFindingIndex + 1} / {revealed.length}
              </span>
              <IconButton label="Next finding" disabled={!hasNext} onClick={() => stepFinding(1)}>
                <IconChevronRight size={14} />
              </IconButton>
            </div>
          ) : null}

          <IconButton
            label={inspectorOpen ? 'Hide evidence inspector' : 'Show evidence inspector'}
            className="xl:hidden"
            onClick={() => setInspectorOpen((value) => !value)}
          >
            <IconLayers size={15} />
          </IconButton>
          <IconButton
            label="Open the evidence graph"
            onClick={() => navigate(`/i/${documentId}/graph`)}
          >
            <IconGraph size={15} />
          </IconButton>
        </div>

        {/* ---- Mobile reading controls --------------------------------- */}
        <div className="flex shrink-0 items-center gap-2 border-b border-ink-border bg-paper-raised/50 px-3 py-1.5 md:hidden">
          <Segmented
            label="Reading mode"
            value={state.readerMode}
            onChange={(mode) => dispatch({ type: 'set-reader-mode', mode })}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'reflow', label: 'Reflowed' },
            ]}
          />
          {state.readerMode === 'original' ? (
            <span className="meta ml-auto">
              {currentPage} / {pageCount || '—'}
            </span>
          ) : null}
        </div>

        {/* ---- Reading surface ----------------------------------------- */}
        <div className="relative min-h-0 flex-1">
          {!hasFile ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-[46ch] text-center">
                <p className="font-display text-lg font-semibold text-ink">
                  No original file is stored for this record
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  Only the guided example has a rendered original in this prototype. The prepared
                  findings for this investigation are still available in the evidence, review and
                  report views.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => navigate('/i/doc-demo-manuscript/read')}>
                    Open the sample manuscript
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/i/${documentId}/evidence`)}>
                    See the findings
                  </Button>
                </div>
              </div>
            </div>
          ) : state.readerMode === 'original' ? (
            <PdfViewer
              ref={viewerRef}
              url={state.sourceUrl}
              anchorRequests={anchorRequests}
              selectedId={state.selectedFindingId}
              onSelect={selectFinding}
              onResolved={setResolved}
              onPageChange={setCurrentPage}
              onDocumentReady={(info) => setPageCount(info.numPages)}
              zoom={state.zoom}
              fitMode={state.fitMode}
            />
          ) : (
            <ReflowReader
              findings={revealed}
              selectedId={state.selectedFindingId}
              onSelect={selectFinding}
            />
          )}

          {/* Margin indicators */}
          {state.readerMode === 'original' && resolved.length > 0 ? (
            <div className="pointer-events-none absolute left-0 top-0 h-full w-0" aria-hidden="true" />
          ) : null}

          {state.readerMode === 'original' ? (
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-0.5 rounded-lg border border-ink-border bg-paper-raised px-1 py-1 shadow-lift-2">
              <IconButton
                label="Previous page"
                onClick={() => viewerRef.current?.goToPage(Math.max(1, currentPage - 1))}
              >
                <IconChevronRight size={14} className="rotate-180" />
              </IconButton>
              <span className="meta w-[54px] text-center tabular-nums">
                {currentPage} / {pageCount || '—'}
              </span>
              <IconButton
                label="Next page"
                onClick={() =>
                  viewerRef.current?.goToPage(Math.min(pageCount || 1, currentPage + 1))
                }
              >
                <IconChevronRight size={14} />
              </IconButton>
              <span className="mx-1 h-4 w-px bg-ink-border" />
              <IconButton
                label="Zoom out"
                onClick={() =>
                  dispatch({
                    type: 'set-zoom',
                    zoom: Math.max(0.4, Math.round((state.zoom - 0.15) * 100) / 100),
                  })
                }
              >
                <IconZoomOut size={14} />
              </IconButton>
              <span className="meta w-[44px] text-center tabular-nums">
                {Math.round(state.zoom * 100)}%
              </span>
              <IconButton
                label="Zoom in"
                onClick={() =>
                  dispatch({
                    type: 'set-zoom',
                    zoom: Math.min(3, Math.round((state.zoom + 0.15) * 100) / 100),
                  })
                }
              >
                <IconZoomIn size={14} />
              </IconButton>
              <span className="mx-1 h-4 w-px bg-ink-border" />
              <Segmented
                label="Page fit"
                value={state.fitMode}
                onChange={(fit) => dispatch({ type: 'set-fit', fit })}
                options={[
                  { value: 'width', label: 'Width' },
                  { value: 'page', label: 'Page' },
                ]}
              />
            </div>
          ) : null}

          <Guide
            onReveal={(findingId) => {
              dispatch({ type: 'reveal-finding', findingId });
              window.setTimeout(() => selectFinding(findingId), 120);
            }}
            onOpenGraph={() => navigate(`/i/${documentId}/graph`)}
            onUploadOwnPaper={() => navigate('/')}
          />
        </div>
      </div>

      {/* ---- Desktop inspector ---------------------------------------- */}
      <aside className="hidden w-[392px] shrink-0 border-l border-ink-border bg-paper-raised/40 xl:block">
        <div className="h-full overflow-hidden">
          <EvidenceInspector
            finding={selectedFinding}
            findings={documentFindings}
            selectedId={state.selectedFindingId}
            onSelectFinding={selectFinding}
            onOpenGraph={openGraph}
            onExploreRevisions={openRevisions}
          />
        </div>
      </aside>

      {/* ---- Mobile sheet ---------------------------------------------- */}
      <Sheet
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title={selectedFinding ? selectedFinding.title : 'Findings'}
      >
        <EvidenceInspector
          finding={selectedFinding}
          findings={documentFindings}
          selectedId={state.selectedFindingId}
          onSelectFinding={selectFinding}
          onOpenGraph={openGraph}
          onExploreRevisions={openRevisions}
          onBack={() => dispatch({ type: 'select-finding', findingId: null })}
        />
      </Sheet>
    </div>
  );
}
