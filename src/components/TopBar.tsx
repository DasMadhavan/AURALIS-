import React from 'react';

export type ActiveTab = 'tts' | 'cloning' | 'video' | 'library';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onExportManifest: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onExportManifest,
}) => {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'tts', label: 'Text to Speech' },
    { id: 'cloning', label: 'Voice Cloning' },
    { id: 'video', label: 'Video Dubbing' },
    { id: 'library', label: 'Voice Library' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-[#E5E4DF]">
      <div className="max-w-[1380px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Brand Title, single text element on one line */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('tts');
          }}
          className="font-display text-lg font-bold tracking-tight text-[#111110] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#D94E1F]"
        >
          Auralis Studio
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav aria-label="Primary Workspace Navigation" className="flex items-center gap-6 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#D94E1F] ${
                  isActive
                    ? 'border-[#D94E1F] text-[#111110] font-semibold'
                    : 'border-transparent text-[#575653] hover:text-[#111110] hover:border-[#D0CFC9]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportManifest}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#111110] rounded-lg hover:bg-[#D94E1F] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#D94E1F]"
          >
            Export Audio Manifest
          </button>
        </div>
      </div>
    </header>
  );
};
