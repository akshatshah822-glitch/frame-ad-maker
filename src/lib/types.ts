export type CreativeIntent = "performance" | "cinematic";

export type Brief = {
  intent: CreativeIntent;
  brandProduct: string;
  audience: string;
  proposition: string;
  platform: string;
  visualTones: string[];
  testObjective?: string;
  testObjectiveOther?: string;
  preserveDetails?: string;
};

export type Concept = {
  conceptName: string;
  idea: string;
  hook: string;
  story: string;
  productRole: string;
  visualWorld: string;
  ending: string;
  creativeMechanism?: string;
  proofMechanism?: string;
  whatThisTests?: string;
  logline?: string;
  humanTruth?: string;
  mainCharacter?: string;
  centralConflict?: string;
  emotionalArc?: string;
  coreMessage?: string;
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

export type BrandBible = {
  brandName: string;
  category: string;
  product: string;
  audience: string;
  singleMindedProposition: string;
  reasonToBelieve: string;
  brandPersonality: string[];
  toneOfVoice: string;
  visualLanguage: string;
  brandColors: string[];
  productDesignLocks: string[];
  packagingLocks: string[];
  logoRules: string[];
  characterOrMascotRules: string[];
  thingsBrandWouldDo: string[];
  thingsBrandWouldNeverDo: string[];
};

export type CreativeGrammar = {
  creativeArchetype: string;
  emotionalArc: string;
  hookMechanism: string;
  productRevealStrategy: string;
  performanceStyle: string;
  editingRhythm: string;
  cameraPhilosophy: string;
  copyDensity: string;
  humourLevel: string;
  audioRole: string;
  brandRevealStyle: string;
  ctaBehaviour: string;
  platformBehaviour: string;
};

export type MotionDirection = {
  startState: string;
  endState: string;
  startPosition: string;
  movementPath: string;
  endPosition: string;
  subjectMotion: string;
  productMotion: string;
  cameraMotion: string;
  environmentMotion: string;
  focusMotion: string;
  motionIntensity: "restrained" | "moderate" | "energetic";
  performanceBeat: string;
  gazeAndExpression: string;
  transitionIntent: string;
};

export type ImageStatus = "pending" | "generating" | "complete" | "failed" | "blocked";

export type AppPhase =
  | "idle"
  | "concepts_generating"
  | "concepts_ready"
  | "storyboard_generating"
  | "images_generating"
  | "storyboard_incomplete"
  | "storyboard_ready"
  | "error";

export type Shot = {
  shotNumber: number;
  sceneNumber?: number;
  narrativeBeat?: string;
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
  productAction?: string;
  performanceDirection?: string;
  focusBehaviour?: string;
  copyOrDialogue?: string;
  audioIntent?: string;
  transitionIntent?: string;
  imagePrompt: string;
  imageStatus: ImageStatus;
  imageUrl?: string;
  imageStorageId?: string;
  imageError?: string;
  motionDirection?: MotionDirection;
};

export type Generation = {
  title: string;
  duration: string;
  visualBible: VisualBible;
  brandBible?: BrandBible;
  creativeGrammar?: CreativeGrammar;
  shots: Shot[];
};

export type VideoClipStatus = "waiting" | "submitted" | "running" | "complete" | "failed" | "cancelled";

export type VideoClip = {
  shotNumber: number;
  jobKey: string;
  status: VideoClipStatus;
  providerTaskId?: string;
  progress?: number;
  motionPrompt: string;
  duration: number;
  videoUrl?: string;
  videoStorageId?: string;
  error?: string;
  failureCode?: string;
  retries: number;
  estimatedCredits?: number;
  finalCredits?: number;
  submittedAt?: number;
  completedAt?: number;
};

export type VideoProductionStatus = "creating" | "generating" | "clips_ready" | "assembling" | "ready" | "partial_failure" | "cancelled" | "failed";

export type VideoProduction = {
  id: string;
  generationId: string;
  status: VideoProductionStatus;
  provider: "runway";
  model: "gen4.5";
  clips: VideoClip[];
  finalVideoUrl?: string;
  finalVideoStorageId?: string;
  technicalQa?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
  clipsReadyAt?: number;
  assemblyStartedAt?: number;
  assemblyPosition?: number;
  assemblyStorageId?: string;
  assemblyUrl?: string;
  assemblyStepDurations?: number[];
  assemblyNarration?: string[];
  assemblyClaimPosition?: number;
  assemblyClaimedAt?: number;
  finalReadyAt?: number;
  totalFinalCredits?: number;
};

export type TreatmentData = {
  id?: string;
  brief: Brief;
  concept: Concept;
  generation: Generation;
};
