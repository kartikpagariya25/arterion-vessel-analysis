# Design system: Arterion Vessel Analysis

A recreation of a clean medical-AI landing page, in teal and white. Every claim and number on the page comes from this project's own README and metrics.

## Structure
1. Floating navigation: logo mark, pill tabs, status, sign-in, Get Started
2. Hero: badge, serif headline (italic gradient second line), lead, two calls to action, check-badges, motif line
3. Features: six cards with gradient icon tiles
4. Process: four numbered steps joined by a rail that fills as you scroll
5. Analyze: the working tool
6. Evidence: dark section with an italic claim and a glass panel of held-out metric bars
7. Call to action and footer

## Tokens
| Token | Value |
|---|---|
| `--brand-1` | `#115e59` |
| `--brand-2` | `#0f766e` |
| `--brand-3` | `#14b8a6` |
| `--bright` | `#5eead4` |
| `--ink` | `#0b2a2a` |
| `--muted` | `#587472` |
| `--bg` | `#f7fcfb` |
| `--soft` | `#f0fdfa` |
| `--dark-1` | `#04201f` |
| `--dark-2` | `#115e59` |

## Type
Headlines: 'Newsreader'. Body: 'Figtree'. Numbers: 'DM Mono'.

## Motion
- **Motion (framer-motion engine, vanilla build):** hero entrance on a spring, button hover and press springs, count-ups.
- **GSAP + ScrollTrigger:** read-progress bar, hero parallax, heading and card reveals, a scrubbed rail that connects the steps, metric bars that grow once in view.
- **Reduced motion:** all animation is skipped and bars and counters show their final values.

## Dark mode
Dark tokens override the light ones under `html[data-theme="dark"]`, and under `prefers-color-scheme: dark` when no choice has been saved. Surfaces: `--bg #051a19`, `--soft #08201f`, `--card #0c2a28`; text `--ink #e2f6f3`; links `--link #5eead4`. The toggle remembers the choice in `localStorage` and a script in `<head>` applies it before first paint, so there is no flash. The evidence section is dark in both themes.

## Accessibility
Skip link, labelled landmarks, visible focus rings, text contrast of at least 4.5:1 on buttons, and a keyboard-operable mobile menu.
