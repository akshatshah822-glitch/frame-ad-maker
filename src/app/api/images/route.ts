import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { getImageSize, supportedPlatforms } from "@/lib/image-prompt";
import { classifyOpenAIError, getOpenAIRequestId } from "@/lib/openai-error";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 120;

type ImageRequest = {
  imagePrompt?: string;
  platform?: string;
  shotNumber?: number;
  generationId?: string;
  faceReferenceUrl?: string;
  productReferenceUrl?: string;
  runId?: string | number;
  totalShots?: number;
  attempt?: number;
  productPresence?: string;
  locationAndProps?: string;
  lighting?: string;
  cameraFraming?: string;
  cameraAngle?: string;
  lensSuggestion?: string;
  cameraMovement?: string;
};

const BLOCKED_REASON = "OpenAI blocked this frame after one safer retry. Reword the image direction and try this shot again.";

async function updateRunStage(body: ImageRequest, status: string, step: string, currentCount?: number) {
  if (!body.runId || !process.env.NEXT_PUBLIC_CONVEX_URL) return;
  try {
    await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).mutation(anyApi.runs.setStage, { id: body.runId, status, step, currentCount, totalCount: body.totalShots });
  } catch (error) { console.warn("Frame progress could not be saved", error); }
}

function imageErrorResponse(error: unknown) {
  const kind = classifyOpenAIError(error);
  if (kind === "quota") {
    return NextResponse.json({ error: "Image generation is not available for this project right now." }, { status: 402 });
  }
  if (kind === "rate_limit") {
    return NextResponse.json({ error: "We're receiving too many generation requests. Try this frame again shortly." }, { status: 429 });
  }
  if (kind === "configuration") {
    return NextResponse.json({ error: "Image generation is not configured for this project." }, { status: 503 });
  }
  return NextResponse.json({ error: "This frame couldn't be rendered." }, { status: 502 });
}

function readableImageError(error: unknown) {
  const kind = classifyOpenAIError(error);
  if (kind === "quota") return "Image generation is not available for this project right now.";
  if (kind === "rate_limit") return "Image generation stayed busy after three retries. Retry this frame shortly.";
  if (kind === "configuration") return "Image generation is not configured for this project.";
  return "This frame couldn't be rendered after three retries.";
}

async function storeImage(imageBytes: Uint8Array, generationId: string | undefined, shotNumber: number) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is missing");

  const convex = new ConvexHttpClient(convexUrl);
  const uploadUrl = await convex.mutation(anyApi.generations.generateImageUploadUrl, {});
  const imageBuffer = new ArrayBuffer(imageBytes.byteLength);
  new Uint8Array(imageBuffer).set(imageBytes);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: new Blob([imageBuffer], { type: "image/jpeg" }),
  });
  if (!uploadResponse.ok) throw new Error(`Convex image upload failed with ${uploadResponse.status}`);

  const { storageId } = await uploadResponse.json() as { storageId: string };
  const imageUrl = await convex.query(anyApi.generations.getImageUrl, { storageId });
  if (!imageUrl) throw new Error("Convex did not return an image URL");

  if (generationId) {
    try {
      await convex.mutation(anyApi.generations.attachImage, { generationId, shotNumber, imageStorageId: storageId, imageUrl });
    } catch (error) {
      console.warn(`Shot ${shotNumber} image stored but generation record was not updated`, error);
    }
  }

  return { imageUrl, imageStorageId: storageId };
}

async function uploadReference(imageBytes: Uint8Array) {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const uploadUrl = await convex.mutation(anyApi.generations.generateImageUploadUrl, {});
  const imageBuffer = new ArrayBuffer(imageBytes.byteLength);
  new Uint8Array(imageBuffer).set(imageBytes);
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: new Blob([imageBuffer], { type: "image/jpeg" }) });
  if (!response.ok) throw new Error(`Convex reference upload failed with ${response.status}`);
  const { storageId } = await response.json() as { storageId: string };
  const imageUrl = await convex.query(anyApi.generations.getImageUrl, { storageId });
  if (!imageUrl) throw new Error("Convex did not return a reference URL");
  return { storageId, imageUrl };
}

