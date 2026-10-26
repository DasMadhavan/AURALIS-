import { VoiceProfile, VideoDubSegment } from '../utils/audioEngine';

export interface SynthesisModel {
  id: 'eleven_multilingual_v2' | 'eleven_flash_v2_5' | 'eleven_turbo_v2_5';
  name: string;
  tagline: string;
  languagesCount: number;
  latencyMs: number;
  creditRateLabel: string;
  description: string;
}

export const ELEVENLABS_MODELS: SynthesisModel[] = [
  {
    id: 'eleven_multilingual_v2',
    name: 'Eleven Multilingual v2',
    tagline: 'Highest emotional range & prosody fidelity',
    languagesCount: 29,
    latencyMs: 240,
    creditRateLabel: '1.0 credit / char',
    description: 'Flagship acoustic foundation model engineered for long-form audiobooks, cinema narration, and nuanced character performance.',
  },
  {
    id: 'eleven_flash_v2_5',
    name: 'Eleven Flash v2.5',
    tagline: 'Ultra-low 75ms latency across 32 languages',
    languagesCount: 32,
    latencyMs: 75,
    creditRateLabel: '0.5 credits / char',
    description: 'High-speed conversational synthesis built for real-time interactive voice agents and instant preview passes.',
  },
  {
    id: 'eleven_turbo_v2_5',
    name: 'Eleven Turbo v2.5',
    tagline: 'Balanced studio quality & low-latency dubbing',
    languagesCount: 32,
    latencyMs: 135,
    creditRateLabel: '0.5 credits / char',
    description: 'Tuned for multi-speaker broadcast localization, automated video dubbing, and rapid content pipelines.',
  },
];

export const INITIAL_VOICES: VoiceProfile[] = [
  {
    id: 'voice-marcus',
    elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb', // George / Documentary baritone ID
    name: 'Marcus Sterling',
    category: 'Premade',
    accent: 'British RP',
    gender: 'Male',
    age: 'Middle-aged',
    useCase: 'Documentary & Cinema',
    sampleRateHz: 48000,
    bitDepth: 24,
    description: 'Resonant baritone with subtle chest warmth and deliberate natural breathing pauses for natural history and film narration.',
    fundamentalHz: 118,
    timbreWarmth: 0.88,
    geminiVoiceName: 'Charon',
    sampleText: 'Beneath three hundred meters of Arctic glacial ice lies a preserved acoustic archive of Earth’s pre-industrial atmosphere.',
    snrDb: 42.5,
  },
  {
    id: 'voice-clara',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah / Editorial ID
    name: 'Clara Vance',
    category: 'Premade',
    accent: 'American Neutral',
    gender: 'Female',
    age: 'Young Adult',
    useCase: 'Audiobooks & Editorial',
    sampleRateHz: 48000,
    bitDepth: 24,
    description: 'Crisp, intimate mezzo-soprano crafted for long-form journalism essays, literary fiction, and executive keynotes.',
    fundamentalHz: 196,
    timbreWarmth: 0.79,
    geminiVoiceName: 'Kore',
    sampleText: 'Every architectural space carries its own reverberation signature—a fingerprint of timber, glass, and human presence.',
    snrDb: 44.1,
  },
  {
    id: 'voice-sora',
    elevenLabsVoiceId: 'XrExE9yKIg1WjnnlVkGX', // Matilda / Global localization
    name: 'Sora Takahashi',
    category: 'Professional Clone',
    accent: 'Tokyo Bilingual',
    gender: 'Female',
    age: 'Adult',
    useCase: 'Video Dubbing & Commercial',
    sampleRateHz: 48000,
    bitDepth: 24,
    description: 'High-clarity studio clone captured in an anechoic vocal booth, optimized for cross-lingual video dubbing and technical product films.',
    fundamentalHz: 214,
    timbreWarmth: 0.74,
    geminiVoiceName: 'Zephyr',
    sampleText: 'Precision optical sensors calibrate twenty-four thousand times per second, adapting seamlessly to shifting ambient light.',
    cloneMode: 'Professional',
    snrDb: 46.0,
  },
  {
    id: 'voice-julian',
    elevenLabsVoiceId: 'N2lVS1w4EtoT3dr4eOWO', // Callum / Conversational podcast
    name: 'Julian Mercer',
    category: 'Cloned',
    accent: 'Transatlantic',
    gender: 'Male',
    age: 'Adult',
    useCase: 'Podcast & Dialogue',
    sampleRateHz: 44100,
    bitDepth: 24,
    description: 'Expressive conversational tenor with natural micro-inflections and dynamic cadence for multi-host podcasts.',
    fundamentalHz: 138,
    timbreWarmth: 0.82,
    geminiVoiceName: 'Puck',
    sampleText: 'Wait—listen closely to the second harmonic overtone right as the tape machine reaches thirty inches per second.',
    cloneMode: 'Instant',
    snrDb: 38.9,
  },
  {
    id: 'voice-freya',
    elevenLabsVoiceId: 'XB0fDUnXU5powFXDhCwa', // Charlotte / Nordic narrative
    name: 'Freya Lindqvist',
    category: 'Voice Design',
    accent: 'Nordic English',
    gender: 'Female',
    age: 'Adult',
    useCase: 'Character & Game Audio',
    sampleRateHz: 48000,
    bitDepth: 24,
    description: 'Synthesized from custom vocal timbre parameters with airy consonant articulation and dramatic dynamic range.',
    fundamentalHz: 184,
    timbreWarmth: 0.85,
    geminiVoiceName: 'Kore',
    sampleText: 'When the northern aurora crosses the fjord, even the radio telescopes fall quiet for a few seconds.',
    snrDb: 43.2,
  },
  {
    id: 'voice-mateo',
    elevenLabsVoiceId: 'pqHfZKP75CvOlQylNhV4', // Bill / Broadcast
    name: 'Mateo Valdés',
    category: 'Professional Clone',
    accent: 'Madrid Castilian',
    gender: 'Male',
    age: 'Middle-aged',
    useCase: 'Broadcast & Localization',
    sampleRateHz: 48000,
    bitDepth: 24,
    description: 'Authoritative bilingual broadcast voice designed for global cinema trailers, sports documentaries, and multilingual dubs.',
    fundamentalHz: 126,
    timbreWarmth: 0.91,
    geminiVoiceName: 'Fenrir',
    sampleText: 'Across five continents, synchronous translation brings local storytelling to audiences in their native cadence.',
    cloneMode: 'Professional',
    snrDb: 45.4,
  },
];

