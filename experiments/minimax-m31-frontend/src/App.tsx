import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import InvestigationsPage from './pages/InvestigationsPage';
import ActivityPage from './pages/ActivityPage';
import ReaderPage from './pages/ReaderPage';
import EvidencePage from './pages/EvidencePage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import GraphPage from './pages/GraphPage';
import ReportPage from './pages/ReportPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Route map.
 *
 * The document is the centre of the product: every investigation-scoped
 * screen hangs off the document that is open, so the researcher always knows
 * which paper they are looking at.
 */
export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/investigations" element={<InvestigationsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/i/:documentId/read" element={<ReaderPage />} />
        <Route path="/i/:documentId/evidence" element={<EvidencePage />} />
        <Route path="/i/:documentId/review" element={<ReviewQueuePage />} />
        <Route path="/i/:documentId/graph" element={<GraphPage />} />
        <Route path="/i/:documentId/report" element={<ReportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
