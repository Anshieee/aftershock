import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Without Vitest globals, auto-cleanup from @testing-library/react does not
// register itself; do it explicitly so tests never leak DOM between runs.
afterEach(() => {
  cleanup();
});
