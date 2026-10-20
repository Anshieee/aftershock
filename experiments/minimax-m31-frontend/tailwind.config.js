/**
 * Aftershock. — Trace the evidence.
 * MiniMax M3.1 experiment · standalone design system.
 *
 * Colours are declared as RGB triplets in `src/styles/tokens.css` so a
 * single `.theme-dark` class on <html> re-themes the entire application
 * without duplicating a Tailwind palette. Dark mode is art-directed, not
 * an inversion (see deliverables/design-system.md).
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: 'rgb(var(--c-paper) / <alpha-value>)',
          deep: 'rgb(var(--c-paper-deep) / <alpha-value>)',
          raised: 'rgb(var(--c-paper-raised) / <alpha-value>)',
          sunk: 'rgb(var(--c-paper-sunk) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          soft: 'rgb(var(--c-ink-soft) / <alpha-value>)',
          border: 'rgb(var(--c-ink-border) / <alpha-value>)',
          faint: 'rgb(var(--c-ink-faint) / <alpha-value>)',
          inverse: 'rgb(var(--c-ink-inverse) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          deep: 'rgb(var(--c-brand-deep) / <alpha-value>)',
          soft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
          line: 'rgb(var(--c-brand-line) / <alpha-value>)',
        },
        sage: {
          DEFAULT: 'rgb(var(--c-sage) / <alpha-value>)',
          deep: 'rgb(var(--c-sage-deep) / <alpha-value>)',
          surface: 'rgb(var(--c-sage-surface) / <alpha-value>)',
          line: 'rgb(var(--c-sage-line) / <alpha-value>)',
        },
        amber: {
          DEFAULT: 'rgb(var(--c-amber) / <alpha-value>)',
          deep: 'rgb(var(--c-amber-deep) / <alpha-value>)',
          surface: 'rgb(var(--c-amber-surface) / <alpha-value>)',
          line: 'rgb(var(--c-amber-line) / <alpha-value>)',
        },
        notice: {
          DEFAULT: 'rgb(var(--c-notice) / <alpha-value>)',
          deep: 'rgb(var(--c-notice-deep) / <alpha-value>)',
          surface: 'rgb(var(--c-notice-surface) / <alpha-value>)',
          line: 'rgb(var(--c-notice-line) / <alpha-value>)',
        },
        uncertain: {
          DEFAULT: 'rgb(var(--c-uncertain) / <alpha-value>)',
          deep: 'rgb(var(--c-uncertain-deep) / <alpha-value>)',
          surface: 'rgb(var(--c-uncertain-surface) / <alpha-value>)',
          line: 'rgb(var(--c-uncertain-line) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Iowan Old Style', 'Georgia', 'serif'],
        sans: ['"Inter Tight Variable"', 'Inter', 'system-ui', 'Avenir', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.55rem' }],
        lg: ['1.0625rem', { lineHeight: '1.65rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.95rem', letterSpacing: '-0.01em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.018em' }],
        '4xl': ['2.375rem', { lineHeight: '2.6rem', letterSpacing: '-0.022em' }],
        '5xl': ['3.125rem', { lineHeight: '3.2rem', letterSpacing: '-0.028em' }],
      },
      borderRadius: {
        xs: '2px',
        sm: '3px',
        DEFAULT: '5px',
        md: '7px',
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        hairline: '0 0 0 1px rgb(var(--c-ink-border) / 1)',
        'lift-1': '0 1px 2px rgb(var(--c-ink) / 0.05), 0 1px 1px rgb(var(--c-ink) / 0.04)',
        'lift-2': '0 4px 16px -4px rgb(var(--c-ink) / 0.12), 0 1px 3px rgb(var(--c-ink) / 0.06)',
        'lift-3': '0 18px 44px -18px rgb(var(--c-ink) / 0.28), 0 4px 12px -6px rgb(var(--c-ink) / 0.14)',
        'page': '0 1px 0 rgb(var(--c-ink) / 0.06), 0 14px 38px -22px rgb(var(--c-ink) / 0.4)',
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)',
        settle: 'cubic-bezier(0.16, 1, 0.3, 1)',
        drift: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      keyframes: {
        'ripple-out': {
          '0%': { transform: 'scale(0.35)', opacity: '0.55' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        'ripple-in': {
          '0%': { transform: 'scale(2.2)', opacity: '0' },
          '60%': { opacity: '0.35' },
          '100%': { transform: 'scale(0.4)', opacity: '0' },
        },
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'sweep': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(210%)' },
        },
        'pulse-dot': {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'ripple-out': 'ripple-out 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'ripple-in': 'ripple-in 1100ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-rise': 'fade-rise 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 220ms ease-out both',
        sweep: 'sweep 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
