/**
 * EvidenceMotif — VARIANT 03 decorative artwork layer ("evidence lens").
 *
 * A hand-drawn, palette-restricted SVG: an aftershock burst (jolt ticks +
 * broken ripple arcs) from one point — conceptually *a publication* — with
 * lavender hairlines radiating out to seven abstract finding nodes, plus a
 * few dashed hairlines tying findings to findings ("works citing works").
 *
 * HARD INTEGRITY RULE: this is DECORATIVE ARTWORK, not data. It contains no
 * text, no metrics, no dates, no titles, no claims, and fetches nothing.
 * Every node carries only an abstract shape (ring, square, triangle, wave,
 * plus, twin dots). The visible caption "Illustrative composition — not
 * evidence data." lives on the page beside this layer (LandingPage), not
 * inside the art. The whole svg is aria-hidden: screen readers hear the
 * caption, never the decoration.
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
          cx="150"
          cy="480"
          r="60"
          stroke={hairline}
          strokeWidth="2.4"
          strokeDasharray="138 34 96 30"
          opacity="0.95"
        />
        <circle
          cx="152"
          cy="478"
          r="110"
          stroke={hairline}
          strokeWidth="2"
          strokeDasharray="176 52 118 26"
          transform="rotate(38 152 478)"
          opacity="0.85"
        />
        <circle
          cx="150"
          cy="481"
          r="172"
          stroke={hairline}
          strokeWidth="2"
          strokeDasharray="208 70 132 40"
          transform="rotate(118 150 481)"
          opacity="0.6"
        />
      </g>

      {/* — Hairlines: lavender guides bowing from the burst to each node. — */}
      <g fill="none" stroke={hairline} strokeWidth="2" strokeLinecap="round" opacity="0.9">
        <path d="M158 474 Q232 408 292 324" />
        <path d="M166 468 Q300 330 456 146" />
        <path d="M172 472 Q392 380 606 222" />
        <path d="M176 478 Q362 442 550 346" />
        <path d="M180 482 Q412 502 640 470" />
        <path d="M158 488 Q300 522 452 538" />
        <path d="M146 466 Q176 320 220 190" />
      </g>
      {/* — Secondary hairlines: findings tied to findings (dashed). — */}
      <g
        fill="none"
        stroke={hairline}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2 9"
      >
        <path d="M302 316 Q426 330 546 338" />
        <path d="M470 146 Q548 160 604 208" />
        <path d="M288 306 Q252 240 226 192" />
      </g>

      {/* — The burst: short jolt ticks + one indigo hub, lower-left. — */}
      <g className="motif-node motif-node--n0">
        <g stroke={indigo} strokeWidth="2.4" strokeLinecap="round">
          <path d="M150 458 L150 473" />
          <path d="M131 467 L144 474" />
          <path d="M169 467 L156 474" />
          <path d="M124 489 L139 482" />
          <path d="M176 489 L161 482" />
        </g>
        <circle cx="150" cy="480" r="6" fill={deep} />
      </g>

      {/* — Finding nodes: abstract shapes only. No text, ever. — */}
      {/* n1 — open ring around a filled point */}
      <g className="motif-node motif-node--n1">
        <path
          d="M282 306 A19 19 0 1 0 314 296"
          fill="none"
          stroke={indigo}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="296" cy="314" r="5.5" fill={deep} />
      </g>

      {/* n2 — tilted square with an inner dot */}
      <g className="motif-node motif-node--n2">
        <rect
          x="447"
          y="126"
          width="28"
          height="28"
          transform="rotate(18 461 140)"
          fill="none"
          stroke={indigo}
          strokeWidth="2.2"
        />
        <circle cx="461" cy="140" r="3.2" fill={indigo} />
      </g>

      {/* n3 — triangle */}
      <g className="motif-node motif-node--n3">
        <path
          d="M612 196 L634 232 L590 230 Z"
          fill="none"
          stroke={indigo}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>

      {/* n4 — dashed ring with a center dot */}
      <g className="motif-node motif-node--n4">
        <circle
          cx="556"
          cy="342"
          r="17"
          fill="none"
          stroke={indigo}
          strokeWidth="2"
          strokeDasharray="4 6"
        />
        <circle cx="556" cy="342" r="2.6" fill={deep} />
      </g>

      {/* n5 — amber plus with a small tick notch under (accent, <2% stroke) */}
      <g className="motif-node motif-node--n5">
        <g stroke={amber} strokeWidth="2.6" strokeLinecap="round">
          <path d="M636 464 h20 M646 454 v20" />
          <path d="M638 484 q8 4 16 0" opacity="0.75" fill="none" />
        </g>
      </g>

      {/* n6 — sage wave inside a ring */}
      <g className="motif-node motif-node--n6">
        <circle cx="458" cy="540" r="15" fill={sage} fillOpacity="0.16" stroke={indigo} strokeWidth="2" />
        <path
          d="M448 542 q5 -7 10 0 t10 0"
          fill="none"
          stroke={sage}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>

      {/* n7 — twin dots, muted-rose satellite (accent, <2% stroke) */}
      <g className="motif-node motif-node--n7">
        <circle cx="214" cy="186" r="4" fill={rose} opacity="0.85" />
        <circle cx="230" cy="174" r="5.5" fill="none" stroke={rose} strokeWidth="2" opacity="0.8" />
      </g>
    </svg>
  );
}
