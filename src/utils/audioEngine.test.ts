import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSynthesisMetrics,
  parseScriptSegments,
  parseBatchScriptItems,
  summarizeBatchQueue,
  validateCloneSubmission,
  syncVideoDubSegments,
  computeWaveformPeaks,
  generateDeterministicWavBytes,
  deriveVoiceDesignParameters,
  generateSfxWavBytes,
  buildNvidiaScriptFallback,
  validateVideoGenerationParams,
  generateStudioSceneSvgDataUri,
  buildNvidiaVisionFallback,
} from './audioEngine';

test('estimateSynthesisMetrics computes accurate character, word, credit, and latency metrics', () => {
  const script = 'Welcome to Auralis Studio. <breath> We synthesize lifelike human speech [pause 0.5s] across thirty-two languages.';
  const multilingualMetrics = estimateSynthesisMetrics(script, 1.0, 'eleven_multilingual_v2');
  assert.equal(multilingualMetrics.characterCount, script.length);
  assert.equal(multilingualMetrics.pauseCount, 2);
  assert.equal(multilingualMetrics.creditsCost, script.length);
  assert.ok(multilingualMetrics.estimatedDurationSec > 2.0);

  const flashMetrics = estimateSynthesisMetrics(script, 1.0, 'eleven_flash_v2_5');
  assert.equal(flashMetrics.creditsCost, Math.ceil(script.length * 0.5));
  assert.ok(flashMetrics.estimatedLatencyMs < multilingualMetrics.estimatedLatencyMs);
});

test('parseScriptSegments splits multi-speaker lines and extracts acoustic cues', () => {
  const script = `Marcus: The expedition reached the glacier ridge at dawn. <breath>\nElena: Check the acoustic telemetry array before the wind picks up. [pause 0.8s]`;
  const segments = parseScriptSegments(script, 'Narrator');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].speakerName, 'Marcus');
  assert.deepEqual(segments[0].emotionCues, ['<breath>']);
  assert.equal(segments[1].speakerName, 'Elena');
  assert.equal(segments[1].pauseAfterMs, 800);
});

test('parseBatchScriptItems and summarizeBatchQueue parse multi-line batch takes and match cloned voice prefixes', () => {
  const voices = [
    { id: 'voice-marcus', name: 'Marcus Sterling' },
    { id: 'voice-clara', name: 'Clara Vance' },
    { id: 'voice-clone-1', name: 'Arthur Pendleton Clone' },
  ];
  const rawBatch = [
    '# Studio Batch Header Comment (ignored)',
    'Chapter One: The Acoustic Horizon begins at forty-eight kilohertz.',
    'Clara Vance: Every surface inside the chamber was calibrated by hand. <breath>',
    'Arthur Pendleton: Cloned baritone stem verification pass number three.',
  ].join('\n');

  const items = parseBatchScriptItems(rawBatch, 'voice-marcus', voices, 1.0, 'eleven_multilingual_v2');
  assert.equal(items.length, 3);
  assert.equal(items[0].voiceId, 'voice-marcus');
  assert.equal(items[1].voiceId, 'voice-clara');
  assert.equal(items[1].text, 'Every surface inside the chamber was calibrated by hand. <breath>');
  assert.equal(items[2].voiceId, 'voice-clone-1');

  const summary = summarizeBatchQueue(items);
  assert.equal(summary.totalItems, 3);
  assert.ok(summary.totalCharacters > 100);
  assert.ok(summary.totalDurationSec > 4.0);
  assert.equal(summary.totalCredits, summary.totalCharacters);
});