async function createIdentityReferences(imageBytes: Uint8Array, generationId: string, imagePrompt: string, platform: string) {
  const metadata = await sharp(imageBytes).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1536;
  const faceBytes = new Uint8Array(await sharp(imageBytes).extract({ left: 0, top: 0, width, height: Math.round(height * 0.7) }).jpeg({ quality: 90 }).toBuffer());
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const productResult = await openai.images.edit({
    model: "gpt-image-2",
    image: await toFile(Buffer.from(imageBytes), "canonical-shot-01.jpg", { type: "image/jpeg" }),
    prompt: `Create a clean product identity reference for the exact advertised product specified below. Show only one product, large and unobstructed, on a neutral warm background. Preserve its exact shape, proportions, material, finish, surface details and color. No person, hands, packaging, logo or text. This reference will lock the product across every frame in one commercial.\n\n${imagePrompt}`,
    n: 1,
    size: getImageSize(platform),
    quality: "medium",
    output_format: "jpeg",
    output_compression: 90,
    background: "opaque",
  });
  const productBase64 = productResult.data?.[0]?.b64_json;
  if (!productBase64) throw new Error("OpenAI returned no product reference bytes");
  const productBytes = new Uint8Array(Buffer.from(productBase64, "base64"));
  const [face, product] = await Promise.all([uploadReference(faceBytes), uploadReference(productBytes)]);
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  await convex.mutation(anyApi.generations.attachIdentityReferences, {
    generationId,
    faceReferenceStorageId: face.storageId,
    faceReferenceUrl: face.imageUrl,
    productReferenceStorageId: product.storageId,
    productReferenceUrl: product.imageUrl,
  });
  return { faceReferenceUrl: face.imageUrl, productReferenceUrl: product.imageUrl };
}

async function resolveReferences(body: ImageRequest) {
  if (body.faceReferenceUrl && body.productReferenceUrl) return { faceReferenceUrl: body.faceReferenceUrl, productReferenceUrl: body.productReferenceUrl };
  if (!body.generationId || body.shotNumber === 1) return null;
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const record = await convex.query(anyApi.generations.getById, { id: body.generationId });
  if (!record?.faceReferenceUrl || !record?.productReferenceUrl) return null;
  return { faceReferenceUrl: String(record.faceReferenceUrl), productReferenceUrl: String(record.productReferenceUrl) };
}

function neutralizeImagePrompt(body: ImageRequest) {
  const clean = (value: unknown, fallback: string) => String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return `Create a neutral commercial product photograph with no description of any person's body, face, age, clothing, ethnicity or physical appearance.

PRODUCT: ${clean(body.productPresence, "Keep the advertised product clearly visible and unchanged.")}
SETTING: ${clean(body.locationAndProps, "A simple professional interior with minimal neutral props.")}
LIGHTING: ${clean(body.lighting, "Soft, natural commercial lighting.")}
CAMERA: ${clean(body.cameraFraming, "Medium product-focused framing")}; ${clean(body.cameraAngle, "eye-level angle")}; ${clean(body.lensSuggestion, "natural perspective")}; ${clean(body.cameraMovement, "static camera")}.

Keep the scene non-sensitive, professional and product-focused. No text, logos, claims or extra products.`;
}

async function markShotBlocked(body: ImageRequest, shotNumber: number) {
  if (!body.generationId || !process.env.NEXT_PUBLIC_CONVEX_URL) return;
  try {
    await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).mutation(anyApi.generations.markImageBlocked, { generationId: body.generationId, shotNumber, reason: BLOCKED_REASON });
  } catch (error) {
    console.warn(`Shot ${shotNumber} block state could not be saved`, error);
  }
}

async function markShotFailed(body: ImageRequest, shotNumber: number, reason: string) {
  if (!body.generationId || !process.env.NEXT_PUBLIC_CONVEX_URL) return;
  try {
    await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).mutation(anyApi.generations.markImageFailed, { generationId: body.generationId, shotNumber, reason });
  } catch (error) {
    console.warn(`Shot ${shotNumber} failure state could not be saved`, error);
  }
}

