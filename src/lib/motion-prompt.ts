import type { BrandBible, CreativeGrammar, MotionDirection, Shot, VisualBible } from "@/lib/types";

export function resolveProductionContext({ brandProduct, audience, proposition, visualTones, conceptName, conceptIdea, visualBible, brandBible, creativeGrammar }: { brandProduct: string; audience: string; proposition: string; visualTones: string[]; conceptName: string; conceptIdea: string; visualBible: VisualBible; brandBible?: BrandBible; creativeGrammar?: CreativeGrammar }) {
  return {
    brandBible: brandBible ?? { brandName: brandProduct.split(/[—,:]/)[0].trim(), category: "Unspecified", product: brandProduct, audience, singleMindedProposition: proposition, reasonToBelieve: "Use only the supplied product truth", brandPersonality: visualTones, toneOfVoice: visualTones.join(", "), visualLanguage: visualBible.cinematography, brandColors: visualBible.colorPalette, productDesignLocks: [visualBible.product], packagingLocks: [], logoRules: [], characterOrMascotRules: [], thingsBrandWouldDo: [conceptIdea], thingsBrandWouldNeverDo: ["Invent unsupported product claims or official brand assets"] },
    creativeGrammar: creativeGrammar ?? { creativeArchetype: "Concept-led commercial", emotionalArc: conceptIdea, hookMechanism: "Approved opening image", productRevealStrategy: "Follow the approved storyboard", performanceStyle: "Natural, restrained and beat-specific", editingRhythm: "Six purposeful hard cuts across 30 seconds", cameraPhilosophy: visualBible.cinematography, copyDensity: "Low", humourLevel: "As approved in the concept", audioRole: "Support clarity and realism", brandRevealStyle: conceptName, ctaBehaviour: "Restrained final brand frame", platformBehaviour: "Respect the selected platform framing" },
  };
}

export function buildMotionPrompt({ brandBible, creativeGrammar, visualBible, shot }: { brandBible: BrandBible; creativeGrammar: CreativeGrammar; visualBible: VisualBible; shot: Shot }) {
  const motion: MotionDirection = shot.motionDirection ?? {
    startState: shot.visualDescription, endState: shot.subjectAction, startPosition: "Preserve the reference-frame blocking", movementPath: shot.subjectAction,
    endPosition: "Settle into a clean editable composition", subjectMotion: shot.subjectAction, productMotion: "Keep product geometry stable",
    cameraMotion: shot.cameraMovement, environmentMotion: "Only physically motivated ambient movement", focusMotion: "Preserve intentional optical focus",
    motionIntensity: "restrained", performanceBeat: shot.subjectAction, gazeAndExpression: "Natural to the story beat", transitionIntent: "End on a clean cut point",
  };
  return `Animate this approved advertising keyframe as one shot from the same commercial.

PRESERVE
- Exact subject identity: ${visualBible.subject}
- Exact product design: ${visualBible.product}
- Wardrobe, accessories, environment, lighting, colour palette and production design from the reference image.
- Brand product locks: ${brandBible.productDesignLocks.join("; ") || "preserve every visible product detail"}
- Continuity locks: ${visualBible.continuityLocks.join("; ")}

CREATIVE GRAMMAR
${creativeGrammar.creativeArchetype}. ${creativeGrammar.performanceStyle}. ${creativeGrammar.cameraPhilosophy}. Edit rhythm: ${creativeGrammar.editingRhythm}.

START
${motion.startState}
Blocking: ${motion.startPosition}

ANIMATE
Subject: ${motion.subjectMotion}
Performance: ${motion.performanceBeat}; ${motion.gazeAndExpression}
Movement path: ${motion.movementPath}
Product: ${motion.productMotion}
Camera: ${motion.cameraMotion}
Focus: ${motion.focusMotion}
Environment: ${motion.environmentMotion}
Motion intensity: ${motion.motionIntensity}

END
${motion.endState}
End position: ${motion.endPosition}
Edit intent: ${motion.transitionIntent}

DO NOT
- change the face, age, hair, wardrobe, hands, product, packaging, labels, set, lighting or palette
- morph, bend, duplicate, resize or redesign the product
- add people, limbs, fingers, props, text, captions, logos or floating objects
- create impossible physics, random gestures, camera drift, excessive bokeh or arbitrary slow motion
- cut to a new scene or reinterpret the art direction

Believable controlled commercial motion. Preserve the approved first frame exactly at the start.`.slice(0, 1000);
}
