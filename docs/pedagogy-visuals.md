# Pedagogy brief: visual boards

Exam-question path only (`/question` → Pedagogy Brief Upload). The ad/film path is unchanged.

## Optional columns

All new columns are optional. A sheet without them renders as text boards, exactly as before (no migration).

| Column | Values |
|---|---|
| `visual` | blank or `text` (default), `flowchart`, `cards`, `bar`, `line`, `waterfall`, `counter`, `logo` |
| `visual_data` | Required when `visual` is not text. Format below. |
| `background` | Image name from `public/pedagogy-backgrounds/`. Blank keeps the previous row's background; `none` clears it. |

For a visual row, `board` is the title above the visual (110 characters max). `emphasis` may match a phrase in the title, or a step, card title, bar label or `Net`.

| `visual` | `visual_data` example |
|---|---|
| `flowchart` | `Free SIM > First use > Daily habit > Stays` (2–6 steps; `>` or `→`) |
| `cards` | `Customers: Phones, little data \| Company: 4G-only network` (1–4 cards; body optional) |
| `bar` | `Before Jio: ₹250 \| After Jio: ₹10` (2–8 bars, values ≥ 0) |
| `line` | `2016: 250 \| 2017: 50 \| 2018: 10` (2–8 points) |
| `waterfall` | `Commission: +₹66 \| Delivery: -₹50` (2–8 signed steps; a `Net` bar is added) |
| `counter` | `10 crore users` (counts up from 0; text before/after the number is kept) |
| `logo` | `jio, airtel, vi` (1–8 names; lowercase, numbers, hyphens) |

Each visual builds in over about 1.6 seconds, then holds for the rest of the narration line. If the next row repeats the same `visual` and `visual_data` (for example to move the emphasis), it stays on screen without re-animating.

## Logo and background files

- Logos: `public/pedagogy-logos/<name>.svg|png|jpg|jpeg|webp`. Use the company's official press or brand-kit file, unaltered. A missing file is drawn as the name in a tile and logged as `logo-name-fallback`.
- Backgrounds: `public/pedagogy-backgrounds/<name>.jpg|jpeg|png|webp`, cropped to 16:9, softly blurred and darkened under the board. A missing file falls back to the built-in gradient and is logged as `procedural-backdrop-fallback`.
- Generate a background: `node scripts/generate-pedagogy-background.mjs airport-dawn "A narrowbody jet on an airport apron at dawn"` (uses `OPENAI_API_KEY`; the prompt forbids text, logos and real people).

The render route's QA header reports `visualRowCount`, `missingLogos` and `missingBackgrounds`.