export interface ScriptPreset {
  id: string;
  title: string;
  category: string;
  recommendedVoiceId: string;
  mode: 'single' | 'dialogue';
  script: string;
}

export const SCRIPT_PRESETS: ScriptPreset[] = [
  {
    id: 'preset-documentary',
    title: 'Arctic Acoustic Documentary',
    category: 'Documentary',
    recommendedVoiceId: 'voice-marcus',
    mode: 'single',
    script: `Beneath three hundred meters of compressed Nordic ice lies an unbroken acoustic record of our planet's past. <breath> When core samples are warmed in an isolated chamber, trapped air bubbles release a faint, centuries-old whisper [pause 0.6s] preserved since the seventeenth century.`,
  },
  {
    id: 'preset-product',
    title: 'Industrial Design Keynote',
    category: 'Commercial',
    recommendedVoiceId: 'voice-clara',
    mode: 'single',
    script: `We milled the enclosure from a single block of recycled aerospace aluminum. <breath> Every chamfer, acoustic aperture, and tactile dial was calibrated in our Munich anechoic chamber [pause 0.5s] so the instrument disappears and only the sound remains.`,
  },
  {
    id: 'preset-dialogue',
    title: 'Dual-Host Sound Engineering Podcast',
    category: 'Multi-Speaker Dialogue',
    recommendedVoiceId: 'voice-julian',
    mode: 'dialogue',
    script: `Julian: Have you heard the raw 48-kilohertz vocal stem from the Reykjavik session? <breath> The transient detail is extraordinary.\nClara: I pulled it into the mastering console this morning. [pause 0.4s] Even without compression, the vocal presence sits right in the center of the room.`,
  },
  {
    id: 'preset-cinema',
    title: 'Sci-Fi Orbital Telemetry Log',
    category: 'Character & Narrative',
    recommendedVoiceId: 'voice-freya',
    mode: 'single',
    script: `Telemetry log, day four hundred and twelve aboard Meridian Station. <breath> High-frequency solar wind is resonating across the outer titanium hull [pause 0.7s] like a choir of glass harmonicas.`,
  },
];

