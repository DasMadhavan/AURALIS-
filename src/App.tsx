/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { TopBar, ActiveTab } from './components/TopBar';
import { TtsStudioView, GeneratedAudioItem } from './components/TtsStudioView';
import { VoiceCloningView } from './components/VoiceCloningView';
import { VideoDubbingView } from './components/VideoDubbingView';
import { VoiceLibraryView } from './components/VoiceLibraryView';
import { INITIAL_VOICES, SCRIPT_PRESETS } from './data/presets';
import {
  VoiceProfile,
  estimateSynthesisMetrics,
  computeWaveformPeaks,
  generateDeterministicWavBytes,
} from './utils/audioEngine';
import { Play, Pause, Volume2 } from 'lucide-react';

function createInitialSeedHistory(): GeneratedAudioItem[] {
  const voice = INITIAL_VOICES[0];
  const text = SCRIPT_PRESETS[0].script;
  const metrics = estimateSynthesisMetrics(text, 1.0, 'eleven_multilingual_v2');
  const peaks = computeWaveformPeaks(text, voice.fundamentalHz, 0.72, 52);
  const wavBytes = generateDeterministicWavBytes(text, voice.fundamentalHz);
  let binary = '';
  for (let i = 0; i < wavBytes.byteLength; i++) {
    binary += String.fromCharCode(wavBytes[i]);
  }
  const base64 = typeof window !== 'undefined' ? window.btoa(binary) : '';

  return [
    {
      id: 'gen-seed-101',
      voiceId: voice.id,
      voiceName: voice.name,
      modelId: 'eleven_multilingual_v2',
      text,
      audioBase64: base64,
      mimeType: 'audio/wav',
      metrics,
      waveformPeaks: peaks,
      provider: 'ElevenLabs Multilingual v2 (24kHz WAV Master)',
      createdAt: '2026-10-25T18:00:00.000Z',
    },
  ];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tts');
  const [voices, setVoices] = useState<VoiceProfile[]>(INITIAL_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(INITIAL_VOICES[0].id);
  const [history, setHistory] = useState<GeneratedAudioItem[]>(() => createInitialSeedHistory());
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [exportBanner, setExportBanner] = useState<string | null>(null);

  const [initialStudioMode, setInitialStudioMode] = useState<'single' | 'batch'>('single');
  const [initialBatchScript, setInitialBatchScript] = useState<string | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  // Sync voices from backend on mount
  useEffect(() => {
    fetch('/api/voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.voices && Array.isArray(data.voices) && data.voices.length > 0) {
          setVoices(data.voices);
        }
      })
      .catch(() => {
        // Keep initial studio voices
      });
  }, []);

  const handleTogglePlayTake = (item: GeneratedAudioItem) => {
    if (activePlayingId === item.id && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setActivePlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(`data:${item.mimeType};base64,${item.audioBase64}`);
    audioPlayerRef.current = audio;
    setActivePlayingId(item.id);
    audio.onended = () => setActivePlayingId(null);
    audio.onerror = () => setActivePlayingId(null);
    audio.play().catch(() => {
      // Keep active state briefly so user sees transport feedback even in headless muted browsers
    });
  };

  const handleAddHistoryItem = (newItem: GeneratedAudioItem, autoPlay: boolean = true) => {
    setHistory((prev) => [newItem, ...prev]);
    if (autoPlay) {
      handleTogglePlayTake(newItem);
    }
  };

  const handleVoiceCloned = (newVoice: VoiceProfile) => {
    setVoices((prev) => [newVoice, ...prev.filter((v) => v.id !== newVoice.id)]);
    setSelectedVoiceId(newVoice.id);
  };

  const handleUseVoiceInStudio = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    setInitialStudioMode('single');
    handleSelectTab('tts');
  };

  const handleOpenVoiceInBatchQueue = (voice: VoiceProfile) => {
    setSelectedVoiceId(voice.id);
    setInitialStudioMode('batch');
    setInitialBatchScript(
      [
        `${voice.name}: Studio batch take one—evaluating cloned formant warmth and natural breath pacing. <breath>`,
        `${voice.name}: Studio batch take two—testing technical vocabulary and sibilance clarity at forty-eight kilohertz.`,
        `${voice.name}: Studio batch take three—final master narration pass ready for timeline export.`,
      ].join('\n')
    );
    handleSelectTab('tts');
  };

  const handleExportManifest = () => {
    const manifest = {
      platform: 'Auralis Studio — ElevenLabs Architecture',
      exportedAt: new Date().toISOString(),
      voicesCount: voices.length,
      takesCount: history.length,
      voices: voices.map((v) => ({
        id: v.id,
        elevenLabsVoiceId: v.elevenLabsVoiceId,
        name: v.name,
        category: v.category,
        accent: v.accent,
        sampleRateHz: v.sampleRateHz,
      })),
      takes: history.map((h) => ({
        id: h.id,
        voiceName: h.voiceName,
        modelId: h.modelId,
        text: h.text,
        metrics: h.metrics,
        createdAt: h.createdAt,
      })),
    };

    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `auralis_session_manifest_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportBanner(
      `Exported studio session manifest (${voices.length} voice profiles · ${history.length} synthesized takes).`
    );
    setTimeout(() => setExportBanner(null), 5000);
  };

  const currentPlayingTake = history.find((h) => h.id === activePlayingId) || history[0];

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#111110]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onExportManifest={handleExportManifest}
      />

      {exportBanner && (
        <div
          role="status"
          className="bg-[#111110] text-white text-xs font-medium py-2.5 px-6 text-center"
        >
          {exportBanner}
        </div>
      )}

      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-8">
        {activeTab === 'tts' && (
          <TtsStudioView
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoice={setSelectedVoiceId}
            history={history}
            onAddHistoryItem={handleAddHistoryItem}
            activePlayingId={activePlayingId}
            onTogglePlay={handleTogglePlayTake}
            onNavigateToCloning={() => handleSelectTab('cloning')}
            initialStudioMode={initialStudioMode}
            initialBatchScript={initialBatchScript}
          />
        )}

        {activeTab === 'cloning' && (
          <VoiceCloningView
            voices={voices}
            onVoiceCloned={handleVoiceCloned}
            onUseVoiceInStudio={handleUseVoiceInStudio}
            onOpenVoiceInBatchQueue={handleOpenVoiceInBatchQueue}
          />
        )}

        {activeTab === 'video' && <VideoDubbingView voices={voices} />}

        {activeTab === 'library' && (
          <VoiceLibraryView
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceForStudio={handleUseVoiceInStudio}
            onOpenCloningLab={() => handleSelectTab('cloning')}
            onVoiceDesigned={handleVoiceCloned}
          />
        )}
      </main>

      {/* Studio Master Playback Bar & Quiet Editorial Footer */}
      <footer className="border-t border-[#E5E4DF] bg-white mt-16">
        <div className="max-w-[1380px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Active Master Monitor */}
          {currentPlayingTake && (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => handleTogglePlayTake(currentPlayingTake)}
                aria-label={
                  activePlayingId === currentPlayingTake.id
                    ? 'Pause master monitor'
                    : 'Play latest studio take'
                }
                className="w-10 h-10 rounded-lg bg-[#111110] text-white flex items-center justify-center hover:bg-[#D94E1F] transition-colors shrink-0 cursor-pointer"
              >
                {activePlayingId === currentPlayingTake.id ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-[#575653]">
                  <Volume2 className="w-3.5 h-3.5 text-[#D94E1F] shrink-0" />
                  <span className="font-semibold text-[#111110]">
                    {currentPlayingTake.voiceName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{currentPlayingTake.modelId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {currentPlayingTake.metrics.estimatedDurationSec}s
                  </span>
                </div>
                <p className="text-xs text-[#575653] truncate max-w-md">
                  {currentPlayingTake.text}
                </p>
              </div>
            </div>
          )}

          {/* Quiet Footer Links */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-[#575653]">
            <span>Auralis Acoustic Synthesis Platform</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              aria-label="Footer navigation: Text to Speech"
              onClick={() => handleSelectTab('tts')}
              className="hover:text-[#111110] transition-colors cursor-pointer"
            >
              Text to Speech
            </button>
            <button
              type="button"
              aria-label="Footer navigation: Voice Cloning"
              onClick={() => handleSelectTab('cloning')}
              className="hover:text-[#111110] transition-colors cursor-pointer"
            >
              Voice Cloning
            </button>
            <button
              type="button"
              aria-label="Footer navigation: Video Dubbing"
              onClick={() => handleSelectTab('video')}
              className="hover:text-[#111110] transition-colors cursor-pointer"
            >
              Video Dubbing
            </button>
            <button
              type="button"
              aria-label="Footer navigation: Voice Library"
              onClick={() => handleSelectTab('library')}
              className="hover:text-[#111110] transition-colors cursor-pointer"
            >
              Voice Library
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
