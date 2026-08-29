export type Brief = {
  brandProduct: string;
  audience: string;
  proposition: string;
  platform: string;
  visualTones: string[];
};

export type Concept = {
  conceptName: string;
  idea: string;
  hook: string;
  story: string;
  productRole: string;
  visualWorld: string;
  ending: string;
};

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

export type ImageStatus = "pending" | "generating" | "complete" | "failed";

export type AppPhase =
  | "idle"
  | "concepts_generating"
  | "concepts_ready"
  | "storyboard_generating"
  | "images_generating"
  | "storyboard_ready"
  | "error";

export type Shot = {
  shotNumber: number;
  startTime: number;
  endTime: number;
  purpose: string;
  displayVisual?: string;
  displayCamera?: string;
  displayAction?: string;
  visualDescription: string;
  subjectAction: string;
  cameraFraming: string;
  cameraAngle: string;
  lensSuggestion: string;
  cameraMovement: string;
  lighting: string;
  audio: string;
  voiceoverOrDialogue: string;
  productPresence: string;
  locationAndProps: string;
  imagePrompt: string;
  imageStatus: ImageStatus;
  imageUrl?: string;
  imageStorageId?: string;
  imageError?: string;
};

export type Generation = {
  title: string;
  duration: string;
  visualBible: VisualBible;
  shots: Shot[];
};

export type TreatmentData = {
  id?: string;
  brief: Brief;
  concept: Concept;
  generation: Generation;
};
