import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * PDF.js bootstrap.
 *
 * The worker is bundled locally (no CDN call), and the standard-font data is
 * served from the prototype's own `public/pdfjs` folder so the sample
 * manuscript renders with real serif metrics in every browser.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_STANDARD_FONT_DATA_URL = '/pdfjs/standard_fonts/';

export type PdfDocumentProxy = pdfjs.PDFDocumentProxy;
export type PdfPageProxy = pdfjs.PDFPageProxy;
export type PdfViewport = pdfjs.PageViewport;
export type PdfTextContent = Awaited<ReturnType<PdfPageProxy['getTextContent']>>;

export async function loadPdf(url: string): Promise<PdfDocumentProxy> {
  return pdfjs.getDocument({
    url,
    standardFontDataUrl: PDF_STANDARD_FONT_DATA_URL,
    isEvalSupported: false,
    disableAutoFetch: false,
  }).promise;
}

export { pdfjs };
