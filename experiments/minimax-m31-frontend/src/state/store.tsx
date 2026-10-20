import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import {
  findings as seedFindings,
  reviewDecisions as seedDecisions,
  revisionProposals as seedProposals,
  type Finding,
  type ProposalStatus,
  type ReviewDecisionRecord,
  type ReviewOutcome,
  type RevisionProposalRecord,
} from '../fixtures';

/**
 * Prototype state.
 *
 * Everything here lives in the browser only: it is a demonstration of the
 * workflow, not durable storage, and the UI says so where it matters.
 */

export type ThemeMode = 'light' | 'dark';
export type ReaderMode = 'original' | 'reflow';
export type FitMode = 'width' | 'page';
export type RevisionMode = 'side-by-side' | 'tracked';
export type AnalysisPhase = 'idle' | 'preparing' | 'complete';

export interface AppState {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  activeDocumentId: string;
  selectedFindingId: string | null;
  readerMode: ReaderMode;
  zoom: number;
  fitMode: FitMode;
  currentPage: number;
  reviewDecisions: Record<string, ReviewDecisionRecord>;
  proposals: Record<string, RevisionProposalRecord>;
  revealedFindingIds: string[];
  analysisPhase: AnalysisPhase;
  analysisStageIndex: number;
  reportSections: Record<string, boolean>;
  revisionMode: RevisionMode;
  graphQuery: string;
  graphKinds: string[];
  guideStep: number;
  guideActive: boolean;
  guideCompleted: boolean;
  bannerDismissed: boolean;
  /** URL of the document currently open in the reader. */
  sourceUrl: string;
  sourceName: string;
  /** True when the open document is a file the visitor picked locally. */
  sourceIsUpload: boolean;
}

const STORAGE_KEY = 'aftershock.m31.state.v1';

export const DEFAULT_REPORT_SECTIONS: Record<string, boolean> = {
  identity: true,
  summary: true,
  concerns: true,
  relationships: true,
  unresolved: true,
  review: true,
  notices: true,
  revisions: false,
  provenance: true,
  limitations: true,
  timestamps: true,
};

export const initialState: AppState = {
  theme: 'light',
  sidebarCollapsed: false,
  activeDocumentId: 'doc-demo-manuscript',
  selectedFindingId: null,
  readerMode: 'original',
  zoom: 1,
  fitMode: 'width',
  currentPage: 1,
  reviewDecisions: Object.fromEntries(
    seedDecisions.map((decision) => [decision.findingId, decision]),
  ),
  proposals: Object.fromEntries(seedProposals.map((proposal) => [proposal.findingId, proposal])),
  revealedFindingIds: [],
  analysisPhase: 'idle',
  analysisStageIndex: 0,
  reportSections: { ...DEFAULT_REPORT_SECTIONS },
  revisionMode: 'side-by-side',
  graphQuery: '',
  graphKinds: [],
  guideStep: 0,
  guideActive: false,
  guideCompleted: false,
  bannerDismissed: false,
  sourceUrl: '/sample-manuscript.pdf',
  sourceName: 'sample-manuscript.pdf',
  sourceIsUpload: false,
};

