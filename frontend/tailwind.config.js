/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT: '#0B1D3A', light: '#112347', deep: '#071428' },
        gold:  { DEFAULT: '#C9A84C', light: '#E8C96A', pale: '#FEF9EE' },
        cream: { DEFAULT: '#F5F0E8', dark: '#EDE5D0' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body:    ['var(--font-body)',    'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
