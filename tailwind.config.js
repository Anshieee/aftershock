/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Frozen design-of-record palette
      // (docs/design/2026-10-19-redesign-spec.md §1). Changed values from the
      // 2026-10-19 audit are applied verbatim; reviewed.* and uncertain.*
      // already match the brief and stay untouched.
      colors: {
        paper: {
          DEFAULT: '#F7F3EA',
          deep: '#F1EBDC',
          raised: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#27283B',
          muted: '#5B5C6D',
          border: '#DFD8C9',
        },
        brand: {
          DEFAULT: '#665C91',
          deep: '#524A78',
          surface: '#DED6FA',
        },
        review: {
          text: '#8A5A05',
          surface: '#F9F0DC',
          border: '#E9B867',
        },
        notice: {
          text: '#8F3B36',
          surface: '#F7E7E4',
          border: '#E5C0BB',
        },
        uncertain: {
          text: '#3D5C86',
          surface: '#E5EDF6',
          border: '#BFCFE2',
        },
        reviewed: {
          default: '#658C79',
          surface: '#E2EFE7',
          text: '#2F5347',
        },
      },
      fontFamily: {
        display: ['"Source Serif 4 Variable"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', 'Avenir', 'Helvetica', 'sans-serif'],
        // Brand wordmark only ("Aftershock." in the header and the landing
        // hero) — never page headings, body text, or controls.
        wordmark: ['"Bodoni Moda"', '"Source Serif 4 Variable"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
