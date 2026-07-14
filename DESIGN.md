---
name: Schlag
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1c1c'
  surface-container: '#1f2020'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e4e2e1'
  on-surface-variant: '#c7c4d6'
  inverse-surface: '#e4e2e1'
  inverse-on-surface: '#303030'
  outline: '#918f9f'
  outline-variant: '#464554'
  surface-tint: '#c2c1ff'
  primary: '#c2c1ff'
  on-primary: '#1c0b9f'
  primary-container: '#5856d6'
  on-primary-container: '#e7e4ff'
  inverse-primary: '#4f4ccd'
  secondary: '#c9c6c5'
  on-secondary: '#313030'
  secondary-container: '#4a4949'
  on-secondary-container: '#bab8b7'
  tertiary: '#ffb785'
  on-tertiary: '#502500'
  tertiary-container: '#a25100'
  on-tertiary-container: '#ffe1cf'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c2c1ff'
  on-primary-fixed: '#0c006a'
  on-primary-fixed-variant: '#3631b4'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c9c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb785'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#713700'
  background: '#131313'
  on-background: '#e4e2e1'
  surface-variant: '#353535'
  # Light theme — see the "Light Theme" section below. Every token here has
  # a dark-theme counterpart above with the same role; unlisted roles
  # (secondary/tertiary-fixed/inverse-*, etc.) are not wired into the live
  # Tailwind theme (App.css) and don't need a light variant yet.
  light-surface: '#fdfdff'
  light-surface-container-lowest: '#ffffff'
  light-surface-container-low: '#f9fafd'
  light-surface-container: '#f4f5f9'
  light-surface-container-high: '#ebecf3'
  light-surface-container-highest: '#dfe1e9'
  light-on-surface: '#181a24'
  light-on-surface-variant: '#494c5e'
  light-outline: '#595c6f'
  light-outline-variant: '#abadbb'
  light-tertiary: '#a44100'
  light-tertiary-container: '#b15300'
  light-error: '#a50013'
  light-error-container: '#fed2cd'
  light-on-error-container: '#5f0000'
  light-primary: '#3d33b0'
  # Accent colors — user-selectable (Settings → Appearance). primary-container
  # is shared between both themes for each accent (see "Accent Colors"
  # below); primary is the one role that differs per theme.
  accent-green-primary-container: '#0c7219'
  accent-green-primary-dark: '#9cd59b'
  accent-green-primary-light: '#005f0a'
  accent-orange-primary-container: '#b23f00'
  accent-orange-primary-dark: '#f7b385'
  accent-orange-primary-light: '#8d2200'
  accent-pink-primary-container: '#c61e54'
  accent-pink-primary-dark: '#fbafba'
  accent-pink-primary-light: '#9f003a'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: '0'
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-xs:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 12px
  sidebar-width: 240px
---

## Brand & Style
The design system for this desktop file explorer is rooted in **technical minimalism**. It is designed for power users and developers who prioritize speed, clarity, and precision. The aesthetic is inspired by high-performance developer tools, utilizing a dark-first interface that reduces visual noise and emphasizes content.

The brand personality is **utilitarian yet premium**, characterized by sharp execution, meticulous alignment, and a "pro-tool" feel. It avoids unnecessary decoration, instead using subtle borders and intentional depth to create a structured environment that feels as powerful as a terminal but as intuitive as a modern web app.

## Colors
This design system utilizes a sophisticated grayscale palette to establish hierarchy without overwhelming the user. The primary mode is a deep-dark theme, though the system is architected to support high-contrast light modes.

- **Background (Surface 0):** `#0A0A0A` — Used for the main application window and sidebar.
- **Surface (Surface 1):** `#171717` — Used for secondary panels, cards, and modal backgrounds.
- **Border/UI (Surface 2):** `#262626` — Used for 1px separators and subtle component outlines.
- **Accent:** `Cyber Indigo (#5856D6)` — Used sparingly for active states, focus rings, and primary actions to guide the eye.
- **Text:** Primary text is `#EDEDED`, secondary text is `#A1A1AA`, and disabled states use `#52525B`.

## Light Theme

Dark remains the default, but every color role above has a light-theme counterpart (Settings → Appearance → Theme), applied at runtime via a `data-theme="light"` attribute on the document root that overrides the same CSS custom properties Tailwind utilities already read through — no separate light-mode utility classes anywhere in the app.

**Deliberately not the warm cream/sand near-white that's the default "AI light mode."** This app's own brand personality is technical minimalism, not consumer softness, so the light palette reads closer to VS Code Light+ / GitHub Light / a JetBrains IDE's light theme: cool, purple-tinted neutrals (hue-278, the brand's own indigo hue, at low chroma 0.002–0.012 — barely perceptible as "tinted" but enough for subconscious cohesion with the brand color) rather than a soft, friendly off-white.

