/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0f1117',
          1: '#181c27',
          2: '#1e2333',
          3: '#252b3b',
          4: '#2d3447',
        },
        accent: {
          blue: '#3b82f6',
          indigo: '#6366f1',
        },
      },
    },
  },
  plugins: [],
}
