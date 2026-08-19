const { hairlineWidth } = require('nativewind/theme');

/**
 * Bridges Tailwind utilities to the CSS variables in src/global.css.
 *
 * Nothing here holds a literal colour. `hsl(var(--x))` is what makes opacity
 * modifiers (`bg-primary/90`, `border-border/50`) work — Tailwind has to own the
 * colour function to inject an alpha channel into it.
 *
 * NativeWind 4 requires Tailwind 3.x. Installing tailwindcss@latest pulls v4 and
 * breaks styling silently: the bundle still builds, the styles just stop applying.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  darkMode: 'class',
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // For `shadow-shadow/20` on the two portalled surfaces that float but
        // are not `Card`s. Everything else gets its depth from `ELEVATION` in
        // src/lib/theme.ts — see src/components/ui/card.tsx.
        shadow: 'hsl(var(--shadow))',
        // Occupancy is the only domain-semantic colour scale in the app.
        // There is deliberately no `unknown` entry — see src/global.css.
        occupancy: {
          empty: 'hsl(var(--occupancy-empty))',
          'empty-surface': 'hsl(var(--occupancy-empty-surface))',
          some: 'hsl(var(--occupancy-some))',
          'some-surface': 'hsl(var(--occupancy-some-surface))',
          packed: 'hsl(var(--occupancy-packed))',
          'packed-surface': 'hsl(var(--occupancy-packed-surface))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Cards round harder than controls. Deriving it from --radius rather
        // than typing 20px keeps one variable in charge of the app's shape.
        card: 'calc(var(--radius) + 0.25rem)',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};
