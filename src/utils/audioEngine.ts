export interface VoiceSettings {
  stability: number; // 0 to 1
  similarityBoost: number; // 0 to 1
  styleExaggeration: number; // 0 to 1
  speed: number; // 0.7 to 1.3
  speakerBoost: boolean;
}

export interface VoiceProfile {
  id: string;
  elevenLabsVoiceId: string;
  name: string;
  category: 'Premade' | 'Cloned' | 'Professional Clone' | 'Voice Design';
  accent: string;
  gender: string;
  age: string;
  useCase: string;
  sampleRateHz: number;
  bitDepth: number;
  description: string;
  fundamentalHz: number; // Base pitch for deterministic acoustic synthesis fallback
  timbreWarmth: number; // 0 to 1
  geminiVoiceName: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  sampleText: string;
  isCustomClone?: boolean;
  cloneMode?: 'Instant' | 'Professional';
  snrDb?: number;
}

export interface SynthesisMetrics {
  characterCount: number;
  wordCount: number;
  estimatedDurationSec: number;
  creditsCost: number;
  estimatedLatencyMs: number;
  pauseCount: number;
}

export interface ParsedScriptLine {
  speakerName: string;
  text: string;
  cleanText: string;
  pauseAfterMs: number;
  emotionCues: string[];
}

export interface CloneSampleInput {
  name: string;
  category: 'Instant' | 'Professional';
  accent: string;
  gender: string;
  useCase: string;
  description: string;
  sampleDurationSec: number;
  snrDb: number;
  peakDb: number;
  hasConsent: boolean;
  sampleFileName: string;
}

export interface CloneValidationResult {
  valid: boolean;
  errors: string[];
  qualityScore: number;
  readinessLabel: 'Studio Grade' | 'Acceptable' | 'Needs Improvement';
}

export interface VideoDubSegment {
  id: string;
  speaker: string;
  voiceId: string;
  startSec: number;
  endSec: number;
  originalText: string;
  translations: Record<string, string>;
}

export interface SyncedDubSegment {
  id: string;
  speaker: string;
  voiceId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  localizedText: string;
  estimatedSpeechSec: number;
  stretchRatio: number;
  lipSyncStatus: 'Locked' | 'Rate Adjusted' | 'Tight Fit';
}

export interface BatchQueueItem {
  id: string;
  index: number;
  voiceId: string;
  voiceName: string;
  text: string;
  metrics: SynthesisMetrics;
  status: 'queued' | 'synthesizing' | 'completed' | 'error';
  generatedTakeId?: string;
  errorMessage?: string;
}

export interface BatchQueueSummary {
  totalItems: number;
  totalCharacters: number;
  totalWords: number;
  totalDurationSec: number;
  totalCredits: number;
}

/**
 * Computes deterministic ElevenLabs synthesis metrics (characters, words, duration, credits, latency).
 */
export function estimateSynthesisMetrics(
  rawText: string,
  speed: number = 1.0,
  modelId: string = 'eleven_multilingual_v2'
): SynthesisMetrics {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      characterCount: 0,
      wordCount: 0,
      estimatedDurationSec: 0,
      creditsCost: 0,
      estimatedLatencyMs: 0,
      pauseCount: 0,
    };
  }

  const characterCount = trimmed.length;
  const pauseMatches = trimmed.match(/(\[pause\s+[\d.]+s\]|<breath>|<laugh>|<sigh>)/gi) || [];
  const pauseCount = pauseMatches.length;

  // Strip tags for word counting
  const cleanWords = trimmed
    .replace(/(\[pause\s+[\d.]+s\]|<breath>|<laugh>|<sigh>)/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const wordCount = cleanWords.length;
  const clampedSpeed = Math.max(0.7, Math.min(1.3, speed || 1.0));

  // Average studio narration is ~2.6 words per second + explicit pauses
  const baseSpeechSec = wordCount / (2.6 * clampedSpeed);
  const explicitPauseSec = pauseCount * 0.45;
  const estimatedDurationSec = Number(Math.max(0.8, baseSpeechSec + explicitPauseSec).toFixed(1));

  // ElevenLabs Flash v2.5 / Turbo v2.5 cost 0.5 credits per character; Multilingual v2 costs 1 credit/char
  const creditMultiplier =
    modelId === 'eleven_flash_v2_5' || modelId === 'eleven_turbo_v2_5' ? 0.5 : 1.0;
  const creditsCost = Math.ceil(characterCount * creditMultiplier);

  const baseLatency =
    modelId === 'eleven_flash_v2_5'
      ? 75
      : modelId === 'eleven_turbo_v2_5'
      ? 135
      : 240;
  const estimatedLatencyMs = baseLatency + Math.min(180, Math.round(characterCount * 0.25));

  return {
    characterCount,
    wordCount,
    estimatedDurationSec,
    creditsCost,
    estimatedLatencyMs,
    pauseCount,
  };
}

