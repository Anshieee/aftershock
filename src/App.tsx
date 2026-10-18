import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import OverviewPage from './pages/OverviewPage';
import InvestigationsPage from './pages/InvestigationsPage';
import LibraryPage from './pages/LibraryPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import ActivityPage from './pages/ActivityPage';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Route map mirrors the information architecture in the handoff §3:
 * five primary sidebar areas, one visible secondary destination
 * (Knowledge Graph), and the import-first landing state at `/`.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/investigations" element={<InvestigationsPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/review-queue" element={<ReviewQueuePage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/graph" element={<KnowledgeGraphPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
