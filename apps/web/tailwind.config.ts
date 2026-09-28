import type { Config } from 'tailwindcss';
// Tailwind reads the CSS custom-property tokens so dark/light swap at runtime without re-render.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)', line: 'var(--line)',
        brand: { DEFAULT: 'var(--brand)', ink: 'var(--brand-ink)', soft: 'var(--brand-soft)' },
        maize: { DEFAULT: 'var(--maize)', soft: 'var(--maize-soft)' }, clay: { DEFAULT: 'var(--clay)', soft: 'var(--clay-soft)' }, leaf: { DEFAULT: 'var(--leaf)', soft: 'var(--leaf-soft)' },
      },
      fontFamily: { display: ['Sora', 'system-ui', 'sans-serif'], sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'] },
      borderRadius: { card: '16px', ctl: '12px' },
      boxShadow: { e1: 'var(--e1)', e2: 'var(--e2)', e3: 'var(--e3)' },
      spacing: { safe: 'env(safe-area-inset-bottom)' },
    },
  },
  plugins: [],
} satisfies Config;
