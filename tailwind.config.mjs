/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,md,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#1A1A1A',
          dark: '#2A2A2A',
          card: '#F7F7F7',
          card2: '#F5F5F5',
          border: '#E0E0E0',
          yellow: '#E6A817',
          yellowLight: '#F0C040',
          yellowDim: 'rgba(230,168,23,0.12)',
          blue: '#3B9FD9',
          blueLight: '#6BB5D9',
          blueDim: 'rgba(59,159,217,0.1)',
          white: '#FFFFFF',
          muted: '#555555',
          muted2: '#888888',
        },
      },
      fontFamily: {
        display: ['Barlow Condensed', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.01em',
        tight: '-0.02em',
      },
    },
  },
  plugins: [],
};
