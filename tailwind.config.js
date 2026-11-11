/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef5f7',
          100: '#d9e8ed',
          500: '#287d87',
          700: '#1a5963',
          900: '#112f4a',
          950: '#0a2033',
        },
        gold: '#b79254',
      },
      boxShadow: {
        card: '0 10px 30px rgba(17, 47, 74, 0.06)',
      },
    },
  },
  plugins: [],
}
