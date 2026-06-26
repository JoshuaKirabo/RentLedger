---
name: Institutional Ledger
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1b1b1c'
  on-surface-variant: '#424654'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#737785'
  outline-variant: '#c3c6d6'
  surface-tint: '#0856cf'
  primary: '#0041a2'
  on-primary: '#ffffff'
  primary-container: '#0b57d0'
  on-primary-container: '#ced9ff'
  inverse-primary: '#b2c5ff'
  secondary: '#3f6377'
  on-secondary: '#ffffff'
  secondary-container: '#c0e5fd'
  on-secondary-container: '#43677b'
  tertiary: '#454847'
  on-tertiary: '#ffffff'
  tertiary-container: '#5d605f'
  on-tertiary-container: '#d9dbd9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001847'
  on-primary-fixed-variant: '#0040a1'
  secondary-fixed: '#c3e7ff'
  secondary-fixed-dim: '#a7cbe3'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#264b5e'
  tertiary-fixed: '#e1e3e1'
  tertiary-fixed-dim: '#c5c7c5'
  on-tertiary-fixed: '#191c1b'
  on-tertiary-fixed-variant: '#444746'
  background: '#fcf9f8'
  on-background: '#1b1b1c'
  surface-variant: '#e5e2e1'
  surface-white: '#FFFFFF'
  border-subtle: '#E0E0E0'
  success-green: '#137333'
  error-red: '#D93025'
typography:
  headline-xl:
    fontFamily: DM Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: DM Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: DM Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

This design system is engineered for high-stakes financial environments, focusing on clarity, precision, and institutional trust. The aesthetic follows a **Corporate/Modern** direction, prioritizing data density and legibility without sacrificing a contemporary feel. 

The brand personality is professional, systematic, and reliable. It avoids unnecessary decoration, opting instead for a structured interface that conveys security and stability. The interface should feel like a high-performance tool—utilitarian yet refined.

## Colors

The palette is anchored by a deep **Institutional Blue** (#0B57D0), serving as the primary driver for actions and brand presence. A **Soft Sky Blue** (#C2E7FF) acts as a secondary accent, primarily used for subtle highlights, active states, or background layering in complex data sets.

The neutral scale is dominated by a near-black **Deep Slate** (#1F1F1F) for high-contrast typography and a **Medium Gray** (#444746) for supporting information. The color system utilizes a light default mode to maintain the clean, "paper-like" feel of a traditional ledger, using white surfaces to create a sense of space and clarity.

## Typography

This design system utilizes **DM Sans** across all hierarchies to ensure a modern, low-contrast, and highly legible experience. DM Sans provides a geometric yet approachable rhythm that balances the "institutional" weight of the product with contemporary tech aesthetics.

- **Headlines:** Use Bold (700) or Medium (500) weights with tighter letter spacing to create a strong visual anchor.
- **Body:** Regular (400) weight is used for maximum readability in paragraphs and data descriptions.
- **Labels:** Utilize Medium and Bold weights. Small labels often use uppercase styling to differentiate metadata from body content.

## Layout & Spacing

The layout philosophy is based on a **Fixed Grid** for desktop environments to maintain control over complex financial data tables and dashboards. 

- **Desktop (1440px+):** 12-column grid with 24px gutters and 48px side margins. 
- **Tablet:** 8-column grid with 16px gutters.
- **Mobile:** 4-column fluid grid with 16px margins.

The spacing system follows a strict 4px base unit, ensuring all components and containers align to a consistent mathematical rhythm. This precision reinforces the brand's commitment to accuracy.

## Elevation & Depth

To maintain a professional and clean appearance, this design system uses **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows. Depth is communicated through surface color shifts (e.g., moving from a white background to a light gray surface for containers).

Where elevation is required for interactivity (such as menus or modals), use highly diffused, low-opacity shadows (e.g., 8% opacity of the neutral color) to create a subtle lift. Borders are typically 1px wide in a light gray (#E0E0E0) to define sections without adding visual noise.

## Shapes

The shape language is **Soft**, utilizing a consistent 0.25rem (4px) corner radius for most UI elements like buttons, input fields, and cards. This slight rounding softens the corporate edge, making the product feel modern and accessible while maintaining a structured, grid-aligned silhouette.

Larger components like modals or feature cards may use `rounded-lg` (8px) to create a clear visual hierarchy.

## Components

### Buttons
- **Primary:** Solid `#0B57D0` background with white text. 4px border radius.
- **Secondary:** Outline style with `#0B57D0` border and text.
- **Tertiary:** Ghost style using `#444746` for text, appearing as plain text until hover.

### Input Fields
Fields use a 1px border (`#E0E0E0`) with a 4px radius. Focused states utilize a 2px `#0B57D0` border. Labels are always positioned above the field using `label-md`.

### Cards & Containers
Containers use a white background with a subtle border. For ledger-style lists, use alternating row fills in a very light gray to improve horizontal scanning.

### Data Tables
The core of the system. High-density rows (40px height) with `body-sm` typography. Headers use `label-sm` with a light gray background fill to distinguish from data.

### Chips/Tags
Used for status indicators (e.g., "Pending," "Cleared"). These use a light tint of the status color (Success, Error, or Secondary Blue) with high-contrast text in the same hue.