export interface StudioReferenceSample {
  id: string;
  label: string;
  fileName: string;
  accent: string;
  gender: string;
  durationSec: number;
  snrDb: number;
  peakDb: number;
  sampleRateHz: number;
  transcript: string;
  fundamentalHz: number;
}

export const STUDIO_CALIBRATION_SAMPLES: StudioReferenceSample[] = [
  {
    id: 'cal-1',
    label: 'Anechoic Baritone Reference (Neumann U87 · 48kHz)',
    fileName: 'arthur_pendleton_u87_48khz.wav',
    accent: 'British Edinburgh',
    gender: 'Male',
    durationSec: 28.4,
    snrDb: 43.8,
    peakDb: -2.8,
    sampleRateHz: 48000,
    fundamentalHz: 114,
    transcript: 'The acoustic curtains in Studio B absorb reflections down to eighty hertz, leaving only pure direct vocal timbre.',
  },
  {
    id: 'cal-2',
    label: 'Editorial Mezzo Reference (Schoeps CMC6 · 48kHz)',
    fileName: 'celeste_moreau_schoeps_48khz.wav',
    accent: 'French-English Bilingual',
    gender: 'Female',
    durationSec: 34.2,
    snrDb: 45.2,
    peakDb: -3.1,
    sampleRateHz: 48000,
    fundamentalHz: 202,
    transcript: 'When translating poetry for cinema, preserving the breath cadence matters just as much as literal vocabulary.',
  },
  {
    id: 'cal-3',
    label: 'Broadcast Tenor Reference (Shure SM7B · 44.1kHz)',
    fileName: 'devon_brooks_sm7b_44khz.wav',
    accent: 'American West Coast',
    gender: 'Male',
    durationSec: 19.6,
    snrDb: 37.5,
    peakDb: -4.0,
    sampleRateHz: 44100,
    fundamentalHz: 144,
    transcript: 'Welcome back to the design lab. Today we are dissecting how neural vocoders reconstruct micro-prosody in real time.',
  },
];

export interface VideoScenePreset {
  id: string;
  title: string;
  subtitle: string;
  durationSec: number;
  fps: number;
  resolution: string;
  visualTheme: 'glacier' | 'keynote' | 'laboratory';
  ambientSfxPrompt: string;
  segments: VideoDubSegment[];
}

