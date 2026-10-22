/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        'on-accent': token('on-accent'),
        sheet: token('sheet'),
        wash: token('wash'),
        rule: token('rule'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        pen: token('pen'),
        ledger: token('ledger'),
        flag: token('flag'),
        mark: token('mark'),
        board: token('board'),
        'on-board': token('on-board'),
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Big Shoulders Display"', '"Arial Narrow"', 'sans-serif'],
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px' },
      keyframes: {
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: { 'dialog-in': 'dialog-in 140ms ease-out' },
    },
  },
  plugins: [],
}
