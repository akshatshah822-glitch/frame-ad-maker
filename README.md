# FRAME

FRAME turns a simple brand brief into three creative directions, one selected 30-second storyboard, a shared Visual Bible, and six generated commercial frames.

## Product flow

```text
Brief
→ 3 creative directions
→ Select one
→ Visual Bible + 6-shot storyboard
→ 6 image prompts
→ 6 generated frames
→ Final treatment
```

## Local setup

1. Copy `.env.local.example` to `.env.local`.
2. Add an OpenAI API key with access to `gpt-5-mini` and `gpt-image-2`.
3. Add the Convex deployment URL.
4. Install dependencies with `npm install`.
5. Run `npx convex dev` to deploy Convex functions.
6. Run `npm run dev` and open `http://localhost:3000`.

Required variables:

```bash
OPENAI_API_KEY=
NEXT_PUBLIC_CONVEX_URL=
```

`OPENAI_API_KEY` is used only by Next.js server routes. Never expose it through a `NEXT_PUBLIC_` variable.

## Models and image storage

- Concepts and storyboards: `gpt-5-mini` through the OpenAI Responses API with strict JSON schemas.
- Storyboard frames: `gpt-image-2` through the OpenAI Image API, medium quality JPEG.
- Images: uploaded to Convex File Storage. The returned file URLs remain available until the stored files are deleted.
- If image storage fails after rendering, that browser session receives an in-memory data URL so the successful frame is still shown. That fallback does not survive refresh.

## Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Deployment

Configure `OPENAI_API_KEY` and `NEXT_PUBLIC_CONVEX_URL` in Vercel. Deploy Convex functions before deploying the Next.js application so image upload and record-update functions exist in production.
