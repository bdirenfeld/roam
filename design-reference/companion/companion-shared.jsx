// Roam · Companion — shared primitives
// Palette, Phosphor-style "light" icons, trip mockups (mobile day view from the
// app screenshot + desktop scheduling view), and the chat / proposal building
// blocks every variation reuses.
//
// Design rules carried through:
//   – Parchment #FAF7F2, Ink #1A1A2E, Sienna only as accent, never as alarm
//   – Playfair Italic for display; DM Sans for body / UI
//   – Phosphor-light icon style only: 1.5 stroke, round caps, no fills
//   – No sparkles, no gradient glow, no "✨" anywhere

const ROAM = {
  parchment:      '#FAF7F2',
  parchmentDeep:  '#F2EDE3',
  parchmentTint:  '#F7F3EA',
  parchmentWash:  '#EEE9DC',
  ink:            '#1A1A2E',
  inkSoft:        '#3A3A4E',
  sienna:         '#C4622D',
  siennaDeep:     '#A0501F',
  rule:           'rgba(26,26,46,0.10)',
  ruleStrong:     'rgba(26,26,46,0.20)',
  caption:        'rgba(26,26,46,0.55)',
  captionSoft:    'rgba(26,26,46,0.40)',
  label:          'rgba(26,26,46,0.85)',
};

const UI_FONT = '"DM Sans", system-ui, sans-serif';
const DISPLAY_FONT = '"Playfair Display", serif';

