export type VisualBible = {
  subject: string;
  product: string;
  location: string;
  colorPalette: string[];
  lighting: string;
  cinematography: string;
  texture: string;
  continuityLocks: string[];
};

export type ImagePromptInput = {
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

const aspectRatios: Record<string, string> = {
  "Instagram / Reels": "9:16 vertical",
  "Meta Ads": "4:5 portrait",
  YouTube: "16:9 landscape",
  "TV / OTT": "16:9 landscape",
};

export function buildImagePrompt({
  storyContext, purpose, subjectAction, cameraFraming, cameraAngle, lensSuggestion,
  cameraMovement, lighting, locationAndProps, selectedTone, platform, visualBible,
}: ImagePromptInput): string {
  const palette = visualBible.colorPalette.join(", ");
  const continuityLocks = visualBible.continuityLocks.map((lock) => `- ${lock}`).join("\n");
  const aspectRatio = aspectRatios[platform] ?? "16:9 landscape";

  return `Create a photorealistic cinematic advertising frame.

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
