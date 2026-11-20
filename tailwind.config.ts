import type { Config } from 'tailwindcss';

export default {
  // relative: resolve globs against this config file, not the process CWD
  // (the dev server is launched with the app dir as a vite root arg, so CWD differs)
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1F5E7A',
          light: '#2E7795',
          dark: '#174A61',
        },
        accent: {
          DEFAULT: '#A66A2B',
          light: '#C28442',
          dark: '#8A5520',
        },
        background: '#FAF8F5',
        surface: '#FFFFFF',
        'surface-alt': '#F3EFE8',
        border: 'rgba(31, 94, 122, 0.12)',
        'text-base': '#1F2933',
        'text-mid': '#3E4C59',
        'text-muted': '#5B6770',
        success: '#2E7D32',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        memorial: '#6B5094',
      },
      fontFamily: {
        sans: ['Rubik', 'sans-serif'],
      },
      fontSize: {
        'h1': ['36px', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['28px', { lineHeight: '1.25', fontWeight: '700' }],
        'h3': ['22px', { lineHeight: '1.3', fontWeight: '600' }],
        'body': ['16px', { lineHeight: '1.6' }],
        'caption': ['14px', { lineHeight: '1.5' }],
        'xs': ['12px', { lineHeight: '1.4' }],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      borderRadius: {
        'btn': '14px',
        'input': '14px',
        'card': '20px',
        'modal': '24px',
        'badge': '99px',
        'sm': '8px',
        'md': '12px',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.10)',
        'modal': '0 20px 60px rgba(0,0,0,0.15)',
        'sm': '0 2px 8px rgba(0,0,0,0.05)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.3s ease',
        'shimmer': 'shimmer 1.5s infinite linear',
      },
    },
  },
  plugins: [],
} satisfies Config;
