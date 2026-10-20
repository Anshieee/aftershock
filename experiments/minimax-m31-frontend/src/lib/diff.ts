/**
 * A small word-level diff.
 *
 * Used for the tracked-changes view of a suggested revision: deletions are
 * struck through, additions are underlined, and the unchanged text stays
 * legible in place.
 */

export type DiffTokenType = 'equal' | 'insert' | 'delete';

export interface DiffToken {
  type: DiffTokenType;
  text: string;
}

function tokenise(value: string): string[] {
  return value.split(/(\s+)/).filter((token) => token.length > 0);
}

/** Longest common subsequence over word tokens. */
export function diffWords(original: string, revised: string): DiffToken[] {
  const left = tokenise(original);
  const right = tokenise(revised);

  const rows = left.length + 1;
  const cols = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        left[i] === right[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      tokens.push({ type: 'equal', text: left[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      tokens.push({ type: 'delete', text: left[i]! });
      i += 1;
    } else {
      tokens.push({ type: 'insert', text: right[j]! });
      j += 1;
    }
  }
  while (i < left.length) {
    tokens.push({ type: 'delete', text: left[i]! });
    i += 1;
  }
  while (j < right.length) {
    tokens.push({ type: 'insert', text: right[j]! });
    j += 1;
  }

  // Merge neighbours of the same kind.
  const merged: DiffToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type) last.text += token.text;
    else merged.push({ ...token });
  }
  return merged;
}

export interface DiffSummary {
  inserted: number;
  deleted: number;
}

export function summarise(tokens: DiffToken[]): DiffSummary {
  let inserted = 0;
  let deleted = 0;
  for (const token of tokens) {
    const words = token.text.trim() ? token.text.trim().split(/\s+/).length : 0;
    if (token.type === 'insert') inserted += words;
    if (token.type === 'delete') deleted += words;
  }
  return { inserted, deleted };
}
