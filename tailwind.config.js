/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        bg2: 'var(--bg2)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        hover: 'var(--hover)',
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        'accent-hover': 'var(--accent-hover)',
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        border: 'var(--border)',
        border2: 'var(--border2)',
        'code-bg': 'var(--code-bg)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        serif: ['Noto Serif SC', 'Georgia', 'serif'],
        sans: ['Noto Sans SC', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Playfair Display', 'Noto Serif SC', 'serif'],
      },
    },
  },
  plugins: [],
}
