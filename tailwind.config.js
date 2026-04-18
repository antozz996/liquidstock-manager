/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        card: '#1a1a1a',
        primary: {
          DEFAULT: '#3b82f6', // un blu intenso che sta bene sul dark
          foreground: '#ffffff',
        },
        accent: {
          green: '#10b981',
          orange: '#f59e0b',
          red: '#ef4444',
        },
        muted: '#52525b',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
