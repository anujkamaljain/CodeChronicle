/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/webview/**/*.{js,jsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                surface: {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617',
                },
                neon: {
                    cyan: '#00f0ff',
                    purple: '#a855f7',
                    pink: '#ec4899',
                    green: '#10b981',
                    blue: '#3b82f6',
                    orange: '#f97316',
                },
                risk: {
                    low: '#10b981',
                    medium: '#f59e0b',
                    high: '#ef4444',
                    critical: '#dc2626',
                },
                glass: {
                    light: 'rgba(255, 255, 255, 0.05)',
                    medium: 'rgba(255, 255, 255, 0.10)',
                    heavy: 'rgba(255, 255, 255, 0.15)',
                    border: 'rgba(255, 255, 255, 0.08)',
                },
            },
            fontFamily: {
                sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
            },
            backdropBlur: {
                xs: '2px',
            },
            animation: {
                'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
                'float': 'float 3s ease-in-out infinite',
                'slide-up': 'slide-up 0.3s ease-out',
                'slide-right': 'slide-right 0.3s ease-out',
                'fade-in': 'fade-in 0.2s ease-out',
                'shimmer': 'shimmer 2s linear infinite',
                'scan-line': 'scan-line 3s linear infinite',
            },
            keyframes: {
                'glow-pulse': {
                    '0%, 100%': { boxShadow: '0 0 15px rgba(0, 240, 255, 0.3)' },
                    '50%': { boxShadow: '0 0 30px rgba(0, 240, 255, 0.6)' },
                },
                'float': {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-5px)' },
                },
                'slide-up': {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                'slide-right': {
                    '0%': { transform: 'translateX(-10px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'shimmer': {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                'scan-line': {
                    '0%': { transform: 'translateY(-100%)' },
                    '100%': { transform: 'translateY(100%)' },
                },
            },
            boxShadow: {
                'neon-cyan': '0 0 15px rgba(0, 240, 255, 0.4), 0 0 45px rgba(0, 240, 255, 0.1)',
                'neon-purple': '0 0 15px rgba(168, 85, 247, 0.4), 0 0 45px rgba(168, 85, 247, 0.1)',
                'neon-green': '0 0 15px rgba(16, 185, 129, 0.4), 0 0 45px rgba(16, 185, 129, 0.1)',
                'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
                'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.4)',
            },
        },
    },
    plugins: [],
};
