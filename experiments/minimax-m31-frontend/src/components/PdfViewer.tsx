import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { locatePhrase, transformMatrix, type AnchorRect } from '../lib/anchors';
import { loadPdf, type PdfDocumentProxy, type PdfTextContent } from '../lib/pdf';

export type AnnotationTone = 'notice' | 'amber' | 'uncertain' | 'sage' | 'brand';

export interface AnchorRequest {
  id: string;
  phrase: string;
  tone: AnnotationTone;
  label: string;
}

export interface ResolvedAnchor {
  id: string;
  pageIndex: number;
  rects: AnchorRect[];
  tone: AnnotationTone;
  label: string;
}

export interface PdfViewerHandle {
  scrollToAnchor: (id: string) => void;
  scrollToPage: (pageNumber: number) => void;
  goToPage: (pageNumber: number) => void;
}

interface Props {
  url: string;
  anchorRequests: AnchorRequest[];
  selectedId: string | null;
  hoveredId?: string | null;
  onSelect: (id: string) => void;
  onResolved: (anchors: ResolvedAnchor[]) => void;
  onPageChange: (page: number) => void;
  onDocumentReady?: (info: { numPages: number }) => void;
  /** Scale multiplier applied on top of the fit calculation. */
  zoom: number;
  fitMode: 'width' | 'page';
}

interface PageMeta {
  pageNumber: number;
  width: number;
  height: number;
}

