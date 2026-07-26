# Brand-Guidelines.md

The single source of truth for the **WarGames** homage look and feel. Keep this in sync with the
`:root` tokens in [css/terminal.css](css/terminal.css) and the live workbench in
[design-system.html](design-system.html) (opened from the Console → **DESIGN SYSTEM ↗**).

> **Brand in one line:** a worn 1983 phosphor-green CRT terminal — calm, institutional, and a
> little haunted. The screen is a character; restraint is the aesthetic.

---

## 1. How to use this document

- The **design-system inspector** ([design-system.html](design-system.html)) lets you edit every
  token live and preview the impact. When a value is right, press **COPY :root**, paste it into
  the `:root` block of [css/terminal.css](css/terminal.css), and update the table in §3 here.
- Treat the tokens as the **only** place colors/sizing are defined. New CSS should reference
  `var(--token)` — never a raw hex or a duplicated `rgba(...)` glow (see §6).
- This file is the place to record brand decisions so "why is it this green?" always has an answer.

---

## 2. Brand personality

| Trait | How it shows up in the UI |
|---|---|
| **Institutional / cold** | Monospace only, UPPERCASE machine voice, boxed labels, no rounded playfulness. |
| **Phosphor-green CRT** | One green family (`--fg` and its dim/bright siblings) on near-black, with scanlines, flicker, and a slow refresh roll. |
| **Worn & analog** | Beige, scuffed monitor bezel; grime overlay; curved-glass vignette. The tech is old and used. |
| **Dread, earned quietly** | Amber for caution, red reserved almost entirely for DEFCON / alarm. Red is a scarce resource. |
| **The screen is a character** | Text has *voice* classes (system, echo, alert, critical), not just styles. |

---

## 3. Design tokens (source of truth)

