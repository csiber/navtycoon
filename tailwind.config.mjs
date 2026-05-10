export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        nt: {
          50: '#f5f7ff', 100: '#e8edff', 200: '#cdd7ff',
          400: '#7d92ff', 500: '#5670ff', 600: '#3b56e6',
          700: '#2c41ba', 900: '#161e4a',
          bg: '#0a0e1f', 'bg-2': '#121732', 'bg-3': '#1a2042',
          accent: '#5670ff', 'accent-l': 'rgba(86, 112, 255, 0.15)',
          text: '#e8edff', 'text-dim': '#9ba3c8',
          border: '#2a3157',
        },
      },
      fontFamily: { mono: ['JetBrains Mono', 'monospace'] },
    },
  },
};
