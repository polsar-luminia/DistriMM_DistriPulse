---
name: frontend-design
description: >
  Senior UI/UX engineering skill that overrides default LLM design biases.
  Enforces anti-AI-slop rules, bias correction, premium typography, accessible UX,
  and creative layout patterns. Includes tunable design knobs, a forbidden-patterns
  registry, a creative arsenal of 40+ advanced concepts, and an audit checklist
  for upgrading existing interfaces. Stack: React 19, Tailwind CSS v4, Vite.
---

# Frontend Design Mastery

Architect digital interfaces that override default LLM biases. This skill enforces metric-based rules, strict component quality, hardware-accelerated CSS, and balanced design engineering that produces interfaces indistinguishable from human-crafted premium products.

---

## 1. Design Thinking

Before coding, commit to a **bold aesthetic direction**:

- **Purpose**: What problem does this solve? Who uses it?
- **Tone**: Pick an extreme — brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco, soft/pastel, industrial/utilitarian. Never settle for "clean and modern."
- **Differentiation**: What's the ONE thing someone will remember?
- **Constraints**: Performance budget, accessibility level, responsive targets.

**CRITICAL**: Bold maximalism and refined minimalism both work — the key is **intentionality**, not intensity. Every design decision must serve the chosen direction. No design should look like any other.

---

## 2. Tunable Design Knobs

Three global variables that drive all design decisions. Defaults below — adapt dynamically based on user requests:

| Knob | Default | Range | Description |
|------|---------|-------|-------------|
| **DESIGN_VARIANCE** | 8 | 1=Perfect Symmetry → 10=Artsy Chaos | Layout asymmetry, grid-breaking |
| **MOTION_INTENSITY** | 6 | 1=Static → 10=Cinematic Physics | Animation complexity |
| **VISUAL_DENSITY** | 4 | 1=Art Gallery/Airy → 10=Cockpit/Packed | Whitespace vs information density |

### Dial Behavior

**DESIGN_VARIANCE:**
- **1-3**: Flexbox center, strict 12-column symmetry, equal padding
- **4-7**: Offset margins, varied aspect ratios (4:3 next to 16:9), left-aligned headers over centered data
- **8-10**: Masonry, CSS Grid fractional units (`grid-template-columns: 2fr 1fr 1fr`), massive whitespace zones

**MOTION_INTENSITY:**
- **1-3**: No auto-animations. CSS `:hover` and `:active` only
- **4-7**: `transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)`, `animation-delay` cascades, `transform` + `opacity` only
- **8-10**: Scroll-triggered reveals, spring physics, Framer Motion hooks. **Never** `window.addEventListener('scroll')`

**VISUAL_DENSITY:**
- **1-3 (Art Gallery)**: Huge section gaps, generous whitespace, everything expensive and clean
- **4-7 (Daily App)**: Standard spacing for web apps
- **8-10 (Cockpit)**: Tiny padding, 1px dividers instead of cards, `font-mono` for all numbers

---

## 3. Stack Conventions