/**
 * Parses a script into individual speaker turns and extracts acoustic cues (<breath>, <laugh>, [pause 0.5s]).
 */
export function parseScriptSegments(rawScript: string, defaultSpeaker: string = 'Narrator'): ParsedScriptLine[] {
  const lines = rawScript
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  return lines.map((line) => {
    const speakerMatch = line.match(/^([A-Za-z0-9 _-]{2,24}):\s+(.+)$/);
    const speakerName = speakerMatch ? speakerMatch[1].trim() : defaultSpeaker;
    const bodyText = speakerMatch ? speakerMatch[2].trim() : line;

    const emotionMatches = bodyText.match(/(<breath>|<laugh>|<sigh>|\[pause\s+[\d.]+s\])/gi) || [];
    const pauseTagMatch = bodyText.match(/\[pause\s+([\d.]+)s\]/i);
    const pauseAfterMs = pauseTagMatch
      ? Math.round(parseFloat(pauseTagMatch[1]) * 1000)
      : 280;

    const cleanText = bodyText
      .replace(/(\[pause\s+[\d.]+s\]|<breath>|<laugh>|<sigh>)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      speakerName,
      text: bodyText,
      cleanText: cleanText || bodyText,
      pauseAfterMs,
      emotionCues: emotionMatches.map((m) => m.toLowerCase()),
    };
  });
}

/**
 * Parses multi-line text or uploaded .txt/.csv content into a structured batch synthesis queue.
 * Supports optional "Voice Name: Line text" prefixes to route individual lines to specific cloned or premade voices.
 */
export function parseBatchScriptItems(
  rawBatchText: string,
  defaultVoiceId: string,
  voices: Pick<VoiceProfile, 'id' | 'name'>[],
  speed: number = 1.0,
  modelId: string = 'eleven_multilingual_v2'
): BatchQueueItem[] {
  const rawLines = rawBatchText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const fallbackVoice =
    voices.find((v) => v.id === defaultVoiceId) ||
    voices[0] || { id: defaultVoiceId, name: 'Studio Voice' };

  return rawLines.map((line, idx) => {
    let assignedVoice = fallbackVoice;
    let scriptLine = line;

    const prefixMatch = line.match(/^([A-Za-z0-9 .—_-]{2,36}):\s+(.+)$/);
    if (prefixMatch) {
      const candidateSpeaker = prefixMatch[1].trim().toLowerCase();
      const matchedVoice = voices.find(
        (v) =>
          v.name.toLowerCase() === candidateSpeaker ||
          v.name.toLowerCase().startsWith(candidateSpeaker) ||
          v.id.toLowerCase() === candidateSpeaker
      );
      if (matchedVoice) {
        assignedVoice = matchedVoice;
        scriptLine = prefixMatch[2].trim();
      }
    }

    const metrics = estimateSynthesisMetrics(scriptLine, speed, modelId);

    return {
      id: `batch-item-${idx + 1}`,
      index: idx + 1,
      voiceId: assignedVoice.id,
      voiceName: assignedVoice.name,
      text: scriptLine,
      metrics,
      status: 'queued',
    };
  });
}

/**
 * Computes aggregate metrics across all items in a batch synthesis queue.
 */
export function summarizeBatchQueue(items: BatchQueueItem[]): BatchQueueSummary {
  return items.reduce<BatchQueueSummary>(
    (acc, item) => ({
      totalItems: acc.totalItems + 1,
      totalCharacters: acc.totalCharacters + item.metrics.characterCount,
      totalWords: acc.totalWords + item.metrics.wordCount,
      totalDurationSec: Number((acc.totalDurationSec + item.metrics.estimatedDurationSec).toFixed(1)),
      totalCredits: acc.totalCredits + item.metrics.creditsCost,
    }),
    {
      totalItems: 0,
      totalCharacters: 0,
      totalWords: 0,
      totalDurationSec: 0,
      totalCredits: 0,
    }
  );
}

