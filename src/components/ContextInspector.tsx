import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { GraphEdge, GraphNode } from '../lib/api';
import { nodePrimaryLabel } from './GraphCanvas';

interface ContextInspectorProps {
  node: GraphNode | null;
  /** All edges so connected ones can be listed with their provenance. */
  edges: GraphEdge[];
  onClose?: () => void;
  /** Whether a focused dependency path is currently active. */
  focusActive?: boolean;
  focusedPath?: boolean;
  focusedPathActive?: boolean;
  isFocusedPath?: boolean;
}

/**
 * Universal Context Inspector — first cut (M2). Whenever a graph record is
 * selected, this same conceptual panel shows its exact identity, provenance
 * state, synthetic-vs-real attribution and source pointer (handoff §3).
 * No interpretation beyond what the record itself states.
 */

/** Node kinds the read-only Evidence Reader can reflow as passages (M7
 * wave-2: these get an honest "Open in evidence reader" hop). */
const READER_COVERED_KINDS = new Set(['Claim', 'Conclusion', 'CitationUse', 'ReferenceOccurrence']);
export default function ContextInspector({ node, edges, onClose, focusActive, focusedPath, focusedPathActive, isFocusedPath }: ContextInspectorProps) {
  const pathActive = !!(focusActive || focusedPath || focusedPathActive || isFocusedPath);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!node) return null;

  const connected = edges.filter((edge) => edge.fromId === node.id || edge.toId === node.id);
  const sourcePointerEdge = connected.find((edge) => edge.sourcePointer);
  const sourcePointer =
    typeof node.properties.sourcePointer === 'string'
      ? (node.properties.sourcePointer as string)
      : (sourcePointerEdge?.sourcePointer ?? undefined);

  return (
    <aside
      data-testid="context-inspector"
      aria-labelledby="inspector-heading"
      className="rounded-lg border border-brand-surface bg-paper-raised p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="inspector-heading" className="text-base font-semibold text-ink">
          Context Inspector
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            data-testid="inspector-close"
            className="rounded border border-ink-border px-2 py-0.5 text-xs text-ink hover:bg-paper-deep"
          >
            Close
          </button>
        )}
      </div>

      {pathActive && (
        <p
          data-testid="inspector-focused-path"
          className="mt-2 rounded border border-brand bg-brand-surface px-2 py-1 text-xs font-medium text-brand-deep"
        >
          Focused dependency path active
        </p>
      )}

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-medium text-ink-muted">Record id</dt>
          <dd className="break-all font-mono text-xs text-ink" data-testid="inspector-id">
            {node.id}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Type</dt>
          <dd className="text-ink">{node.kind}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Label</dt>
          <dd className="break-words text-ink" data-testid="inspector-label">
            {nodePrimaryLabel(node)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Provenance</dt>
          <dd className="text-ink">
            {node.provenanceKind ?? 'not recorded'}
            {' — '}
            <span className="text-ink-muted">where this record and its classification originate</span>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Source</dt>
          <dd className="text-ink">
            {node.isSynthetic === true ? (
              <span className="font-medium text-uncertain-text" data-testid="inspector-synthetic">
                FICTIONAL / GUIDED DEMO
              </span>
            ) : node.isSynthetic === false ? (
              <span className="text-ink-muted" data-testid="inspector-real">
                Real bibliographic record (isSynthetic=false)
              </span>
            ) : (
              <span className="text-ink-muted">not recorded</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Source pointer</dt>
          <dd className="break-all text-xs text-ink">
            {sourcePointer ?? <span className="text-ink-muted">none recorded</span>}
          </dd>
        </div>
      </dl>

      {/* M7 wave-2 — reader hop for reader-covered kinds only. Navigation
          only: it opens /reader?focus=<nodeId>, where the reader honestly
          handles an unknown focus id (highlights nothing). */}
      {READER_COVERED_KINDS.has(node.kind) && (
        <Link
          to={`/reader?focus=${node.id}`}
          data-testid="inspector-reader-link"
          className="mt-3 inline-block text-sm text-brand-deep underline hover:text-brand"
        >
          Open in evidence reader
        </Link>
      )}

      {connected.length > 0 ? (
        <div className="mt-4 border-t border-ink-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Connected edges ({connected.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {connected.map((edge, index) => (
              <li key={edge.id ?? `${edge.type}-${index}`} className="text-xs leading-5 text-ink">
                <span className="font-mono text-[11px] text-ink-muted">
                  {edge.type}
                </span>
                <span className="mx-1 text-ink-border">·</span>
                <span>
                  {edge.fromId === node.id ? '→ ' : '← '}
                  {edge.fromId === node.id ? edge.toId : edge.fromId}
                </span>
                {edge.provenanceKind && (
                  <span className="ml-1 text-ink-muted">({edge.provenanceKind})</span>
                )}
                {edge.rationale && <span className="block text-ink-muted">{edge.rationale}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 border-t border-ink-border pt-3 text-xs text-ink-muted">
          No connected edges among the records this view returned.
        </p>
      )}

      {/* Unselected-node prompt keeps both keyboard and screen-reader paths explicit. */}
      <p className="mt-3 text-xs text-ink-muted">
        Select any node in the canvas or the records list to inspect its exact provenance.
        The inspector shows only what the returned graph records state — nothing is inferred.
      </p>
    </aside>
  );
}
