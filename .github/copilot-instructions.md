# War Games — MANDATORY design & brand rules (read every session)

This file is auto-loaded each session. **Follow it for every change that touches UI/CSS/markup.**
The product is a **worn 1983 phosphor-green CRT terminal**. Breaking the look is a brand defect.

## Sources of truth (open these before styling anything)
- **[Brand-Guidelines.md](../Brand-Guidelines.md)** — tokens, components, rules, known debt.
- **[design-system.html](../design-system.html)** — live token inspector (opens from Console → `DESIGN SYSTEM ↗`).
- **[site-map.html](../site-map.html)** — every scene/screen and how they interlink.

## Non‑negotiables
1. **The CRT scanline "glass" is GLOBAL and singular.** One `.scanlines` overlay is drawn *over*
   everything at the top of the stacking order (`z-index: 100`, `pointer-events: none`,
   `mix-blend-mode: multiply`). The dark `--scanline` lines cutting through the lettering are THE
   defining look. **Never** give a panel its own scanline layer (out-of-phase moiré) and **never**
   let a new panel/overlay render above the glass — if its text looks clean/modern, that is the bug.
2. **Tokens only — never hardcode colors or glows.** Use `--fg`, `--fg-dim`, `--fg-bright`,
   `--amber`, `--warn`, `--red`, `--echo`, `--glow-rgb`/`--glow-soft`/`--glow`, `--scanline`,
   `--font`, `--btn-h`, `--btn-font`. If you need a new value, add a token — don't inline `rgba(...)`.
3. **Adopt existing styles.** Reuse the established classes/tokens; do not duplicate or "make up"
   values. A new control should look identical to its existing sibling.
4. **One font** (`--font`, Cascadia mono). Build hierarchy with size + letter-spacing + case.
   Machine/system voice is **UPPERCASE**.
5. **Buttons** = `.ghost-btn` (transparent, `1px solid --fg-dim`, invert on hover). **Icons** = a
   **solid monochrome glyph** filled with `currentColor` + phosphor bleed, like the chess pieces —
   never a thin modern outline.
6. **Green on black everywhere.** Form controls (`select`/`input`) are green-on-black; `html` sets
   `color-scheme: dark` so native dropdown popups render dark, never white. **Red is scarce**
   (genuine danger only: DEFCON ≤2, alarm, launch, parse-fail). Amber = labels/cautions.
7. **Respect `prefers-reduced-motion`** — every animation needs an off-switch.

## Required workflow for any UI change
1. Read Brand-Guidelines.md and glance at design-system.html first.
2. Implement using existing tokens/classes (see rules above).
3. **Verify in the browser**: run `node serve.mjs` (port 8787) and screenshot the changed surface.
   Confirm it has **scanlines-through-text + phosphor glow** and matches the terminal. A surface
   that looks crisp/clean is failing the brand.
4. **Keep the three sources of truth in sync**: update Brand-Guidelines.md (tokens/components),
   design-system.html (demos), and site-map.html (if scenes/links changed).
5. Commit with a clear message and push to `main`.

## Project facts
- Vanilla JS ES modules, **no build step**. Entry `js/main.js`. Dev server: `node serve.mjs` (:8787,
  also proxies `/v1/chat/completions` and `/sync/:room`). Hosted on GitHub Pages.
- Single-page app: `index.html` hosts all in-game scenes/overlays; `design-system.html` and
  `site-map.html` are standalone reference pages (open in a new tab).