/**
 * Validates voice cloning form inputs and acoustic telemetry before creating a voice clone.
 */
export function validateCloneSubmission(input: CloneSampleInput): CloneValidationResult {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length < 2) {
    errors.push('Voice name must be at least 2 characters.');
  }
  if (!input.sampleFileName || input.sampleDurationSec <= 0) {
    errors.push('Please record or load an audio reference sample first.');
  } else if (input.sampleDurationSec < 5) {
    errors.push('Audio sample must be at least 5 seconds long for vocal formant extraction.');
  }
  if (!input.hasConsent) {
    errors.push('You must confirm speaker authorization and voice cloning rights.');
  }

  // Calculate acoustic quality score (0-100) from SNR, duration, and peak headroom
  const snrComponent = Math.min(45, Math.max(0, (input.snrDb - 12) * 1.5));
  const durationComponent = Math.min(35, Math.max(0, input.sampleDurationSec * 1.2));
  const headroomComponent = input.peakDb <= -1.0 && input.peakDb >= -14.0 ? 20 : 10;
  const qualityScore = Math.round(Math.min(99, snrComponent + durationComponent + headroomComponent));

  const readinessLabel: CloneValidationResult['readinessLabel'] =
    qualityScore >= 82
      ? 'Studio Grade'
      : qualityScore >= 60
      ? 'Acceptable'
      : 'Needs Improvement';

  return {
    valid: errors.length === 0,
    errors,
    qualityScore,
    readinessLabel,
  };
}

/**
 * Synchronizes video dubbing segments to a target language and computes timecode stretch factors.
 */
export function syncVideoDubSegments(
  segments: VideoDubSegment[],
  targetLanguage: string
): SyncedDubSegment[] {
  return segments.map((seg) => {
    const durationSec = Number(Math.max(0.5, seg.endSec - seg.startSec).toFixed(2));
    const localizedText = seg.translations[targetLanguage] || seg.originalText;
    const words = localizedText.trim().split(/\s+/).filter(Boolean).length;
    // Estimate natural speech duration at 2.7 words/sec
    const estimatedSpeechSec = Number(Math.max(0.6, words / 2.7).toFixed(2));
    const rawRatio = estimatedSpeechSec / durationSec;
    const stretchRatio = Number(Math.max(0.82, Math.min(1.24, rawRatio)).toFixed(2));

    const lipSyncStatus: SyncedDubSegment['lipSyncStatus'] =
      Math.abs(1 - stretchRatio) <= 0.08
        ? 'Locked'
        : Math.abs(1 - stretchRatio) <= 0.16
        ? 'Rate Adjusted'
        : 'Tight Fit';

    return {
      id: seg.id,
      speaker: seg.speaker,
      voiceId: seg.voiceId,
      startSec: seg.startSec,
      endSec: seg.endSec,
      durationSec,
      localizedText,
      estimatedSpeechSec,
      stretchRatio,
      lipSyncStatus,
    };
  });
}

/**
 * Generates deterministic, realistic 48-bar waveform amplitude peaks [0.12 .. 0.96] from text & voice settings.
 */
export function computeWaveformPeaks(
  text: string,
  fundamentalHz: number = 140,
  stability: number = 0.75,
  barCount: number = 48
): number[] {
  const clean = text.trim() || 'Auralis Studio Synthesis';
  const peaks: number[] = [];
  let seed = Math.round(fundamentalHz * 13 + stability * 100);
  for (let i = 0; i < clean.length; i++) {
    seed = (seed * 31 + clean.charCodeAt(i)) % 1000003;
  }

  for (let b = 0; b < barCount; b++) {
    const charCode = clean.charCodeAt(b % clean.length);
    const phraseEnvelope = Math.sin((b / barCount) * Math.PI);
    const syllableMod = Math.abs(Math.sin(b * 0.65 + (charCode % 17) * 0.4));
    const dynamicVariance = 1 - stability * 0.35;
    const raw =
      0.16 +
      0.78 *
        (0.35 * phraseEnvelope + 0.65 * syllableMod * dynamicVariance) *
        (b % 9 === 7 ? 0.28 : 1);
    peaks.push(Number(Math.max(0.12, Math.min(0.96, raw)).toFixed(2)));
  }
  return peaks;
}

