'use client';

export type PageBgColor    = 'orange' | 'purple' | 'teal' | 'pink';
export type PageBgVariant  = 'blob' | 'aurora' | 'horizon' | 'rising';
export type PageBgIntensity = 'subtle' | 'medium' | 'strong';

interface Props {
  color?:     PageBgColor;
  variant?:   PageBgVariant;
  intensity?: PageBgIntensity;
}

/* ── Per-colour palette ───────────────────────────────────────── */
const PALETTE: Record<PageBgColor, { core: string; body: string; shadow: string; specular: string }> = {
  orange: {
    core:     'hsla(22,  100%, 64%, VAL)',
    body:     'hsla(14,  100%, 44%, VAL)',
    shadow:   'hsla(8,   100%, 18%, VAL)',
    specular: 'hsla(38,  100%, 80%, VAL)',
  },
  purple: {
    core:     'hsla(272, 82%,  68%, VAL)',
    body:     'hsla(266, 88%,  46%, VAL)',
    shadow:   'hsla(262, 90%,  18%, VAL)',
    specular: 'hsla(282, 65%,  84%, VAL)',
  },
  teal: {
    core:     'hsla(158, 76%,  50%, VAL)',
    body:     'hsla(162, 84%,  32%, VAL)',
    shadow:   'hsla(164, 84%,  13%, VAL)',
    specular: 'hsla(154, 62%,  74%, VAL)',
  },
  pink: {
    core:     'hsla(346, 86%,  62%, VAL)',
    body:     'hsla(350, 90%,  46%, VAL)',
    shadow:   'hsla(354, 88%,  18%, VAL)',
    specular: 'hsla(342, 72%,  82%, VAL)',
  },
};

/* Swap the "VAL" placeholder for an actual opacity string */
function pal(template: string, opacity: number) {
  return template.replace('VAL', String(opacity));
}

/* ── Intensity multipliers ────────────────────────────────────── */
const MULT: Record<PageBgIntensity, number> = { subtle: 0.55, medium: 1, strong: 1.45 };

/* ══════════════════════════════════════════════════════════════
   BLOB variant  —  large organic 3D form (tasks / goals / review)
   ══════════════════════════════════════════════════════════════ */
