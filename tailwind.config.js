/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['鸿蒙黑体', 'HarmonyOS Sans', 'Microsoft YaHei', 'Microsoft YaHei UI', 'Segoe UI', '-apple-system', 'sans-serif'],
        mono: ['Maple Mono Normal NF CN', 'Maple Mono Normal', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        dark: {
          900: '#0f0f0f',
          800: '#1a1a1a',
          700: '#252525',
          600: '#303030',
          500: '#404040',
        }
      }
    },
  },
  plugins: [],
}
