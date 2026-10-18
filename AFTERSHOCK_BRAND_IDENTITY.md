# Aftershock — Logo & Brand Identity Guide

## Brand direction

Aftershock is a research-integrity platform that traces scientific retractions, corrections, and their potential impact on cited claims and downstream conclusions. Its identity should feel like a modern academic publication: scholarly, investigative, calm, precise, and approachable. The visual direction is **retro-editorial typography with modern software usability**, inspired by Indieground's *Advercase* advertisement.

## Colour palette

These hex values are **proposed consolidated brand colours**, not a verified extraction from the original visual reference.

| Colour | Hex | Role |
|---|---|---|
| Paper | `#F7F3EA` | Primary light background |
| Ink | `#27283B` | Primary wordmark and dark surfaces |
| Indigo | `#665C91` | Primary brand accent |
| Lavender | `#DED6FA` | Soft accent |
| Amber | `#E9B867` | Needs review / pending action |
| Sage | `#658C79` | Human reviewed |
| Muted Red | `#B85F59` | Formal source notices |
| Warm Grey | `#89857F` | Secondary text |
| White | `#FFFFFF` | Reverse backgrounds |

**Preferred logo combination:** Ink `#27283B` on Paper `#F7F3EA`, with Indigo `#665C91` as an optional accent. Avoid putting every status colour into the logo. Sage means *reviewed by a human*, not scientifically validated or that a revision has been applied.

## Typography

- **Wordmark (implemented):** **Bodoni Moda** — a high-contrast editorial serif with a Bodoni character. Used at weight 900 (weights 800 and 900 are loaded; normal style only), with about **-0.02em letter-spacing** and a subtle horizontal compression of **scaleX(0.965)** so the silhouette reads as a single mark; the final period is kept optically visible (left transform origin, small right padding). Licensed under the **SIL Open Font License 1.1** and loaded from Google Fonts (latin subset, `display=swap`, preconnected), alongside the self-hosted OFL interface fonts.
- **Wordmark usage scope:** the Bodoni Moda treatment applies to exactly two spots — the **sidebar/header brand mark** and the **landing-page hero masthead** ("Aftershock."). Page headings, body text, buttons, and all other UI stay in the existing display/sans stacks (Source Serif 4 Variable for display/headings, Inter Variable for interface text).
- **Supporting interface font:** **Inter**, for navigation, metadata, captions, graph labels, controls, and body text.
- Use display serif for headings; preserve readability for small text.

## Service status display policy

Service health is **discreet diagnostics, not a header badge**: the truthful status ("API: online / unavailable / checking…", JSON-only classification — an HTML-shaded 2xx reads as unavailable) lives as a quiet `text-xs` muted line at the bottom of the sidebar (end of the header block on mobile) and as an optional quiet inline line on the Overview page. No prominent pill/border treatment in a header row, and no status element may claim graph-backend state — the health endpoint does not probe FalkorDB, so "online" never implies a connected data layer.

## Recommended logo concept

**A typographic wordmark plus a compact independent symbol.**

- Wordmark: **Aftershock.** (including the period as an optional brand treatment).
- Symbol: three to five connected nodes representing an evidence-dependency chain, with one changed or interrupted relationship and a subtle downstream effect.
- The meaning is **traceability and reassessment**, not destruction or a claim that every citing paper is invalid.
- Aim for a clear silhouette at 24–32 px and an icon that can stand alone as a favicon.
- Use elegant curves and precise geometric lines; no complex graph meshes.

### Logo variations

1. **Primary light:** Ink `#27283B` on Paper `#F7F3EA`.
2. **Reverse dark:** Paper `#F7F3EA` on Ink `#27283B`, optionally accented with Lavender `#DED6FA`.
3. **White monochrome:** White `#FFFFFF` on Indigo `#665C91`.
4. **Ink monochrome:** Ink `#27283B` on white.
5. **Standalone symbol:** Icon-only, tested at favicon sizes.

## Brand personality and rules

| Attribute | Direction |
|---|---|
| Personality | Scholarly, investigative, calm, precise |
| Visual era | Retro-editorial with modern clarity |
| Symbolism | Evidence chains, citations, propagation, reassessment |
| Shape language | Elegant curves with precise lines and nodes |
| Typography | Expressive serif wordmark, restrained sans-serif support |
| Motion | Subtle relationship highlighting, not shaking or dramatic effects |
| Tone | Trustworthy, factual, never sensational |
| Optional tagline | **Trace the evidence.** |

**Avoid:** generic AI brains, circuit boards, random network spheres, magnifying glasses, shields, exaggerated earthquake waves, glossy 3D, gradients, and excessive details.

## Logo designer / image-generator brief

Design a distinctive, premium visual identity for **Aftershock**, a research-integrity platform that tracks scientific retractions, corrections, and their potential impact on cited claims and downstream research conclusions.

**Visual direction:** Retro-academic editorial design inspired by Indieground's Advercase typeface, combined with precise scientific visual language. The identity should be scholarly, memorable, approachable, and sophisticated rather than corporate or futuristic.

**Typography:** Use a high-contrast editorial serif with a Bodoni character for the **Aftershock.** wordmark — implemented as **Bodoni Moda 900** (SIL OFL 1.1). Supporting interface typography is Inter; display headings use Source Serif 4 Variable.

**Primary colours:** Warm Paper `#F7F3EA`; Dark Ink `#27283B`; Muted Indigo `#665C91`; Soft Lavender `#DED6FA`.

**Supporting colours:** Amber `#E9B867`; Sage Green `#658C79`; Muted Red `#B85F59`.

**Symbol concept:** A minimal evidence-dependency chain or connected research graph with a single changed node and subtle downstream ripple. Communicate traceability and reassessment, not destruction or universal invalidation.

**Deliverables:** Horizontal wordmark with icon; standalone symbol; dark-background version; single-colour version; small-size favicon. Prefer editable vector artwork, with typography converted to outlines for final delivery (subject to font licensing).

**Avoid:** Generic AI brains, circuit-board imagery, random network spheres, magnifying glasses, exaggerated earthquake waves, glossy 3D, gradients, excessive detail, and generic technology-startup aesthetics.

**Optional tagline:** *Trace the evidence.*

The identity must work on a warm cream website, a dark ink background, academic report covers, and GitHub branding.

## Final recommendation

The implemented wordmark is **Aftershock.** (with the period) set in **Bodoni Moda 900**, slightly tracked and compressed, in dark ink or brand indigo on paper. Keep amber, red, and sage primarily for application status communication rather than the brand mark, and keep service health as quiet diagnostics rather than a header badge.