function BlobBackground({ color, m }: { color: PageBgColor; m: number }) {
  const p = PALETTE[color];
  return (
    <>
      {/* Main organic body */}
      <div style={{
        position: 'absolute',
        right:  '-6%',
        top:    '-14%',
        width:  '78vw',
        height: '88vh',
        background: `
          radial-gradient(
            ellipse 54% 50% at 38% 32%,
            ${pal(p.core,     0.88 * m)}   0%,
            ${pal(p.body,     0.70 * m)}  42%,
            ${pal(p.shadow,   0.50 * m)}  72%,
            transparent 90%
          )`,
        borderRadius: '52% 61% 48% 56% / 46% 54% 68% 47%',
        transform:    'rotate(-18deg)',
        filter:       'blur(52px)',
      }} />

      {/* Specular highlight — directional light on the peak */}
      <div style={{
        position: 'absolute',
        right:  '13%',
        top:     '3%',
        width:  '34vw',
        height: '30vh',
        background: `
          radial-gradient(
            ellipse at 42% 36%,
            ${pal(p.specular, 0.55 * m)}  0%,
            transparent 62%
          )`,
        borderRadius: '62% 38% 54% 46% / 52% 62% 42% 54%',
        filter:       'blur(34px)',
      }} />

      {/* Shadow depth — lower-right recession */}
      <div style={{
        position: 'absolute',
        right:   '-16%',
        bottom:    '7%',
        width:   '54vw',
        height:  '48vh',
        background: `
          radial-gradient(
            ellipse at 50% 50%,
            ${pal(p.shadow, 0.50 * m)}  0%,
            transparent 70%
          )`,
        filter: 'blur(74px)',
      }} />

      {/* Secondary rim — soft halo around the opposite edge */}
      <div style={{
        position: 'absolute',
        right:  '30%',
        top:    '20%',
        width:  '42vw',
        height: '46vh',
        background: `
          radial-gradient(
            ellipse at 55% 45%,
            ${pal(p.body, 0.22 * m)}  0%,
            transparent 65%
          )`,
        filter:       'blur(60px)',
        borderRadius: '40% 60% 55% 45% / 50% 42% 58% 50%',
        transform:    'rotate(25deg)',
      }} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   AURORA variant  —  multi-colour horizontal sweep (home)
   Three pillars blend across the top of the screen like
   northern lights, fading to transparent below ~55 vh.
   ══════════════════════════════════════════════════════════════ */
function AuroraBackground({ m }: { m: number }) {
  return (
    <>
      {/* Orange sweep — left side */}
      <div style={{
        position: 'absolute',
        left:  '-5%',
        top:   '-20%',
        width:  '55vw',
        height: '70vh',
        background: `
          radial-gradient(
            ellipse 70% 55% at 25% 28%,
            hsla(16, 100%, 58%, ${0.18 * m})   0%,
            hsla(16, 100%, 40%, ${0.10 * m})  45%,
            transparent 72%
          )`,
        filter: 'blur(55px)',
      }} />

      {/* Purple sweep — centre, slightly lower */}
      <div style={{
        position: 'absolute',
        left:  '30%',
        top:   '-18%',
        width:  '50vw',
        height: '65vh',
        background: `
          radial-gradient(
            ellipse 65% 50% at 50% 30%,
            hsla(270, 85%, 62%, ${0.16 * m})   0%,
            hsla(270, 85%, 40%, ${0.08 * m})  48%,
            transparent 72%
          )`,
        filter: 'blur(60px)',
      }} />

      {/* Teal sweep — right side */}
      <div style={{
        position: 'absolute',
        right: '-8%',
        top:   '-16%',
        width:  '48vw',
        height: '60vh',
        background: `
          radial-gradient(
            ellipse 62% 48% at 65% 26%,
            hsla(158, 80%, 48%, ${0.14 * m})   0%,
            hsla(158, 80%, 28%, ${0.07 * m})  50%,
            transparent 74%
          )`,
        filter: 'blur(58px)',
      }} />

      {/* Thin shimmer line at very top — the "aurora edge" */}
      <div style={{
        position:   'absolute',
        top:         0,
        left:        0,
        right:       0,
        height:     '2px',
        background: `linear-gradient(
          to right,
          transparent                          0%,
          hsla(16,  100%, 65%, ${0.45 * m})  20%,
          hsla(270, 85%,  68%, ${0.45 * m})  50%,
          hsla(158, 80%,  55%, ${0.40 * m})  80%,
          transparent                          100%
        )`,
        filter: 'blur(1px)',
      }} />

      {/* Hard fade-to-dark mask — keeps lower content clean */}
      <div style={{
        position:   'absolute',
        top:         0,
        left:        0,
        right:       0,
        height:     '100%',
        background: `linear-gradient(
          to bottom,
          transparent  0%,
          transparent  30%,
          var(--color-bg-primary) 68%
        )`,
      }} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   HORIZON variant  —  thin coloured glow at the top edge (calendar)
   Gives the page personality without competing with block colours.
   ══════════════════════════════════════════════════════════════ */
function HorizonBackground({ color, m }: { color: PageBgColor; m: number }) {
  const p = PALETTE[color];
  return (
    <>
      {/* Wide but shallow glow band */}
      <div style={{
        position: 'absolute',
        top:   '-8%',
        left:  '-5%',
        right: '-5%',
        height: '38vh',
        background: `
          radial-gradient(
            ellipse 80% 55% at 50% 0%,
            ${pal(p.core,   0.12 * m)}  0%,
            ${pal(p.body,   0.07 * m)} 45%,
            transparent 75%
          )`,
        filter: 'blur(44px)',
      }} />

      {/* 1px accent line along the very top */}
      <div style={{
        position:   'absolute',
        top:         0,
        left:       '10%',
        right:      '10%',
        height:     '1px',
        background: `linear-gradient(
          to right,
          transparent,
          ${pal(p.specular, 0.50 * m)} 30%,
          ${pal(p.core,     0.60 * m)} 50%,
          ${pal(p.specular, 0.50 * m)} 70%,
          transparent
        )`,
      }} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   RISING variant  —  warmth rising from the bottom (coach)
   Donna's presence as ambient light from below.
   ══════════════════════════════════════════════════════════════ */
function RisingBackground({ color, m }: { color: PageBgColor; m: number }) {
  const p = PALETTE[color];
  return (
    <>
      {/* Main rising glow */}
      <div style={{
        position: 'absolute',
        bottom:  '-10%',
        left:     '15%',
        right:    '15%',
        height:   '70vh',
        background: `
          radial-gradient(
            ellipse 75% 55% at 50% 100%,
            ${pal(p.core,   0.16 * m)}  0%,
            ${pal(p.body,   0.09 * m)} 40%,
            transparent 68%
          )`,
        filter: 'blur(60px)',
      }} />

      {/* Side warmth — fills the lower corners */}
      <div style={{
        position: 'absolute',
        bottom:  '-5%',
        left:    '-10%',
        width:    '40vw',
        height:  '45vh',
        background: `
          radial-gradient(
            ellipse at 30% 100%,
            ${pal(p.body, 0.10 * m)} 0%,
            transparent 65%
          )`,
        filter: 'blur(50px)',
      }} />
      <div style={{
        position: 'absolute',
        bottom:  '-5%',
        right:   '-10%',
        width:    '40vw',
        height:  '45vh',
        background: `
          radial-gradient(
            ellipse at 70% 100%,
            ${pal(p.body, 0.10 * m)} 0%,
            transparent 65%
          )`,
        filter: 'blur(50px)',
      }} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main export
   ══════════════════════════════════════════════════════════════ */
export function PageBackground({
  color    = 'orange',
  variant  = 'blob',
  intensity = 'medium',
}: Props) {
  const m = MULT[intensity];

  return (
    <div
      aria-hidden
      style={{
        position:       'fixed',
        inset:           0,
        zIndex:         -1,
        pointerEvents:  'none',
        overflow:       'hidden',
      }}
    >
      {variant === 'blob'    && <BlobBackground    color={color} m={m} />}
      {variant === 'aurora'  && <AuroraBackground             m={m} />}
      {variant === 'horizon' && <HorizonBackground color={color} m={m} />}
      {variant === 'rising'  && <RisingBackground  color={color} m={m} />}
    </div>
  );
}
