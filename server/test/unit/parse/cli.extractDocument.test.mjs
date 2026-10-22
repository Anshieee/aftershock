/**
 * Guard-logic tests for the local extraction CLI `scripts/extract-document.mjs`.
 *
 * The CLI is driven as a REAL subprocess (`spawnSync(process.execPath, ...)`,
 * explicit argv array, explicit `cwd` — never a shell string) so these tests
 * lock the exit codes, stderr messages, stdout contract, and file-safety
 * guards exactly as a user experiences them. An independent review flagged
 * that the guards were previously verified manually only; this suite exists
 * so a refactor cannot silently drop them.
 *
 * Covered guards (see the CLI header comment for the exit-code contract):
 *   0  canonical, schema-valid record (stdout or --out)
 *   1  input unreadable / not a regular file / over the 200 MB read cap
 *   2  usage error (--out == input file, bad --max-pages, flag missing value)
 *
 * Offline by construction: fixtures live in-repo, scratch files go to
 * os.tmpdir() and are removed, nothing touches the network or the graph.
 *
 * Run: `npm --prefix server run test` (covered by test/unit/**).
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateExtractionRecord } from '../../../parse/schema.mjs';

/** Repository root: this file lives at <repoRoot>/server/test/unit/parse/. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLI_PATH = fileURLToPath(new URL('../../../../scripts/extract-document.mjs', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('../../../parse/fixtures/', import.meta.url));

const TXT_FIXTURE = join(FIXTURES_DIR, 'synthetic-notes.txt');
const PDF_2P_FIXTURE = join(FIXTURES_DIR, 'synthetic-article-2p.pdf');

/**
 * Run the CLI as a real subprocess with an explicit argv array (no shell,
 * no interpolation of values into a command string). `process.execPath`
 * keeps the child on the exact Node binary running this suite (CI's Node 20
 * verification therefore also spawns Node-20 children).
 *
 * @param {string[]} args
 */
function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  if (result.error) throw result.error;
  return result;
}

/** A fresh scratch directory under os.tmpdir(); caller removes it in finally. */
function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'aftershock-cli-test-'));
}

describe('extract-document.mjs CLI — guard logic (real subprocess, offline)', () => {
  it('happy path: TXT fixture → exit 0, stdout is a schema-valid documentExtract-1 record', () => {
    const result = runCli([TXT_FIXTURE]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const record = JSON.parse(result.stdout);
    expect(record.schema).toBe('documentExtract-1');
    expect(record.source.format).toBe('txt');
    expect(record.extraction.attempted).toBe(true);
    expect(validateExtractionRecord(record)).toEqual([]);
  });

  it('happy path: 2-page PDF fixture → exit 0, two pages extracted with real coordinates', () => {
    const result = runCli([PDF_2P_FIXTURE]);

    expect(result.status).toBe(0);

    const record = JSON.parse(result.stdout);
    expect(record.schema).toBe('documentExtract-1');
    expect(record.source.format).toBe('pdf');
    expect(record.extraction.pages).toHaveLength(2);
    expect(record.extraction.coordinatesSupported).toBe(true);
    expect(validateExtractionRecord(record)).toEqual([]);
  }, 30_000);

  it('missing input file → exit 1, honest "nothing was scanned" message, empty stdout, no content leak', () => {
    const tempDir = makeTempDir();
    try {
      const missingPath = join(tempDir, 'does-not-exist.txt');
      expect(existsSync(missingPath)).toBe(false);

      const result = runCli([missingPath]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('could not read the input file');
      expect(result.stderr).toContain('ENOENT');
      // The honest failure phrasing — nothing was scanned, nothing invented.
      expect(result.stderr).toContain('nothing was scanned');
      // No record (and therefore no file content) leaks onto stdout.
      expect(result.stdout).toBe('');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('--out pointing at the input file → exit 2 AND the source bytes are untouched', () => {
    const tempDir = makeTempDir();
    try {
      const target = join(tempDir, 'source-document.txt');
      copyFileSync(TXT_FIXTURE, target);
      const bytesBefore = readFileSync(target);

      const result = runCli([target, '--out', target]);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('refusing to overwrite the source document');
      // The critical property: the guard must prevent clobbering the input.
      const bytesAfter = readFileSync(target);
      expect(bytesAfter.equals(bytesBefore)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('--max-pages 0 → exit 2 (a zero-page scan is not meaningful)', () => {
    const result = runCli([TXT_FIXTURE, '--max-pages', '0']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--max-pages');
  });

  it('--max-pages abc → exit 2 (non-numeric page cap rejected)', () => {
    const result = runCli([TXT_FIXTURE, '--max-pages', 'abc']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--max-pages');
  });

  it('--format with a missing value (--format --out x.json) → exit 2', () => {
    const tempDir = makeTempDir();
    try {
      const result = runCli([TXT_FIXTURE, '--format', '--out', join(tempDir, 'x.json')]);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('--format requires a value');
      // The guard fires before any work: no output file may appear.
      expect(existsSync(join(tempDir, 'x.json'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('directory passed as input → exit 1 (not a regular file)', () => {
    const result = runCli([FIXTURES_DIR]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a regular file');
    expect(result.stderr).toContain('nothing was scanned');
    expect(result.stdout).toBe('');
  });

  it('--out <tmpfile> → exit 0, record written to the file and schema-valid', () => {
    const tempDir = makeTempDir();
    try {
      const outPath = join(tempDir, 'record.json');

      const result = runCli([TXT_FIXTURE, '--out', outPath]);

      expect(result.status).toBe(0);
      // The record goes to the file, not stdout.
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('wrote record');

      const record = JSON.parse(readFileSync(outPath, 'utf-8'));
      expect(record.schema).toBe('documentExtract-1');
      expect(record.source.format).toBe('txt');
      expect(validateExtractionRecord(record)).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
