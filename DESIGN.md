---
name: E2E Studio
description: Offline, bilingual no-code end-to-end testing console on Playwright.
colors:
  accent: "#2563eb"
  accent-dark: "#60a5fa"
  accent-ink: "#1d4ed8"
  accent-soft: "#dbe7ff"
  accent-on: "#ffffff"
  accent-hover: "#1d4ed8"
  accent-active: "#1e40af"
  bench-bg: "#f3f5f9"
  bench-bg-dark: "#0f1420"
  chrome: "#e6eaf1"
  chrome-dark: "#090c13"
  surface: "#ffffff"
  surface-dark: "#171e2b"
  surface-2: "#e9edf4"
  surface-3: "#dde3ec"
  border: "#dce2eb"
  border-strong: "#a9b4c6"
  ink: "#0f172a"
  ink-dark: "#f3f6fb"
  ink-dim: "#334155"
  ink-faint: "#526078"
  ok: "#15803d"
  ok-soft: "#dcfce7"
  fail: "#b91c1c"
  fail-soft: "#fee2e2"
  warn: "#854d0e"
  warn-soft: "#fef3c7"
  info: "#1d4ed8"
  info-soft: "#dbe7ff"
typography:
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Inter, sans-serif"
    fontSize: "23px"
    fontWeight: 660
    lineHeight: 1.25
    letterSpacing: "-0.021em"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"cv05\" 1"
  body-sm:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 620
    letterSpacing: "0.005em"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, SF Mono, Consolas, monospace"
    fontSize: "12.5px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "13px"
  lg: "18px"
  xl: "22px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "5px 13px"
    height: "32px"
  button-hover:
    backgroundColor: "{colors.surface-2}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.sm}"
    padding: "5px 13px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-active}"
  button-ghost:
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.sm}"
    padding: "5px 13px"
  button-danger:
    textColor: "{colors.fail}"
    rounded: "{rounded.sm}"
    padding: "5px 13px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 11px"
    height: "34px"
  chip-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
    typography: "{typography.label}"
  chip-fail:
    backgroundColor: "{colors.fail-soft}"
    textColor: "{colors.fail}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  nav-item:
    textColor: "{colors.ink-dim}"
    rounded: "5px"
    padding: "8px 10px"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
---

# Design System: E2E Studio

## Overview

**Creative North Star: "The Lab Bench"**

The console is a clean laboratory bench. Instruments sit where the hand expects them, surfaces are neutral and matte, and nothing on the bench is coloured unless it is a reading. A test run is an experiment: the UI's job is to set it up precisely and then report what happened without embellishment. Colour is reserved for results (pass, fail, warning) and for the single blue that marks where you are and what you can do next.

Density is moderate-to-high, tuned for people who spend a working day in the tool: 14px body, compact 32px controls, thin 1px borders instead of shadows. The application frame (title bar, sidebar, tab strip) sits one tone darker than the work area, IDE-style, so the regions separate without lines shouting. Everything runs offline, so typography uses system fonts only; no web fonts, no CDN.

Both light and dark themes are first-class. Every colour token is declared once as a `light-dark()` pair so the two modes are always edited together, and switching mode flips `color-scheme`, which also restyles native selects, date pickers and scrollbars.

**Key Characteristics:**
- Flat, bordered surfaces; elevation only for floating layers.
- One blue accent for navigation and primary action; colour elsewhere means status.
- System sans (Segoe UI Variable first), compact controls, small radii.
- Light/dark parity enforced by `light-dark()` tokens and a machine contrast check.
- Every string bilingual (EN/VI); layouts must hold Vietnamese diacritics and longer labels.

## Colors

Cool, neutral slate greys with no warm cast, one working blue, and four status hues that only appear when they mean something.

### Primary
- **Bench Blue** (`accent`; dark mode `accent-dark`): fill of the primary button, toggles, the active-nav marker bar and focus outline. Never decorative.
- **Bench Blue Ink** (`accent-ink`): the accent used as text, e.g. the active nav label and links, tuned darker for contrast on light surfaces.
- **Blue Wash** (`accent-soft`): background of the active nav item, selection highlight, info chips.

### Neutral
- **Bench Grey** (`bench-bg`): the work area behind cards.
- **Frame Grey** (`chrome`): title bar, sidebar and tab strip, one step darker than the work area.
- **Clean Surface** (`surface`): cards, inputs, modals, drawers.
- **Tray Grey 1 / 2** (`surface-2`, `surface-3`): hover and pressed backgrounds, nested panels.
- **Hairline** (`border`): card and divider strokes. **Firm Hairline** (`border-strong`): control borders and scrollbar thumbs.
- **Ink / Dim Ink / Faint Ink** (`ink`, `ink-dim`, `ink-faint`): primary text, secondary text, hints and placeholders.

### Status
- **Pass Green** (`ok` on `ok-soft`), **Fail Red** (`fail` on `fail-soft`), **Caution Amber** (`warn` on `warn-soft`), **Info Blue** (`info` on `info-soft`). Always text-on-wash pairs.

Chart series have their own validated tokens (`--series-bug`, `--series-run`, `--chart-grid` in `console/web/styles.css`).

### Named Rules
**The Colour Means Something Rule.** Outside the blue accent, a coloured pixel is a status. If a hue isn't reporting pass, fail, warning or info, it doesn't belong.

