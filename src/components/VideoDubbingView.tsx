import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  Languages,
  Video,
  Image as ImageIcon,
  Eye,
  Upload,
  Wand2,
  ArrowUpRight,
} from 'lucide-react';
import {
  VoiceProfile,
  VideoDubSegment,
  syncVideoDubSegments,
  generateDeterministicWavBytes,
} from '../utils/audioEngine';
import { VIDEO_SCENE_PRESETS, VideoScenePreset } from '../data/presets';

interface VideoDubbingViewProps {
  voices: VoiceProfile[];
}

const TARGET_LANGUAGES = ['English', 'Spanish', 'Japanese', 'German', 'French'];

export const VideoDubbingView: React.FC<VideoDubbingViewProps> = ({ voices }) => {
  const [selectedSceneId, setSelectedSceneId] = useState<string>(VIDEO_SCENE_PRESETS[0].id);
  const [targetLanguage, setTargetLanguage] = useState<string>('Spanish');
  const [segments, setSegments] = useState<VideoDubSegment[]>(VIDEO_SCENE_PRESETS[0].segments);
  const [includeAmbientSfx, setIncludeAmbientSfx] = useState<boolean>(true);
  const [sfxPrompt, setSfxPrompt] = useState<string>(VIDEO_SCENE_PRESETS[0].ambientSfxPrompt);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isRenderingDub, setIsRenderingDub] = useState<boolean>(false);
  const [dubStatusMsg, setDubStatusMsg] = useState<string | null>(null);
  const [masterDubAudioBase64, setMasterDubAudioBase64] = useState<string | null>(null);

  // ElevenLabs Sound Generation API (/v1/sound-generation) state
  const [sfxDurationSec, setSfxDurationSec] = useState<number>(3.5);
  const [sfxInfluence, setSfxInfluence] = useState<number>(0.7);
  const [isGeneratingSfx, setIsGeneratingSfx] = useState<boolean>(false);
  const [generatedSfx, setGeneratedSfx] = useState<{
    sfxId: string;
    prompt: string;
    durationSeconds: number;
    audioBase64: string;
    mimeType: string;
    provider: string;
  } | null>(null);
  const [isPlayingSfx, setIsPlayingSfx] = useState<boolean>(false);
  const sfxAudioRef = useRef<HTMLAudioElement | null>(null);

  // 1. Gemini Omni 1.1 Flash (gemini-omni-1.1-flash) Text-to-Video state
  const [videoPrompt, setVideoPrompt] = useState<string>(
    'Aerial tracking shot over a crystalline Nordic glacier canyon at blue hour with mist rising from meltwater.'
  );
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '10s'>('5s');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [generatedVideo, setGeneratedVideo] = useState<{
    videoId: string;
    prompt: string;
    aspectRatio: '16:9' | '9:16';
    duration: '5s' | '10s';
    videoBase64: string | null;
    videoUri: string | null;
    posterDataUri?: string;
    mimeType: string;
    fallbackMode?: boolean;
    provider: string;
  } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // 2. Gemini Nano Banana 2.1 (gemini-nano-banana-2.1) Create & Edit Images state
  const [imagePrompt, setImagePrompt] = useState<string>(
    'Minimalist acoustic broadcast studio with warm cedar slat walls, vintage ribbon microphone, and amber key light.'
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [referenceImageBase64, setReferenceImageBase64] = useState<string | null>(null);
  const [referenceImageMime, setReferenceImageMime] = useState<string>('image/png');
  const [referenceImageName, setReferenceImageName] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [generatedImage, setGeneratedImage] = useState<{
    imageId: string;
    prompt: string;
    aspectRatio: '16:9' | '9:16' | '1:1';
    isEdit: boolean;
    imageDataUri: string;
    base64: string;
    mimeType: string;
    provider: string;
  } | null>(null);
  const [customMonitorBackdropUri, setCustomMonitorBackdropUri] = useState<string | null>(null);
  const imageUploadRef = useRef<HTMLInputElement | null>(null);
  const backdropImageRef = useRef<HTMLImageElement | null>(null);

  // 3. NVIDIA NIM Multimodal Vision Analyzer (meta/llama-3.2-90b-vision-instruct) state
  const [visionImageUrl, setVisionImageUrl] = useState<string>(
    'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg'
  );
  const [visionQuestion, setVisionQuestion] = useState<string>('Is there a car in this image?');
  const [isAnalyzingVision, setIsAnalyzingVision] = useState<boolean>(false);
  const [visionResult, setVisionResult] = useState<{
    model: string;
    imageUrl: string;
    question: string;
    answer: string;
    suggestedVoiceover: string;
    suggestedFfxPrompt: string;
    provider: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const dubAudioRef = useRef<HTMLAudioElement | null>(null);

  const activeScene: VideoScenePreset = useMemo(
    () => VIDEO_SCENE_PRESETS.find((s) => s.id === selectedSceneId) || VIDEO_SCENE_PRESETS[0],
    [selectedSceneId]
  );

  const syncedSegments = useMemo(
    () => syncVideoDubSegments(segments, targetLanguage),
    [segments, targetLanguage]
  );

  const currentActiveSegment = useMemo(
    () =>
      syncedSegments.find(
        (seg) => currentTimeSec >= seg.startSec && currentTimeSec <= seg.endSec
      ) || syncedSegments[0],
    [syncedSegments, currentTimeSec]
  );

  // Preload custom monitor backdrop image whenever customMonitorBackdropUri changes
  useEffect(() => {
    if (!customMonitorBackdropUri) {
      backdropImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      backdropImageRef.current = img;
      // Trigger canvas redraw
      setCurrentTimeSec((prev) => prev);
    };
    img.src = customMonitorBackdropUri;
  }, [customMonitorBackdropUri]);

  const handleSelectScene = (sceneId: string) => {
    const found = VIDEO_SCENE_PRESETS.find((s) => s.id === sceneId);
    if (!found) return;
    setIsPlaying(false);
    setCurrentTimeSec(0);
    setSelectedSceneId(found.id);
    setSegments(found.segments);
    setSfxPrompt(found.ambientSfxPrompt);
    setCustomMonitorBackdropUri(null);
    setDubStatusMsg(null);
  };

  // Render Cinema Preview Frame onto Canvas whenever currentTimeSec, scene, backdrop, or language updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    if (backdropImageRef.current) {
      ctx.drawImage(backdropImageRef.current, 0, 0, w, h);
      ctx.fillStyle = 'rgba(10, 10, 12, 0.36)';
      ctx.fillRect(0, 0, w, h);
    } else {
      // 1. Background Cinematic Scene Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (activeScene.visualTheme === 'glacier') {
        grad.addColorStop(0, '#0C192C');
        grad.addColorStop(0.55, '#1B3B5A');
        grad.addColorStop(1, '#0A111A');
      } else {
        grad.addColorStop(0, '#181615');
        grad.addColorStop(0.6, '#29231F');
        grad.addColorStop(1, '#0D0C0B');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 2. Architectural / Horizon Geometry
      ctx.save();
      if (activeScene.visualTheme === 'glacier') {
        ctx.fillStyle = 'rgba(148, 210, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.65);
        ctx.lineTo(w * 0.22, h * 0.44);
        ctx.lineTo(w * 0.48, h * 0.54);
        ctx.lineTo(w * 0.76, h * 0.38);
        ctx.lineTo(w, h * 0.56);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(217, 78, 31, 0.22)';
        ctx.lineWidth = 2;
        for (let i = 1; i <= 5; i++) {
          ctx.beginPath();
          ctx.moveTo((w / 6) * i, 0);
          ctx.lineTo((w / 6) * i, h * 0.72);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. Top Cinema Timecode & Telemetry HUD
    ctx.fillStyle = 'rgba(10, 10, 10, 0.68)';
    ctx.fillRect(20, 18, w - 40, 38);
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FAF9F6';
    const formattedTime = `TC 00:00:${currentTimeSec.toFixed(2).padStart(5, '0')} / 00:00:${activeScene.durationSec.toFixed(2)}`;
    ctx.fillText(formattedTime, 34, 41);

    ctx.fillStyle = '#D94E1F';
    ctx.fillText(
      `DUB: ${targetLanguage.toUpperCase()} · ${activeScene.resolution} · ${activeScene.fps} FPS`,
      w - 340,
      41
    );

    // 4. Dynamic Acoustic Lip-Sync Visualizer in center
    const centerY = h * 0.48;
    const barCount = 36;
    const totalWidth = 360;
    const startX = (w - totalWidth) / 2;

    for (let i = 0; i < barCount; i++) {
      const wave = isPlaying
        ? Math.abs(Math.sin(currentTimeSec * 9 + i * 0.45)) * 42 + 8
        : Math.abs(Math.sin(i * 0.35 + currentTimeSec)) * 16 + 6;
      ctx.fillStyle = isPlaying ? '#D94E1F' : 'rgba(250, 249, 246, 0.45)';
      ctx.fillRect(startX + i * 10, centerY - wave / 2, 6, wave);
    }

    // 5. Burned-In Localized Subtitle Scrim & Two-Line Word Wrap
    if (currentActiveSegment) {
      ctx.fillStyle = 'rgba(8, 8, 8, 0.84)';
      ctx.fillRect(36, h - 104, w - 72, 82);

      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#D94E1F';
      ctx.fillText(
        `${currentActiveSegment.speaker} (${currentActiveSegment.lipSyncStatus} · ${currentActiveSegment.stretchRatio}x)`,
        54,
        h - 80
      );

      ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      const fullQuote = `“${currentActiveSegment.localizedText}”`;
      const words = fullQuote.split(' ');
      let line1 = '';
      let line2 = '';
      for (const word of words) {
        if ((line1 + ' ' + word).trim().length <= 68 && !line2) {
          line1 = (line1 + ' ' + word).trim();
        } else {
          line2 = (line2 + ' ' + word).trim();
        }
      }
      ctx.fillText(line1, 54, h - 56);
      if (line2) {
        ctx.fillText(line2, 54, h - 35);
      }
    }
  }, [
    currentTimeSec,
    activeScene,
    targetLanguage,
    isPlaying,
    currentActiveSegment,
    customMonitorBackdropUri,
  ]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) window.clearInterval(playbackTimerRef.current);
      return;
    }

    playbackTimerRef.current = window.setInterval(() => {
      setCurrentTimeSec((prev) => {
        const next = Number((prev + 0.2).toFixed(2));
        if (next >= activeScene.durationSec) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 200);

    return () => {
      if (playbackTimerRef.current) window.clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, activeScene.durationSec]);

  const handleTogglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (dubAudioRef.current) dubAudioRef.current.pause();
      return;
    }

    setIsPlaying(true);
    const wavBytes = generateDeterministicWavBytes(
      currentActiveSegment?.localizedText || 'Dubbed audio playback',
      140
    );
    let binary = '';
    for (let i = 0; i < wavBytes.byteLength; i++) {
      binary += String.fromCharCode(wavBytes[i]);
    }
    const base64 = masterDubAudioBase64 || window.btoa(binary);
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    dubAudioRef.current = audio;
    audio.play().catch(() => {});
  };

  const handleUpdateSegmentVoice = (segmentId: string, newVoiceId: string) => {
    setSegments((prev) =>
      prev.map((seg) => (seg.id === segmentId ? { ...seg, voiceId: newVoiceId } : seg))
    );
  };

  const handleUpdateSegmentTranslation = (segmentId: string, newText: string) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === segmentId
          ? {
              ...seg,
              translations: {
                ...seg.translations,
                [targetLanguage]: newText,
              },
            }
          : seg
      )
    );
  };

  const handleRenderMasterDub = async () => {
    setIsRenderingDub(true);
    setDubStatusMsg(null);

    try {
      const response = await fetch('/api/video/dub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments,
          targetLanguage,
          includeAmbientSfx,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to render dubbed track.');
      }
      setMasterDubAudioBase64(data.masterAudioBase64);
      setDubStatusMsg(
        `Rendered ${targetLanguage} master stem (${syncedSegments.length} time-locked speaker segments + ${
          includeAmbientSfx ? 'Foley SFX stem' : 'Dry vocal stem'
        }).`
      );
    } catch (err: any) {
      setDubStatusMsg(err?.message || 'Error rendering dubbed track.');
    } finally {
      setIsRenderingDub(false);
    }
  };

  const handleGenerateSfxStem = async () => {
    if (!sfxPrompt.trim()) return;
    setIsGeneratingSfx(true);

    try {
      const response = await fetch('/api/sound-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: sfxPrompt,
          durationSeconds: sfxDurationSec,
          promptInfluence: sfxInfluence,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setGeneratedSfx(data);
      }
    } catch {
      // Handled gracefully
    } finally {
      setIsGeneratingSfx(false);
    }
  };

  const handleTogglePlaySfx = () => {
    if (!generatedSfx) return;
    if (isPlayingSfx && sfxAudioRef.current) {
      sfxAudioRef.current.pause();
      setIsPlayingSfx(false);
      return;
    }
    const audio = new Audio(`data:${generatedSfx.mimeType};base64,${generatedSfx.audioBase64}`);
    sfxAudioRef.current = audio;
    setIsPlayingSfx(true);
    audio.onended = () => setIsPlayingSfx(false);
    audio.onerror = () => setIsPlayingSfx(false);
    audio.play().catch(() => setIsPlayingSfx(false));
  };

  // Handler 1: Generate Video from Text (gemini-omni-1.1-flash via Interactions API)
  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;
    setIsGeneratingVideo(true);
    setVideoError(null);

    try {
      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          aspectRatio: videoAspectRatio,
          duration: videoDuration,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate video.');
      }
      setGeneratedVideo(data);
      if (data.posterDataUri) {
        setCustomMonitorBackdropUri(data.posterDataUri);
      }
    } catch (err: any) {
      setVideoError(err?.message || 'Unable to generate video.');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // Handler 2: Upload Reference Image for Editing with gemini-nano-banana-2.1
  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        setReferenceImageMime(match[1]);
        setReferenceImageBase64(match[2]);
        setReferenceImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handler 2b: Create or Edit Image with gemini-nano-banana-2.1
  const handleGenerateOrEditImage = async () => {
    if (!imagePrompt.trim()) return;
    setIsGeneratingImage(true);

    try {
      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          aspectRatio: imageAspectRatio,
          base64ImageData: referenceImageBase64,
          mimeType: referenceImageMime,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setGeneratedImage(data);
      }
    } catch {
      // Handled gracefully
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Handler 3: NVIDIA NIM Vision Analysis (meta/llama-3.2-90b-vision-instruct)
  const handleAnalyzeWithNvidiaVision = async () => {
    if (!visionImageUrl.trim()) return;
    setIsAnalyzingVision(true);

    try {
      const response = await fetch('/api/nvidia/vision-director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: visionImageUrl,
          question: visionQuestion,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setVisionResult(data);
      }
    } catch {
      // Handled gracefully
    } finally {
      setIsAnalyzingVision(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <section className="pt-4 pb-6 border-b border-[#E5E4DF]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs font-medium tracking-wide text-[#575653]">
              Automated Video Dubbing · Omni Flash Text-to-Video · Nano Banana 2.1 Image Studio · NVIDIA Vision
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#111110] leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Generate cinema video, edit studio backdrops, and dub multi-speaker dialogue into 32 languages.
            </h1>
          </div>

          <div className="lg:col-span-4 flex lg:justify-end">
            <div className="flex items-center gap-1.5 p-1 bg-[#F3F2EE] rounded-lg">
              {VIDEO_SCENE_PRESETS.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => handleSelectScene(scene.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedSceneId === scene.id
                      ? 'bg-white text-[#111110] shadow-xs'
                      : 'text-[#575653] hover:text-[#111110]'
                  }`}
                >
                  {scene.visualTheme === 'glacier' ? '01. Glacier Doc' : '02. Hardware Keynote'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main Video Dubbing Studio Split */}
      <section aria-label="Video Dubbing Workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Cinema Monitor Canvas & Timeline Scrubber */}
        <div className="lg:col-span-7 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#111110]">
                {activeScene.title}
              </h2>
              <p className="text-xs text-[#575653]">{activeScene.subtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-[#575653]" />
              <label htmlFor="dub-target-language" className="text-xs font-semibold text-[#111110]">
                Target Dub Language:
              </label>
              <select
                id="dub-target-language"
                value={targetLanguage}
                onChange={(e) => {
                  setTargetLanguage(e.target.value);
                  setDubStatusMsg(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive HTML5 Cinema Monitor */}
          <div className="relative rounded-lg overflow-hidden border border-[#111110] bg-[#0C192C]">
            <canvas
              ref={canvasRef}
              width={760}
              height={380}
              data-testid="video-dub-canvas"
              className="w-full h-auto block"
            />
          </div>

          {/* Transport Controls & Scrubber */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleTogglePlayback}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause Dub Preview' : 'Play Synchronized Dub'}</span>
              </button>

              <div className="flex-1">
                <label htmlFor="video-timeline-scrubber" className="sr-only">
                  Timeline Scrubber
                </label>
                <input
                  id="video-timeline-scrubber"
                  type="range"
                  min={0}
                  max={activeScene.durationSec}
                  step={0.1}
                  value={currentTimeSec}
                  onChange={(e) => setCurrentTimeSec(parseFloat(e.target.value))}
                  className="studio-slider"
                />
              </div>

              <span className="font-mono tabular-nums text-xs text-[#575653] whitespace-nowrap shrink-0">
                {currentTimeSec.toFixed(1)}s / {activeScene.durationSec.toFixed(1)}s
              </span>
            </div>

            {/* ElevenLabs AI Sound Effects (/v1/sound-generation) Stem Studio */}
            <div className="p-4 bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="sfx-stem-toggle" className="text-xs font-semibold text-[#111110] cursor-pointer block">
                    ElevenLabs AI Sound Effects API (/v1/sound-generation)
                  </label>
                  <p className="text-[11px] text-[#575653]">
                    Synthesize custom Foley and atmospheric audio stems from text prompts.
                  </p>
                </div>
                <input
                  id="sfx-stem-toggle"
                  type="checkbox"
                  checked={includeAmbientSfx}
                  onChange={(e) => setIncludeAmbientSfx(e.target.checked)}
                  className="w-4 h-4 accent-[#D94E1F] rounded cursor-pointer"
                />
              </div>

              <input
                type="text"
                aria-label="Ambient Sound Effects Prompt"
                value={sfxPrompt}
                onChange={(e) => setSfxPrompt(e.target.value)}
                className="w-full px-3 py-2 text-xs text-[#111110] bg-white border border-[#D0CFC9] rounded-md focus:outline-none focus:border-[#111110]"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-4 text-xs text-[#575653] font-mono tabular-nums">
                  <label className="flex items-center gap-1.5">
                    <span>Duration:</span>
                    <select
                      aria-label="SFX Duration Seconds"
                      value={sfxDurationSec}
                      onChange={(e) => setSfxDurationSec(parseFloat(e.target.value))}
                      className="px-2 py-1 bg-white border border-[#D0CFC9] rounded text-[#111110]"
                    >
                      <option value={2.0}>2.0s</option>
                      <option value={3.5}>3.5s</option>
                      <option value={5.0}>5.0s</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span>Prompt Influence:</span>
                    <select
                      aria-label="SFX Prompt Influence"
                      value={sfxInfluence}
                      onChange={(e) => setSfxInfluence(parseFloat(e.target.value))}
                      className="px-2 py-1 bg-white border border-[#D0CFC9] rounded text-[#111110]"
                    >
                      <option value={0.5}>50%</option>
                      <option value={0.7}>70%</option>
                      <option value={0.9}>90%</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  {generatedSfx && (
                    <button
                      type="button"
                      onClick={handleTogglePlaySfx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111110] bg-white border border-[#111110] rounded-lg hover:bg-[#111110] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isPlayingSfx ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPlayingSfx ? 'Stop SFX' : `Play SFX (${generatedSfx.durationSeconds}s)`}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateSfxStem}
                    disabled={isGeneratingSfx}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isGeneratingSfx ? 'Generating SFX...' : 'Generate SFX Stem'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Timecode Transcript & Lip-Sync Alignment Editor */}
        <div className="lg:col-span-5 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E4DF]">
            <div>
              <h2 className="font-display text-base font-bold text-[#111110]">
                Time-Locked Speaker Tracks ({syncedSegments.length})
              </h2>
              <p className="text-xs text-[#575653]">
                Automatic prosody time-stretching locks localized speech to speaker lip motion.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {syncedSegments.map((seg) => {
              const isCurrent = currentActiveSegment?.id === seg.id;
              return (
                <div
                  key={seg.id}
                  onClick={() => setCurrentTimeSec(seg.startSec)}
                  className={`p-4 rounded-lg border transition-colors cursor-pointer space-y-3 ${
                    isCurrent
                      ? 'bg-[#FAF9F6] border-[#111110]'
                      : 'bg-white border-[#E5E4DF] hover:border-[#D0CFC9]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#111110]">{seg.speaker}</span>
                      <span aria-hidden="true" className="text-[#575653]">·</span>
                      <span className="font-mono tabular-nums text-[#575653]">
                        {seg.startSec.toFixed(1)}s – {seg.endSec.toFixed(1)}s
                      </span>
                    </div>

                    <span className="font-mono tabular-nums text-[11px] text-[#575653]">
                      {seg.lipSyncStatus} ({seg.stretchRatio}x rate)
                    </span>
                  </div>

                  <div>
                    <label htmlFor={`dub-voice-${seg.id}`} className="sr-only">
                      Assigned Voice for {seg.speaker}
                    </label>
                    <select
                      id={`dub-voice-${seg.id}`}
                      value={seg.voiceId}
                      onChange={(e) => handleUpdateSegmentVoice(seg.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2.5 py-1.5 text-xs font-medium text-[#111110] bg-white border border-[#D0CFC9] rounded-md"
                    >
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          Dub Voice: {v.name} ({v.accent})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`dub-script-${seg.id}`} className="sr-only">
                      Localized Script for {seg.speaker}
                    </label>
                    <textarea
                      id={`dub-script-${seg.id}`}
                      rows={2}
                      value={seg.localizedText}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateSegmentTranslation(seg.id, e.target.value)}
                      className="w-full p-2.5 text-xs text-[#111110] bg-white border border-[#D0CFC9] rounded-md focus:outline-none focus:border-[#111110]"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {dubStatusMsg && (
            <div role="status" className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-start gap-2 text-xs text-[#15803D]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{dubStatusMsg}</span>
            </div>
          )}

          <div className="pt-3 border-t border-[#E5E4DF]">
            <button
              type="button"
              onClick={handleRenderMasterDub}
              disabled={isRenderingDub}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#D94E1F] rounded-lg hover:bg-[#BF3F15] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isRenderingDub
                  ? `Rendering ${targetLanguage} Master Dub...`
                  : `Render ${targetLanguage} Master Dub Track`}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Generative Video, Image Creation/Editing & NVIDIA Vision Multimodal Studio */}
      <section
        aria-label="Generative Media & Multimodal Vision Studio"
        className="pt-8 border-t border-[#E5E4DF] space-y-6"
      >
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-[#575653]">
            gemini-omni-1.1-flash · gemini-nano-banana-2.1 · meta/llama-3.2-90b-vision-instruct
          </p>
          <h2 className="font-display text-2xl font-bold text-[#111110]">
            Generative Video, Scene Image Studio & Multimodal Vision Director
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Column 1 (4 cols): Text-to-Video Generator (gemini-omni-1.1-flash) */}
          <div className="lg:col-span-4 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E5E4DF]">
              <div className="flex items-center gap-2 min-w-0">
                <Video className="w-4 h-4 text-[#D94E1F] shrink-0" />
                <h3 className="font-display text-sm font-bold text-[#111110] truncate">
                  Generate Video from Text
                </h3>
              </div>
              <span className="font-mono text-[11px] text-[#575653] whitespace-nowrap shrink-0">
                gemini-omni-1.1-flash
              </span>
            </div>

            <div className="space-y-2">
              <label htmlFor="omni-video-prompt" className="text-xs font-semibold text-[#111110] block">
                Cinema Video Prompt
              </label>
              <textarea
                id="omni-video-prompt"
                rows={3}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Describe camera movement, subject, lighting, and atmosphere..."
                className="w-full p-2.5 text-xs text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-semibold text-[#111110] block mb-1.5">
                  Aspect Ratio (16:9 / 9:16)
                </span>
                <div className="flex items-center gap-1 p-1 bg-[#F3F2EE] rounded-lg">
                  {(['16:9', '9:16'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setVideoAspectRatio(ratio)}
                      className={`flex-1 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        videoAspectRatio === ratio
                          ? 'bg-[#111110] text-white'
                          : 'text-[#575653] hover:text-[#111110]'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="omni-video-duration" className="text-xs font-semibold text-[#111110] block mb-1.5">
                  Clip Duration
                </label>
                <select
                  id="omni-video-duration"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value as '5s' | '10s')}
                  className="w-full px-2.5 py-2 text-xs font-mono font-semibold text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg"
                >
                  <option value="5s">5s · 720p</option>
                  <option value="10s">10s · 720p</option>
                </select>
              </div>
            </div>

            {videoError && (
              <p className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-2.5">
                {videoError}
              </p>
            )}

            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>
                {isGeneratingVideo
                  ? `Generating ${videoAspectRatio} Video...`
                  : `Generate ${videoAspectRatio} Video`}
              </span>
            </button>

            {generatedVideo && (
              <div className="pt-3 border-t border-[#E5E4DF] space-y-2.5" data-testid="generated-video-card">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#575653]">
                  <span>
                    {generatedVideo.aspectRatio} · {generatedVideo.duration}
                  </span>
                  <span className="truncate max-w-[180px]">{generatedVideo.provider}</span>
                </div>

                <div
                  className={`mx-auto overflow-hidden rounded-lg border border-[#111110] bg-[#0C192C] ${
                    generatedVideo.aspectRatio === '9:16' ? 'max-w-[200px] aspect-[9/16]' : 'w-full aspect-video'
                  }`}
                >
                  {generatedVideo.videoBase64 || generatedVideo.videoUri ? (
                    <video
                      controls
                      playsInline
                      className="w-full h-full object-cover"
                      src={
                        generatedVideo.videoBase64
                          ? `data:${generatedVideo.mimeType};base64,${generatedVideo.videoBase64}`
                          : generatedVideo.videoUri || undefined
                      }
                    />
                  ) : (
                    <img
                      src={generatedVideo.posterDataUri}
                      alt={generatedVideo.prompt}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Column 2 (4 cols): Create & Edit Studio Images (gemini-nano-banana-2.1) */}
          <div className="lg:col-span-4 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E5E4DF]">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-[#D94E1F] shrink-0" />
                <h3 className="font-display text-sm font-bold text-[#111110] truncate">
                  Create & Edit Images
                </h3>
              </div>
              <span className="font-mono text-[11px] text-[#575653] whitespace-nowrap shrink-0">
                gemini-nano-banana-2.1
              </span>
            </div>

            <div className="space-y-2">
              <label htmlFor="nano-image-prompt" className="text-xs font-semibold text-[#111110] block">
                {referenceImageBase64 ? 'Image Editing Instruction' : 'Image Creation Prompt'}
              </label>
              <textarea
                id="nano-image-prompt"
                rows={3}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe a new scene image or instructions to edit your reference image..."
                className="w-full p-2.5 text-xs text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#F3F2EE] rounded-lg">
                {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setImageAspectRatio(ratio)}
                    className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                      imageAspectRatio === ratio
                        ? 'bg-[#111110] text-white'
                        : 'text-[#575653] hover:text-[#111110]'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>

              <div>
                <input
                  ref={imageUploadRef}
                  type="file"
                  accept="image/*"
                  onChange={handleReferenceImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => imageUploadRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg hover:border-[#111110] transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{referenceImageName ? 'Replace Image' : 'Upload to Edit'}</span>
                </button>
              </div>
            </div>

            {referenceImageName && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF9F6] border border-[#E5E4DF] rounded-md text-xs">
                <span className="text-[#111110] font-medium truncate">
                  Editing: {referenceImageName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReferenceImageBase64(null);
                    setReferenceImageName(null);
                  }}
                  className="text-[#D94E1F] font-semibold hover:underline cursor-pointer ml-2"
                >
                  Clear
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateOrEditImage}
              disabled={isGeneratingImage}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>
                {isGeneratingImage
                  ? 'Synthesizing Image...'
                  : referenceImageBase64
                  ? 'Edit Image with Prompt'
                  : 'Create Studio Image'}
              </span>
            </button>

            {generatedImage && (
              <div className="pt-3 border-t border-[#E5E4DF] space-y-2.5" data-testid="generated-image-card">
                <div className="overflow-hidden rounded-lg border border-[#E5E4DF] bg-[#111110]">
                  <img
                    src={generatedImage.imageDataUri}
                    alt={generatedImage.prompt}
                    className="w-full h-40 object-cover block"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomMonitorBackdropUri(generatedImage.imageDataUri)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-md hover:border-[#111110] cursor-pointer"
                  >
                    <span>Set as Monitor Backdrop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceImageBase64(generatedImage.base64);
                      setReferenceImageMime(generatedImage.mimeType);
                      setReferenceImageName('generated-scene-frame');
                    }}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#D94E1F] bg-[#FAF9F6] border border-[#D0CFC9] rounded-md hover:border-[#D94E1F] cursor-pointer"
                  >
                    <span>Edit This Frame</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Column 3 (4 cols): NVIDIA NIM Multimodal Vision Director (meta/llama-3.2-90b-vision-instruct) */}
          <div className="lg:col-span-4 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#D94E1F]" />
                <h3 className="font-display text-base font-bold text-[#111110]">
                  NVIDIA NIM Vision Director
                </h3>
              </div>
              <span className="font-mono text-[11px] text-[#575653]">llama-3.2-90b-vision</span>
            </div>

            <div className="space-y-2">
              <label htmlFor="nvidia-vision-url" className="text-xs font-semibold text-[#111110] block">
                Reference Image URL (`image_url`)
              </label>
              <input
                id="nvidia-vision-url"
                type="text"
                value={visionImageUrl}
                onChange={(e) => setVisionImageUrl(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="nvidia-vision-question" className="text-xs font-semibold text-[#111110] block">
                Visual Inspection Prompt
              </label>
              <input
                id="nvidia-vision-question"
                type="text"
                value={visionQuestion}
                onChange={(e) => setVisionQuestion(e.target.value)}
                className="w-full px-2.5 py-2 text-xs text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-lg focus:outline-none focus:border-[#111110]"
              />
            </div>

            <button
              type="button"
              onClick={handleAnalyzeWithNvidiaVision}
              disabled={isAnalyzingVision}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {isAnalyzingVision
                  ? 'Analyzing Scene with Llama 3.2 90B Vision...'
                  : 'Inspect Image & Derive Audio Cues'}
              </span>
            </button>

            {visionResult && (
              <div className="pt-3 border-t border-[#E5E4DF] space-y-3" data-testid="nvidia-vision-result">
                <div className="p-3 bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg space-y-1.5">
                  <p className="text-[11px] font-mono text-[#D94E1F] font-semibold">
                    {visionResult.model}
                  </p>
                  <p className="text-xs text-[#111110] leading-relaxed">{visionResult.answer}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentActiveSegment) {
                        handleUpdateSegmentTranslation(
                          currentActiveSegment.id,
                          visionResult.suggestedVoiceover
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111110] bg-[#FAF9F6] border border-[#D0CFC9] rounded-md hover:border-[#111110] cursor-pointer"
                  >
                    <span>Send Voiceover to Active Track</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSfxPrompt(visionResult.suggestedFfxPrompt)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#D94E1F] bg-[#FAF9F6] border border-[#D0CFC9] rounded-md hover:border-[#D94E1F] cursor-pointer"
                  >
                    <span>Use Foley SFX Prompt</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
