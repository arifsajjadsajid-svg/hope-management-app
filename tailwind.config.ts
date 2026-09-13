import type { Config } from 'tailwindcss';

/**
 * THE HOPE SCIENCE ACADEMY - visual identity
 * Deep navy / royal blue primary, gold accent, light neutral surfaces.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f2f6fb',
          100: '#e2ebf6',
          200: '#c5d7ec',
          300: '#98b8dc',
          400: '#6493c8',
          500: '#4174b1',
          600: '#305b94',
          700: '#284a78',
          800: '#243f64',
          900: '#0f2547',
          950: '#081428',
        },
        royal: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd7fe',
          300: '#93bcfd',
          400: '#6098fa',
          500: '#3b76f6',
          600: '#2559eb',
          700: '#1d45d8',
          800: '#1e3aaf',
          900: '#1e368a',
          950: '#172354',
        },
        gold: {
          50: '#fbf8ef',
          100: '#f5edd4',
          200: '#ead9a8',
          300: '#dcbf74',
          400: '#d0a64e',
          500: '#c8a34a',
          600: '#a97f34',
          700: '#87612c',
          800: '#714f2b',
          900: '#614328',
          950: '#372213',
        },
        parchment: '#faf9f6',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Segoe UI', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'Cambria', 'serif'],
        mono: ['ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 37, 71, 0.06), 0 4px 16px rgba(15, 37, 71, 0.06)',
        elevated: '0 8px 30px rgba(15, 37, 71, 0.12)',
        crest: '0 2px 10px rgba(200, 163, 74, 0.35)',
      },
      backgroundImage: {
        'navy-gradient': 'linear-gradient(135deg, #0f2547 0%, #1e368a 55%, #243f64 100%)',
        'gold-gradient': 'linear-gradient(135deg, #dcbf74 0%, #c8a34a 50%, #a97f34 100%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