const TONE_RGB: Record<AnnotationTone, string> = {
  notice: 'var(--c-notice)',
  amber: 'var(--c-amber)',
  uncertain: 'var(--c-uncertain)',
  sage: 'var(--c-sage)',
  brand: 'var(--c-brand)',
};

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer(
  {
    url,
    anchorRequests,
    selectedId,
    hoveredId,
    onSelect,
    onResolved,
    onPageChange,
    onDocumentReady,
    zoom,
    fitMode,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const textLayerRefs = useRef(new Map<number, HTMLDivElement>());
  const pageTextCache = useRef(new Map<number, PdfTextContent>());
  const viewportTransforms = useRef(new Map<number, number[]>());
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const resolvedRef = useRef(new Map<string, ResolvedAnchor>());
  const docRef = useRef<PdfDocumentProxy | null>(null);

  const [doc, setDoc] = useState<PdfDocumentProxy | null>(null);
  const [resolvedAnchors, setResolvedAnchors] = useState<ResolvedAnchor[]>([]);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [scale, setScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 960, height: 720 });
  const [visiblePage, setVisiblePage] = useState(1);
  const [renderTick, setRenderTick] = useState(0);

  /* ---- Load the document ------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setPages([]);
    resolvedRef.current.clear();
    pageTextCache.current.clear();
    setResolvedAnchors([]);

    loadPdf(url)
      .then((loaded) => {
        if (cancelled) return;
        docRef.current = loaded;
        setDoc(loaded);
        const meta: PageMeta[] = [];
        for (let i = 1; i <= loaded.numPages; i += 1) {
          meta.push({ pageNumber: i, width: 0, height: 0 });
        }
        setPages(meta);
        onDocumentReady?.({ numPages: loaded.numPages });
      })
      .catch(() => {
        if (!cancelled) setDoc(null);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  /* ---- Track the container size ------------------------------------ */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* ---- Page sizes --------------------------------------------------- */
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const sizes: PageMeta[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        viewportTransforms.current.set(i - 1, [...viewport.transform]);
        sizes.push({ pageNumber: i, width: viewport.width, height: viewport.height });
      }
      if (!cancelled) setPages(sizes);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  /* ---- Fit scale ---------------------------------------------------- */
  useEffect(() => {
    const first = pages[0];
    if (!first || first.width === 0) return;
    const padding = 56;
    const widthScale = (containerSize.width - padding) / first.width;
    const heightScale =
      (containerSize.height - padding) / Math.max(1, first.height * (pages.length || 1));
    const base =
      fitMode === 'page'
        ? Math.min(widthScale, Math.max(0.2, (containerSize.height - padding) / first.height))
        : widthScale;
    void heightScale;
    setScale(base * zoom);
  }, [pages, containerSize, zoom, fitMode]);

  /* ---- Render pages -------------------------------------------------- */
  useEffect(() => {
    if (!doc || pages.length === 0 || pages[0]?.width === 0) return;
    let cancelled = false;

    (async () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      for (const meta of pages) {
        if (cancelled) return;
        const canvas = canvasRefs.current.get(meta.pageNumber);
        if (!canvas) continue;
        const page = await doc.getPage(meta.pageNumber);
        const viewport = page.getViewport({ scale });
        const dpr = ratio;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const context = canvas.getContext('2d');
        if (!context) continue;
        renderTaskRef.current?.cancel();
        const task = page.render({
          canvasContext: context,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        renderTaskRef.current = task;
        try {
          await task.promise;
        } catch {
          // A cancelled render is expected when the zoom changes mid-flight.
          continue;
        }

        // Text content is fetched once per page and reused for anchoring.
        const textContent = await page.getTextContent();
        if (cancelled) return;
        pageTextCache.current.set(meta.pageNumber - 1, textContent);
        renderTextLayer(textContent, viewport, textLayerRefs.current.get(meta.pageNumber));
        setRenderTick((tick) => tick + 1);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [doc, pages, scale]);

  /* ---- Resolve anchors from the real text layer --------------------- */
  const resolveAnchors = useCallback(() => {
    const requests = anchorRequests;
    if (requests.length === 0) return;
    let changed = false;
    for (const request of requests) {
      if (resolvedRef.current.has(request.id)) continue;
      for (const [pageIndex, textContent] of pageTextCache.current) {
        const viewportTransform = viewportTransforms.current.get(pageIndex);
        if (!viewportTransform) continue;
        const match = locatePhrase(
          textContent.items as never,
          request.phrase,
          { pageIndex, viewportTransform },
        );
        if (match) {
          resolvedRef.current.set(request.id, {
            id: request.id,
            pageIndex: match.pageIndex,
            rects: match.rects,
            tone: request.tone,
            label: request.label,
          });
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      const next = [...resolvedRef.current.values()];
      setResolvedAnchors(next);
      onResolved(next);
    }
  }, [anchorRequests, onResolved]);

  useEffect(() => {
    resolveAnchors();
  }, [resolveAnchors, renderTick]);

  /* ---- Track the page in view --------------------------------------- */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const onScroll = () => {
      const rootRect = root.getBoundingClientRect();
      let current = 1;
      for (const meta of pages) {
        const element = root.querySelector<HTMLElement>(`[data-page="${meta.pageNumber}"]`);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top - rootRect.top <= rootRect.height * 0.4) current = meta.pageNumber;
      }
      setVisiblePage((previous) => (previous === current ? previous : current));
      onPageChange(current);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [pages, onPageChange]);

  /* ---- Imperative API ------------------------------------------------ */
  useImperativeHandle(
    ref,
    () => ({
      scrollToAnchor(id: string) {
        const anchor = resolvedRef.current.get(id);
        const root = scrollRef.current;
        if (!anchor || !root) return;
        const element = root.querySelector<HTMLElement>(
          `[data-page="${anchor.pageIndex + 1}"]`,
        );
        if (!element) return;
        const first = anchor.rects[0];
        if (!first) return;
        const top = element.offsetTop + first.y * scale - 96;
        root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      },
      scrollToPage(pageNumber: number) {
        const root = scrollRef.current;
        if (!root) return;
        const element = root.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
        if (!element) return;
        root.scrollTo({ top: Math.max(0, element.offsetTop - 24), behavior: 'smooth' });
      },
      goToPage(pageNumber: number) {
        const root = scrollRef.current;
        if (!root) return;
        const element = root.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
        if (!element) return;
        root.scrollTo({ top: Math.max(0, element.offsetTop - 24), behavior: 'smooth' });
      },
    }),
    [scale],
  );

  const anchorsByPage = useMemo(() => {
    const map = new Map<number, ResolvedAnchor[]>();
    for (const anchor of resolvedAnchors) {
      const list = map.get(anchor.pageIndex) ?? [];
      list.push(anchor);
      map.set(anchor.pageIndex, list);
    }
    return map;
  }, [resolvedAnchors]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div
        ref={scrollRef}
        className="h-full w-full overflow-auto bg-paper-deep/70"
        role="document"
        aria-label="Original manuscript PDF"
      >
        <div className="mx-auto flex w-max flex-col items-center gap-8 px-7 py-8">
          {pages.map((meta) => {
            const pageAnchors = anchorsByPage.get(meta.pageNumber - 1) ?? [];
            return (
              <div
                key={meta.pageNumber}
                data-page={meta.pageNumber}
                className="relative shrink-0 bg-white pdf-page-shadow"
                style={{
                  width: meta.width ? meta.width * scale : undefined,
                  height: meta.height ? meta.height * scale : undefined,
                }}
              >
                <canvas
                  ref={(element) => {
                    if (element) canvasRefs.current.set(meta.pageNumber, element);
                    else canvasRefs.current.delete(meta.pageNumber);
                  }}
                  className="block"
                />
                {/* Text layer for selection — the visual truth stays the canvas. */}
                <div
                  ref={(element) => {
                    if (element) textLayerRefs.current.set(meta.pageNumber, element);
                    else textLayerRefs.current.delete(meta.pageNumber);
                  }}
                  className="text-layer"
                  style={{
                    width: meta.width ? meta.width * scale : undefined,
                    height: meta.height ? meta.height * scale : undefined,
                  }}
                />
                {/* Annotations */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ width: meta.width ? meta.width * scale : undefined }}
                >
                  {pageAnchors.map((anchor) => {
                    const isSelected = anchor.id === selectedId;
                    const isHovered = anchor.id === hoveredId;
                    const colour = TONE_RGB[anchor.tone];
                    return (
                      <div key={anchor.id}>
                        {anchor.rects.map((rect, index) => {
                          const left = rect.x * scale;
                          const top = rect.y * scale;
                          const width = rect.width * scale;
                          const height = rect.height * scale;
                          return (
                            <div key={`${anchor.id}-${index}`}>
                              {isSelected ? (
                                <div
                                  className="annotation-highlight"
                                  style={{
                                    left,
                                    top,
                                    width,
                                    height,
                                    background: `rgb(${colour} / 0.16)`,
                                    boxShadow: `0 0 0 1px rgb(${colour} / 0.32)`,
                                  }}
                                />
                              ) : null}
                              <div
                                className="annotation-underline"
                                style={{
                                  left,
                                  top: top + height - Math.max(1.5, height * 0.12),
                                  width,
                                  color: colour,
                                  opacity: isSelected ? 1 : isHovered ? 1 : 0.62,
                                }}
                              />
                              <span
                                aria-hidden="true"
                                className="annotation-pin"
                                style={{
                                  left: -13,
                                  top: top + height / 2,
                                  background: colour,
                                  opacity: isSelected ? 1 : 0.72,
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {/* Clickable hit areas sit above the (pointer-events-none) marks. */}
                {pageAnchors.map((anchor) => (
                  <button
                    key={`hit-${anchor.id}`}
                    type="button"
                    aria-label={`${anchor.label} — open evidence`}
                    onClick={() => onSelect(anchor.id)}
                    className="absolute rounded-sm transition-colors duration-150 hover:bg-brand/[0.06]"
                    style={{
                      left: Math.min(...anchor.rects.map((r) => r.x)) * scale,
                      top: Math.min(...anchor.rects.map((r) => r.y)) * scale,
                      width:
                        (Math.max(...anchor.rects.map((r) => r.x + r.width)) -
                          Math.min(...anchor.rects.map((r) => r.x))) *
                        scale,
                      height:
                        (Math.max(...anchor.rects.map((r) => r.y + r.height)) -
                          Math.min(...anchor.rects.map((r) => r.y))) *
                        scale,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        Page {visiblePage} of {pages.length}
      </span>
    </div>
  );
});

/* ------------------------------------------------------------------ *
 * A minimal text layer: real, selectable text positioned over the
 * canvas so that selection highlights land where the glyphs are.
 * ------------------------------------------------------------------ */
function renderTextLayer(
  textContent: PdfTextContent,
  viewport: { transform: number[] },
  container: HTMLDivElement | undefined,
): void {
  if (!container) return;
  container.textContent = '';
  const fragment = document.createDocumentFragment();

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;
    const textItem = item as { str: string; transform: number[]; width: number; height: number };
    const tx = transformMatrix(viewport.transform, textItem.transform);
    const fontHeight = textItem.height || Math.hypot(tx[2]!, tx[3]!) || 10;
    const span = document.createElement('span');
    span.textContent = textItem.str;
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5]! - fontHeight * 0.82}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = '"Times New Roman", Times, serif';
    fragment.appendChild(span);
  }
  container.appendChild(fragment);
}
