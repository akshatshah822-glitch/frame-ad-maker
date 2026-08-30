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
  const compact = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);
  return `REFERENCE FRAME IS AUTHORITATIVE. Frame zero must match it exactly: same composition, crop, subject, product, face, hands, wardrobe, set, props, lighting, palette and focus. Do not redesign or reinterpret anything.

LOCK SUBJECT: ${compact(visualBible.subject, 150)}
LOCK PRODUCT: ${compact(brandBible.productDesignLocks.join("; ") || visualBible.product, 170)}
LOCK CONTINUITY: ${compact(visualBible.continuityLocks.join("; "), 150)}
STYLE: ${compact(creativeGrammar.cameraPhilosophy, 80)}

ANIMATE ONLY
Subject: ${compact(motion.subjectMotion, 120)}
Product: ${compact(motion.productMotion, 90)}
Camera: ${compact(motion.cameraMotion, 80)}
Focus/environment: ${compact(`${motion.focusMotion}; ${motion.environmentMotion}`, 100)}
Intensity: ${compact(motion.motionIntensity, 40)}

Keep motion restrained and physically believable. One continuous shot. No cuts, new scene, extra people or objects, identity change, product morphing, text, logos, random gestures, camera drift or impossible physics. End: ${compact(motion.endState, 100)}`.slice(0, 1000);
}
