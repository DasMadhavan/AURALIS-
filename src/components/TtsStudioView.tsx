import React, { useState, useMemo, useEffect } from 'react';
import {
  Play,
  Pause,
  Download,
  RotateCcw,
  Sparkles,
  Sliders,
  FileAudio,
  Upload,
  ListChecks,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  VoiceProfile,
  VoiceSettings,
  SynthesisMetrics,
  BatchQueueItem,
  estimateSynthesisMetrics,
  parseScriptSegments,
  parseBatchScriptItems,
  summarizeBatchQueue,
} from '../utils/audioEngine';
import { ELEVENLABS_MODELS, SCRIPT_PRESETS } from '../data/presets';

export interface GeneratedAudioItem {
  id: string;
  voiceId: string;
  voiceName: string;
  modelId: string;
  text: string;
  audioBase64: string;
  mimeType: string;
  metrics: SynthesisMetrics;
  waveformPeaks: number[];
  provider: string;
  createdAt: string;
}

interface TtsStudioViewProps {
  voices: VoiceProfile[];
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string) => void;
  history: GeneratedAudioItem[];
  onAddHistoryItem: (item: GeneratedAudioItem, autoPlay?: boolean) => void;
  activePlayingId: string | null;
  onTogglePlay: (item: GeneratedAudioItem) => void;
  onNavigateToCloning: () => void;
  initialStudioMode?: 'single' | 'batch';
  initialBatchScript?: string | null;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stability: 0.72,
  similarityBoost: 0.84,
  styleExaggeration: 0.20,
  speed: 1.0,
  speakerBoost: true,
};

const DEFAULT_BATCH_SCRIPT = [
  'Beneath three hundred meters of Arctic glacial ice lies a preserved acoustic archive of Earth’s pre-industrial atmosphere.',
  'Clara Vance: Every architectural space carries its own reverberation signature—a fingerprint of timber, glass, and human presence. <breath>',
  'Sora Takahashi: Precision optical sensors calibrate twenty-four thousand times per second, adapting seamlessly to shifting ambient light.',
].join('\n');