export type Action =
  | { type: 'set-theme'; theme: ThemeMode }
  | { type: 'toggle-sidebar' }
  | { type: 'set-document'; documentId: string }
  | { type: 'select-finding'; findingId: string | null }
  | { type: 'set-reader-mode'; mode: ReaderMode }
  | { type: 'set-zoom'; zoom: number }
  | { type: 'set-fit'; fit: FitMode }
  | { type: 'set-page'; page: number }
  | { type: 'record-review'; findingId: string; outcome: ReviewOutcome; note: string }
  | { type: 'set-proposal-status'; findingId: string; status: ProposalStatus }
  | { type: 'reveal-finding'; findingId: string }
  | { type: 'start-analysis' }
  | { type: 'set-analysis-stage'; index: number; phase?: AnalysisPhase }
  | { type: 'toggle-report-section'; section: string }
  | { type: 'set-revision-mode'; mode: RevisionMode }
  | { type: 'set-graph-query'; query: string }
  | { type: 'toggle-graph-kind'; kind: string }
  | { type: 'guide-start' }
  | { type: 'guide-step'; step: number }
  | { type: 'guide-stop' }
  | { type: 'guide-complete' }
  | { type: 'dismiss-banner' }
  | { type: 'set-source'; url: string; name: string; isUpload: boolean }
  | { type: 'reset-prototype' };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-theme':
      return { ...state, theme: action.theme };
    case 'toggle-sidebar':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'set-document':
      return {
        ...state,
        activeDocumentId: action.documentId,
        selectedFindingId: null,
        readerMode: 'original',
        currentPage: 1,
        zoom: 1,
        fitMode: 'width',
        sourceUrl: '/sample-manuscript.pdf',
        sourceName: 'sample-manuscript.pdf',
        sourceIsUpload: false,
      };
    case 'select-finding':
      return { ...state, selectedFindingId: action.findingId };
    case 'set-reader-mode':
      return { ...state, readerMode: action.mode };
    case 'set-zoom':
      return { ...state, zoom: action.zoom };
    case 'set-fit':
      return { ...state, fitMode: action.fit };
    case 'set-page':
      return { ...state, currentPage: action.page };
    case 'record-review': {
      const finding = seedFindings.find((f) => f.id === action.findingId);
      const decision: ReviewDecisionRecord = {
        id: `review-${action.findingId}`,
        findingId: action.findingId,
        outcome: action.outcome,
        note: action.note,
        reviewer: 'You (prototype)',
        decidedAt: new Date().toISOString(),
        seeded: false,
      };
      void finding;
      return {
        ...state,
        reviewDecisions: { ...state.reviewDecisions, [action.findingId]: decision },
      };
    }
    case 'set-proposal-status': {
      const existing = state.proposals[action.findingId];
      if (!existing) return state;
      return {
        ...state,
        proposals: {
          ...state.proposals,
          [action.findingId]: { ...existing, status: action.status },
        },
      };
    }
    case 'reveal-finding':
      if (state.revealedFindingIds.includes(action.findingId)) return state;
      return {
        ...state,
        revealedFindingIds: [...state.revealedFindingIds, action.findingId],
      };
    case 'start-analysis':
      return { ...state, analysisPhase: 'preparing', analysisStageIndex: 0 };
    case 'set-analysis-stage':
      return {
        ...state,
        analysisStageIndex: action.index,
        analysisPhase: action.phase ?? state.analysisPhase,
      };
    case 'toggle-report-section':
      return {
        ...state,
        reportSections: {
          ...state.reportSections,
          [action.section]: !state.reportSections[action.section],
        },
      };
    case 'set-revision-mode':
      return { ...state, revisionMode: action.mode };
    case 'set-graph-query':
      return { ...state, graphQuery: action.query };
    case 'toggle-graph-kind': {
      const kinds = state.graphKinds.includes(action.kind)
        ? state.graphKinds.filter((k) => k !== action.kind)
        : [...state.graphKinds, action.kind];
      return { ...state, graphKinds: kinds };
    }
    case 'guide-start':
      return { ...state, guideActive: true, guideStep: 0 };
    case 'guide-step':
      return { ...state, guideStep: action.step };
    case 'guide-stop':
      return { ...state, guideActive: false };
    case 'guide-complete':
      return { ...state, guideActive: false, guideCompleted: true };
    case 'dismiss-banner':
      return { ...state, bannerDismissed: true };
    case 'set-source':
      return {
        ...state,
        sourceUrl: action.url,
        sourceName: action.name,
        sourceIsUpload: action.isUpload,
      };
    case 'reset-prototype':
      return {
        ...initialState,
        theme: state.theme,
        revealedFindingIds: state.revealedFindingIds,
        analysisPhase: state.analysisPhase,
        analysisStageIndex: state.analysisStageIndex,
      };
    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

function loadPersisted(): Partial<AppState> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (base) => {
    const persisted = loadPersisted();
    const merged = { ...base, ...persisted };
    // Theme follows the system preference on a first visit.
    if (!persisted.theme && typeof window !== 'undefined') {
      merged.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return merged;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(state.theme === 'dark' ? 'theme-dark' : 'theme-light');
    root.style.colorScheme = state.theme;
    try {
      window.localStorage.setItem('aftershock.m31.theme', state.theme);
    } catch {
      /* storage unavailable — the theme still applies for this session */
    }
  }, [state.theme]);

  useEffect(() => {
    const persistable: Partial<AppState> = {
      theme: state.theme,
      sidebarCollapsed: state.sidebarCollapsed,
      activeDocumentId: state.activeDocumentId,
      reviewDecisions: state.reviewDecisions,
      proposals: state.proposals,
      revealedFindingIds: state.revealedFindingIds,
      reportSections: state.reportSections,
      revisionMode: state.revisionMode,
      bannerDismissed: state.bannerDismissed,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    } catch {
      /* storage unavailable — prototype state stays in memory only */
    }
  }, [
    state.theme,
    state.sidebarCollapsed,
    state.activeDocumentId,
    state.reviewDecisions,
    state.proposals,
    state.revealedFindingIds,
    state.reportSections,
    state.revisionMode,
    state.bannerDismissed,
  ]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

/* ------------------------------------------------------------------ *
 * Derived helpers
 * ------------------------------------------------------------------ */

export function findingsForActiveDocument(state: AppState): Finding[] {
  return seedFindings.filter((f) => f.documentId === state.activeDocumentId);
}

export function revealedFindings(state: AppState): Finding[] {
  const revealed = new Set(state.revealedFindingIds);
  return findingsForActiveDocument(state).filter((f) => revealed.has(f.id));
}

export function decisionFor(state: AppState, findingId: string) {
  return state.reviewDecisions[findingId];
}
