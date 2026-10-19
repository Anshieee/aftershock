/**
 * EvidenceMotif — VARIANT 03 decorative artwork layer ("evidence lens").
 *
 * A hand-drawn, palette-restricted SVG: an aftershock burst (jolt ticks +
 * broken ripple arcs) from one point — conceptually *a publication* — with
 * lavender hairlines radiating out to seven abstract finding nodes, plus
 * dashed hairlines tying findings to findings ("works citing works").
 *
 * HARD INTEGRITY RULE: this is DECORATIVE ARTWORK, not data. It contains no
 * text, no metrics, no dates, no titles, no claims, and fetches nothing.
 * Every node carries only an abstract shape (ring, square, triangle, wave,
 * plus, twin dots). The visible caption "Illustrative composition — not
 * evidence data." lives on the page beside this layer (LandingPage), not
 * inside the art. The whole svg is aria-hidden: screen readers hear the
 * caption, never the decoration.
 *
 * LEGIBILITY CONTRACT (desktop md+): the svg anchors top-right of the page;
 * its lower-LEFT band (viewBox x < ~230 past the ripple zone) stays empty so
 * the indigo/colored nodes never sit under the wordmark or lede text — only
 * the faint lavender arcs may cross the headline zone. Small screens show a
 * scaled crop from the top-right corner for the same reason.
 *
 * Nodes shift subtly (transform-only) when the artwork itself is hovered —
 * see landing-v3.css; disabled under prefers-reduced-motion.
 */
const hairline = '#DED6FA';
const indigo = '#665C91';
const deep = '#524A78';
const amber = '#E9B867';
const sage = '#658C79';
const rose = '#B85F59';

export default function EvidenceMotif() {
  return (
    <svg
      viewBox="0 0 760 620"
      className="motif-svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* — Ripple arcs: broken concentric circles around the origin burst —
          the "aftershock". Irregular dash rhythms keep the hand-drawn feel. */}
      <g fill="none" strokeLinecap="round">
        <circle
          cx="248"
          cy="66"
          r="64"
          stroke={hairline}
          strokeWidth="2.4"
          strokeDasharray="80 26 66 22"
          opacity="0.95"
        />
        <circle
          cx="248"
          cy="66"
          r="112"
          stroke={hairline}
          strokeWidth="2"
          strokeDasharray="112 40 74 28"
          transform="rotate(38 248 66)"
          opacity="0.85"
        />
        <circle
          cx="248"
          cy="66"
          r="168"
          stroke={hairline}
          strokeWidth="2"
          strokeDasharray="140 52 96 38"
          transform="rotate(118 248 66)"
          opacity="0.6"
        />
      </g>

      {/* — Hairlines: lavender guides bowing from the burst to each node. — */}
      <g fill="none" stroke={hairline} strokeWidth="2" strokeLinecap="round" opacity="0.9">
        <path d="M258 72 Q330 140 414 244" />
        <path d="M262 64 Q400 80 548 140" />
        <path d="M266 80 Q420 180 568 328" />
        <path d="M270 96 Q370 230 470 418" />
        <path d="M264 104 Q420 320 532 536" />
        <path d="M254 112 Q310 320 398 552" />
        <path d="M268 116 Q300 300 320 456" />
      </g>
      {/* — Secondary hairlines: findings tied to findings (dashed). — */}
      <g
        fill="none"
        stroke={hairline}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2 9"
      >
        <path d="M426 262 Q440 340 462 408" />
        <path d="M548 168 Q560 240 590 316" />
        <path d="M408 288 Q360 380 322 462" />
      </g>

      {/* — The burst: short jolt ticks + one indigo hub, top-right. — */}
      <g className="motif-node motif-node--n0">
        <g stroke={indigo} strokeWidth="2.4" strokeLinecap="round">
          <path d="M248 42 L248 57" />
          <path d="M229 51 L242 58" />
          <path d="M267 51 L254 58" />
          <path d="M222 73 L237 66" />
          <path d="M274 73 L259 66" />
        </g>
        <circle cx="248" cy="64" r="6" fill={deep} />
      </g>

      {/* — Finding nodes: abstract shapes only. No text, ever. — */}
      {/* n1 — open ring around a filled point */}
      <g className="motif-node motif-node--n1">
        <path
          d="M407 238 A19 19 0 1 0 439 228"
          fill="none"
          stroke={indigo}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="421" cy="246" r="5.5" fill={deep} />
      </g>

      {/* n2 — tilted square with an inner dot */}
      <g className="motif-node motif-node--n2">
        <rect
          x="541"
          y="131"
          width="28"
          height="28"
          transform="rotate(18 555 145)"
          fill="none"
          stroke={indigo}
          strokeWidth="2.2"
        />
        <circle cx="555" cy="145" r="3.2" fill={indigo} />
      </g>

      {/* n3 — triangle */}
      <g className="motif-node motif-node--n3">
        <path
          d="M575 316 L597 352 L553 350 Z"
          fill="none"
          stroke={indigo}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>

      {/* n4 — dashed ring with a center dot */}
      <g className="motif-node motif-node--n4">
        <circle
          cx="465"
          cy="425"
          r="17"
          fill="none"
          stroke={indigo}
          strokeWidth="2"
          strokeDasharray="4 6"
        />
        <circle cx="465" cy="425" r="2.6" fill={deep} />
      </g>

      {/* n5 — amber plus with a small tick notch under (accent, <2% stroke) */}
      <g className="motif-node motif-node--n5">
        <g stroke={amber} strokeWidth="2.6" strokeLinecap="round">
          <path d="M530 541 h20 M540 531 v20" />
          <path d="M532 561 q8 4 16 0" opacity="0.75" fill="none" />
        </g>
      </g>

      {/* n6 — sage wave inside a ring */}
      <g className="motif-node motif-node--n6">
        <circle cx="390" cy="565" r="15" fill={sage} fillOpacity="0.16" stroke={indigo} strokeWidth="2" />
        <path
          d="M380 567 q5 -7 10 0 t10 0"
          fill="none"
          stroke={sage}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>

      {/* n7 — twin dots, muted-rose satellite (accent, <2% stroke) */}
      <g className="motif-node motif-node--n7">
        <circle cx="307" cy="474" r="4" fill={rose} opacity="0.85" />
        <circle cx="323" cy="462" r="5.5" fill="none" stroke={rose} strokeWidth="2" opacity="0.8" />
      </g>
    </svg>
  );
}
