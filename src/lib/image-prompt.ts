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

export function getImageSize(platform: string) {
  return platformImages[platform]?.apiSize ?? "1824x1024";
}

export function getPlatformFormat(platform: string) {
  if (platform === "Instagram / Reels") return "vertical";
  if (platform === "Meta Ads") return "portrait";
  return "landscape";
}

export function buildImagePrompt({
  intent, selectedConcept, narrativeStructure, storyContext, purpose, subjectAction, cameraFraming, cameraAngle, lensSuggestion,
  cameraMovement, lighting, locationAndProps, selectedTone, platform, visualBible,
}: ImagePromptInput): string {
  const palette = visualBible.colorPalette.join(", ");
  const continuityLocks = visualBible.continuityLocks.map((lock) => `- ${lock}`).join("\n");
  const aspectRatio = platformImages[platform]?.promptRatio ?? "16:9 landscape";

  return `Create a photorealistic cinematic advertising frame.

Generate exactly one cinematic production frame. No collage, no montage grid, no contact sheet, no split screen, no multi-panel layout, no storyboard sheet.

CREATIVE INTENT
${intent === "performance" ? "Performance advertisement" : "Cinematic story"}

SELECTED CONCEPT
${selectedConcept}

NARRATIVE STRUCTURE
${narrativeStructure}

STORY CONTEXT
${storyContext}

SHOT PURPOSE
${purpose}

SUBJECT
${visualBible.subject}

PRODUCT
${visualBible.product}

LOCATION
${visualBible.location}

ACTION
${subjectAction}

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
${locationAndProps}

COLOR
${palette}

TEXTURE
Natural skin texture.
Real fabric folds.
Physically believable product materials.
${visualBible.texture}
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
