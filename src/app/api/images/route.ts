import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import OpenAI from "openai";
import { getImageSize, supportedPlatforms } from "@/lib/image-prompt";
import { classifyOpenAIError } from "@/lib/openai-error";

export const maxDuration = 120;

type ImageRequest = {
  imagePrompt?: string;
  platform?: string;
  shotNumber?: number;
  generationId?: string;
};

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

export async function POST(request: Request) {
  let body: ImageRequest;
  try {
    body = await request.json() as ImageRequest;
  } catch {
    return NextResponse.json({ error: "The frame request could not be read." }, { status: 400 });
  }

  const imagePrompt = body.imagePrompt?.trim();
  const platform = body.platform?.trim();
  const shotNumber = body.shotNumber;
  if (!imagePrompt || imagePrompt.length > 32_000 || !platform || !supportedPlatforms.includes(platform) || !Number.isInteger(shotNumber) || !shotNumber || shotNumber < 1 || shotNumber > 6) {
    return NextResponse.json({ error: "This frame is missing valid production direction." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Image generation is not configured for this project." }, { status: 503 });
  }

  let imageBase64: string;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await openai.images.generate({
      model: "gpt-image-2",
      prompt: imagePrompt,
      n: 1,
      size: getImageSize(platform),
      quality: "medium",
      output_format: "jpeg",
      output_compression: 82,
      background: "opaque",
    });
    imageBase64 = result.data?.[0]?.b64_json ?? "";
    if (!imageBase64) throw new Error("OpenAI returned no image bytes");
  } catch (error) {
    console.error(`OpenAI image generation failed for shot ${shotNumber}`, error);
    return imageErrorResponse(error);
  }

  const imageBytes = Uint8Array.from(Buffer.from(imageBase64, "base64"));
  try {
    const stored = await storeImage(imageBytes, body.generationId, shotNumber);
    return NextResponse.json({ ...stored, imageStatus: "complete" });
  } catch (error) {
    console.warn(`Shot ${shotNumber} rendered but durable storage failed`, error);
    return NextResponse.json({
      imageUrl: `data:image/jpeg;base64,${imageBase64}`,
      imageStatus: "complete",
      storageWarning: true,
    });
  }
}