test('validateCloneSubmission enforces name, sample duration, and speaker consent', () => {
  const invalidResult = validateCloneSubmission({
    name: '',
    category: 'Instant',
    accent: 'British',
    gender: 'Female',
    useCase: 'Narrative',
    description: 'Warm documentary voice',
    sampleDurationSec: 0,
    snrDb: 38.4,
    peakDb: -3.2,
    hasConsent: false,
    sampleFileName: '',
  });
  assert.equal(invalidResult.valid, false);
  assert.equal(invalidResult.errors.length, 3);

  const validResult = validateCloneSubmission({
    name: 'Clara Vance — Studio Clone',
    category: 'Instant',
    accent: 'British',
    gender: 'Female',
    useCase: 'Narrative',
    description: 'Warm documentary voice',
    sampleDurationSec: 24.5,
    snrDb: 38.4,
    peakDb: -3.2,
    hasConsent: true,
    sampleFileName: 'clara_studio_take_48khz.wav',
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.errors.length, 0);
  assert.equal(validResult.readinessLabel, 'Studio Grade');
  assert.ok(validResult.qualityScore >= 82);
});

test('syncVideoDubSegments computes localized duration and lip-sync stretch ratios', () => {
  const segments = [
    {
      id: 'seg-1',
      speaker: 'Dr. Soren Lindqvist',
      voiceId: 'voice-marcus',
      startSec: 0.0,
      endSec: 4.5,
      originalText: 'Beneath three hundred meters of glacial ice lies an ancient acoustic archive.',
      translations: {
        Spanish: 'Bajo trescientos metros de hielo glaciar yace un antiguo archivo acústico.',
        Japanese: '厚さ300メートルの氷河の下に、古代の音響アーカイブが眠っています。',
      },
    },
  ];

  const syncedEs = syncVideoDubSegments(segments, 'Spanish');
  assert.equal(syncedEs.length, 1);
  assert.equal(syncedEs[0].durationSec, 4.5);
  assert.ok(syncedEs[0].stretchRatio >= 0.82 && syncedEs[0].stretchRatio <= 1.24);
  assert.ok(syncedEs[0].localizedText.includes('glaciar'));
});

test('generateDeterministicWavBytes produces valid RIFF WAVE header and PCM payload', () => {
  const wav = generateDeterministicWavBytes('Testing high fidelity studio synthesis.', 150);
  assert.ok(wav.byteLength > 44);
  const header = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
  const format = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
  assert.equal(header, 'RIFF');
  assert.equal(format, 'WAVE');

  const peaks = computeWaveformPeaks('Testing high fidelity studio synthesis.', 150, 0.75, 48);
  assert.equal(peaks.length, 48);
  assert.ok(peaks.every((p) => p >= 0.12 && p <= 0.96));
});

test('deriveVoiceDesignParameters and generateSfxWavBytes support Voice Design and Sound Generation APIs', () => {
  const spec = deriveVoiceDesignParameters(
    'Deep resonant British baritone narrator with warm analog studio presence'
  );
  assert.equal(spec.gender, 'Male');
  assert.equal(spec.accent, 'British RP');
  assert.ok(spec.fundamentalHz < 116);
  assert.ok(spec.timbreWarmth >= 0.9);

  const sfxWav = generateSfxWavBytes({
    prompt: 'Sub-zero Arctic glacier wind sweeping across crystalline ice',
    durationSeconds: 2.0,
    promptInfluence: 0.7,
  });
  // 2.0 seconds at 24000 Hz * 2 bytes/sample + 44 byte header = 96044 bytes
  assert.equal(sfxWav.byteLength, 96044);
  const riff = String.fromCharCode(sfxWav[0], sfxWav[1], sfxWav[2], sfxWav[3]);
  assert.equal(riff, 'RIFF');
});

test('buildNvidiaScriptFallback generates prosody-tagged scripts for single and batch modes', () => {
  const singleScript = buildNvidiaScriptFallback('Deep Sea Hydrothermal Vents', 'single');
  assert.ok(singleScript.includes('Deep Sea Hydrothermal Vents'));
  assert.ok(singleScript.includes('<breath>'));

  const batchScript = buildNvidiaScriptFallback('Aerospace Chronometer', 'batch', [
    'Marcus Sterling',
    'Clara Vance',
  ]);
  const lines = batchScript.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('Marcus Sterling:'));
  assert.ok(lines[1].startsWith('Clara Vance:'));
});

test('validateVideoGenerationParams normalizes 16:9 and 9:16 aspect ratios and validates prompt length', () => {
  const validPortrait = validateVideoGenerationParams('Glacier meltwater rushing through canyon', '9:16', '10s');
  assert.equal(validPortrait.valid, true);
  assert.equal(validPortrait.aspectRatio, '9:16');
  assert.equal(validPortrait.duration, '10s');

  const invalidShort = validateVideoGenerationParams('abc', '16:9');
  assert.equal(invalidShort.valid, false);
  assert.ok(invalidShort.error);
});

test('generateStudioSceneSvgDataUri and buildNvidiaVisionFallback return valid studio assets and multimodal cues', () => {
  const sceneSvg = generateStudioSceneSvgDataUri('Architectural sound stage with warm key lighting', '16:9', false);
  assert.equal(sceneSvg.width, 960);
  assert.equal(sceneSvg.height, 540);
  assert.ok(sceneSvg.dataUri.startsWith('data:image/svg+xml;base64,'));

  const visionAnalysis = buildNvidiaVisionFallback(
    'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg',
    'Is there a car in this image?'
  );
  assert.ok(visionAnalysis.answer.toLowerCase().includes('yes'));
  assert.ok(visionAnalysis.suggestedVoiceover.includes('<breath>'));
  assert.ok(visionAnalysis.suggestedFfxPrompt.length > 10);
});