export const VIDEO_SCENE_PRESETS: VideoScenePreset[] = [
  {
    id: 'scene-glacier',
    title: 'Svalbard Glacial Core Expedition',
    subtitle: 'Documentary Field Recording · 24 fps · 4K DCI',
    durationSec: 14.0,
    fps: 24,
    resolution: '4096 × 2160',
    visualTheme: 'glacier',
    ambientSfxPrompt: 'Subtle sub-zero Arctic wind sweeping across crystalline blue glacier ice with distant deep ice creaks',
    segments: [
      {
        id: 'seg-101',
        speaker: 'Dr. Soren Lindqvist',
        voiceId: 'voice-marcus',
        startSec: 0.5,
        endSec: 5.0,
        originalText: 'Beneath three hundred meters of glacial ice lies an untouched acoustic archive of our climate.',
        translations: {
          English: 'Beneath three hundred meters of glacial ice lies an untouched acoustic archive of our climate.',
          Spanish: 'Bajo trescientos metros de hielo glaciar yace un archivo acústico intacto de nuestro clima.',
          Japanese: '厚さ300メートルの氷河の下に、地球の気候を記録した手つかずの音響アーカイブが眠っています。',
          German: 'Unter dreihundert Metern Gletschereis liegt ein unberührtes akustisches Archiv unseres Klimas.',
          French: 'Sous trois cents mètres de glace polaire repose une archive acoustique intacte de notre climat.',
        },
      },
      {
        id: 'seg-102',
        speaker: 'Dr. Freya Lindqvist',
        voiceId: 'voice-freya',
        startSec: 5.4,
        endSec: 9.6,
        originalText: 'Each compressed layer preserves the exact atmospheric resonance of the century it fell.',
        translations: {
          English: 'Each compressed layer preserves the exact atmospheric resonance of the century it fell.',
          Spanish: 'Cada capa comprimida conserva la resonancia atmosférica exacta del siglo en que cayó.',
          Japanese: '圧縮されたそれぞれの氷の層には、雪が降った世紀の大気の共鳴がそのまま保存されています。',
          German: 'Jede komprimierte Schicht bewahrt die exakte atmosphärische Resonanz des Jahrhunderts, in dem sie fiel.',
          French: 'Chaque couche comprimée préserve la résonance atmosphérique exacte du siècle où elle est tombée.',
        },
      },
      {
        id: 'seg-103',
        speaker: 'Dr. Soren Lindqvist',
        voiceId: 'voice-marcus',
        startSec: 10.0,
        endSec: 13.6,
        originalText: 'Listen closely as the core melts inside the isolated hydrophone chamber.',
        translations: {
          English: 'Listen closely as the core melts inside the isolated hydrophone chamber.',
          Spanish: 'Escuche atentamente mientras el núcleo se derrite dentro de la cámara de hidrófono aislada.',
          Japanese: '隔離されたハイドロフォンチャンバーの中で氷床コアが溶ける音に、耳を澄ませてみてください。',
          German: 'Hören Sie genau hin, während der Bohrkern in der isolierten Hydrophonkammer schmilzt.',
          French: 'Écoutez attentivement pendant que la carotte fond dans la chambre hydrophonique isolée.',
        },
      },
    ],
  },
  {
    id: 'scene-keynote',
    title: 'Auralis Reference Monitor Unveiling',
    subtitle: 'Munich Industrial Keynote · 60 fps · 4K UHD',
    durationSec: 12.0,
    fps: 60,
    resolution: '3840 × 2160',
    visualTheme: 'keynote',
    ambientSfxPrompt: 'Warm concert hall room tone with subtle audience hush and precision anodized dial click',
    segments: [
      {
        id: 'seg-201',
        speaker: 'Clara Vance',
        voiceId: 'voice-clara',
        startSec: 0.4,
        endSec: 4.4,
        originalText: 'Every acoustic wave leaves the beryllium tweeter with zero phase distortion across the room.',
        translations: {
          English: 'Every acoustic wave leaves the beryllium tweeter with zero phase distortion across the room.',
          Spanish: 'Cada onda acústica sale del tweeter de berilio con cero distorsión de fase en toda la sala.',
          Japanese: 'すべての音波はベリリウムツイーターから放たれ、部屋全体で位相歪みゼロを実現します。',
          German: 'Jede Schallwelle verlässt den Beryllium-Hochtöner ohne Phasenverzerrung im gesamten Raum.',
          French: 'Chaque onde acoustique quitte le tweeter en béryllium sans aucune distorsion de phase dans la pièce.',
        },
      },
      {
        id: 'seg-202',
        speaker: 'Julian Mercer',
        voiceId: 'voice-julian',
        startSec: 4.8,
        endSec: 8.6,
        originalText: 'We paired the analog waveguide with real-time neural room correction at ninety-six kilohertz.',
        translations: {
          English: 'We paired the analog waveguide with real-time neural room correction at ninety-six kilohertz.',
          Spanish: 'Combinamos la guía de ondas analógica con corrección acústica neuronal a noventa y seis kilohercios.',
          Japanese: 'アナログウェーブガイドと96キロヘルツのリアルタイム神経室内音響補正を融合させました。',
          German: 'Wir haben den analogen Waveguide mit neuronaler Echtzeit-Raumkorrektur bei sechsundneunzig Kilohertz gekoppelt.',
          French: 'Nous avons associé le guide d’ondes analogique à une correction acoustique neuronale à quatre-vingt-seize kilohertz.',
        },
      },
      {
        id: 'seg-203',
        speaker: 'Clara Vance',
        voiceId: 'voice-clara',
        startSec: 9.0,
        endSec: 11.7,
        originalText: 'What you hear is the exact studio master, untouched by the walls around you.',
        translations: {
          English: 'What you hear is the exact studio master, untouched by the walls around you.',
          Spanish: 'Lo que escuchas es el máster de estudio exacto, intacto por las paredes que te rodean.',
          Japanese: '周囲の壁の影響を一切受けない、スタジオマスターそのままの響きをお聴きください。',
          German: 'Was Sie hören, ist das exakte Studiomaster, unbeeinflusst von den Wänden um Sie herum.',
          French: 'Ce que vous entendez est le master studio exact, inaltéré par les murs qui vous entourent.',
        },
      },
    ],
  },
];
