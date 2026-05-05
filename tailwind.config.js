/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        harmony: {
          sage: '#B2AC88', // Primary A
          sand: '#E6D5B8', // Primary B
          indigo: '#5F7ADB', // Secondary
          background: '#FBFBF9', // Soft background
          text: '#3E3C38', // Deep warm gray
          textMuted: '#8B8881', // Muted text
        }
      },
      borderRadius: {
        '4xl': '32px', // Super large border radius
        'full': '9999px',
      },
      boxShadow: {
        'zen': '0 10px 40px -10px rgba(178, 172, 136, 0.15)', // Soft diffuse shadow
      }
    },
  },
  plugins: [],
}
