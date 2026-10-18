/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#FBF7EF',
          deep: '#F3ECDD',
          raised: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#2B2922',
          muted: '#5B5748',
          border: '#DAD2C0',
        },
        brand: {
          DEFAULT: '#52489C',
          deep: '#40377B',
          surface: '#EDEBF6',
        },
        review: {
          text: '#8A5A05',
          surface: '#FBEFD4',
          border: '#E1C98F',
        },
        notice: {
          text: '#8F3535',
          surface: '#F6E4E3',
          border: '#E3BBB8',
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
      },
    },
  },
  plugins: [],
};
