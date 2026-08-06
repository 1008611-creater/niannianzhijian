# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Niannian AI
**Generated:** 2026-08-04 21:33:34
**Category:** Project-Centric AI Short-Drama Production Platform
**Design Dials:** Variance 6/10 (Balanced / Modern) | Motion 3/10 (Subtle) | Density 7/10 (Standard)

---

## Global Rules

### Product Constraints

- Product surface: `https://ai.cauai.fun` only.
- Visual direction: black, white, near-black, and restrained neutral grays.
- Forbidden in new product pages: purple, magenta, indigo accents, decorative gradients, glassmorphism, ambient blobs, and the retired top Logo treatment.
- Homepage is a protected approved surface. Do not restyle it as part of a project-page change.
- Production pages prioritize project identity, current action, evidence, quality gates, blockers, and real delivery state over decoration.
- Never invent metrics, testimonials, provider results, task completion, or delivery claims.

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#18181B` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#27272A` | `--color-secondary` |
| Accent/CTA | `#F8FAFC` | `--color-accent` |
| Background | `#000000` | `--color-background` |
| Foreground | `#FAFAFA` | `--color-foreground` |
| Muted | `#181818` | `--color-muted` |
| Border | `#3F3F46` | `--color-border` |
| Destructive | `#EF4444` | `--color-destructive` |
| Ring | `#18181B` | `--color-ring` |

**Color Notes:** Neutral monochrome system. Use near-black surfaces and hairline borders; do not use pure-black-on-pure-white pairings without checking the actual text size and contrast.

### Typography

- **Heading Font:** Inter
- **Body Font:** Inter
- **Mood:** cinematic, direct, quiet, precise, professional, high-end utility
- **Font policy:** use the existing locally served font stack where available; do not add a remote font dependency to production pages without a separate performance decision.

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 7/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #F8FAFC;
  color: #18181B;
  padding: 12px 24px;
  border-radius: 4px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #FAFAFA;
  border: 1px solid #3F3F46;
  padding: 12px 24px;
  border-radius: 4px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #18181B;
  border-radius: 4px;
  padding: 24px;
  border: 1px solid #3F3F46;
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  border-color: #FAFAFA;
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 4px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #18181B;
  outline: none;
  box-shadow: 0 0 0 3px #18181B20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 4px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Monochrome Production Workbench

**Keywords:** monochrome, cinematic, direct, precise, dense, project-first, editorial utility, quiet premium

**Best For:** AI production workspaces, creative operations, project-based media tools, professional creator software

**Key Effects:** short opacity/transform transitions only; hairline border changes for active states; no ambient blobs, glass blur, decorative gradients, or layout-shifting hover effects.

### Page Pattern

**Pattern Name:** Project-Centric Production Workspace

- **Primary action:** one current project action per page.
- **Page order:** project identity → current task → evidence/state → next action → delivery or recovery.
- **Workbench order:** three equal product entrances only; do not add invented metrics, testimonials, or marketing proof rows.

---

## Motion

**Short State Transition** (Subtle) — Trigger: user action or route change | Duration: 150-220ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 8, duration: 0.18, ease: 'power1.out' });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger)

- ✅ Animate only transform and opacity.
- ❌ Do not hide production evidence or delivery state behind animation.
- ✅ Respect `prefers-reduced-motion: reduce` with an immediate state change.

---

## Anti-Patterns (Do NOT Use)

- ❌ Poor profiles
- ❌ No reviews

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio for normal text and verify actual button foreground/background pairs
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Neutral dark and light surface text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 390px, 768px, 1024px, 1280px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
