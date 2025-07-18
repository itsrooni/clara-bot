// components/VisualizerBars.js
export default function VisualizerBars({ active = false }) {
  return (
    <div
      className="flex gap-1 items-end w-full justify-center"
      aria-label="Audio visualizer"
      style={{
        minHeight: '28px',  // Smaller height for the bar area (like a text input)
        maxWidth: '100%',
        padding: '2px 0',
        transition: 'min-height 0.2s'
      }}
    >
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
        <div
          key={i}
          className="rounded bg-blue-500 transition-all duration-200"
          style={{
            width: '12%',             // Each bar takes about 12% of container (so 7 bars ~ 84%)
            minWidth: '18px',         // Makes bars a little chunkier
            maxWidth: '26px',
            height: active
              ? `${Math.floor(Math.random() * 12) + 12}px`   // 12px–24px tall when active
              : "12px",                                      // 12px at rest
            animation: active
              ? `bounce 0.${i + 1}s infinite alternate`
              : "none"
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          to { transform: scaleY(1.7); }
        }
      `}</style>
    </div>
  );
}