- **Background:** `#fdfdff` (surface) — a crisp, cool near-white, not cream.
- **Surface containers:** a 6-step scale from `#ffffff` (lowest/most recessed) to `#dfe1e9` (highest/most elevated) — inverted from dark mode's own direction (there, "highest" means lightest; in light mode "highest" means the most visibly tinted, since elevation is conveyed by moving *away* from pure white in both directions). The bottom four steps (`lowest`/`surface`/`low`/`container`, which back the sidebar, main content, toolbar, and title bar respectively) are deliberately kept within a ~2% lightness band of each other — an earlier, wider-spread pass made the toolbar/title bar read as a visibly grayer stripe across the top of the window, which came across as "the whole app looks gray." `-high`/`-highest` keep more spread since those specifically need to stay visible for hover/selected states.
- **Text:** `#181a24` (primary, 17:1 against surface) / `#494c5e` (secondary, 8.3:1).
- **Semantic colors (error, favorite/tertiary)** get proper light-mode redesigns rather than reused dark values — Material's own convention (a light-tinted container + dark text, inverted from dark mode's dark container + light text) matters here specifically because `error-container` renders as a translucent wash in a couple of banners (`FileExplorerView`, `SearchModal`); keeping the dark theme's saturated-red container unchanged would blend to a pale pink wash while the text stayed light-pink-on-light-pink — verified unreadable (1.2:1) before this fix.
- Every pairing (body text, UI borders, button text-on-fill, and text-on-translucent-wash) is OKLCH-derived and contrast-checked against WCAG AA — body text ≥4.5:1, UI borders ≥3:1, all comfortably cleared with margin.

*Known gap, not introduced by this pass:* `outline-variant` is used as small dim text in a couple of Settings-page labels in **both** themes, at roughly 2:1 contrast — a pre-existing gap that predates the light theme, tracked under Phase 6's separate Accessibility item rather than fixed here.

## Accent Colors

Four selectable accents (Settings → Appearance → Accent Color): Cyber Indigo (default), Green, Orange, Pink — all built on the same OKLCH formula for perceptual consistency across hues, applied via a `data-accent` attribute alongside `data-theme`.

- **`primary-container`** (the solid, saturated fill behind CTA buttons — see Components below) is **shared between both themes per accent**. It's always paired with light/white text on top regardless of app theme, so it doesn't need to invert.
- **`primary`** (the text/icon role — active states, links, selection) is the one role that flips: a light tint for dark backgrounds, a dark saturated tone for light backgrounds, per accent. This is the only token that varies along *both* axes (theme × accent) at once.
- Tertiary (the favorite/star color) is **not** part of the accent system — it stays a fixed amber regardless of which accent is selected, theme-dependent only.

## Typography
Typography is the core of the file explorer experience. We use **Geist** throughout, including for metadata, file paths, and technical details — one typeface for the whole app rather than switching families for data-heavy information.

Headlines are kept compact to maximize vertical space. Body text is optimized at 14px for comfortable reading of file names, while 13px is used for sidebar items and secondary metadata to maintain a high information density without sacrificing clarity.

## Layout & Spacing
The system follows a strict **8px spacing grid**. High information density is achieved by using the 4px (XS) and 8px (SM) increments for internal component padding and item lists.

- **Grid Structure:** A 12-column fluid grid for the main content area, with a fixed-width sidebar (240px).
- **Density:** Item lists (files/folders) use a compact vertical height of 32px or 36px to allow for scanning large directories.
- **Margins:** Standard application margins are 16px. Content within views is separated by 12px gutters.
- **Mobile/Compact:** On smaller viewports, the sidebar collapses into a drawer or a narrow icon-only bar, and padding reduces to 8px globally.

## Elevation & Depth
In this design system, depth is primarily conveyed through **Tonal Layering** and **Subtle Outlines** rather than heavy shadows.

- **Layer 0 (Base):** `#0A0A0A` is the deepest layer.
- **Layer 1 (Panels):** Raised elements like sidebars or secondary panes use `#171717`.
- **Layer 2 (Popovers/Modals):** Floating elements use `#1C1C1C` with a `1px` solid border of `#262626`.
- **Shadows:** Only used for floating elements (menus, modals). Use a soft, 12% opacity black shadow with a 15px-20px blur to create a lift effect without looking dated.
- **Interaction:** Hover states are indicated by a subtle background shift to `#262626` or a very fine `#3F3F46` border highlight.

## Shapes
The design system uses a standard **8px (rounded-md)** corner radius for almost all UI elements, including buttons, input fields, and cards. This provides a modern, friendly feel that balances the "hard" nature of a technical tool.

- **Buttons & Inputs:** 8px.
- **Large Containers/Modals:** 12px (rounded-lg).
- **Small Indicators (Tags/Chips):** 4px (rounded-sm) to keep them sharp and legible at small sizes.

## Components
Consistent component behavior ensures the application feels like a singular, integrated tool.

- **Buttons:** Primary buttons use the Cyber Indigo background with white text. Secondary buttons are ghost-style with a `1px` border of `#262626`. All buttons have an 8px radius.
- **Inputs:** Search bars and text fields use a `#171717` background with a subtle `#262626` border. On focus, the border transitions to Cyber Indigo with a subtle outer glow.
- **Lists:** File list items are 32px high. Hover states use a subtle gray fill (`#1A1A1A`). Selected items use a very faint Indigo tint or a left-side 2px accent bar.
- **Chips/Badges:** Used for file extensions or tags. Rectangular with a slight 4px radius, using low-contrast backgrounds and secondary text colors.
- **Cards:** Used in the "Get Info" or "Preview" panes. Defined by a `1px` border rather than a background change, maintaining the "flat-depth" aesthetic.
- **Icons:** Use **Lucide** icons. Line weight should be consistent at `1.5px` or `2px`. Icons are always monochrome (Secondary Text color) unless they represent a specific file type (e.g., Folder = Blue-ish, Image = Green-ish).