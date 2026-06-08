/**
 * Full-screen CRT scanlines + a moving brighter sweep line.
 * Sits above all content but below toasts. Never captures pointer events.
 */
export function ScanlinesOverlay(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 50 }}
    >
      {/* Static dense scanline texture */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(255,0,51,0.045) 3px, rgba(255,0,51,0.045) 3px)",
          mixBlendMode: "screen",
        }}
      />
      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* Moving sweep line */}
      <div
        className="absolute left-0 right-0 h-[2px] animate-scan"
        style={{
          top: 0,
          background:
            "linear-gradient(to bottom, transparent, rgba(255,23,68,0.55), transparent)",
          boxShadow: "0 0 12px rgba(255,0,51,0.45)",
        }}
      />
    </div>
  );
}
