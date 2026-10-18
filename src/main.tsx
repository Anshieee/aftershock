import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted, SIL OFL 1.1 licensed fonts (via Fontsource) — no runtime CDN.
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';

import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
