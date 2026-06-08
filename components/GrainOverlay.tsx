/**
 * Static-ish film grain overlay. Inline SVG noise, no network fetch.
 */
export function GrainOverlay(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none grain"
      style={{ zIndex: 40, opacity: 0.06, mixBlendMode: "overlay" }}
    />
  );
}
