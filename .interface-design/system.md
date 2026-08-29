# FRAME Interface System

## Direction

FRAME should feel like a focused creative director's workbench: editorial, precise, confident, and ready for production. The interface helps a brand manager move from an unfocused brief to one filmable idea without feeling like a generic AI form.

## Visual language

- Ink: `#101b36` — primary type, selected controls, and production surfaces.
- Paper: `#f5f7f8` — page canvas.
- Panel: `#ffffff` — active work surfaces.
- Line: `#cbd2dc` — quiet structure and unselected controls.
- Coral: `#ff5c46` — decisions, active details, and primary actions.
- Blueprint: `#dbe6ff` — lifted-card depth and focus rings.
- Muted: `#657086` — labels and secondary information.
- Keep coral scarce. It marks a decision or action; it is not decoration.

## Depth and surfaces

- Use sharp borders and small offset blueprint shadows for main work surfaces.
- Page → white panel → selected ink control is the elevation order.
- Avoid rounded SaaS cards, gradients, glass effects, and decorative shadows.
- Inputs remain transparent with a quiet bottom border; focus changes the border to coral.

## Typography and hierarchy

- Display: condensed, heavy sans-serif treatment with tight tracking and uppercase where expressive.
- Interface/body: Arial-compatible sans-serif for clarity and speed.
- Labels: `9–10px`, `800`, uppercase, tracked.
- Questions: `16–17px`, `800`, tight tracking, sentence case.
- Body: `15–18px`, regular, around `1.5` line height.
- Dynamic counters use tabular numbers.

## Spacing and density

- Base spacing unit: `8px`.
- Form groups: `24px` vertical padding.
- Control gaps: `8px`.
- Question-label gap: `4–8px`.
- Main panels: `28px` desktop padding and `20px` mobile padding.
- Use tighter spacing within a decision and larger spacing between decisions.

## Creative brief pattern

- The brief is one bordered panel with five numbered sections.
- Each section contains one category label, one direct question, and one control group.
- Section numbers are coral and use `01`, `02`, `03`, `04`, `05`.
- Questions use the brand manager's language and avoid explanatory paragraphs.
- The primary action follows all five sections and uses the label `Develop concepts` so it accurately describes the next step.

## Choice chips

- Use native `<button type="button">` elements.
- Minimum height: `42px`; target a `44px` hit area where space permits.
- Shape: square corners, `1px` quiet border, compact label.
- Default: pale panel background with muted ink text.
- Hover: ink border and ink text.
- Selected: ink background, white text, coral inset bottom marker.
- Active: `scale(.97)` press feedback.
- Focus: blueprint `3px` outline with `3px` offset.
- Disabled: `38%` opacity with a not-allowed cursor.
- Use `aria-pressed` for selected state.

## Platform selection

- Single selection.
- Options: Instagram / Reels, Meta Ads, YouTube, TV / OTT.
- Four columns on desktop; two columns on mobile.

## Visual-tone selection

- Multi-selection with a maximum of three choices.
- Options: Cinematic, Luxury, Raw, Playful, Emotional, Bold, Minimal, Surreal.
- Show the live count as `n / 3` beside the section question.
- When three are selected, disable only the remaining unselected options; selected options stay available for removal.
- Require at least one tone before generation.
- Four columns on desktop; two columns on mobile.

## Responsive rules

- Collapse the landing hero and brief layout to one column below `900px`.
- At `650px` and below, use `18px` page gutters and `20px` panel padding.
- Choice grids use two equal columns on mobile.
- Remove decorative left indentation from form controls on mobile.
- Never rely on colour alone: selected chips retain contrast and `aria-pressed` state.

## Motion

- Keep control feedback between `100–150ms`.
- Animate only colour, opacity, and transform.
- Respect `prefers-reduced-motion` by removing movement transitions.

## Storyboard treatment pattern

- The result screen should feel like a commercial treatment being presented for approval, not an AI response or dashboard.
- Lead with the selected concept name and its one-line central idea. Keep duration and platform as compact production metadata.
- Present the six shots in one fixed narrative order: `01 Hook`, `02 Tension`, `03 Product`, `04 Proof`, `05 Payoff`, `06 Brand`.
- Use two columns above `750px` and one column below it.
- Each shot begins with a dominant `16:9` frame well with a sharp ink border and `6px` blueprint offset shadow (`4px` on mobile).
- When a real image URL exists, fill the frame with the image using cover cropping. Never imply that a visual placeholder is a generated image.
- Place the image first, then shot number, narrative role, timestamp, Visual, Camera, and Action.
- Default shot copy is one concise visual instruction, one concise camera instruction, and one concise physical action.
- Use native `<details>` for the secondary control labelled `View shot details`.
- Keep the full visual, purpose, framing, angle/movement, lens, lighting, production design, product continuity, audio, dialogue, and raw image prompt inside collapsed shot details.
- Do not expose raw image-generation prompts by default.
- Do not add shot-directing controls until that workflow is explicitly designed.
- Image rendering states stay inside each frame: waiting, directing, completed image, or a local failure with an explicit `Retry frame` action.
- During the six-frame render queue, use one compact studio-status strip with real stage copy. Never display invented percentages.
- Match the visible frame shape to platform intent: `9:16` for Reels, `4:5` for Meta Ads, and `16:9` for YouTube and TV / OTT.
- Completed treatments lead with Copy treatment, then Download PDF and Share link. Make another film is tertiary.
- All important controls use an effective minimum hit area of `44px` on touch screens.
- Loading and completion copy derive from one phase. A ready treatment never retains directing language.
