import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#111111',
        panel: '#171717',
        border: '#2a2a2a',
        muted: '#a3a3a3',
        accent: '#3b82f6',
        success: '#22c55e',
        danger: '#ef4444'
      },
      borderRadius: {
        card: '8px',
        badge: '4px'
      },
      keyframes: {
        'slide-in-top': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translate(16px, 12px)' },
          to: { opacity: '1', transform: 'translate(0, 0)' }
        }
      },
      animation: {
        'slide-in-top': 'slide-in-top 150ms ease-out',
        'toast-in': 'toast-in 150ms ease-out'
      }
    }
  },
  plugins: [animate]
};

export default config;

