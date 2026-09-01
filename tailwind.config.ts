import type { Config } from 'tailwindcss'

export default {
	content: ['./index.html', './src/**/*.{ts,tsx}'],
	darkMode: ['class'],
	theme: {
		screens: {
			sm: '640px',
			md: '768px',
			tablet: '768px',
			lg: '1024px',
			desktop: '1024px',
			xl: '1280px',
			'2xl': '1536px'
		},
		extend: {
			/*
			  App stacking scale (CSS vars in src/index.css :root).
			  modal > sidebar > action-sheet > mobile-nav > map-controls > map
			*/
			zIndex: {
				map: 'var(--z-map)',
				'map-controls': 'var(--z-map-controls)',
				'mobile-nav': 'var(--z-mobile-nav)',
				'action-sheet': 'var(--z-action-sheet)',
				sidebar: 'var(--z-sidebar)',
				header: 'var(--z-header)',
				modal: 'var(--z-modal)',
				toast: 'var(--z-toast)'
			},
			colors: {
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				muted: 'hsl(var(--muted))',
				'muted-foreground': 'hsl(var(--muted-foreground))',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				}
			},
			borderRadius: {
				lg: '0.75rem',
				md: '0.5rem',
				sm: '0.375rem'
			},
			boxShadow: {
				card: '0 8px 30px rgba(0,0,0,0.12)'
			},
			backdropBlur: {
				xs: '2px'
			}
		}
	}
} satisfies Config



