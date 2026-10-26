import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Play, Pause, Search, ArrowRight, Mic, Sparkles, CheckCircle2 } from 'lucide-react';
import { VoiceProfile, generateDeterministicWavBytes } from '../utils/audioEngine';

interface VoiceLibraryViewProps {
  voices: VoiceProfile[];
  selectedVoiceId: string;
  onSelectVoiceForStudio: (voiceId: string) => void;
  onOpenCloningLab: () => void;
  onVoiceDesigned?: (newVoice: VoiceProfile) => void;
}

const CATEGORIES = ['All Voices', 'Premade', 'Cloned', 'Professional Clone', 'Voice Design'] as const;

export const VoiceLibraryView: React.FC<VoiceLibraryViewProps> = ({
  voices,
  selectedVoiceId,
  onSelectVoiceForStudio,
  onOpenCloningLab,
  onVoiceDesigned,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('All Voices');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  // ElevenLabs Voice Design API (/v1/text-to-voice/create-previews) state
  const [designPrompt, setDesignPrompt] = useState<string>(
    'Deep resonant British baritone documentary narrator with warm analog studio presence and calm pacing'
  );
  const [designName, setDesignName] = useState<string>('');
  const [isDesigning, setIsDesigning] = useState<boolean>(false);
  const [designedSuccess, setDesignedSuccess] = useState<VoiceProfile | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
    };
  }, []);

  const filteredVoices = useMemo(() => {
    return voices.filter((voice) => {
      const matchesCat =
        categoryFilter === 'All Voices' || voice.category === categoryFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        voice.name.toLowerCase().includes(q) ||
        voice.accent.toLowerCase().includes(q) ||
        voice.useCase.toLowerCase().includes(q) ||
        voice.description.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [voices, categoryFilter, searchQuery]);

  const handlePreviewVoice = (voice: VoiceProfile) => {
    if (previewingVoiceId === voice.id && audioElRef.current) {
      audioElRef.current.pause();
      setPreviewingVoiceId(null);
      return;
    }

    if (audioElRef.current) {
      audioElRef.current.pause();
    }

    const wavBytes = generateDeterministicWavBytes(voice.sampleText, voice.fundamentalHz);
    let binary = '';
    for (let i = 0; i < wavBytes.byteLength; i++) {
      binary += String.fromCharCode(wavBytes[i]);
    }
    const base64 = window.btoa(binary);
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    audioElRef.current = audio;
    setPreviewingVoiceId(voice.id);
    audio.onended = () => setPreviewingVoiceId(null);
    audio.onerror = () => setPreviewingVoiceId(null);
    audio.play().catch(() => setPreviewingVoiceId(null));
  };

  const handleCreateVoiceDesign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (designPrompt.trim().length < 8) {
      setDesignError('Please enter a voice persona description of at least 8 characters.');
      return;
    }

    setDesignError(null);
    setDesignedSuccess(null);
    setIsDesigning(true);

    try {
      const response = await fetch('/api/voice-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceDescription: designPrompt.trim(),
          customName: designName.trim(),
          saveToLibrary: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Voice Design API request failed.');
      }
      if (onVoiceDesigned && data.voice) {
        onVoiceDesigned(data.voice);
      }
      setDesignedSuccess(data.voice);
      setDesignName('');
    } catch (err: any) {
      setDesignError(err?.message || 'Unable to reach Voice Design API.');
    } finally {
      setIsDesigning(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header Section */}
      <section className="pt-4 pb-6 border-b border-[#E5E4DF]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs font-medium tracking-wide text-[#575653]">
              Curated Studio Personas, Verified Voice Clones & Voice Design API (/v1/text-to-voice)
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#111110] leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Explore multilingual studio voices or synthesize new vocal identities from text prompts.
            </h1>
          </div>

          <div className="lg:col-span-4 flex lg:justify-end">
            <button
              type="button"
              onClick={onOpenCloningLab}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Clone From Audio Stem</span>
            </button>
          </div>
        </div>
      </section>

      {/* ElevenLabs Voice Design API (/v1/text-to-voice/create-previews) Studio Panel */}
      <section aria-label="Voice Design API Generator" className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E4DF]">
          <div>
            <h2 className="font-display text-base font-bold text-[#111110]">
              ElevenLabs Voice Design API (/v1/text-to-voice/create-previews)
            </h2>
            <p className="text-xs text-[#575653]">
              Prompt a custom vocal persona from scratch—specifying age, register, accent, and acoustic warmth—without needing an audio sample.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateVoiceDesign} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6">
            <label htmlFor="voice-design-prompt" className="block text-xs font-semibold text-[#111110] mb-1.5">
              Voice Persona Prompt *
            </label>
            <input
              id="voice-design-prompt"
              type="text"
              value={designPrompt}
              onChange={(e) => {
                setDesignPrompt(e.target.value);
                if (designError) setDesignError(null);
              }}
              placeholder="e.g. Crisp Tokyo bilingual female narrator with warm mezzo timbre..."
              className="w-full px-3.5 py-2 text-xs text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
            />
          </div>

          <div className="lg:col-span-3">
            <label htmlFor="voice-design-name" className="block text-xs font-semibold text-[#111110] mb-1.5">
              Persona Name (Optional)
            </label>
            <input
              id="voice-design-name"
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder="e.g. Alistair Finch"
              className="w-full px-3.5 py-2 text-xs text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
            />
          </div>

          <div className="lg:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={isDesigning}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#D94E1F] rounded-lg hover:bg-[#BF3F15] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isDesigning ? 'Designing Voice...' : 'Synthesize Voice Persona'}</span>
            </button>
          </div>
        </form>

        {designError && (
          <p role="alert" className="text-xs font-medium text-[#B91C1C]">
            {designError}
          </p>
        )}

        {designedSuccess && (
          <div role="status" className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs text-[#15803D]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Created Voice Design persona <strong>{designedSuccess.name}</strong> ({designedSuccess.accent} · {designedSuccess.fundamentalHz} Hz F0).
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectVoiceForStudio(designedSuccess.id)}
              className="px-3 py-1 font-semibold bg-[#15803D] text-white rounded hover:bg-[#166534] transition-colors cursor-pointer"
            >
              Use in TTS Studio
            </button>
          </div>
        )}
      </section>

      {/* Filter & Search Bar */}
      <section aria-label="Voice Directory Controls" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#F3F2EE] rounded-lg overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-white text-[#111110] shadow-xs'
                  : 'text-[#575653] hover:text-[#111110]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#575653] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="voice-library-search" className="sr-only">
            Search voices by name, accent, or application
          </label>
          <input
            id="voice-library-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by accent, name, or role..."
            className="w-full pl-9 pr-3.5 py-2 text-xs text-[#111110] bg-white border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
          />
        </div>
      </section>

      {/* Voice Grid */}
      <section aria-label="Voice Profiles Grid">
        {filteredVoices.length === 0 ? (
          <div className="bg-white border border-[#E5E4DF] rounded-xl p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-[#111110]">
              No voice profiles match your current filter
            </p>
            <p className="text-xs text-[#575653]">
              Reset the category filter or synthesize a custom voice above.
            </p>
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('All Voices');
                setSearchQuery('');
              }}
              className="px-4 py-2 text-xs font-semibold text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg hover:border-[#111110] transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVoices.map((voice) => {
              const isSelected = voice.id === selectedVoiceId;
              const isPreviewing = previewingVoiceId === voice.id;
              return (
                <article
                  key={voice.id}
                  className={`bg-white rounded-xl border p-6 flex flex-col justify-between space-y-5 transition-colors ${
                    isSelected ? 'border-[#111110]' : 'border-[#E5E4DF] hover:border-[#D0CFC9]'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Unboxed Metadata Kicker (Zero-Pill Discipline) */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#575653]">
                      <span className="font-medium text-[#111110]">{voice.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{voice.accent}</span>
                      <span aria-hidden="true">·</span>
                      <span>{voice.gender}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{voice.sampleRateHz / 1000} kHz</span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="font-display text-lg font-bold text-[#111110]">
                        {voice.name}
                      </h2>
                      <span className="font-mono tabular-nums text-xs text-[#575653]">
                        {voice.fundamentalHz} Hz F0
                      </span>
                    </div>

                    <p className="text-xs text-[#575653] leading-relaxed">
                      {voice.description}
                    </p>

                    <div className="pt-2 border-t border-[#E5E4DF] text-xs text-[#575653] flex items-center justify-between font-mono tabular-nums">
                      <span>Application: {voice.useCase}</span>
                      <span>{voice.snrDb || 42.0} dB SNR</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E5E4DF] flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handlePreviewVoice(voice)}
                      aria-label={isPreviewing ? `Stop preview of ${voice.name}` : `Audition ${voice.name}`}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isPreviewing
                          ? 'bg-[#D94E1F] text-white'
                          : 'bg-[#FAF9F6] text-[#111110] border border-[#D0CFC9] hover:border-[#111110]'
                      }`}
                    >
                      {isPreviewing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPreviewing ? 'Stop Sample' : 'Audition Voice'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectVoiceForStudio(voice.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Select for Synthesis</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
