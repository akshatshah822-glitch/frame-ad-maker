import type { VisualBible } from "@/lib/types";

export type ImagePromptInput = {
  intent: "performance" | "cinematic";
  selectedConcept: string;
  narrativeStructure: string;
  storyContext: string;
  purpose: string;
  subjectAction: string;
  cameraFraming: string;
  cameraAngle: string;
  lensSuggestion: string;
  cameraMovement: string;
  lighting: string;
  locationAndProps: string;
  selectedTone: string;
  platform: string;
  visualBible: VisualBible;
};

const platformImages: Record<string, { promptRatio: string; apiSize: string }> = {
  "Instagram / Reels": { promptRatio: "9:16 vertical", apiSize: "1024x1824" },
  "Meta Ads": { promptRatio: "4:5 portrait", apiSize: "1024x1280" },
  YouTube: { promptRatio: "16:9 landscape", apiSize: "1824x1024" },
  "TV / OTT": { promptRatio: "16:9 landscape", apiSize: "1824x1024" },
};

export const supportedPlatforms = Object.keys(platformImages);
const PERSON_DESCRIPTOR = /\b(body|appearance|age|aged|young|old|clothing|clothes|wardrobe|outfit|dress|shirt|blouse|sari|saree|skin|complexion|hair|hairstyle|ethnicity|race|racial|physique|figure|build|chest|legs?|bare|attractive|beautiful|handsome)\b/i;

function safeDirection(value: string, fallback: string) {
  const safeParts = value.split(/(?<=[.!?;])\s+|\n+/).filter((part) => !PERSON_DESCRIPTOR.test(part));
  return safeParts.join(" ").trim() || fallback;
}

export function getImageSize(platform: string) {
  return platformImages[platform]?.apiSize ?? "1824x1024";
}

export function getPlatformFormat(platform: string) {
  if (platform === "Instagram / Reels") return "vertical";
  if (platform === "Meta Ads") return "portrait";
  return "landscape";
}

export function buildImagePrompt({
  intent, subjectAction, cameraFraming, cameraAngle, lensSuggestion,
  cameraMovement, lighting, locationAndProps, selectedTone, platform, visualBible,
}: ImagePromptInput): string {
  const palette = visualBible.colorPalette.join(", ");
  const continuityLocks = visualBible.continuityLocks.filter((lock) => !PERSON_DESCRIPTOR.test(lock)).map((lock) => `- ${lock}`).join("\n") || "- Same product, set, lighting and camera language";
  const aspectRatio = platformImages[platform]?.promptRatio ?? "16:9 landscape";

  return `Create a photorealistic cinematic advertising frame.

Generate exactly one cinematic production frame. No collage, no montage grid, no contact sheet, no split screen, no multi-panel layout, no storyboard sheet.

CREATIVE INTENT
${intent === "performance" ? "Performance advertisement" : "Cinematic story"}

PRODUCT
${visualBible.product}

LOCATION
${safeDirection(visualBible.location, "A neutral professional setting.")}

ACTION
${safeDirection(subjectAction, "The subject completes one clear product-focused action.")}

COMPOSITION
${cameraFraming}
${cameraAngle}
Clearly defined foreground, subject and background.
Strong intentional visual hierarchy.

CAMERA
${lensSuggestion}
${cameraMovement}
${visualBible.cinematography}
Natural optical depth of field.
Commercial cinematography rather than stock photography.

LIGHTING
${lighting}
Shared lighting direction: ${visualBible.lighting}
Lighting must be physically motivated by the environment.

PRODUCTION DESIGN
${safeDirection(locationAndProps, "Minimal neutral set dressing and props.")}

COLOR
${palette}

TEXTURE
Physically believable product materials.
${safeDirection(visualBible.texture, "Physically believable materials and subtle film texture.")}
Subtle film grain where appropriate.
Realistic highlights and shadows.

MOOD
${selectedTone}

CONTINUITY
This is one frame from the same advertisement as all previous and following shots.

Maintain exactly:
${continuityLocks}

The product must preserve its exact shape, proportions, material and design.

DO NOT INCLUDE
text
captions
watermarks
unprovided logos
collage
montage grid
contact sheet
split screen
multi-panel layout
storyboard sheet
distorted hands
extra fingers
plastic skin
impossible reflections
warped products
duplicate objects
floating objects
excessive lens flare
generic stock-photo composition

The final result must look like a professionally art-directed commercial frame rather than an AI-generated marketing image.

Use a ${aspectRatio} aspect ratio appropriate to ${platform}.`;
}