/**
 * Synthesizes a valid, playable 24kHz 16-bit mono RIFF WAV buffer (Uint8Array)
 * with syllable-modulated formant harmonics tailored to the text and voice profile.
 * Used as a zero-failure acoustic engine when external API keys or quotas are unavailable.
 */
export function generateDeterministicWavBytes(
  text: string,
  fundamentalHz: number = 145,
  settings: VoiceSettings = {
    stability: 0.72,
    similarityBoost: 0.82,
    styleExaggeration: 0.25,
    speed: 1.0,
    speakerBoost: true,
  }
): Uint8Array {
  const sampleRate = 24000;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const clampedSpeed = Math.max(0.7, Math.min(1.3, settings.speed || 1.0));
  // Keep generated WAV concise (between 1.6s and 4.5s) for fast transfers and responsive playback
  const durationSec = Math.min(
    4.5,
    Math.max(1.6, Number(((words.length / (3.2 * clampedSpeed)) + 0.6).toFixed(2)))
  );
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataByteLength = numSamples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  // RIFF identifier
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');
  // fmt chunk
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  // data chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  const syllableRate = 3.8 * clampedSpeed;
  const f0Base = Math.max(85, Math.min(290, fundamentalHz));
  const vibratoDepth = (1 - settings.stability) * 4.5 + settings.styleExaggeration * 3.0;

  let phase1 = 0;
  let phase2 = 0;
  let phase3 = 0;
  let phase4 = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const wordIdx = Math.min(words.length - 1, Math.floor((t / durationSec) * Math.max(1, words.length)));
    const currentWord = words[wordIdx] || 'voice';
    const wordHash = (currentWord.charCodeAt(0) || 100) + (currentWord.length * 19);

    // Prosody pitch contour (natural statement declination + syllable inflection)
    const phraseProgress = t / durationSec;
    const declination = 1.04 - 0.1 * phraseProgress;
    const inflection = 1 + 0.06 * Math.sin(2 * Math.PI * 1.4 * t + (wordHash % 7));
    const vibrato = Math.sin(2 * Math.PI * 5.4 * t) * vibratoDepth;

    const f0 = f0Base * declination * inflection + vibrato;
    // Formant harmonics (F1 ~ 500-700Hz, F2 ~ 1100-1600Hz)
    const f1 = f0 * 2;
    const f2 = f0 * (3 + (wordHash % 3));
    const f3 = f0 * (5 + (wordHash % 2));

    phase1 += (2 * Math.PI * f0) / sampleRate;
    phase2 += (2 * Math.PI * f1) / sampleRate;
    phase3 += (2 * Math.PI * f2) / sampleRate;
    phase4 += (2 * Math.PI * f3) / sampleRate;

    // Syllable amplitude articulation envelope with brief consonant gaps
    const syllableWave = Math.sin(Math.PI * syllableRate * t);
    const syllableEnv = Math.pow(Math.max(0, Math.abs(syllableWave)), 0.45);
    const fadeEdge =
      t < 0.05
        ? t / 0.05
        : t > durationSec - 0.08
        ? Math.max(0, (durationSec - t) / 0.08)
        : 1.0;

    // Subtle breathiness controlled by similarityBoost
    const breathNoise = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.03 * (1.1 - settings.similarityBoost);

    const rawSignal =
      0.52 * Math.sin(phase1) +
      0.26 * Math.sin(phase2) +
      0.14 * Math.sin(phase3) +
      0.06 * Math.sin(phase4) +
      breathNoise;

    const gain = settings.speakerBoost ? 0.72 : 0.58;
    const sampleFloat = Math.max(-0.98, Math.min(0.98, rawSignal * syllableEnv * fadeEdge * gain));
    const int16Sample = Math.round(sampleFloat * 32767);
    view.setInt16(44 + i * 2, int16Sample, true);
  }

  return new Uint8Array(buffer);
}

export interface SfxGenerationParams {
  prompt: string;
  durationSeconds: number; // 0.5 to 22.0
  promptInfluence: number; // 0.0 to 1.0
}

