import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4fa', 100: '#dce6f5', 200: '#b9cde9', 300: '#8aaad9', 400: '#5583c2',
          500: '#2f5f9e', 600: '#1b3a6b', 700: '#16305a', 800: '#122748', 900: '#0d1b33',
        },
        gold: {
          50: '#faf6ea', 100: '#f3e9c8', 200: '#e8d494', 300: '#ddbe62', 400: '#d4af37',
          500: '#c9a227', 600: '#a8861f', 700: '#856a1a', 800: '#614d14', 900: '#3f310c',
        },
        paper: '#f7f5f0',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