**Framework**: React 19 with Vite 7. No Server Components (we don't use Next.js).

**Styling**: Tailwind CSS v4.
- **CONFIG GUARD**: For v4, do NOT use `tailwindcss` plugin in `postcss.config.js`. Use `@tailwindcss/postcss` or the Vite plugin.
- Check `package.json` before assuming version. Never use v3 syntax in a v4 project.

**Dependency check** [MANDATORY]: Before importing ANY 3rd party library, check `package.json`. If missing, output the install command first. **Never** assume a library exists.

**Icons**: Use `lucide-react` (project standard). Standardize `strokeWidth` globally (use `1.5` or `2.0` consistently).

**Responsiveness**:
- Standardize breakpoints: `sm`, `md`, `lg`, `xl`
- Contain layouts: `max-w-[1400px] mx-auto` or `max-w-7xl`
- **CRITICAL**: Never use `h-screen` for full-height sections. Use `min-h-[100dvh]` to prevent iOS Safari layout jumping.
- **Grid over Flex-Math**: Never use `w-[calc(33%-1rem)]`. Use CSS Grid: `grid grid-cols-1 md:grid-cols-3 gap-6`.

**Mobile override**: For DESIGN_VARIANCE 4-10, any asymmetric layout above `md:` MUST fall back to strict single-column (`w-full px-4 py-8`) on viewports < 768px.

---

## 4. Bias Correction Rules

LLMs have statistical biases toward specific UI cliches. Override them with these engineered rules:

### Rule 1: Deterministic Typography

- **Headlines**: `text-4xl md:text-6xl tracking-tighter leading-none`
- **ANTI-SLOP**: Discourage `Inter` for premium/creative. Force character with `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`.
- **TECHNICAL UI**: Serif fonts BANNED for dashboard/software UIs. Use sans-serif pairings: `Geist` + `Geist Mono` or `Satoshi` + `JetBrains Mono`.
- **Body**: `text-base text-gray-600 leading-relaxed max-w-[65ch]`
- **Weight hierarchy**: Don't just use 400 and 700. Introduce Medium (500) and SemiBold (600).
- **Numbers**: Use `font-variant-numeric: tabular-nums` or monospace for data interfaces.
- **Orphaned words**: Fix with `text-wrap: balance` or `text-wrap: pretty`.

### Rule 2: Color Calibration

- Max **1 accent color**. Saturation < 80%.
- **THE LILA BAN**: Purple/blue "AI aesthetic" is BANNED. No purple button glows, no neon gradients.
- Use neutral bases (Zinc/Slate) with high-contrast singular accents (Emerald, Electric Blue, Deep Rose).
- **Consistency**: One palette for the entire output. Never mix warm and cool grays.
- Never use pure `#000000`. Use off-black: `zinc-950`, `#0a0a0a`, or tinted dark.
- Tint shadows to match background hue. Use colored shadows, not pure black at low opacity.

### Rule 3: Layout Diversification

- **ANTI-CENTER BIAS**: Centered Hero/H1 BANNED when DESIGN_VARIANCE > 4. Force split-screen (50/50), left-aligned content/right asset, or asymmetric whitespace.
- **THREE-COLUMN BAN**: Generic "3 equal cards" feature row is BANNED. Use 2-column zig-zag, asymmetric grid, or horizontal scroll.
- Use overlap and negative margins for depth. Elements should not sit flat side by side.

### Rule 4: Materiality & Anti-Card Overuse

- For VISUAL_DENSITY > 7, generic card containers are BANNED. Use `border-t`, `divide-y`, or negative space.
- Use cards ONLY when elevation communicates hierarchy.
- When a shadow is used, tint it to the background hue.
- Vary border-radius: tighter on inner elements, softer on containers.

### Rule 5: Interactive States [MANDATORY]

LLMs generate static "happy path" states. You MUST implement full cycles:
- **Loading**: Skeleton loaders matching layout shape. No generic circular spinners.
- **Empty states**: Composed "getting started" views with action CTA.
- **Error states**: Inline error messages near the problem. Never `window.alert()`.
- **Hover**: Background shift, subtle scale, or translate.
- **Active/Pressed**: `scale-[0.98]` or `-translate-y-[1px]` to simulate physical push.
- **Focus**: Visible focus ring for keyboard nav (2-4px). This is accessibility, not optional.
- **Disabled**: Reduced opacity (0.38-0.5) + cursor change + semantic attribute.

### Rule 6: Data & Forms

- Label MUST sit above input. Helper text optional but in markup. Error text below input. `gap-2` for input blocks.
- Mark required fields (asterisk). Validate on blur, not keystroke.
- Use semantic input types (`email`, `tel`, `number`) for correct mobile keyboard.
- Confirm before destructive actions. Auto-dismiss toasts in 3-5s.

---

## 5. UX Guidelines (Priority-Ranked)

### CRITICAL: Accessibility

- **Contrast**: Minimum 4.5:1 for normal text, 3:1 for large text
- **Focus rings**: Visible on all interactive elements (2-4px)
- **Alt text**: Descriptive for meaningful images
- **Keyboard nav**: Tab order matches visual order; full keyboard support
- **Headings**: Sequential h1→h6, no level skip
- **Color not only**: Never convey info by color alone — add icon/text
- **Reduced motion**: Respect `prefers-reduced-motion`; disable animations when requested
- **Skip links**: "Skip to main content" for keyboard users
- **Aria-live**: Form errors use `aria-live` region or `role="alert"`

### CRITICAL: Touch & Interaction

- **Touch targets**: Minimum 44x44px; extend hit area beyond visual bounds if needed
- **Touch spacing**: Minimum 8px gap between targets
- **No hover-only**: Primary interactions must work via click/tap
- **Loading buttons**: Disable during async; show spinner/progress
- **Tap delay**: Use `touch-action: manipulation` to reduce 300ms delay
- **Safe area**: Keep targets away from notch, Dynamic Island, gesture bar, screen edges

### HIGH: Performance

- **Images**: WebP/AVIF, `srcset`/`sizes`, lazy load non-hero assets
- **Dimensions**: Declare `width`/`height` or `aspect-ratio` to prevent CLS
- **Fonts**: `font-display: swap` to avoid invisible text (FOIT)
- **Code splitting**: Split by route/feature with React Suspense
- **Hardware acceleration**: Animate ONLY `transform` and `opacity`. Never `top`, `left`, `width`, `height`
- **Lists**: Virtualize lists with 50+ items
- **Debounce**: Use debounce/throttle for scroll, resize, input events
- **Grain/noise**: Apply exclusively to `fixed inset-0 z-50 pointer-events-none` pseudo-elements

### HIGH: Layout & Responsive

- **Mobile-first**: Design mobile-first, scale up
- **Viewport**: `min-h-dvh` over `100vh` on mobile
- **Container**: Consistent `max-w-7xl` on desktop with auto margins
- **Spacing scale**: Use 4px/8px incremental system
- **Z-index**: Define scale (0/10/20/40/100/1000). Never spam `z-50` arbitrarily
- **No horizontal scroll**: Content must fit viewport width on mobile
- **Font size**: Minimum 16px body on mobile (avoids iOS auto-zoom)
- **Line length**: 35-60 chars mobile, 60-75 chars desktop

### MEDIUM: Animation

- **Duration**: 150-300ms for micro-interactions, max 400ms for complex transitions
- **Easing**: ease-out for entering, ease-in for exiting. No linear for UI
- **Spring physics**: Prefer `type: "spring", stiffness: 100, damping: 20` for natural feel
- **Stagger**: 30-50ms per item; avoid all-at-once or too-slow reveals
- **Exit < Enter**: Exit animations ~60-70% of enter duration
- **Interruptible**: User tap cancels in-progress animation immediately
- **No blocking**: Never block user input during animation

---

## 6. AI Tells — Forbidden Patterns

To guarantee premium, non-generic output, STRICTLY avoid these unless explicitly requested:

### Visual & CSS
- NO neon/outer glows. Use inner borders or subtle tinted shadows
- NO pure `#000000`. Use off-black, zinc-950, or charcoal
- NO oversaturated accents. Desaturate to blend with neutrals
- NO excessive gradient text on large headers
- NO custom mouse cursors (outdated, kills performance/a11y)
- NO perfectly even gradients. Break with radial, noise, or mesh gradients
- NO random dark sections in light-mode pages (or vice versa)

### Typography
- NO `Inter` font — BANNED. Use `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`
- NO oversized H1s that scream. Control hierarchy with weight and color, not just scale
- NO serif on dashboards. Only for creative/editorial designs
- NO `All Caps On Every Header`. Use sentence case
- NO using only Regular (400) and Bold (700). Use the full weight spectrum

### Layout & Spacing
- NO "3 equal cards in a row" feature sections — the most generic AI pattern
- NO centered hero sections when DESIGN_VARIANCE > 4
- NO complex flexbox percentage math — use CSS Grid
- NO everything centered and symmetrical
- NO cards of equal height forced by flexbox when content varies
- NO dashboard that always has a left sidebar — try top nav, command menu, collapsible panel

### Content & Data (The "Jane Doe" Effect)
- NO generic names: "John Doe", "Sarah Chan" — use creative, realistic names
- NO generic avatars: no SVG egg icons — use creative photo placeholders or styled initials
- NO fake round numbers: `99.99%`, `50%` — use organic data: `47.2%`, `$99.00`
- NO startup slop names: "Acme", "Nexus", "SmartFlow" — invent premium contextual brands
- NO filler words: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer", "Delve"
- NO `Lorem Ipsum` — write real draft copy
- NO "Oops!" error messages — be direct: "Connection failed. Please try again."

### External Resources
- NO broken Unsplash links. Use `https://picsum.photos/seed/{random}/800/600` or SVG UI Avatars
- NO emoji in code, markup, or text content. Use proper icons from lucide-react
- shadcn/ui: NEVER in default state. Customize radii, colors, shadows to match the aesthetic

---

## 7. Creative Arsenal

Do not default to generic UI. Pull from this library of advanced concepts:

### Heroes & Navigation
- **Asymmetric Hero**: Text left/right-aligned, background image with subtle fade into bg color. Never centered text over dark image.
- **Magnetic Button**: Buttons that physically pull toward cursor via `useMotionValue`
- **Dynamic Island**: Pill-shaped UI that morphs to show status/alerts
- **Mega Menu Reveal**: Full-screen dropdowns with stagger-fade content
- **Floating Speed Dial**: FAB that springs into curved secondary actions

### Layout & Grids
- **Bento Grid**: Asymmetric tile grouping (Apple Control Center style)
- **Masonry Layout**: Staggered grid without fixed row heights (Pinterest)
- **Split-Screen Scroll**: Two halves sliding opposite directions on scroll
- **Curtain Reveal**: Hero parting in the middle like a curtain on scroll
- **Broken Grid/Asymmetry**: Elements deliberately ignoring column structure, overlapping, bleeding off-screen

### Cards & Containers
- **Parallax Tilt Card**: 3D-tilting card tracking mouse coordinates
- **Spotlight Border Card**: Borders illuminating dynamically under cursor
- **Glassmorphism Panel**: Beyond `backdrop-blur` — add `border-white/10` and `shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`
- **Holographic Foil Card**: Iridescent rainbow reflections on hover
- **Morphing Modal**: Button that expands into its own full-screen dialog

### Scroll Animations
- **Sticky Scroll Stack**: Cards sticking to top, physically stacking over each other
- **Horizontal Scroll Hijack**: Vertical scroll translates into horizontal gallery pan
- **Zoom Parallax**: Central image zooming with scroll
- **Scroll Progress Path**: SVG lines drawing themselves as user scrolls

### Typography & Text
- **Kinetic Marquee**: Text bands reversing/speeding on scroll
- **Text Mask Reveal**: Large typography as transparent window to video background
- **Text Scramble**: Matrix-style character decoding on load/hover
- **Gradient Stroke Animation**: Outlined text with gradient running along the stroke

### Micro-Interactions
- **Particle Explosion Button**: CTAs shattering into particles on success
- **Skeleton Shimmer**: Shifting light reflections across placeholder boxes
- **Directional Hover Button**: Fill entering from exact side mouse enters
- **Ripple Click Effect**: Waves rippling from click coordinates
- **Mesh Gradient Background**: Organic lava-lamp animated color blobs

---

## 8. Design Audit Checklist

When upgrading an existing interface, run through this audit and fix every generic pattern found:

### Typography Audit
- [ ] Browser default fonts or Inter everywhere → swap to characterful font
- [ ] Headlines lack presence → increase size, tighten tracking, reduce line-height
- [ ] Body text too wide → limit to ~65 characters
- [ ] Only Regular/Bold weights → introduce Medium (500), SemiBold (600)
- [ ] Numbers in proportional font → enable `tabular-nums`
- [ ] All-caps subheaders everywhere → try sentence case, small-caps, or lowercase italics

### Color & Surface Audit
- [ ] Pure #000000 → off-black (#0a0a0a, zinc-950, dark navy)
- [ ] Oversaturated accents → keep saturation < 80%
- [ ] More than one accent color → pick one, remove the rest
- [ ] Purple/blue "AI gradient" → neutral bases + singular accent
- [ ] Generic box-shadow → tint shadows to background hue
- [ ] Flat with zero texture → add subtle noise, grain, or micro-patterns
- [ ] Inconsistent lighting → audit all shadows for single light source

### Layout Audit
- [ ] Everything centered and symmetrical → break with offset margins, mixed aspect ratios
- [ ] Three equal card columns → zig-zag, asymmetric grid, horizontal scroll, masonry
- [ ] `h-screen` for full sections → `min-h-dvh`
- [ ] No max-width container → add ~1200-1440px constraint
- [ ] No overlap or depth → use negative margins for layering
- [ ] Missing whitespace → double the spacing, let it breathe

### Interactivity Audit
- [ ] No hover states on buttons → add background shift, scale, or translate
- [ ] No active/pressed feedback → add `scale(0.98)` or `translateY(1px)`
- [ ] No loading states → skeleton loaders matching layout shape
- [ ] No empty states → compose "getting started" view
- [ ] No error states → inline messages near the problem
- [ ] No focus rings → visible indicators for keyboard nav
- [ ] Animations using top/left/width/height → switch to transform + opacity

### Content Audit
- [ ] Generic names, fake round numbers → realistic, organic data
- [ ] AI copywriting cliches → plain, specific language
- [ ] Lorem Ipsum → real draft copy
- [ ] Same avatar for multiple users → unique assets per person
- [ ] Title Case On Every Header → sentence case

### Component Audit
- [ ] Generic card everywhere → remove borders, use spacing/color instead
- [ ] Accordion FAQ → side-by-side list, searchable help, inline progressive disclosure
- [ ] 3-card carousel testimonials → masonry wall, social embeds, single rotating quote
- [ ] Modals for everything → inline editing, slide-over panels, expandable sections
- [ ] Avatar circles exclusively → try squircles or rounded squares

### Code Quality Audit
- [ ] Div soup → semantic HTML: `<nav>`, `<main>`, `<article>`, `<aside>`, `<section>`
- [ ] Inline styles mixed with Tailwind → move all to Tailwind utilities
- [ ] Missing alt text → describe image content
- [ ] Arbitrary z-index (9999) → establish clean scale
- [ ] Import hallucinations → verify every import exists in `package.json`
- [ ] Missing meta tags → `<title>`, description, og:image

---

## 9. Upgrade Techniques

High-impact techniques for replacing generic patterns:

### Typography
- Variable font animation: interpolate weight/width on scroll or hover
- Outlined-to-fill transitions: text starts as stroke, fills on scroll entry
- Text mask reveals: large typography as window to animated imagery

### Layout
- Broken grid / asymmetry: elements deliberately ignoring column structure
- Whitespace maximization: aggressive negative space forcing focus on a single element
- Parallax card stacks: sections sticking and stacking during scroll

### Motion
- Staggered entry: elements cascade with slight delays, Y-translation + opacity fade
- Spring physics: replace linear easing with spring-based motion on all interactive elements
- Scroll-driven reveals: expanding masks, wipes, SVG paths tied to scroll progress

### Surfaces
- True glassmorphism: `backdrop-blur` + 1px inner border + subtle inner shadow
- Spotlight borders: card borders illuminating under cursor
- Grain overlays: fixed pointer-events-none overlay with subtle noise

---

## 10. Fix Priority & Pre-flight

### Upgrade Order (maximum impact, minimum risk)

1. **Font swap** — biggest instant improvement, lowest risk
2. **Color palette cleanup** — remove clashing/oversaturated colors
3. **Hover and active states** — makes interface feel alive
4. **Layout and spacing** — proper grid, max-width, consistent padding
5. **Replace generic components** — swap cliche patterns for modern alternatives
6. **Add loading, empty, error states** — makes it feel finished
7. **Polish typography scale** — the premium final touch

### Pre-flight Check

Before outputting code, evaluate against this matrix:

- [ ] Is mobile layout collapse guaranteed for high-variance designs?
- [ ] Do full-height sections use `min-h-[100dvh]` not `h-screen`?
- [ ] Are empty, loading, and error states provided?
- [ ] Are cards omitted in favor of spacing where possible?
- [ ] Does the color palette use max 1 accent? No purple AI gradients?
- [ ] Is Inter banned? Does the font choice have character?
- [ ] Do animations use only transform/opacity? Do they have cleanup?
- [ ] Is contrast ratio ≥ 4.5:1 for all text?
- [ ] Are touch targets ≥ 44x44px?
- [ ] Does every import exist in `package.json`?
- [ ] Is `prefers-reduced-motion` respected?
- [ ] Is the design MEMORABLE? Would someone screenshot this?
