/**
 * Verifies that every annotation anchor resolves against the generated PDF.
 *
 *   node scripts/verify-anchors.ts
 *
 * Exits non-zero when an anchor cannot be located: a highlight is never
 * allowed to be drawn for a passage the PDF does not actually contain.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorSpecs } from '../src/fixtures/manuscriptContent.ts';
import { locatePhrase, type PdfTextItemLike } from '../src/lib/anchors.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

async function main(): Promise<void> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(
    fs.readFileSync(path.join(ROOT, 'public', 'sample-manuscript.pdf')),
  );
  const doc = await pdfjs.getDocument({ data }).promise;

  const remaining = new Map(anchorSpecs.map((a) => [a.id, a.phrase]));
  const resolved = new Map<string, { page: number; rects: number; text: string }>();

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = textContent.items as unknown as PdfTextItemLike[];

    for (const [id, phrase] of remaining) {
      const match = locatePhrase(items, phrase, {
        pageIndex: pageNumber - 1,
        viewportTransform: viewport.transform,
      });
      if (match) {
        resolved.set(id, {
          page: pageNumber,
          rects: match.rects.length,
          text: match.matchedText.slice(0, 70),
        });
        remaining.delete(id);
      }
    }
  }

  let failed = false;
  for (const anchor of anchorSpecs) {
    const hit = resolved.get(anchor.id);
    if (!hit) {
      failed = true;
      process.stdout.write(`FAIL  ${anchor.id} — phrase not found in the PDF\n`);
    } else {
      process.stdout.write(
        `ok    ${anchor.id.padEnd(28)} page ${hit.page} · ${hit.rects} rect(s) · “${hit.text}…”\n`,
      );
    }
  }

  if (failed) {
    process.stdout.write('\nAnchors did not resolve — no highlight may be drawn.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`\nAll ${anchorSpecs.length} anchors resolved against the PDF.\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