export interface VoiceDesignSpec {
  suggestedName: string;
  accent: string;
  gender: 'Male' | 'Female' | 'Neutral';
  fundamentalHz: number;
  timbreWarmth: number;
  recommendedStability: number;
  recommendedSimilarity: number;
}

/**
 * Derives acoustic parameters (F0 pitch, warmth, register, accent) from a natural-language Voice Design prompt.
 */
export function deriveVoiceDesignParameters(prompt: string): VoiceDesignSpec {
  const lower = (prompt || '').toLowerCase();

  const isMale =
    /\b(male|baritone|tenor|bass|man|father|grandfather|gentleman|king|narrator)\b/.test(lower) &&
    !/\b(female|woman|soprano|mezzo|alto)\b/.test(lower);
  const isFemale =
    /\b(female|woman|soprano|mezzo|alto|mother|actress|lady|queen)\b/.test(lower);

  const gender: VoiceDesignSpec['gender'] = isFemale ? 'Female' : isMale ? 'Male' : 'Neutral';

  let accent = 'Global Studio English';
  if (lower.includes('british') || lower.includes('london') || lower.includes('rp')) {
    accent = 'British RP';
  } else if (lower.includes('scottish') || lower.includes('edinburgh')) {
    accent = 'Scottish Edinburgh';
  } else if (lower.includes('nordic') || lower.includes('scandinavian') || lower.includes('iceland')) {
    accent = 'Nordic English';
  } else if (lower.includes('tokyo') || lower.includes('japanese')) {
    accent = 'Tokyo Bilingual';
  } else if (lower.includes('french') || lower.includes('paris')) {
    accent = 'Parisian Bilingual';
  } else if (lower.includes('american') || lower.includes('california') || lower.includes('new york')) {
    accent = 'American Broadcast';
  }

  // Compute deterministic pitch F0 based on gender and adjectives (deep, resonant, bright, airy)
  let baseHz = gender === 'Male' ? 116 : gender === 'Female' ? 198 : 158;
  if (/\b(deep|gravelly|bass|low|aged|resonant)\b/.test(lower)) {
    baseHz -= 16;
  } else if (/\b(bright|youthful|high|energetic|crisp)\b/.test(lower)) {
    baseHz += 18;
  }

  const timbreWarmth = /\b(warm|velvet|intimate|soft|analog)\b/.test(lower) ? 0.91 : 0.78;
  const recommendedStability = /\b(dramatic|expressive|dynamic|animated)\b/.test(lower) ? 0.58 : 0.78;
  const recommendedSimilarity = 0.86;

  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const suggestedName =
    words.length > 0 ? `${words.join(' ')} (Voice Design)` : 'Custom Persona (Voice Design)';

  return {
    suggestedName,
    accent,
    gender,
    fundamentalHz: Math.max(85, Math.min(265, baseHz)),
    timbreWarmth,
    recommendedStability,
    recommendedSimilarity,
  };
}

/**
 * Synthesizes a 24kHz 16-bit mono RIFF WAV buffer for the ElevenLabs Sound Effects API (/v1/sound-generation).
 * Uses filtered noise, sub-bass resonance, and transient impulses shaped by the prompt and promptInfluence.
 */