Defined in `:root` in [css/terminal.css](css/terminal.css#L3). Edit via the inspector, then sync here.

### Color

| Token | Value | Role |
|---|---|---|
| `--bg` | `#020a02` | Base background (deep green-black). |
| `--fg` | `#33ff66` | Primary phosphor green — the machine's normal voice. |
| `--fg-dim` | `#1f9c40` | Dim green — **all borders**, labels, secondary text. |
| `--fg-bright` | `#b6ffcc` | Bright green — titles, emphasis, active glyphs. |
| `--amber` | `#ffcc33` | Amber — section labels; NORAD accent. |
| `--warn` | `#ff9d3c` | Warm amber-orange — soft cautions (softer than red). |
| `--red` | `#ff4444` | Alarm red — critical lines, DEFCON danger, launch. |
| `--echo` | `#7fe0c0` | Cool phosphor — quiet asides, links, wiki markers. |
| `--norad-dim` | `#143a1f` | NORAD unlit-segment ghost. |

NORAD also aliases `--norad-accent: var(--fg-bright)`, `--norad-amber: var(--amber)`,
`--norad-red: var(--red)` ([css/terminal.css](css/terminal.css#L1285)) so the board stays on-palette.

### Typography

- **Family (only one):** `--font: "Cascadia Code", "Consolas", "SFMono-Regular", ui-monospace, monospace`.
- Hierarchy comes from **size + weight + letter-spacing + case**, not extra fonts.
- Letter-spacing scale: body ~0; labels 1–2px; titles 3–4px.
- Machine/system voice is **UPPERCASE**; narration is sentence case.

Size ladder (rem): `1.5` title · `1.3` entry title · `1.0` body/primary-btn · `0.9` inputs ·
`0.82` secondary · `0.72` labels/hints · `0.6–0.68` micro-labels.

### Control sizing (responsive)

| Token | Base | ≤600px | ≥1600px | ≥2400px |
|---|---|---|---|---|
| `--btn-h` | `28px` | `26px` | `34px` | `44px` |
| `--btn-font` | `0.75rem` | `0.7rem` | `0.9rem` | `1.1rem` |

---

## 4. Components (canonical patterns)

- **Buttons.** `.ghost-btn` is the canonical control everywhere (status bar, NORAD header, menu,
  overlays): transparent fill, `1px solid --fg-dim` border, invert-to-black on hover. Variants:
  `.icon-only` (borderless glyph, e.g. the chess piece), `.muted` (de-emphasized). `.primary-btn`
  now shares the outlined ghost treatment (unified this cycle — previously a solid fill).
- **Panels.** `1px solid --fg-dim`, dark green translucent fill, soft green glow box-shadow. Used
  by the menu, Admin Console, wiki overlay, and pair sheet.
- **Overlays.** Full-bleed scrim `rgba(1,6,1,0.92)`, centered panel. Shared by
  `.menu-overlay`, `.telemetry-overlay`, `.wiki-overlay`.
- **Status bar.** `.defcon` (label + value + red rung ladder) on the left; `.status-right` row of
  `.ghost-btn`s on the right. The NORAD board reuses the **same** `.defcon` markup.
- **CRT treatment.** `.scanlines`, `.flicker`, `.crt::after` refresh roll, monitor bezel + grime.
  Always on; respects `prefers-reduced-motion`.

---

## 5. Usage rules

1. **Reference tokens, never raw values.** New rules use `var(--fg-dim)` etc. If you need a new
   color, add a token — don't inline a hex.
2. **Red is scarce.** Reserve `--red` for genuine danger (DEFCON ≤2, alarm, launch, parse-fail).
   Everyday caution uses `--amber` / `--warn`.
3. **One font.** Do not introduce a second family. Create hierarchy with size/spacing/case.
4. **Borders are `1px solid --fg-dim`.** Keep the single-hairline look consistent.
5. **Additive features stay diegetic and on-palette.** New surfaces (e.g. the wiki) use `--echo`
   for their accent so they read as "adjacent" to the machine voice, not foreign UI.
6. **Respect reduced motion.** Any new animation needs a `prefers-reduced-motion` off-switch.

---

## 6. Known inconsistencies (backlog for perfection)

These are the "hard-to-fix-by-bug-report" items the inspector was built to surface. Each has a
proposed token fix; tackle them when doing a polish pass.

| # | Finding | Where | Proposed fix |
|---|---|---|---|
| B1 | **Phosphor glow is hardcoded** as `rgba(51,255,102,α)` in ~40 `box-shadow`/`text-shadow` rules instead of deriving from `--fg`. Changing the brand green does **not** update the glows. | throughout [css/terminal.css](css/terminal.css) | Add `--glow-rgb: 51 255 102;` and use `rgba(var(--glow-rgb) / α)` (or `color-mix`) so glow tracks `--fg`. |
| B2 | **Panel fill alpha drifts** (`rgba(2,12,2,0.9)` / `0.94` / `0.95` / `0.975`). | menu, wiki, console, drawers | Introduce `--panel-bg` and `--panel-scrim` tokens; apply everywhere. |
| B3 | **Border color sometimes inlined** as `rgba(31,156,64,α)` (that is `--fg-dim` with alpha) rather than the token. | chess, drawers | Use `color-mix(in srgb, var(--fg-dim) N%, transparent)`. |
| B4 | **Stray literal hexes** (`#010601`, `#041204`, `#6ad38a`, `#4f6b5a`, `#cfffe0`, `#eaffee`). | terminal bg, endings | Promote the recurring ones (`#010601` input bg, `#041204` CRT core) to tokens `--input-bg`, `--crt-core`. |
| B5 | **Glow intensity is ad-hoc** (blur 4–40px, alpha 0.08–0.95). | everywhere | Define a small glow scale (`--glow-sm/md/lg`) for consistent bloom. |

> None of these are visible bugs today — they are **maintainability** debts that make global brand
> tweaks tedious. The inspector's COPY :root flow plus these tokens would make future adjustments a
> one-line change.

---

## 7. Change log

Record brand-affecting changes here so the tokens and this file never drift.

- **This cycle:** unified the opening screen to the terminal treatment; `.primary-btn` adopted the
  outlined ghost style; NORAD DEFCON now reuses the bedroom `.defcon` markup + red ladder; added the
  `--echo`-accented **Field Briefings** wiki surface; added the design-system inspector. No token
  values changed — only new components and this catalog.