// ─────────────────────────────────────────────────────────────────
// Phosphor-light icons (hand-rolled — 1.5 stroke, round caps, no fill)
// Sized to a 24px box by default; pass `size` to scale.
// ─────────────────────────────────────────────────────────────────
const Ph = {
  Compass: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5L13 13l-4.5 2.5L11 11z" />
    </svg>
  ),
  ChatCircle: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-3.6-7.2L21 4l-1.2 3.6A9 9 0 0121 12z" />
    </svg>
  ),
  ChatTeardrop: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20l1.6-3.5A9 9 0 1112 21H3.2a.2.2 0 01-.2-.3z" />
    </svg>
  ),
  Check: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4 4 10-10" />
    </svg>
  ),
  X: ({ size = 14, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  CaretRight: ({ size = 12, color = 'currentColor', sw = 1.6 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  CaretLeft: ({ size = 12, color = 'currentColor', sw = 1.6 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  CaretDown: ({ size = 12, color = 'currentColor', sw = 1.6 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9l7 7 7-7" />
    </svg>
  ),
  Plus: ({ size = 14, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Minus: ({ size = 14, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  ),
  ArrowUp: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  ArrowRight: ({ size = 14, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  CornerDownLeft: ({ size = 14, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 5v6a3 3 0 01-3 3H5M9 10l-4 4 4 4" />
    </svg>
  ),
  Airplane: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 14L10 10l-2-7 2-.5L15 8l4.5-1c1 0 1.5.5 1.5 1.3s-.5 1.2-1.3 1.5L15 11l1.5 5.5-1.5.7-4.5-4-5 3 .5 2.5-1 .8-2-3-3-2 .8-1z" />
    </svg>
  ),
  Bed: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18V7M21 18v-6a3 3 0 00-3-3H10v6M3 14h18M3 18h18" />
      <circle cx="7" cy="11" r="1.5" />
    </svg>
  ),
  Flag: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
    </svg>
  ),
  ForkKnife: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v8a2 2 0 002 2v9M11 2v4a2 2 0 01-2 2M7 6v2M17 2c-2 0-3 1.5-3 4s1 4 3 4v11" />
    </svg>
  ),
  IceCream: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11a5 5 0 1110 0M7 11l5 11 5-11M9 11h6" />
    </svg>
  ),
  Storefront: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v10h16V10M2 10l2-6h16l2 6a2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0z" />
    </svg>
  ),
  Coffee: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h14v6a4 4 0 01-4 4H8a4 4 0 01-4-4V8zM18 10h2a2 2 0 010 4h-2M7 3v2M11 3v2M15 3v2" />
    </svg>
  ),
  MapPin: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  Notebook: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18H6zM9 3v18M6 8h3M6 13h3M6 18h3" />
    </svg>
  ),
  DotsThree: ({ size = 16, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
  PaperPlane: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3L3 11l7 2.5L13 21l8-18zM10 13.5L21 3" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────
// Type primitives
// ─────────────────────────────────────────────────────────────────
function Italic({ children, size = 17, color = ROAM.ink, weight = 500, style = {} }) {
  return (
    <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: weight, fontSize: size, letterSpacing: '-0.005em', color, ...style }}>
      {children}
    </span>
  );
}

function SmallCaps({ children, color = ROAM.caption, size = 10, style = {} }) {
  return (
    <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: size, letterSpacing: '0.22em', textTransform: 'uppercase', color, ...style }}>
      {children}
    </span>
  );
}

function Body({ children, size = 15, color = ROAM.ink, lh = 1.55, style = {} }) {
  return (
    <span style={{ fontFamily: UI_FONT, fontWeight: 400, fontSize: size, lineHeight: lh, letterSpacing: '-0.005em', color, ...style }}>
      {children}
    </span>
  );
}

function HRule({ color = ROAM.rule, style = {} }) {
  return <div style={{ height: 1, background: color, ...style }} />;
}

// ─────────────────────────────────────────────────────────────────
// "About to add — 5 places" — the canonical scenario
// (Day 2, Lower East Side around Mia's interests)
// ─────────────────────────────────────────────────────────────────
const PROPOSED_PLACES = [
  { icon: Ph.Coffee,      kind: 'Breakfast', name: 'Russ & Daughters Cafe',     meta: '10:00 – 11:30 AM · 127 Orchard St' },
  { icon: Ph.Storefront,  kind: 'Workshop',  name: 'Wing on Wo & Co.',          meta: '12:30 – 2:00 PM · Porcelain & tea, Chinatown' },
  { icon: Ph.Flag,        kind: 'Visit',     name: 'Tenement Museum',           meta: '2:30 – 4:00 PM · 103 Orchard St' },
  { icon: Ph.IceCream,    kind: 'Snack',     name: 'Economy Candy',             meta: '4:15 – 4:45 PM · 108 Rivington St' },
  { icon: Ph.ForkKnife,   kind: 'Dinner',    name: 'Wildair',                   meta: '7:00 – 9:00 PM · 142 Orchard St' },
];

// ─────────────────────────────────────────────────────────────────
// Approve / Discard affordance — used by every gate variant.
// Approve is a quiet ink-filled button; discard is a ghost text link.
// No "are you sure" framing, no destructive red.
// ─────────────────────────────────────────────────────────────────
function ApproveDiscard({ approveLabel = 'Approve', discardLabel = 'Discard', align = 'right', size = 'md' }) {
  const px = size === 'sm' ? '8px 14px' : '10px 18px';
  const fs = size === 'sm' ? 13 : 14;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', fontFamily: UI_FONT }}>
      <button type="button" style={{
        fontFamily: UI_FONT, fontSize: fs, fontWeight: 500, letterSpacing: '-0.005em',
        color: ROAM.caption, background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 0,
      }}>{discardLabel}</button>
      <button type="button" style={{
        fontFamily: UI_FONT, fontSize: fs, fontWeight: 500, letterSpacing: '-0.005em',
        color: ROAM.parchment, background: ROAM.ink, border: 'none', cursor: 'pointer',
        padding: px, borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        {approveLabel}
        <Ph.Check size={13} color={ROAM.parchment} sw={1.6} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Proposal card — the "about to add 5 places" composition.
// Two density modes:
//   compact : inline-in-chat, single column, smaller
//   rich    : sheet/modal, more breathing room, larger
// ─────────────────────────────────────────────────────────────────
function ProposalCard({ density = 'compact', heading, lede, places = PROPOSED_PLACES, footer = true, day = 'Day 2', placeColor }) {
  const compact = density === 'compact';
  const rowPad = compact ? '12px 14px' : '16px 18px';
  const nameSize = compact ? 14 : 15.5;
  const metaSize = compact ? 11.5 : 12.5;
  return (
    <div style={{
      background: ROAM.parchment,
      border: `1px solid ${ROAM.ruleStrong}`,
      borderRadius: 4,
      overflow: 'hidden',
      fontFamily: UI_FONT,
    }}>
      {/* Editorial header — small caps + italic title, thin sienna rule */}
      <div style={{ padding: compact ? '14px 16px 12px' : '20px 22px 16px', borderBottom: `1px solid ${ROAM.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: compact ? 4 : 6 }}>
          <SmallCaps color={ROAM.sienna} size={compact ? 9.5 : 10}>About to add · {day}</SmallCaps>
          <SmallCaps color={ROAM.captionSoft} size={compact ? 9.5 : 10}>{places.length} places</SmallCaps>
        </div>
        <div style={{ marginTop: 2 }}>
          <Italic size={compact ? 17 : 20} weight={500}>{heading || 'Lower East Side, around what Mia would love.'}</Italic>
        </div>
        {lede && (
          <div style={{ marginTop: compact ? 6 : 8 }}>
            <Body size={compact ? 12.5 : 14} color={ROAM.caption} lh={1.55}>{lede}</Body>
          </div>
        )}
      </div>
      {/* Place rows */}
      <div>
        {places.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: compact ? 12 : 14,
              padding: rowPad,
              borderBottom: i < places.length - 1 ? `1px solid ${ROAM.rule}` : 'none',
            }}>
              <div style={{
                flex: '0 0 auto',
                width: compact ? 28 : 32, height: compact ? 28 : 32,
                borderRadius: '50%',
                border: `1px solid ${ROAM.ruleStrong}`,
                background: ROAM.parchmentDeep,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: placeColor || ROAM.ink,
              }}>
                <Icon size={compact ? 14 : 16} sw={1.3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: UI_FONT, fontSize: metaSize, fontWeight: 500,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: ROAM.captionSoft, marginBottom: 3,
                }}>{p.kind}</div>
                <div style={{ fontFamily: UI_FONT, fontSize: nameSize, fontWeight: 500, color: ROAM.ink, letterSpacing: '-0.01em' }}>
                  {p.name}
                </div>
                <div style={{ fontFamily: UI_FONT, fontSize: metaSize, color: ROAM.caption, marginTop: 2 }}>
                  {p.meta}
                </div>
              </div>
              {/* Plus mark — quiet, indicates "to be added" */}
              <div style={{ flex: '0 0 auto', color: ROAM.caption, paddingTop: compact ? 4 : 6 }}>
                <Ph.Plus size={compact ? 12 : 14} color={ROAM.captionSoft} sw={1.4} />
              </div>
            </div>
          );
        })}
      </div>
      {/* Footer: approve / discard */}
      {footer && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: compact ? '12px 16px' : '18px 22px',
          borderTop: `1px solid ${ROAM.rule}`,
          background: ROAM.parchmentTint,
        }}>
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: compact ? 13 : 14, color: ROAM.caption }}>
            Nothing changes until you approve.
          </span>
          <ApproveDiscard size={compact ? 'sm' : 'md'} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Chat thread — interview-transcript style, no SaaS bubbles.
//   speaker label : Playfair italic small period — "Roam." / "You."
//   body          : DM Sans, the same column the label introduces
//   streaming     : a soft caret block at the end of a Roam paragraph
//
// Pass an array of turns, each { who: 'roam'|'you', text, streaming?, children? }.
// children renders inside the turn body, after text — used to drop a
// ProposalCard inline (the in-chat gate).
// ─────────────────────────────────────────────────────────────────
function ChatTurn({ who, text, streaming, children, dense = false }) {
  const isYou = who === 'you';
  const labelColor = isYou ? ROAM.caption : ROAM.sienna;
  const label = isYou ? 'You.' : 'Roam.';
  return (
    <div style={{ marginBottom: dense ? 18 : 26 }}>
      <div style={{ marginBottom: 6 }}>
        <span style={{
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
          fontSize: 13, color: labelColor, letterSpacing: '0.01em',
        }}>{label}</span>
      </div>
      {text && (
        <div style={{
          fontFamily: UI_FONT, fontSize: 15, lineHeight: 1.6,
          color: isYou ? ROAM.label : ROAM.ink,
          letterSpacing: '-0.005em', maxWidth: '58ch',
        }}>
          {text}
          {streaming && (
            <span style={{
              display: 'inline-block', width: 7, height: 14,
              background: ROAM.ink, marginLeft: 2, verticalAlign: '-2px',
              animation: 'roam-caret 1s steps(2) infinite',
            }} />
          )}
        </div>
      )}
      {children && <div style={{ marginTop: 14, maxWidth: '64ch' }}>{children}</div>}
    </div>
  );
}

// Editorial input — thin underline rule, italic placeholder, ↵ at right.
// No rounded SaaS field, no circle send button.
function ChatComposer({ placeholder = 'Think aloud with Roam…', value = '', dark = false }) {
  return (
    <div style={{ paddingTop: 14, borderTop: `1px solid ${ROAM.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '6px 0' }}>
        <div style={{ flex: 1, minHeight: 30 }}>
          {value
            ? <Body size={15} color={ROAM.ink}>{value}</Body>
            : <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 16, color: ROAM.captionSoft }}>{placeholder}</span>}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: ROAM.caption,
        }}>
          <SmallCaps size={9.5} color={ROAM.captionSoft}>Return to send</SmallCaps>
          <Ph.CornerDownLeft size={13} color={ROAM.caption} sw={1.5} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Mobile day view — mocks the second screenshot (Thursday, Day 1).
// `entry` slot is where each entry-point variation hangs its mark.
// `slot` controls which slot the entry renders into.
// ─────────────────────────────────────────────────────────────────
function StaticMapMobile({ height = 196 }) {
  // A flat parchment map placeholder with two ink pins. No real tiles —
  // a calmer mapbox stand-in that doesn't compete with the day cards.
  return (
    <div style={{
      position: 'relative', width: '100%', height,
      background: ROAM.parchmentWash,
      overflow: 'hidden',
    }}>
      {/* shoreline strokes — just suggestion, not navigation */}
      <svg width="100%" height="100%" viewBox="0 0 390 200" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <g stroke={ROAM.ruleStrong} strokeWidth="0.7" fill="none">
          <path d="M-10 60 Q 80 50 140 80 T 280 90 T 410 70" />
          <path d="M-10 130 Q 60 120 130 140 T 260 150 T 410 140" />
          <path d="M-10 170 Q 80 160 160 175 T 410 175" />
        </g>
        <g stroke={ROAM.rule} strokeWidth="0.5" fill="none">
          {Array.from({length: 8}).map((_, i) => <line key={i} x1={i*60} y1="0" x2={i*60+30} y2="200" />)}
        </g>
        {/* pin 1 */}
        <g transform="translate(170 90)">
          <circle r="14" fill={ROAM.ink}/>
          <text x="0" y="2" textAnchor="middle" dominantBaseline="middle" fontFamily={UI_FONT} fontSize="9.5" fontWeight="600" fill={ROAM.parchment}>1</text>
        </g>
        {/* pin 2 */}
        <g transform="translate(240 130)">
          <circle r="14" fill={ROAM.ink}/>
          <text x="0" y="2" textAnchor="middle" dominantBaseline="middle" fontFamily={UI_FONT} fontSize="9.5" fontWeight="600" fill={ROAM.parchment}>2</text>
        </g>
      </svg>
      {/* "mapbox" attribution, faint */}
      <div style={{ position: 'absolute', bottom: 6, right: 8 }}>
        <SmallCaps size={8} color={ROAM.captionSoft}>Mapbox</SmallCaps>
      </div>
    </div>
  );
}

const DAY_1_ITEMS = [
  { icon: Ph.Airplane,   title: 'Pearson Airport Terminal 1 Parking', meta: 'YYZ → LGA · 9:20 — 10:55 AM',           gap: '1h 5m free' },
  { icon: Ph.Bed,        title: '11 Howard',                          meta: '12:00 — 1:00 PM · 11 Howard St, NY 1001…', gap: '1h free' },
  { icon: Ph.Flag,       title: 'Sloomoo Institute',                  meta: '2:00 — 3:30 PM · 475 Broadway, NY 10…',   gap: '2h 30m free' },
  { icon: Ph.ForkKnife,  title: 'Rubirosa',                           meta: '6:00 — 7:30 PM · 235 Mulberry St, NY 1…' },
  { icon: Ph.IceCream,   title: "Morgenstern's Finest Ice Cream",      meta: '7:30 — 8:00 PM · 2 Rivington St, NY 100…' },
];

function ItineraryCard({ icon: Icon, title, meta }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: ROAM.parchment,
      border: `1px solid ${ROAM.rule}`,
      borderRadius: 10,
    }}>
      <div style={{
        flex: '0 0 auto', width: 34, height: 34, borderRadius: 8,
        background: ROAM.parchmentDeep, color: ROAM.label,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} sw={1.3} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: UI_FONT, fontSize: 13, fontWeight: 600, color: ROAM.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontFamily: UI_FONT, fontSize: 10.5, color: ROAM.caption, marginTop: 2, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {meta}
        </div>
      </div>
      <Ph.CaretRight size={11} color={ROAM.captionSoft} />
    </div>
  );
}

function GapMarker({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px' }}>
      <div style={{ flex: '0 0 auto', width: 34, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 1, height: 18, borderLeft: `1px dashed ${ROAM.ruleStrong}` }} />
      </div>
      <div style={{ flex: 1, fontFamily: UI_FONT, fontSize: 10.5, color: ROAM.captionSoft }}>{label}</div>
      <div style={{ fontFamily: UI_FONT, fontSize: 10.5, color: ROAM.caption, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Ph.Plus size={10} color={ROAM.caption} /> Add
      </div>
    </div>
  );
}

// chrome:   { headerEntry?, headerAnnotation?, dayChipsTrailing?, footerEntry?, sideRibbon? }
//   each is a ReactNode rendered in that slot of the mobile day view.
function TripDayMobile({ chrome = {}, dimmed = false }) {
  const { headerEntry, headerAnnotation, dayChipsTrailing, footerEntry, sideRibbon, betweenChipsAndMap } = chrome;
  return (
    <div style={{
      position: 'absolute', inset: 0, background: ROAM.parchment,
      display: 'flex', flexDirection: 'column',
      opacity: dimmed ? 0.42 : 1,
      filter: dimmed ? 'saturate(0.7)' : 'none',
      pointerEvents: dimmed ? 'none' : undefined,
      transition: 'opacity 200ms ease',
    }}>
      {/* Status bar spacer */}
      <div style={{ height: 50 }} />
      {/* Nav: back chevron, italic date, ellipsis */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 16px 10px', position: 'relative' }}>
        <button style={{ width: 36, height: 36, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: 0, color: ROAM.label }}>
          <Ph.CaretLeft size={14} color={ROAM.ink} sw={1.6}/>
        </button>
        <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Italic size={18} weight={500}>Thursday, 23 July</Italic>
          {headerAnnotation}
        </div>
        <div style={{ width: 36, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          {headerEntry}
          <button style={{ width: 28, height: 28, background: 'transparent', border: 'none', cursor: 'pointer', color: ROAM.label, padding: 0 }}>
            <Ph.DotsThree size={18} color={ROAM.ink} />
          </button>
        </div>
      </div>

      {/* Day chips */}
      <div style={{ display: 'flex', gap: 8, padding: '6px 16px 14px', alignItems: 'center' }}>
        {['Day 1', 'Day 2', 'Day 3', 'Day 4'].map((d, i) => (
          <div key={d} style={{
            padding: '7px 14px', borderRadius: 999,
            background: i === 0 ? ROAM.ink : ROAM.parchmentDeep,
            color: i === 0 ? ROAM.parchment : ROAM.label,
            fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
          }}>{d}</div>
        ))}
        {dayChipsTrailing}
      </div>

      {betweenChipsAndMap}

      {/* Map */}
      <StaticMapMobile />

      {/* Itinerary */}
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {DAY_1_ITEMS.map((it, i) => (
          <React.Fragment key={i}>
            <ItineraryCard {...it} />
            {it.gap && <GapMarker label={it.gap} />}
          </React.Fragment>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      {footerEntry}

      {/* Side ribbon — for the bookmark-tab entry-point variant */}
      {sideRibbon}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Desktop trip view — mocks the third screenshot
// (filter sidebar + mapbox + interested/scheduled pills).
// chrome slots let the entry-point variants hang a mark.
// ─────────────────────────────────────────────────────────────────
function StaticMapDesktop({ style = {} }) {
  return (
    <div style={{ position: 'relative', flex: 1, background: '#EDE7DA', overflow: 'hidden', ...style }}>
      <svg width="100%" height="100%" viewBox="0 0 1080 720" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        {/* Water — broad parchment-wash river through the middle */}
        <rect width="1080" height="720" fill="#EDE7DA"/>
        <path d="M-20 220 C 200 200, 360 250, 520 230 S 800 280, 1100 240 L 1100 360 C 880 380, 700 330, 520 360 S 200 320, -20 360 Z" fill="#E2DBC9" opacity="0.6"/>
        {/* Avenues — faint grid */}
        <g stroke="rgba(26,26,46,0.08)" strokeWidth="0.8" fill="none">
          {Array.from({length: 12}).map((_, i) => <line key={'v'+i} x1={i*100+30} y1="0" x2={i*100+30} y2="720" />)}
          {Array.from({length: 9}).map((_, i) => <line key={'h'+i} x1="0" y1={i*90+30} x2="1080" y2={i*90+30} />)}
        </g>
        {/* Neighborhood labels */}
        <g fontFamily={UI_FONT} fill="rgba(26,26,46,0.35)" letterSpacing="0.2em" fontSize="10">
          <text x="280" y="160">SOHO</text>
          <text x="640" y="120">EAST VILLAGE</text>
          <text x="780" y="500">L.E.S.</text>
          <text x="200" y="540">TRIBECA</text>
        </g>
        {/* Place pins — ink filled circles, scheduled vs interested via dot pattern */}
        <g>
          {[[300,180],[330,200],[365,210],[290,230],[400,250],[450,220],[480,260],[520,290],[560,250],[620,300],[660,330],[700,310],[720,350],[760,400],[790,430],[820,460],[840,490]].map(([x,y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r="10" fill={i % 3 === 0 ? ROAM.ink : ROAM.parchment} stroke={ROAM.ink} strokeWidth="1.2"/>
              {i % 3 !== 0 && <circle r="2.5" fill={ROAM.ink}/>}
            </g>
          ))}
        </g>
      </svg>
      <div style={{ position: 'absolute', bottom: 10, right: 14 }}>
        <SmallCaps size={9} color={ROAM.captionSoft}>Mapbox</SmallCaps>
      </div>
    </div>
  );
}

function DesktopSidebar({ replaceWith }) {
  if (replaceWith) return replaceWith;
  // Filter sidebar matching screenshot 3
  const Section = ({ title, items, on = true }) => (
    <div style={{ padding: '14px 18px 8px', borderBottom: `1px solid ${ROAM.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SmallCaps size={9.5} color={ROAM.caption}>{title}</SmallCaps>
        <div style={{ width: 24, height: 14, borderRadius: 7, background: on ? ROAM.ink : ROAM.parchmentDeep, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 1, [on ? 'right' : 'left']: 1, width: 12, height: 12, borderRadius: 6, background: ROAM.parchment }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(([name, count, lead]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {lead && <Ph.CaretRight size={10} color={ROAM.caption} />}
              <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.label }}>{name}</span>
            </div>
            {count != null && <span style={{ fontFamily: UI_FONT, fontSize: 12, color: ROAM.captionSoft }}>{count}</span>}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ width: 232, flex: '0 0 232px', borderRight: `1px solid ${ROAM.rule}`, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 18px 10px' }}>
        <SmallCaps size={9.5} color={ROAM.caption}>Status</SmallCaps>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: `1px solid ${ROAM.rule}`, borderRadius: 999 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, border: `1.2px solid ${ROAM.ink}` }} />
            <span style={{ fontFamily: UI_FONT, fontSize: 12, color: ROAM.label }}>Interested</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: `1px solid ${ROAM.rule}`, borderRadius: 999 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: ROAM.ink }} />
            <span style={{ fontFamily: UI_FONT, fontSize: 12, color: ROAM.label }}>Scheduled</span>
          </div>
        </div>
      </div>
      <HRule />
      <Section title="Activity" items={[['Guided', 8, true], ['Self-Directed', 22, true], ['Wellness', 2, true]]} />
      <Section title="Food" items={[['Restaurant', 30, true], ['Coffee', 5, true], ['Dessert', 8, true], ['Bar', 10, true]]} />
      <Section title="Stay" items={[['Hotel', 3, true], ['Flight Arrival', 4, true], ['Flight Departure', null, false]]} />
      <div style={{ flex: 1 }} />
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${ROAM.rule}` }}>
        <span style={{ fontFamily: UI_FONT, fontSize: 12.5, color: ROAM.caption }}>Enrich all cards</span>
      </div>
    </div>
  );
}

// chrome: { topRightEntry?, sidebarReplacement?, sidePanel?, leftPanelReplacement?, bottomLeftEntry?, centerOverlay?, dim? }
function TripDesktop({ chrome = {} }) {
  const { topRightEntry, sidebarReplacement, sidePanel, bottomLeftEntry, centerOverlay, dim } = chrome;
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: ROAM.parchment, display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT, overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 22px', borderBottom: `1px solid ${ROAM.rule}`,
        background: ROAM.parchment,
        opacity: dim ? 0.55 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ph.CaretLeft size={13} color={ROAM.ink} />
          <Italic size={20} weight={500}>New York</Italic>
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption, marginLeft: 6 }}>
            (Mia & Daddy) · Jul 23 — 26
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px', borderRadius: 999,
          background: ROAM.parchmentDeep,
          minWidth: 320, maxWidth: 520,
        }}>
          <Ph.MapPin size={13} color={ROAM.caption} sw={1.3} />
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.captionSoft }}>Search places in New York, NY, USA…</span>
        </div>
        <div style={{ flex: 1 }} />
        {topRightEntry}
        <div style={{ width: 30, height: 30, borderRadius: 15, background: ROAM.parchmentDeep, border: `1px solid ${ROAM.rule}` }} />
      </div>
      {/* Body */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
        <div style={{ opacity: dim ? 0.4 : 1, display: 'flex', flex: '0 0 auto', filter: dim ? 'saturate(0.8)' : 'none' }}>
          <DesktopSidebar replaceWith={sidebarReplacement} />
        </div>
        <div style={{ flex: 1, position: 'relative', display: 'flex', opacity: dim ? 0.4 : 1, filter: dim ? 'saturate(0.8)' : 'none' }}>
          <StaticMapDesktop />
        </div>
        {sidePanel}
        {bottomLeftEntry}
        {centerOverlay}
      </div>
    </div>
  );
}

// Inject the caret-blink keyframes once.
if (typeof document !== 'undefined' && !document.getElementById('roam-anim')) {
  const s = document.createElement('style');
  s.id = 'roam-anim';
  s.textContent = `
    @keyframes roam-caret { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
  `;
  document.head.appendChild(s);
}

Object.assign(window, {
  ROAM, UI_FONT, DISPLAY_FONT, Ph,
  Italic, SmallCaps, Body, HRule,
  PROPOSED_PLACES, ApproveDiscard, ProposalCard,
  ChatTurn, ChatComposer,
  TripDayMobile, TripDesktop, DesktopSidebar, StaticMapDesktop,
  ItineraryCard, GapMarker, DAY_1_ITEMS,
});
