import { useLayoutEffect } from 'react';

/**
 * V5 needs the TRUE italic cut of Bodoni Moda for the indigo turn line
 * ("the record."). index.html loads only Bodoni Moda 800/900 normal style
 * (untouched — the wordmark everywhere else must not change). This hook
 * adds the italic stylesheet once, landing-local, at runtime; when the
 * network denies it, the composition degrades honestly to a synthesized
 * oblique over the already-loaded 900 roman, then Georgia italic.
 */
const BODONI_ITALIC_LINK_ID = 'landing-v5-bodoni-italic';

const BODONI_ITALIC_HREF =
  'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@1,800;1,900&display=swap';

export default function useBodoniItalic(): void {
  useLayoutEffect(() => {
    if (document.getElementById(BODONI_ITALIC_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = BODONI_ITALIC_LINK_ID;
    link.rel = 'stylesheet';
    link.href = BODONI_ITALIC_HREF;
    document.head.appendChild(link);
  }, []);
}
