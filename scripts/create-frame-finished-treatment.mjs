import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convex = new ConvexHttpClient("https://valiant-cod-559.convex.cloud");
const imagePaths = process.argv.slice(2);
if (imagePaths.length !== 6) throw new Error("Pass exactly six keyframe paths");

async function upload(path) {
  const uploadUrl = await convex.mutation(api.generations.generateImageUploadUrl, {});
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: await readFile(path) });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  const { storageId } = await response.json();
  return { storageId, imageUrl: await convex.query(api.generations.getImageUrl, { storageId }) };
}

const assets = [];
for (const path of imagePaths) assets.push(await upload(path));
const voiceovers = [
  "Every great ad starts with one clear line.",
  "Type it into FRAME, and the idea takes shape.",
  "A visual world forms, coherent down to every detail.",
  "Six directed shots become one story, not six guesses.",
  "Then every frame moves, cuts, and lands with purpose.",
  "One line in. Thirty seconds later, your finished film.",
];
const visuals = [
  "A warm-olive hand presses the coral key on the matte navy creative console.",
  "The same hand lifts as three blank cinematic tiles rise from the console.",
  "Six tiles reveal one coherent coral-object visual world above the console.",
  "Six sequential tiles show one exact object progressing through a directed story.",
  "One hero tile isolates the exact coral object in its finished visual world.",
  "The console presents the resolved film frame with six aligned frame markers.",
];
const motions = [
  ["Finger poised above the coral key", "Finger settles on the fully depressed key", "The index finger presses once at a restrained pace", "The console remains completely fixed", "slow push-in", "locked", "restrained", "quiet confidence"],
  ["Hand just above the pressed key; tiles flush with console", "Hand clear of console; three tiles upright", "The hand withdraws slowly", "Three tiles rise in one smooth precise motion", "locked-off", "locked", "restrained", "calm reveal"],
  ["Six tiles dim and aligned", "Six tiles softly illuminated", "No human subject", "The six tiles brighten in sequence without changing position", "slow lateral slider", "gentle rack across the grid", "restrained", "intelligent formation"],
  ["Camera aligned with first tile", "Camera aligned with sixth tile", "No human subject", "Tiles remain fixed and the coral object remains identical", "slow left-to-right tracking move", "deep enough to preserve all tiles", "moderate", "directed progression"],
  ["Highlight begins on left edge of coral object", "Highlight resolves on right curve", "No human subject", "A narrow highlight travels across the object without deformation", "controlled orbit of only a few degrees", "focus locked on object", "restrained", "premium hero reveal"],
  ["Six markers slightly separated", "Six markers precisely aligned around hero frame", "No human subject", "The six markers settle into exact alignment", "slow pullback", "locked on hero frame", "restrained", "resolved completion"],
];
const shots = assets.map((asset, index) => {
  const start = index * 5; const m = motions[index];
  return { shotNumber: index + 1, startTime: start, endTime: start + 5, purpose: ["HOOK","TENSION","PRODUCT","PROOF / ESCALATION","PAYOFF","BRAND ENDING"][index], displayVisual: visuals[index], displayCamera: index === 0 ? "50mm close product view · slow push-in" : "50mm normal perspective · one restrained move", displayAction: visuals[index], visualDescription: visuals[index], subjectAction: visuals[index], cameraFraming: "Vertical close product composition", cameraAngle: "Three-quarter eye-level", lensSuggestion: "50mm normal-lens perspective", cameraMovement: m[4], lighting: "Soft window light from frame left, restrained contrast", audio: "Restrained tactile pulse and subtle interface accent", voiceoverOrDialogue: voiceovers[index], productPresence: "The identical matte navy creative console remains visible and unchanged", locationAndProps: "Ivory desk and ivory architectural background; no additional props", imagePrompt: "Generated from locked FRAME visual system; no text or logos", imageStatus: "complete", imageUrl: asset.imageUrl, imageStorageId: asset.storageId, motionDirection: { startState: m[0], endState: m[1], startPosition: "Console fixed on ivory desk", movementPath: "Single direct path only", endPosition: "Console remains fixed", subjectMotion: m[2], productMotion: m[3], cameraMotion: m[4], environmentMotion: "Only soft window-light drift", focusMotion: m[5], motionIntensity: m[6], performanceBeat: m[7], gazeAndExpression: "No visible speaking face", transitionIntent: index === 5 ? "Resolve cleanly for render-layer end copy" : "Clean hard cut to next beat" } };
});
const concept = { conceptName: "One Line. Finished Film.", idea: "A single input transforms into a complete cinematic film system.", hook: "One coral key waits beneath a poised hand.", story: "One line enters. Ideas form. A visual world locks. Six shots become one moving film.", productRole: "FRAME is the transformation engine and the proof.", visualWorld: "Ivory studio surfaces, matte navy console, coral action and cobalt structure.", ending: "The finished frame resolves above the console." };
const visualBible = { subject: "One right hand belonging to a 32-year-old person, warm olive skin, short clean natural nails, slim matte silver ring on index finger, sand-colored ribbed knit cuff.", product: "Unbranded matte navy rectangular creative console with recessed ivory field, one coral key, four cobalt keys and one dark round control.", location: "Minimal ivory desk against ivory architectural planes.", colorPalette: ["ivory","matte navy","coral","cobalt"], lighting: "Soft window light from frame left with restrained contrast.", cinematography: "Vertical 50mm normal-lens perspective, natural depth of field, one restrained move per shot.", texture: "Matte powder-coated console, ceramic coral object, natural skin and fine film grain.", continuityLocks: ["Exact console shape and controls","Exact hand, ring and cuff","Ivory/navy/coral/cobalt only","Light always from frame left","50mm lens language","No generated text or logos"] };
const generationId = await convex.mutation(api.generations.save, { brandProduct: "FRAME — AI Creative Director", audience: "Brand teams who need a finished advertisement quickly", proposition: "Type one line and get the finished film, not a plan for one.", platform: "Instagram / Reels", visualTones: ["Cinematic","Minimal","Bold"], selectedConcept: JSON.stringify(concept), visualBible: JSON.stringify(visualBible), title: concept.conceptName, shotList: JSON.stringify(shots) });
console.log(generationId);