**The Machine-Checked Rule.** Colours are chosen by `npm run check:contrast`, not by eye. Any new or changed token must pass in both light and dark before merge.

## Typography

**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui, -apple-system, Inter)
**Mono Font:** ui-monospace (with Cascadia Mono, SF Mono, Consolas) for selectors, code, logs and IDs

**Character:** One quiet system sans doing all the work, differentiated by weight rather than size. Weights sit at intermediate steps (550, 620, 650, 660) on the variable font to separate roles without jumping to bold.

### Hierarchy
- **Headline** (660, 23px, 1.25, -0.021em): page title in the page head, one per screen.
- **Title** (600, 15px): card and modal headings.
- **Body** (400, 14px, 1.55): default text; descriptions capped at 74ch.
- **Body small** (400, 12.5–13.5px): table cells, form controls, secondary lines.
- **Label** (620, 12px, +0.005em): chips, field hints, meta.
- **Mono** (12.5px): step targets, selectors, logs.

### Named Rules
**The Weight Not Size Rule.** Separate hierarchy with weight steps first. Only the page title breaks 16px.

**The No Web Fonts Rule.** The console must render offline; never add a font file or font CDN.

## Layout

App-shell layout: a fixed title bar (`--head-h` 42px), a resizable left sidebar (user width 200–560px, persisted), and a scrolling work area of cards. Page heads align title and actions on a shared bottom edge with 22px below. Cards stack with 18px gaps; grids own their own gaps. Card heads use 13px × 18px padding.

Breakpoints step down at 1280, 1100, 900, 760, 720 and 640px; the sidebar collapses behind a toggle on narrow widths. `prefers-reduced-motion` disables transitions.

## Elevation & Depth

Flat by default. Cards, tables and panels sit *in* the page with a 1px hairline and no shadow. Depth is conveyed by tonal steps: frame darker than work area, work area darker than surface. Shadows exist only for layers that float above the page: modals, drawers, toasts, tooltips, menus. Dark mode uses much heavier shadow alpha so floating layers still read.

### Shadow Vocabulary
- **Rest** (`--shadow-sm`: `0 1px 2px` shadow-1): tiny lift for small floating controls.
- **Float** (`--shadow`: `0 4px 6px -2px` shadow-2, `0 12px 28px -8px` shadow-3): modals, drawers, toasts.
- **Scrim** (`--backdrop`): 50% slate (light) / 65% black (dark) behind modals.

### Named Rules
**The On-The-Bench Rule.** If it lives in the page, it gets a border, not a shadow. Only things lifted off the bench cast one.

## Shapes

Small, consistent radii: 4px for controls (buttons, inputs, focus outline), 5–6px for nav items, 8px for cards, modals and drawers, full pill only for status chips and scrollbar thumbs. Borders are always 1px. The active nav item carries a 3px blue bar on its left edge so selection survives greyscale printing.

## Components

### Buttons
Precise and restrained.
- **Shape:** gently squared (4px), min-height 32px, 13px text at weight 550.
- **Default:** surface fill with firm hairline border.
- **Primary:** Bench Blue fill, white text, weight 650. Hover swaps to `accent-hover`, press to `accent-active` (explicit colours, never `filter: brightness`).
- **Ghost:** transparent, dim ink, darkens to ink on hover.
- **Danger:** transparent with Fail Red border and text; red wash on hover.
- **Record:** the test-case recorder button is larger (40px, 700 weight) and carries the only blinking red dot in the product.
- **Focus:** 3px blue ring (`--ring`) plus accent border. **Disabled:** 45% opacity.

### Chips
- **Style:** pill, 12px label weight, status text on its matching soft wash (ok / fail / warn / info).
- Used only for status; never as decorative tags.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Clean Surface on Bench Grey.
- **Shadow Strategy:** none (see On-The-Bench Rule).
- **Border:** 1px hairline; head separated by a hairline divider.
- **Internal Padding:** 13px × 18px head.

### Inputs / Fields
- **Style:** 1px firm hairline, 4px radius, surface fill, 34px min-height, 13.5px text.
- **Hover:** border darkens to faint ink. **Focus:** blue border plus 3px ring, no outline.
- Native controls inherit the theme through `color-scheme`.

### Navigation
- Sidebar items: dim ink, 13.5px, 8px × 10px padding, 18px icons. Hover adds Tray Grey. Active: Blue Wash fill, Bench Blue Ink label at 620, 3px left marker bar.

### Floating layers
- Modal (460px max), drawer (460px, wide 880px), toast: surface, hairline, 8px radius, Float shadow over Scrim.

## Do's and Don'ts

### Do:
- **Do** declare every new colour token once as `light-dark(light, dark)` in `:root` of `console/web/styles.css`.
- **Do** run `npm run check:contrast` after any colour change.
- **Do** keep in-page containers flat with a 1px hairline.
- **Do** reserve blue for navigation, primary actions and focus.
- **Do** keep transitions short (≈0.12s ease) and honour `prefers-reduced-motion`.
- **Do** check layouts with Vietnamese strings, which run longer than English.

### Don't:
- **Don't** add shadows to cards, tables or panels that sit in the page.
- **Don't** use colour decoratively; a coloured element must report a status.
- **Don't** add web fonts, icon fonts, CSS frameworks or CDN assets; the console must work offline.
- **Don't** darken/lighten buttons with `filter: brightness`; use the explicit hover/active tokens.
- **Don't** introduce a second accent hue.