const post = async (request: Request) => {
  let body: ImageRequest;
  try {
    body = await request.json() as ImageRequest;
  } catch {
    return NextResponse.json({ error: "The frame request could not be read." }, { status: 400 });
  }

  const imagePrompt = String(body.imagePrompt ?? "").trim();
  const platform = String(body.platform ?? "").trim();
  body.runId = String(body.runId ?? "").trim() || undefined;
  body.attempt = Number.isInteger(body.attempt) ? Number(body.attempt) : 1;
  const shotNumber = body.shotNumber;
  if (!imagePrompt || imagePrompt.length > 32_000 || !platform || !supportedPlatforms.includes(platform) || !Number.isInteger(shotNumber) || !shotNumber || shotNumber < 1 || shotNumber > 10) {
    return NextResponse.json({ error: "This frame is missing valid production direction." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Image generation is not configured for this project." }, { status: 503 });
  }

  await updateRunStage(body, "images_generating", `Drawing frame ${shotNumber} of ${body.totalShots ?? "?"}`, shotNumber - 1);

  let imageBase64: string;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const references = await resolveReferences(body);
    const sharedOptions = { model: "gpt-image-2" as const, n: 1, size: getImageSize(platform), quality: "medium" as const, output_format: "jpeg" as const, output_compression: 82, background: "opaque" as const };
    const generateFrame = async (prompt: string) => references
      ? openai.images.edit({
          ...sharedOptions,
          image: [
            await toFile(Buffer.from(await (await fetch(references.faceReferenceUrl)).arrayBuffer()), "face-reference.jpg", { type: "image/jpeg" }),
            await toFile(Buffer.from(await (await fetch(references.productReferenceUrl)).arrayBuffer()), "product-reference.jpg", { type: "image/jpeg" }),
          ],
          prompt: `OUTPUT FORMAT LOCK: Generate one single photograph that fills the entire canvas. Show one moment in time only. Never divide the canvas or repeat the subject. No collage, montage, diptych, triptych, grid, contact sheet, split screen, multi-panel composition, sequence, before-and-after, inset image, or storyboard sheet.\n\nREFERENCE 1 is the canonical adult character identity. REFERENCE 2 is the canonical finished product identity. Preserve both exactly; change only staging, action, framing and scene direction required below. The exact finished product from REFERENCE 2 must remain clearly visible and unchanged. Use neutral, non-sensitive commercial art direction.\n\n${prompt}`,
        })
      : openai.images.generate({
          ...sharedOptions,
          prompt: `OUTPUT FORMAT LOCK: Generate one single photograph that fills the entire canvas. Show one moment in time only. Never divide the canvas or repeat the subject. No collage, montage, diptych, triptych, grid, contact sheet, split screen, multi-panel composition, sequence, before-and-after, inset image, or storyboard sheet.\n\n${prompt}`,
        });
    let result;
    try {
      result = await generateFrame(imagePrompt);
    } catch (error) {
      if (classifyOpenAIError(error) !== "moderation_blocked") throw error;
      console.warn(`OpenAI moderation block shot=${shotNumber} requestId=${getOpenAIRequestId(error)} attempt=1`);
      try {
        result = await generateFrame(neutralizeImagePrompt(body));
      } catch (retryError) {
        if (classifyOpenAIError(retryError) !== "moderation_blocked") throw retryError;
        console.warn(`OpenAI moderation block shot=${shotNumber} requestId=${getOpenAIRequestId(retryError)} attempt=2`);
        await markShotBlocked(body, shotNumber);
        const totalShots = body.totalShots;
        await updateRunStage(body, totalShots && shotNumber === totalShots ? "frames_ready" : "images_generating", totalShots && shotNumber === totalShots ? `Storyboard ready; frame ${shotNumber} blocked` : `Drawing frame ${shotNumber + 1} of ${totalShots ?? "?"}`, shotNumber);
        return NextResponse.json({ imageStatus: "blocked", imageError: BLOCKED_REASON });
      }
    }
    imageBase64 = result.data?.[0]?.b64_json ?? "";
    if (!imageBase64) throw new Error("OpenAI returned no image bytes");
  } catch (error) {
    console.error(`OpenAI image generation failed for shot ${shotNumber}`, error);
    if (body.attempt >= 4) await markShotFailed(body, shotNumber, readableImageError(error));
    await updateRunStage(body, "images_generating", body.attempt >= 4 ? `Frame ${shotNumber} failed; continuing` : `Retrying frame ${shotNumber}`, shotNumber - 1);
    return imageErrorResponse(error);
  }

  const imageBytes = Uint8Array.from(Buffer.from(imageBase64, "base64"));
  try {
    const stored = await storeImage(imageBytes, body.generationId, shotNumber);
    const references = shotNumber === 1 && body.generationId ? await createIdentityReferences(imageBytes, body.generationId, imagePrompt, platform) : {};
    if (body.totalShots) {
      if (shotNumber === body.totalShots) await updateRunStage(body, "frames_ready", `${body.totalShots} frames ready`, body.totalShots);
      else await updateRunStage(body, "images_generating", `Drawing frame ${shotNumber + 1} of ${body.totalShots}`, shotNumber);
    }
    return NextResponse.json({ ...stored, ...references, imageStatus: "complete" });
  } catch (error) {
    console.warn(`Shot ${shotNumber} rendered but durable storage failed`, error);
    return NextResponse.json({
      imageUrl: `data:image/jpeg;base64,${imageBase64}`,
      imageStatus: "complete",
      storageWarning: true,
    });
  }
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
