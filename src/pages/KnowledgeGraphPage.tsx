import EmptyArea from '../components/EmptyArea';

/**
 * Secondary navigation destination (visible below the primary five).
 * The Investigated focused graph lives inside Investigations; this page
 * is the global graph view (M2+).
 */
export default function KnowledgeGraphPage() {
  return (
    <EmptyArea
      title="Knowledge Graph"
      note="The global provenance-backed citations-and-claims graph renders here once FalkorDB is connected and seeded (M2). Until then, no edges or nodes are shown — a missing result must never be dressed up with invented structure."
    />
  );
}
