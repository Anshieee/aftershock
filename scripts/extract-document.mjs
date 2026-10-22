#!/usr/bin/env node
/**
 * extract-document.mjs — Aftershock M9 local document-extraction CLI.
 *
 * Parses a local document (TXT or text-layer PDF) OFFLINE into the canonical
 * `documentExtract-1` record: located text, citation/DOI candidate
 * occurrences, reference entries, and honest unavailable/failed states.
 * No network, no graph, no services — this CLI never contacts FalkorDB or
 * any provider, and real/private documents stay entirely on this machine.
 *
 * Usage:
 *   node scripts/extract-document.mjs <file> [--format txt|pdf|docx]
 *        [--max-pages N] [--out <path>] [--help]
 *
 * --format defaults to the file extension (.txt/.pdf/.docx); an
 * unrecognized extension is passed through as 'unknown' so the record
 * reports the honest no-scan state instead of guessing.
 *
 * Exit codes:
 *   0  a canonical record was produced and validated (including honest
 *      "nothing was scanned" records — those are valid outcomes)
 *   1  the input file could not be read (message on stderr)
 *   2  usage error
 *   3  internal invariant failure: extractor emitted a record that failed
 *      schema validation (never expected; loud, never fabricated around)
 *
 * Privacy: the JSON output contains extracted document text. Keep it
 * local; do not pipe it into logs, tickets, or shared chat.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { extractDocument } from '../server/parse/documentExtract.mjs';

/**
 * Local in-memory read cap for the CLI (the module-level budgets trim the
 * scan/decode window, but the file is read whole first — refuse absurd
 * inputs up front instead of silently filling RAM).
 */
const MAX_INPUT_FILE_BYTES = 200 * 1024 * 1024;

const USAGE = `Aftershock local document extraction (offline; no network, no graph).

Usage:
  node scripts/extract-document.mjs <file> [options]

Options:
  --format txt|pdf|docx   Declare the format (default: file extension).
  --max-pages N           Cap extracted PDF pages (default: module budget).
  --out <path>            Write the JSON record to <path> instead of stdout.
  --help                  Show this help and exit.

The JSON output contains extracted document text — keep it local.`;

function failExit(code, message) {
  process.stderr.write(`extract-document: ${message}\n`);
  process.exit(code);
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    failExit(2, `${flag} requires a value`);
  }
  return value;
}

function parseArgv(argv) {
  const out = { file: null, format: null, maxPages: null, outPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--format') {
      out.format = takeValue(argv, i, '--format');
      i += 1;
    } else if (arg === '--max-pages') {
      const raw = takeValue(argv, i, '--max-pages');
      if (!/^[1-9]\d*$/.test(raw)) {
        failExit(2, '--max-pages requires a positive integer (a zero-page extraction is not a meaningful scan)');
      }
      out.maxPages = raw;
      i += 1;
    } else if (arg === '--out') {
      out.outPath = takeValue(argv, i, '--out');
      i += 1;
    } else if (arg === '--') {
      continue;
    } else if (arg.startsWith('--')) {
      failExit(2, `unknown option ${arg}`);
    } else if (out.file === null) {
      out.file = arg;
    } else {
      failExit(2, 'exactly one input file is accepted');
    }
  }
  return out;
}

function formatFromExtension(fileName) {
  if (/\.txt$/i.test(fileName)) return 'txt';
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  if (/\.docx$/i.test(fileName)) return 'docx';
  return 'unknown';
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.file === null) failExit(2, 'a file path is required (node scripts/extract-document.mjs <file> --help)');
  if (args.outPath && resolvePath(args.outPath) === resolvePath(args.file)) {
    failExit(2, '--out must not be the input file itself; refusing to overwrite the source document.');
  }

  // Input guard: the module budgets cap what gets SCANNED, but the CLI reads
  // the file whole; refuse non-files and absurd sizes with an honest
  // rejection before any content is opened.
  try {
    const stat = statSync(args.file);
    if (!stat.isFile()) {
      failExit(1, 'the input path is not a regular file; nothing was scanned.');
    }
    if (stat.size > MAX_INPUT_FILE_BYTES) {
      failExit(
        1,
        `the input file is ${stat.size} bytes, above the local read cap (${MAX_INPUT_FILE_BYTES} bytes); nothing was scanned.`,
      );
    }
  } catch (err) {
    const code = err && err.code ? err.code : 'stat error';
    const readLike = code === 'ENOENT' || code === 'EACCES' || code === 'EPERM';
    failExit(
      1,
      readLike
        ? `could not read the input file (${code}); nothing was scanned.`
        : `could not inspect the input file (${code}); nothing was scanned.`,
    );
  }

  let bytes;
  try {
    bytes = new Uint8Array(readFileSync(args.file));
  } catch (err) {
    failExit(1, `could not read the input file (${err && err.code ? err.code : 'read error'}); nothing was scanned.`);
  }

  const format = args.format ?? formatFromExtension(args.file);
  const deps = {
    format,
    fileName: args.file,
  };
  if (args.maxPages !== null) {
    // The CLI is the integration layer above the parse modules: wire the
    // real PDF op with the caller-supplied page budget explicitly.
    const { extractPdfText } = await import('../server/parse/pdfText.mjs');
    deps.pdfExtractOp = (bytes) => extractPdfText(bytes, { maxPages: Number(args.maxPages) });
  }

  let record;
  try {
    record = await extractDocument(bytes, deps);
  } catch (err) {
    // The dispatcher's hard validation gate throws on internal invariants only.
    failExit(3, `internal extraction invariant failure: ${err && err.message ? err.message : String(err)}`);
  }

  const json = JSON.stringify(record, null, 2) + '\n';
  if (args.outPath) {
    try {
      writeFileSync(args.outPath, json, 'utf-8');
      process.stderr.write(
        `wrote record (${record.schema}, format ${record.source.format}) to ${args.outPath}\n`,
      );
    } catch (err) {
      failExit(1, `could not write the output file (${err && err.code ? err.code : 'write error'})`);
    }
  } else {
    process.stdout.write(json);
  }
}

await main();
