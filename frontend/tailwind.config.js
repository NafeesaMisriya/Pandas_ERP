/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFFDF5',
          100: '#FFF8E1',
          200: '#FFEEB3',
          300: '#FFE082',
          400: '#F5C518',
          500: '#F5B900',
          600: '#D99A00',
          700: '#B07D00',
        },
        navy: {
          800: '#1A1A1A',
          900: '#111111',
          950: '#0A0A0A',
        },
        gold: {
          50: '#FFFDF5',
          100: '#FFF8E1',
          200: '#FFEEB3',
          300: '#FFE082',
          400: '#F5C518',
          500: '#F5B900',
          600: '#D99A00',
          700: '#B07D00',
          border: '#E9D9AD',
        },
        surface: {
          warm: '#FAF9F5',
          white: '#FFFFFF',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
