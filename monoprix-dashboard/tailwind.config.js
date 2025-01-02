/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: [
	  './pages/**/*.{js,jsx}',
	  './components/**/*.{js,jsx}',
	  './app/**/*.{js,jsx}',
	  './src/**/*.{js,jsx}',
	],
	prefix: "",
	theme: {
	  container: {
		center: true,
		padding: '2rem',
		screens: {
		  '2xl': '1400px'
		}
	  },
	  extend: {
		colors: {
		  border: 'hsl(var(--border))',
		  input: 'hsl(var(--input))',
		  ring: 'hsl(var(--ring))',
		  background: 'hsl(var(--background))',
		  foreground: 'hsl(var(--foreground))',
		  primary: {
			DEFAULT: 'hsl(var(--primary))',
			foreground: 'hsl(var(--primary-foreground))'
		  },
		  secondary: {
			DEFAULT: 'hsl(var(--secondary))',
			foreground: 'hsl(var(--secondary-foreground))'
		  },
		  destructive: {
			DEFAULT: 'hsl(var(--destructive))',
			foreground: 'hsl(var(--destructive-foreground))'
		  },
		  muted: {
			DEFAULT: 'hsl(var(--muted))',
			foreground: 'hsl(var(--muted-foreground))'
		  },
		  accent: {
			DEFAULT: 'hsl(var(--accent))',
			foreground: 'hsl(var(--accent-foreground))'
		  },
		  popover: {
			DEFAULT: 'hsl(var(--popover))',
			foreground: 'hsl(var(--popover-foreground))'
		  },
		  card: {
			DEFAULT: 'hsl(var(--card))',
			foreground: 'hsl(var(--card-foreground))'
		  },
		  chart: {
			'1': 'hsl(var(--chart-1))',
			'2': 'hsl(var(--chart-2))',
			'3': 'hsl(var(--chart-3))',
			'4': 'hsl(var(--chart-4))',
			'5': 'hsl(var(--chart-5))'
		  }
		},
		borderRadius: {
		  lg: 'var(--radius)',
		  md: 'calc(var(--radius) - 2px)',
		  sm: 'calc(var(--radius) - 4px)'
		},
		animation: {
		  'fade-in': 'fadeIn 0.6s ease-out forwards',
		  'slide-up': 'slideUp 0.6s ease-out forwards',
		  'slide-left': 'slideLeft 0.6s ease-out forwards',
		  'slide-right': 'slideRight 0.6s ease-out forwards',
		  'zoom-in': 'zoomIn 0.3s ease-out forwards',
		  'blob': 'blob 7s infinite',
		},
		keyframes: {
		  fadeIn: {
			'0%': { opacity: '0' },
			'100%': { opacity: '1' },
		  },
		  slideUp: {
			'0%': { 
			  opacity: '0',
			  transform: 'translateY(20px)'
			},
			'100%': { 
			  opacity: '1',
			  transform: 'translateY(0)'
			},
		  },
		  slideLeft: {
			'0%': { 
			  opacity: '0',
			  transform: 'translateX(-20px)'
			},
			'100%': { 
			  opacity: '1',
			  transform: 'translateX(0)'
			},
		  },
		  slideRight: {
			'0%': { 
			  opacity: '0',
			  transform: 'translateX(20px)'
			},
			'100%': { 
			  opacity: '1',
			  transform: 'translateX(0)'
			},
		  },
		  zoomIn: {
			'0%': { 
			  opacity: '0',
			  transform: 'scale(0)'
			},
			'100%': { 
			  opacity: '1',
			  transform: 'scale(1)'
			},
		  },
		  blob: {
			'0%': {
			  transform: 'translate(0px, 0px) scale(1)'
			},
			'33%': {
			  transform: 'translate(30px, -50px) scale(1.1)'
			},
			'66%': {
			  transform: 'translate(-20px, 20px) scale(0.9)'
			},
			'100%': {
			  transform: 'translate(0px, 0px) scale(1)'
			},
		  },
		},
	  },
	},
	plugins: [require("tailwindcss-animate")],
  }