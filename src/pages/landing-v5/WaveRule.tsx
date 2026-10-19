/**
 * The indigo "wave" rule — the page's single typographic interpretation of
 * the Aftershock wave identity in line form. A hairline SVG sine path that
 * runs beneath the display statement and gives ONE small pulse when the
 * primary CTA is hovered/focused (state class passed in; no observers, no
 * animation loops, reduced-motion-safe via the shell's global rule).
 */
export default function WaveRule({ pulsing }: { pulsing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 250 24"
      preserveAspectRatio="none"
      className={`v5-wave ${pulsing ? 'v5-wave--pulse' : ''} mt-3 h-5 w-52 md:w-64 lg:w-72`}
      // Static wave, hand-set: alternating quadratic arcs, 5 half-waves.
      fill="none"
    >
      <path
        d="M0 15 Q 25 5 50 12 T 100 12 T 150 12 T 200 12 T 250 12"
        stroke="#665C91"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
