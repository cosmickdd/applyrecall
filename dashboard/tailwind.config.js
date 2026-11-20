/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#2142E7",
          deep: "#182FA5",
          light: "#EEF2FF",
          canvas: "#FFFFFF",
          surface: "#FFFFFF",
          soft: "#F9FAFB",
          subtle: "#F3F4F6",
        },
        ink: {
          primary: "#111827",
          secondary: "#4B5563",
          muted: "#70747D",
          disabled: "#9CA3AF"
        },
        edge: {
          default: "#E5E7EB",
          strong: "#D1D5DB"
        },
        status: {
          success: "#15803D",
          warning: "#B45309",
          error: "#B91C1C",
          info: "#2142E7"
        }
      },
      borderRadius: {
        'sm': '8px',
        'btn': '12px',
        'card': '16px',
        'container': '20px'
      },
      boxShadow: {
        'subtle': '0 2px 8px rgba(17, 24, 39, 0.04)',
        'hover': '0 4px 12px rgba(17, 24, 39, 0.07)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
