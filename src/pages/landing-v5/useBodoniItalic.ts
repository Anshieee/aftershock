import { useLayoutEffect } from 'react';

/**
 * V5 needs the TRUE italic cut of Bodoni Moda for the indigo turn line
 * ("the record."). index.html loads only Bodoni Moda 800/900 normal style
 * (untouched — the wordmark everywhere else must not change), and no local
 * italic cut exists in this repo, so the landing page fetches it once,
 * landing-local.
 *
 * Loading strategy (QA fix): the <link> is inserted NON-BLOCKING —
 * `rel="preload" as="style"` fetched in parallel with the first paint and
 * swapped to `rel="stylesheet"` on its `load` event. A render-blocking
 * stylesheet inserted here would hold the hero's dominant display line
 * (the page's largest paint) behind a third-party round trip; this pattern
 * keeps paint free and swaps the face in as soon as it arrives. It needs no
 * inline `onload` attribute (CSP-safe) and no `index.html` change.
 *
 * Honest degradation, unchanged: when the network denies the face, the swap
 * never happens and the composition falls back to the already-loaded 900
 * roman rendered with synthesized oblique (font-style: italic over the roman
 * cut), then Georgia italic — i.e. a synthesized italic, never a fake
 * decorative one. FOUT on the turn line is accepted in exchange for never
 * blocking first paint; `font-display: swap` on the remote face means the
 * line is readable the whole time.
 */
const BODONI_ITALIC_LINK_ID = 'landing-v5-bodoni-italic';

const BODONI_ITALIC_HREF =
  'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@1,800;1,900&display=swap';

export default function useBodoniItalic(): void {
  useLayoutEffect(() => {
    if (document.getElementById(BODONI_ITALIC_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = BODONI_ITALIC_LINK_ID;
    link.rel = 'preload';
    link.as = 'style';
    link.href = BODONI_ITALIC_HREF;
    const apply = () => {
      if (link.rel === 'stylesheet') return;
      link.rel = 'stylesheet';
      link.removeAttribute('as');
    };
    // Swap only after the stylesheet has fully loaded: no render block, no
    // inline handler, and no "preloaded but unused" console warning.
    link.addEventListener('load', apply);
    document.head.appendChild(link);
  }, []);
}
