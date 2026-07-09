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
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-xs:
    fontFamily: JetBrains Mono
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

## Typography
Typography is the core of the file explorer experience. We use **Geist** for its exceptional legibility and technical aesthetic. For metadata, file paths, and technical details, we employ **JetBrains Mono** to provide a distinct visual "mode" for data-heavy information.

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