export const TtsStudioView: React.FC<TtsStudioViewProps> = ({
  voices,
  selectedVoiceId,
  onSelectVoice,
  history,
  onAddHistoryItem,
  activePlayingId,
  onTogglePlay,
  onNavigateToCloning,
  initialStudioMode = 'single',
  initialBatchScript = null,
}) => {
  const [studioMode, setStudioMode] = useState<'single' | 'batch'>(initialStudioMode);
  const [scriptText, setScriptText] = useState<string>(SCRIPT_PRESETS[0].script);
  const [batchRawText, setBatchRawText] = useState<string>(
    initialBatchScript || DEFAULT_BATCH_SCRIPT
  );
  const [uploadedBatchFileName, setUploadedBatchFileName] = useState<string | null>(null);
  const [rowVoiceOverrides, setRowVoiceOverrides] = useState<Record<number, string>>({});
  const [batchStatuses, setBatchStatuses] = useState<
    Record<number, { status: BatchQueueItem['status']; generatedTakeId?: string }>
  >({});
  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);
  const [batchCompletedCount, setBatchCompletedCount] = useState<number>(0);

  const [selectedModelId, setSelectedModelId] = useState<string>(ELEVENLABS_MODELS[0].id);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>('');

  // NVIDIA NIM Script & Prosody Director (/api/nvidia/script-director) state
  const [nimTopic, setNimTopic] = useState<string>('Deep-sea hydrothermal vent acoustic expedition');
  const [isGeneratingNimScript, setIsGeneratingNimScript] = useState<boolean>(false);
  const [nimProviderNotice, setNimProviderNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialStudioMode) {
      setStudioMode(initialStudioMode);
    }
  }, [initialStudioMode]);

  useEffect(() => {
    if (initialBatchScript) {
      setBatchRawText(initialBatchScript);
      setStudioMode('batch');
      setBatchStatuses({});
      setRowVoiceOverrides({});
    }
  }, [initialBatchScript]);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === selectedVoiceId) || voices[0],
    [voices, selectedVoiceId]
  );

  const selectedModel = useMemo(
    () => ELEVENLABS_MODELS.find((m) => m.id === selectedModelId) || ELEVENLABS_MODELS[0],
    [selectedModelId]
  );

  const liveMetrics = useMemo(
    () => estimateSynthesisMetrics(scriptText, settings.speed, selectedModelId),
    [scriptText, settings.speed, selectedModelId]
  );

  const parsedLines = useMemo(
    () => parseScriptSegments(scriptText, selectedVoice?.name || 'Narrator'),
    [scriptText, selectedVoice]
  );

  // Compute Batch Queue items with per-row voice override support
  const batchQueueItems: BatchQueueItem[] = useMemo(() => {
    const baseItems = parseBatchScriptItems(
      batchRawText,
      selectedVoice.id,
      voices,
      settings.speed,
      selectedModelId
    );
    return baseItems.map((item) => {
      const overrideVoiceId = rowVoiceOverrides[item.index];
      const assignedVoice = overrideVoiceId
        ? voices.find((v) => v.id === overrideVoiceId)
        : undefined;
      const runtimeState = batchStatuses[item.index];
      return {
        ...item,
        voiceId: assignedVoice ? assignedVoice.id : item.voiceId,
        voiceName: assignedVoice ? assignedVoice.name : item.voiceName,
        status: runtimeState?.status || 'queued',
        generatedTakeId: runtimeState?.generatedTakeId,
      };
    });
  }, [batchRawText, selectedVoice.id, voices, settings.speed, selectedModelId, rowVoiceOverrides, batchStatuses]);

  const batchSummary = useMemo(
    () => summarizeBatchQueue(batchQueueItems),
    [batchQueueItems]
  );

  const filteredHistory = useMemo(() => {
    if (!historyFilter.trim()) return history;
    const q = historyFilter.toLowerCase();
    return history.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        item.voiceName.toLowerCase().includes(q) ||
        item.modelId.toLowerCase().includes(q)
    );
  }, [history, historyFilter]);

  const handleInsertCue = (cue: string) => {
    if (studioMode === 'batch') {
      setBatchRawText((prev) => `${prev.trimEnd()} ${cue}`);
    } else {
      setScriptText((prev) => `${prev.trimEnd()} ${cue} `);
    }
    setErrorMsg(null);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = SCRIPT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setScriptText(preset.script);
    if (voices.some((v) => v.id === preset.recommendedVoiceId)) {
      onSelectVoice(preset.recommendedVoiceId);
    }
    setErrorMsg(null);
  };

  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const textContent = await file.text();
      const cleaned = textContent.trim();
      if (!cleaned) {
        setErrorMsg('The uploaded text file is empty.');
        return;
      }
      setUploadedBatchFileName(file.name);
      setBatchRawText(cleaned);
      setBatchStatuses({});
      setRowVoiceOverrides({});
      setErrorMsg(null);
    } catch {
      setErrorMsg('Unable to read text file. Please upload a valid UTF-8 .txt, .csv, or .md file.');
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (studioMode === 'batch') {
      await handleRunBatchQueue();
      return;
    }

    if (!scriptText.trim()) {
      setErrorMsg('Please enter a script or select a studio preset before synthesizing audio.');
      return;
    }

    setErrorMsg(null);
    setIsSynthesizing(true);

    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scriptText,
          voiceId: selectedVoice.id,
          modelId: selectedModelId,
          settings,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Synthesis request failed');
      }

      onAddHistoryItem(data, true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to reach synthesis engine.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleRunBatchQueue = async () => {
    if (batchQueueItems.length === 0) {
      setErrorMsg('Please paste at least one line of script or upload a text file to run the batch queue.');
      return;
    }

    setErrorMsg(null);
    setIsRunningBatch(true);
    setBatchCompletedCount(0);

    // Initialize all items as queued
    const initialMap: Record<number, { status: BatchQueueItem['status'] }> = {};
    for (const item of batchQueueItems) {
      initialMap[item.index] = { status: 'queued' };
    }
    setBatchStatuses(initialMap);

    let lastGeneratedItem: GeneratedAudioItem | null = null;

    for (let i = 0; i < batchQueueItems.length; i++) {
      const item = batchQueueItems[i];
      setBatchStatuses((prev) => ({
        ...prev,
        [item.index]: { status: 'synthesizing' },
      }));

      try {
        const response = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: item.text,
            voiceId: item.voiceId,
            modelId: selectedModelId,
            settings,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Failed on batch line ${item.index}`);
        }

        const uniqueData: GeneratedAudioItem = {
          ...data,
          id: `gen-batch-${Date.now()}-${item.index}`,
        };

        lastGeneratedItem = uniqueData;
        onAddHistoryItem(uniqueData, false);
        setBatchCompletedCount((c) => c + 1);
        setBatchStatuses((prev) => ({
          ...prev,
          [item.index]: { status: 'completed', generatedTakeId: uniqueData.id },
        }));
      } catch (err: any) {
        setBatchStatuses((prev) => ({
          ...prev,
          [item.index]: { status: 'error' },
        }));
        setErrorMsg(err?.message || `Batch synthesis failed at line ${item.index}.`);
      }
    }

    if (lastGeneratedItem) {
      onTogglePlay(lastGeneratedItem);
    }
    setIsRunningBatch(false);
  };

  const handleDownloadAudio = (item: GeneratedAudioItem) => {
    const ext = item.mimeType.includes('mpeg') ? 'mp3' : 'wav';
    const link = document.createElement('a');
    link.href = `data:${item.mimeType};base64,${item.audioBase64}`;
    link.download = `${item.voiceName.toLowerCase().replace(/\s+/g, '_')}_${item.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateNimScript = async () => {
    if (!nimTopic.trim()) {
      setErrorMsg('Please enter a script topic for the NVIDIA NIM Script Director.');
      return;
    }

    setErrorMsg(null);
    setNimProviderNotice(null);
    setIsGeneratingNimScript(true);

    try {
      const response = await fetch('/api/nvidia/script-director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: nimTopic.trim(),
          mode: studioMode,
          voiceNames: [
            selectedVoice.name,
            voices.find((v) => v.id !== selectedVoice.id)?.name || 'Clara Vance',
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate script.');
      }

      if (studioMode === 'batch') {
        setBatchRawText(data.script);
        setBatchStatuses({});
      } else {
        setScriptText(data.script);
      }
      setNimProviderNotice(`Generated prosody-tagged ${studioMode} script via ${data.provider}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to reach NVIDIA NIM Script Director.');
    } finally {
      setIsGeneratingNimScript(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Studio Hero Header & Proposition */}
      <section className="pt-4 pb-6 border-b border-[#E5E4DF]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs font-medium tracking-wide text-[#575653]">
              ElevenLabs v1 Architecture · NVIDIA NIM Script Director · Batch Queue & Multi-Speaker Synthesis
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#111110] leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Context-aware speech synthesis with human breath, cadence, and emotional inflection.
            </h1>
          </div>
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:justify-end gap-3">
            <button
              type="button"
              onClick={onNavigateToCloning}
              className="px-4 py-2.5 text-xs font-semibold text-[#111110] bg-white border border-[#D0CFC9] rounded-lg hover:border-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clone Custom Voice
            </button>
          </div>
        </div>
      </section>

      {/* Main Two-Column Synthesis Console */}
      <section aria-label="Text to Speech Synthesis Console" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Script Editor / Batch Queue Console */}
        <form onSubmit={handleSynthesize} className="lg:col-span-8 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-6">
          {/* Mode Switcher & Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E5E4DF]">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-[#111110]">
                01. Script & Acoustic Direction
              </h2>
              <p className="text-xs text-[#575653]">
                {studioMode === 'single'
                  ? 'Insert breath cues or write Speaker: prefixes for multi-speaker dialogue.'
                  : 'Upload a .txt/.csv script file or paste multiple lines to synthesize audio takes in a sequential batch queue.'}
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F3F2EE] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setStudioMode('single');
                  setErrorMsg(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  studioMode === 'single'
                    ? 'bg-white text-[#111110] shadow-xs'
                    : 'text-[#575653] hover:text-[#111110]'
                }`}
              >
                Single Script
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudioMode('batch');
                  setErrorMsg(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  studioMode === 'batch'
                    ? 'bg-white text-[#111110] shadow-xs'
                    : 'text-[#575653] hover:text-[#111110]'
                }`}
              >
                Batch Queue ({batchQueueItems.length})
              </button>
            </div>
          </div>

          {/* NVIDIA NIM Script & Prosody Director Bar (/api/nvidia/script-director) */}
          <div className="p-3.5 bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="nim-topic-input" className="text-xs font-semibold text-[#111110]">
                NVIDIA NIM Script & Prosody Director (/v1/chat/completions)
              </label>
              {nimProviderNotice && (
                <span className="text-[11px] font-mono text-[#15803D]">{nimProviderNotice}</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                id="nim-topic-input"
                type="text"
                value={nimTopic}
                onChange={(e) => setNimTopic(e.target.value)}
                placeholder="Describe a narration topic or multi-speaker scene..."
                className="flex-1 px-3 py-1.5 text-xs text-[#111110] bg-white border border-[#D0CFC9] rounded-md focus:outline-none focus:border-[#111110]"
              />
              <button
                type="button"
                onClick={handleGenerateNimScript}
                disabled={isGeneratingNimScript}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#111110] rounded-md hover:bg-[#D94E1F] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isGeneratingNimScript
                    ? 'Drafting Script...'
                    : studioMode === 'batch'
                    ? 'Draft Batch Script (NIM)'
                    : 'Draft Script (NIM)'}
                </span>
              </button>
            </div>
          </div>

          {studioMode === 'single' ? (
            <>
              {/* Single Mode Preset Bar & Acoustic Cue Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#F3F2EE] rounded-lg overflow-x-auto">
                  {SCRIPT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        scriptText === preset.script
                          ? 'bg-white text-[#111110] shadow-xs font-semibold'
                          : 'text-[#575653] hover:text-[#111110]'
                      }`}
                    >
                      {preset.category}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleInsertCue('<breath>')}
                    className="px-2.5 py-1 text-xs font-mono text-[#111110] bg-[#FAF9F6] border border-[#E5E4DF] rounded hover:border-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    &lt;breath&gt;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertCue('[pause 0.5s]')}
                    className="px-2.5 py-1 text-xs font-mono text-[#111110] bg-[#FAF9F6] border border-[#E5E4DF] rounded hover:border-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    [pause 0.5s]
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertCue('<laugh>')}
                    className="px-2.5 py-1 text-xs font-mono text-[#111110] bg-[#FAF9F6] border border-[#E5E4DF] rounded hover:border-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    &lt;laugh&gt;
                  </button>
                </div>
              </div>

              {/* Single Script Textarea */}
              <div>
                <label htmlFor="script-editor" className="sr-only">
                  Script Editor
                </label>
                <textarea
                  id="script-editor"
                  rows={6}
                  value={scriptText}
                  onChange={(e) => {
                    setScriptText(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter narration script or multi-speaker dialogue..."
                  className="w-full p-4 text-[15px] leading-relaxed text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110] transition-colors resize-y"
                />
              </div>

              {/* Parsed Speaker Turn Preview */}
              {parsedLines.length > 0 && (
                <div className="pt-2 border-t border-[#E5E4DF]">
                  <div className="flex items-center justify-between text-xs text-[#575653] mb-2">
                    <span>Detected Prosody Segments ({parsedLines.length})</span>
                    <span className="font-mono tabular-nums">
                      {liveMetrics.pauseCount} acoustic cues · {liveMetrics.wordCount} words
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {parsedLines.map((seg, idx) => (
                      <div
                        key={idx}
                        className="flex items-baseline justify-between gap-4 text-xs py-1.5 px-3 bg-[#FAF9F6] rounded border border-[#E5E4DF]"
                      >
                        <div className="truncate">
                          <span className="font-semibold text-[#111110] mr-2">{seg.speakerName}:</span>
                          <span className="text-[#575653]">{seg.cleanText}</span>
                        </div>
                        <span className="font-mono tabular-nums text-[11px] text-[#575653] whitespace-nowrap shrink-0">
                          +{seg.pauseAfterMs}ms pause
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Batch Queue Mode (File Upload + Multi-Line Editor + Per-Row Voice Assignment) */
            <div className="space-y-5">
              {/* Batch File Upload & Sample Loader Toolbar */}
              <div className="p-4 bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[#111110] block">
                    Batch Script Source ({uploadedBatchFileName || 'Direct Multi-Line Input'})
                  </span>
                  <p className="text-xs text-[#575653]">
                    Each non-empty line generates a separate studio audio take. Prefix with <span className="font-mono">Voice Name:</span> to route to a specific cloned voice.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label
                    htmlFor="batch-script-file-input"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111110] bg-white border border-[#D0CFC9] rounded-lg hover:border-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Script File (.txt)</span>
                    <input
                      id="batch-script-file-input"
                      type="file"
                      accept=".txt,.csv,.md,text/plain"
                      onChange={handleBatchFileUpload}
                      className="sr-only"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const clonedVoice = voices.find((v) => v.isCustomClone) || selectedVoice;
                      setBatchRawText(
                        [
                          `${clonedVoice.name}: Calibration take one—testing low-frequency baritone warmth and room isolation.`,
                          `${clonedVoice.name}: Calibration take two—verifying sibilance control at forty-eight kilohertz. <breath>`,
                          `Clara Vance: Cross-checking conversational transition with secondary studio narrator.`,
                        ].join('\n')
                      );
                      setBatchStatuses({});
                      setRowVoiceOverrides({});
                      setUploadedBatchFileName(null);
                      setErrorMsg(null);
                    }}
                    className="px-3 py-2 text-xs font-medium text-[#575653] hover:text-[#111110] bg-white border border-[#E5E4DF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Load Voice Clone Test Batch
                  </button>
                </div>
              </div>

              {/* Multi-Line Batch Textarea */}
              <div>
                <label htmlFor="batch-script-textarea" className="block text-xs font-semibold text-[#111110] mb-1.5">
                  Multi-Line Batch Script (1 Take Per Line)
                </label>
                <textarea
                  id="batch-script-textarea"
                  rows={5}
                  value={batchRawText}
                  onChange={(e) => {
                    setBatchRawText(e.target.value);
                    setBatchStatuses({});
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Paste multiple script lines here (one audio take per line)..."
                  className="w-full p-3.5 text-sm leading-relaxed text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110] font-sans resize-y"
                />
              </div>

              {/* Queued Batch Items Table with Per-Line Voice Selector & Live Status */}
              <div className="space-y-2.5 pt-2 border-t border-[#E5E4DF]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#111110] flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-[#D94E1F]" />
                    <span>Queued Audio Takes ({batchQueueItems.length})</span>
                  </span>
                  {isRunningBatch && (
                    <span className="font-mono tabular-nums text-[#D94E1F] font-semibold">
                      Synthesizing {batchCompletedCount} / {batchQueueItems.length} takes...
                    </span>
                  )}
                </div>

                {batchQueueItems.length === 0 ? (
                  <div className="p-6 text-center bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg text-xs text-[#575653]">
                    Enter one or more script lines above or upload a `.txt` file to populate the batch synthesis queue.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E4DF] border border-[#E5E4DF] rounded-lg bg-[#FAF9F6] max-h-64 overflow-y-auto">
                    {batchQueueItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums font-semibold text-[#575653]">
                              #{String(item.index).padStart(2, '0')}
                            </span>
                            <label htmlFor={`batch-voice-row-${item.index}`} className="sr-only">
                              Voice for batch line {item.index}
                            </label>
                            <select
                              id={`batch-voice-row-${item.index}`}
                              value={item.voiceId}
                              onChange={(e) =>
                                setRowVoiceOverrides((prev) => ({
                                  ...prev,
                                  [item.index]: e.target.value,
                                }))
                              }
                              className="px-2 py-1 text-xs font-semibold text-[#111110] bg-white border border-[#D0CFC9] rounded focus:outline-none focus:border-[#111110]"
                            >
                              {voices.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} ({v.category})
                                </option>
                              ))}
                            </select>
                            <span className="font-mono tabular-nums text-[11px] text-[#575653]">
                              {item.metrics.characterCount} chars · ~{item.metrics.estimatedDurationSec}s
                            </span>
                          </div>
                          <p className="text-[#111110] truncate">{item.text}</p>
                        </div>

                        {/* Status Indicator */}
                        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                          {item.status === 'queued' && (
                            <span className="inline-flex items-center gap-1 text-[#575653]">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Queued</span>
                            </span>
                          )}
                          {item.status === 'synthesizing' && (
                            <span className="inline-flex items-center gap-1 text-[#D94E1F] font-semibold">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Synthesizing</span>
                            </span>
                          )}
                          {item.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-[#15803D] font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Completed</span>
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-[#B91C1C] font-semibold">Failed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="p-3 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Bottom Action & Live Telemetry Bar */}
          <div className="pt-4 border-t border-[#E5E4DF] flex flex-wrap items-center justify-between gap-4">
            {studioMode === 'single' ? (
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#575653] font-mono tabular-nums">
                <span>{liveMetrics.characterCount} / 5,000 chars</span>
                <span aria-hidden="true">·</span>
                <span>~{liveMetrics.estimatedDurationSec}s audio</span>
                <span aria-hidden="true">·</span>
                <span>{liveMetrics.creditsCost} credits</span>
                <span aria-hidden="true">·</span>
                <span>~{liveMetrics.estimatedLatencyMs}ms latency</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#575653] font-mono tabular-nums">
                <span>{batchSummary.totalItems} batch takes</span>
                <span aria-hidden="true">·</span>
                <span>{batchSummary.totalCharacters} total chars</span>
                <span aria-hidden="true">·</span>
                <span>~{batchSummary.totalDurationSec}s total audio</span>
                <span aria-hidden="true">·</span>
                <span>{batchSummary.totalCredits} credits</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSynthesizing || isRunningBatch}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#D94E1F] rounded-lg hover:bg-[#BF3F15] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111110]"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {studioMode === 'batch'
                  ? isRunningBatch
                    ? `Synthesizing Batch (${batchCompletedCount}/${batchQueueItems.length})...`
                    : `Run Batch Queue (${batchQueueItems.length} Takes)`
                  : isSynthesizing
                  ? 'Synthesizing Audio...'
                  : 'Synthesize Audio'}
              </span>
            </button>
          </div>
        </form>

        {/* Right 4 Columns: Voice Selection, Model Engine & Acoustic Parameters */}
        <aside className="lg:col-span-4 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-6">
          <div className="space-y-3 pb-5 border-b border-[#E5E4DF]">
            <label htmlFor="voice-selector" className="block text-sm font-semibold text-[#111110]">
              02. Active Voice Persona
            </label>
            <select
              id="voice-selector"
              value={selectedVoice.id}
              onChange={(e) => onSelectVoice(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-medium text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.accent} · {voice.category})
                </option>
              ))}
            </select>

            {/* Unboxed Metadata Display */}
            <div className="pt-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#575653]">
                <span className="font-medium text-[#111110]">{selectedVoice.category}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedVoice.accent}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedVoice.gender}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{selectedVoice.sampleRateHz / 1000} kHz</span>
              </div>
              <p className="text-xs text-[#575653] leading-relaxed">
                {selectedVoice.description}
              </p>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-3 pb-5 border-b border-[#E5E4DF]">
            <label htmlFor="model-selector" className="block text-sm font-semibold text-[#111110]">
              03. Acoustic Foundation Model
            </label>
            <select
              id="model-selector"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-medium text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
            >
              {ELEVENLABS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.latencyMs}ms · {m.creditRateLabel})
                </option>
              ))}
            </select>
            <p className="text-xs text-[#575653] leading-relaxed">
              {selectedModel.description}
            </p>
          </div>

          {/* Voice Settings Sliders */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#111110] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#575653]" />
                <span>04. Voice Settings</span>
              </span>
              <button
                type="button"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="inline-flex items-center gap-1 text-xs text-[#575653] hover:text-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* Stability */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-stability" className="font-medium text-[#111110]">
                  Stability (Variable ↔ Consistent)
                </label>
                <span className="font-mono tabular-nums text-[#575653]">
                  {Math.round(settings.stability * 100)}%
                </span>
              </div>
              <input
                id="slider-stability"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.stability}
                onChange={(e) => setSettings((s) => ({ ...s, stability: parseFloat(e.target.value) }))}
                className="studio-slider"
              />
            </div>

            {/* Similarity Boost */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-similarity" className="font-medium text-[#111110]">
                  Clarity + Similarity Boost
                </label>
                <span className="font-mono tabular-nums text-[#575653]">
                  {Math.round(settings.similarityBoost * 100)}%
                </span>
              </div>
              <input
                id="slider-similarity"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.similarityBoost}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, similarityBoost: parseFloat(e.target.value) }))
                }
                className="studio-slider"
              />
            </div>

            {/* Style Exaggeration */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-style" className="font-medium text-[#111110]">
                  Style Exaggeration
                </label>
                <span className="font-mono tabular-nums text-[#575653]">
                  {Math.round(settings.styleExaggeration * 100)}%
                </span>
              </div>
              <input
                id="slider-style"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.styleExaggeration}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, styleExaggeration: parseFloat(e.target.value) }))
                }
                className="studio-slider"
              />
            </div>

            {/* Speed */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-speed" className="font-medium text-[#111110]">
                  Speaking Rate
                </label>
                <span className="font-mono tabular-nums text-[#575653]">
                  {settings.speed.toFixed(2)}x
                </span>
              </div>
              <input
                id="slider-speed"
                type="range"
                min={0.7}
                max={1.3}
                step={0.05}
                value={settings.speed}
                onChange={(e) => setSettings((s) => ({ ...s, speed: parseFloat(e.target.value) }))}
                className="studio-slider"
              />
            </div>

            {/* Speaker Boost Checkbox */}
            <div className="pt-2 flex items-center justify-between">
              <label htmlFor="toggle-speaker-boost" className="text-xs font-medium text-[#111110] cursor-pointer">
                High-Frequency Speaker Presence Boost
              </label>
              <input
                id="toggle-speaker-boost"
                type="checkbox"
                checked={settings.speakerBoost}
                onChange={(e) => setSettings((s) => ({ ...s, speakerBoost: e.target.checked }))}
                className="w-4 h-4 accent-[#D94E1F] rounded cursor-pointer"
              />
            </div>
          </div>
        </aside>
      </section>

      {/* Synthesized Audio History & Master Takes Table */}
      <section aria-label="Generated Audio Takes" className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E4DF]">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111110]">
              05. Studio Master Takes ({filteredHistory.length})
            </h2>
            <p className="text-xs text-[#575653]">
              Every generated single or batch take is rendered as lossless 24kHz PCM WAV or 44.1kHz MP3 ready for NLE timeline import.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <label htmlFor="history-search" className="sr-only">
              Filter takes by script or voice
            </label>
            <input
              id="history-search"
              type="search"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Filter takes by voice or text..."
              className="w-full px-3 py-1.5 text-xs text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
            />
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <FileAudio className="w-8 h-8 text-[#575653] mx-auto stroke-[1.5]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#111110]">No matching studio takes found</p>
              <p className="text-xs text-[#575653]">
                Synthesize a script above or clear your search filter to inspect master audio takes.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E4DF]">
            {filteredHistory.map((item) => {
              const isPlaying = activePlayingId === item.id;
              return (
                <div
                  key={item.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FAF9F6]/60 transition-colors px-2 rounded-lg"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#575653]">
                      <span className="font-semibold text-[#111110]">{item.voiceName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{item.modelId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{item.metrics.estimatedDurationSec}s</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{item.metrics.characterCount} chars</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.provider}</span>
                    </div>
                    <p className="text-sm text-[#111110] line-clamp-2 leading-relaxed">
                      “{item.text}”
                    </p>
                  </div>

                  {/* Interactive Waveform Visualization & Play/Download Controls */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div
                      aria-hidden="true"
                      className="hidden sm:flex items-center gap-[2px] h-8 px-3 bg-[#FAF9F6] border border-[#E5E4DF] rounded-md"
                    >
                      {item.waveformPeaks.slice(0, 32).map((peak, idx) => (
                        <span
                          key={idx}
                          style={{ height: `${Math.max(18, Math.round(peak * 100))}%` }}
                          className={`w-[3px] rounded-full transition-colors ${
                            isPlaying ? 'bg-[#D94E1F]' : 'bg-[#111110]/40'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => onTogglePlay(item)}
                      aria-label={isPlaying ? `Pause take by ${item.voiceName}` : `Play take by ${item.voiceName}`}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isPlaying
                          ? 'bg-[#D94E1F] text-white'
                          : 'bg-[#111110] text-white hover:bg-[#D94E1F]'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPlaying ? 'Pause' : 'Play Take'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadAudio(item)}
                      aria-label={`Download audio take by ${item.voiceName}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#111110] bg-white border border-[#D0CFC9] rounded-lg hover:border-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>WAV</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