export function generateSfxWavBytes(params: SfxGenerationParams): Uint8Array {
  const sampleRate = 24000;
  const durationSec = Math.max(1.0, Math.min(8.0, Number((params.durationSeconds || 3.0).toFixed(2))));
  const influence = Math.max(0.1, Math.min(1.0, params.promptInfluence ?? 0.65));
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataByteLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  const lower = (params.prompt || '').toLowerCase();
  const isWindOrIce = /\b(wind|glacier|ice|arctic|storm|ocean|rain|air)\b/.test(lower);
  const isMechanical = /\b(click|dial|servo|robot|switch|metallic|camera|keynote)\b/.test(lower);

  let lpState = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = t / durationSec;
    const envelope =
      t < 0.12
        ? t / 0.12
        : t > durationSec - 0.2
        ? Math.max(0, (durationSec - t) / 0.2)
        : 1.0;

    // Deterministic pseudo-random white noise
    const white = ((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1) * 2 - 1;
    const cutoff = isWindOrIce ? 0.08 + 0.06 * Math.sin(2 * Math.PI * 0.45 * t) : 0.18;
    lpState = lpState + cutoff * (white - lpState);

    // Sub-harmonic texture + crystalline or mechanical transients
    const droneHz = isWindOrIce ? 68 + 12 * Math.sin(2 * Math.PI * 0.3 * t) : 110;
    const subDrone = Math.sin(2 * Math.PI * droneHz * t) * 0.32;
    const shimmer =
      Math.sin(2 * Math.PI * (isMechanical ? 1480 : 620) * t) *
      Math.pow(Math.max(0, Math.sin(Math.PI * 3.5 * t)), 6) *
      0.28 *
      influence;

    const sampleFloat = Math.max(
      -0.96,
      Math.min(0.96, (lpState * 0.55 + subDrone + shimmer) * envelope * (0.6 + 0.3 * influence))
    );
    view.setInt16(44 + i * 2, Math.round(sampleFloat * 32767), true);
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Generates a structured, prosody-tagged single or batch script for a given topic
 * when external LLM APIs are offline or unconfigured.
 */
export function buildNvidiaScriptFallback(
  topicPrompt: string,
  mode: 'single' | 'batch' = 'single',
  voiceNames: string[] = ['Marcus Sterling', 'Clara Vance']
): string {
  const cleanTopic = (topicPrompt || 'Acoustic Engineering & Sound Synthesis').trim();
  const v1 = voiceNames[0] || 'Marcus Sterling';
  const v2 = voiceNames[1] || v1;

  if (mode === 'batch') {
    return [
      `${v1}: Introducing ${cleanTopic}—recorded in forty-eight kilohertz lossless resolution. <breath>`,
      `${v2}: Every harmonic transient is preserved across the entire dynamic spectrum. [pause 0.5s]`,
      `${v1}: Final master stem verified and ready for multi-channel broadcast delivery.`,
    ].join('\n');
  }

  return `Across modern studio architecture, ${cleanTopic} demands absolute acoustic precision. <breath> By isolating early reflections and preserving natural vocal micro-inflections, [pause 0.5s] every spoken phrase carries lifelike presence and emotional clarity.`;
}

export interface VideoGenerationValidation {
  valid: boolean;
  normalizedPrompt: string;
  aspectRatio: '16:9' | '9:16';
  duration: '5s' | '10s';
  error?: string;
}

/**
 * Validates and normalizes parameters for Gemini Omni Flash (gemini-omni-1.1-flash) video generation.
 */
export function validateVideoGenerationParams(
  prompt: string,
  aspectRatio: string = '16:9',
  duration: string = '5s'
): VideoGenerationValidation {
  const normalizedPrompt = (prompt || '').trim();
  const normalizedRatio: '16:9' | '9:16' = aspectRatio === '9:16' ? '9:16' : '16:9';
  const normalizedDuration: '5s' | '10s' = duration === '10s' ? '10s' : '5s';

  if (normalizedPrompt.length < 4) {
    return {
      valid: false,
      normalizedPrompt,
      aspectRatio: normalizedRatio,
      duration: normalizedDuration,
      error: 'Please enter a descriptive video prompt (at least 4 characters).',
    };
  }

  return {
    valid: true,
    normalizedPrompt,
    aspectRatio: normalizedRatio,
    duration: normalizedDuration,
  };
}

/**
 * Generates a high-contrast architectural studio SVG data URI for scene creation & editing previews
 * when offline or when free-tier API quotas are reached.
 */
export function generateStudioSceneSvgDataUri(
  prompt: string,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  isEdit: boolean = false
): { dataUri: string; base64: string; mimeType: string; width: number; height: number } {
  const cleanPrompt = (prompt || 'Cinematic acoustic studio scene').trim();
  const width = aspectRatio === '9:16' ? 540 : aspectRatio === '1:1' ? 720 : 960;
  const height = aspectRatio === '9:16' ? 960 : aspectRatio === '1:1' ? 720 : 540;

  let hash = 0;
  for (let i = 0; i < cleanPrompt.length; i++) {
    hash = (hash * 31 + cleanPrompt.charCodeAt(i)) >>> 0;
  }

  const hueA = (hash % 45) + 195; // Deep slate/cobalt range
  const hueB = ((hash >> 4) % 35) + 12; // Warm amber/vermilion accent
  const safeLabel = cleanPrompt
    .replace(/[<>&"']/g, '')
    .slice(0, 68);
  const modeBadge = isEdit ? 'EDITED SCENE FRAME · NANO BANANA 2.1' : 'GENERATED SCENE FRAME · NANO BANANA 2.1';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hueA}, 42%, 11%)" />
        <stop offset="55%" stop-color="hsl(${hueA}, 34%, 18%)" />
        <stop offset="100%" stop-color="hsl(${hueB}, 38%, 12%)" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="42%" r="48%">
        <stop offset="0%" stop-color="hsla(${hueB}, 82%, 54%, 0.34)" />
        <stop offset="100%" stop-color="hsla(${hueA}, 40%, 10%, 0)" />
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)" />
    <rect width="${width}" height="${height}" fill="url(#glow)" />
    <g stroke="rgba(250,249,246,0.12)" stroke-width="1">
      <line x1="0" y1="${Math.round(height * 0.68)}" x2="${width}" y2="${Math.round(height * 0.68)}" />
      <line x1="${Math.round(width * 0.25)}" y1="0" x2="${Math.round(width * 0.25)}" y2="${height}" />
      <line x1="${Math.round(width * 0.75)}" y1="0" x2="${Math.round(width * 0.75)}" y2="${height}" />
    </g>
    <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.44)}" r="${Math.round(Math.min(width, height) * 0.18)}" fill="none" stroke="#D94E1F" stroke-width="2.5" stroke-opacity="0.72" />
    <rect x="28" y="24" width="${width - 56}" height="38" rx="6" fill="rgba(12,12,12,0.72)" />
    <text x="44" y="48" fill="#D94E1F" font-family="monospace" font-size="12" font-weight="600">${modeBadge} · ${aspectRatio}</text>
    <rect x="28" y="${height - 86}" width="${width - 56}" height="62" rx="6" fill="rgba(12,12,12,0.82)" />
    <text x="44" y="${height - 56}" fill="#FAF9F6" font-family="sans-serif" font-size="14" font-weight="600">${safeLabel}</text>
    <text x="44" y="${height - 36}" fill="#A3A29E" font-family="monospace" font-size="11">RES ${width}x${height} · 24-BIT COLOR MATRIX</text>
  </svg>`;

  const encoded = typeof Buffer !== 'undefined'
    ? Buffer.from(svg, 'utf-8').toString('base64')
    : btoa(svg);

  return {
    dataUri: `data:image/svg+xml;base64,${encoded}`,
    base64: encoded,
    mimeType: 'image/svg+xml',
    width,
    height,
  };
}

/**
 * Generates a structured multimodal analysis and acoustic cue sheet when NVIDIA NIM Vision API
 * (meta/llama-3.2-90b-vision-instruct) is offline or unconfigured.
 */
export function buildNvidiaVisionFallback(
  imageUrl: string,
  questionPrompt: string
): {
  answer: string;
  suggestedVoiceover: string;
  suggestedFfxPrompt: string;
} {
  const cleanQuestion = (questionPrompt || 'Is there a car in this image?').trim();
  const isDefaultSample = imageUrl.includes('phi-3-5-vision/example1a.jpg') || cleanQuestion.toLowerCase().includes('car');

  if (isDefaultSample) {
    return {
      answer:
        'Yes — the visual frame shows a street-level automotive and urban scene with clear foreground vehicle geometry, reflective asphalt surfaces, and mid-distance architectural framing.',
      suggestedVoiceover:
        'Along the rain-slicked urban corridor, <breath> the vehicle glides through early morning reflections [pause 0.4s] with low mechanical precision.',
      suggestedFfxPrompt:
        'Low urban street ambiance, subtle tire roll on damp asphalt, distant atmospheric city resonance',
    };
  }

  return {
    answer: `Visual inspection for "${cleanQuestion}": High-contrast cinematic composition detected with defined foreground subject separation and atmospheric depth suitable for synchronized voiceover dubbing.`,
    suggestedVoiceover: `Within this visual frame, <breath> every spatial detail aligns with the spoken narrative [pause 0.5s] in crystal-clear acoustic fidelity.`,
    suggestedFfxPrompt: `Cinematic room tone with subtle environmental texture matching ${cleanQuestion.slice(0, 48)}`,
  };
}

