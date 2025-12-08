/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}',
		'./public/**/*.html'
	],
	theme: {
		extend: {
			colors: {
				primary: {
					DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
					foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)'
				},
				secondary: {
					DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
					foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)'
				},
				neutral: {
					DEFAULT: 'rgb(var(--color-neutral) / <alpha-value>)',
					foreground: 'rgb(var(--color-neutral-foreground) / <alpha-value>)',
					muted: 'rgb(var(--color-neutral-muted) / <alpha-value>)',
					border: 'rgb(var(--color-neutral-border) / <alpha-value>)',
					surface: 'rgb(var(--color-neutral-surface) / <alpha-value>)'
				}
			}
		}
	}
};

