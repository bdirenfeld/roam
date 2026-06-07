// desktop-shared.jsx
// Tokens, photos, content primitives reused across the desktop re-housing
// mockups. companion-shared.jsx publishes ROAM, UI_FONT, DISPLAY_FONT, Ph,
// Italic, SmallCaps, Body, HRule to window — we lean on those so the
// desktop work uses the same atoms as the live mobile app.

const { ROAM, UI_FONT, DISPLAY_FONT, Ph, Italic, SmallCaps, Body, HRule } = window;

// ─── Photography ─────────────────────────────────────────────────
// (Same Unsplash URLs the login + trips list already use; cropped wider
// for desktop hero treatments.)
const PHOTOS_DT = {
  manhattanGolden: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80&auto=format&fit=crop',
  tokyoTower:      'https://images.unsplash.com/photo-1554797589-7241bb691973?w=1200&q=80&auto=format&fit=crop',
  rome:            'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1200&q=80&auto=format&fit=crop',
  // Kyoto autumn — verified working URL borrowed from login-variations.
  kyoto:           'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1600&q=80&auto=format&fit=crop',
  avatarBrennan:   'https://images.unsplash.com/photo-1463453091185-61582044d556?w=160&q=80&auto=format&fit=crop',
};

// ─── Extra icons (Phosphor-light, same hand) ─────────────────────
const PhDT = {
  Compass:   Ph.Compass,
  Magnifier: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
    </svg>
  ),
  Columns:   ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="5" height="15" rx="1" />
      <rect x="9.5" y="4.5" width="5" height="15" rx="1" />
      <rect x="15.5" y="4.5" width="5" height="15" rx="1" />
    </svg>
  ),
  Calendar:  ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  Globe:     ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  ),
  User:      ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  ),
};

// ─── GoogleG (for login CTA) ─────────────────────────────────────
function GoogleG({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

// ─── Profile avatar (the user from the screenshots) ──────────────
function ProfileAvatar({ size = 30, ring = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundImage: `url(${PHOTOS_DT.avatarBrennan})`,
      backgroundSize: 'cover', backgroundPosition: '50% 30%',
      boxShadow: ring ? `0 0 0 1px ${ROAM.rule}` : 'none',
      flex: '0 0 auto',
    }} />
  );
}

// ─── Trip card (used in the journeys grid) ───────────────────────
function TripCard({ image, position = '50% 50%', name, meta, size = 'lg' }) {
  const h = size === 'lg' ? 280 : 180;
  return (
    <div style={{ cursor: 'pointer' }}>
      <div style={{
        width: '100%', height: h, borderRadius: 12, overflow: 'hidden',
        backgroundColor: '#2a2620',
        backgroundImage: `url(${image})`,
        backgroundSize: 'cover', backgroundPosition: position,
      }} />
      <div style={{ padding: '14px 2px 0' }}>
        <div style={{
          fontFamily: UI_FONT, fontWeight: 500, fontSize: 18,
          letterSpacing: '-0.01em', color: ROAM.ink, marginBottom: 6,
        }}>{name}</div>
        <SmallCaps color={ROAM.caption} size={10}>{meta}</SmallCaps>
      </div>
    </div>
  );
}

// ─── Activity row (matches the mobile cards in the day view) ─────
// Same composition the user said works — icon · KIND · name · meta —
// just laid out wider with more breathing room.
function ActivityRow({ icon: Icon, kind, title, meta, last = false }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '18px 20px',
        background: '#fff',
        borderRadius: 14,
        boxShadow: `0 1px 2px rgba(26,26,46,0.04), 0 0 0 1px ${ROAM.rule}`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 20,
          background: ROAM.parchmentDeep, color: ROAM.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flex: '0 0 auto',
        }}>
          <Icon size={18} sw={1.35} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
            <SmallCaps color={ROAM.caption} size={9.5}>{kind}</SmallCaps>
          </div>
          <div style={{
            fontFamily: UI_FONT, fontWeight: 500, fontSize: 16,
            letterSpacing: '-0.005em', color: ROAM.ink, marginBottom: 3,
          }}>{title}</div>
          <div style={{
            fontFamily: UI_FONT, fontWeight: 400, fontSize: 13,
            color: ROAM.caption, letterSpacing: '-0.005em',
          }}>{meta}</div>
        </div>
        <div style={{ color: ROAM.captionSoft }}>
          <Ph.CaretRight size={14} sw={1.3} color={ROAM.captionSoft} />
        </div>
      </div>
    </div>
  );
}

function GapRow({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 20px',
    }}>
      <div style={{
        width: 40, display: 'flex', justifyContent: 'center', flex: '0 0 auto',
      }}>
        <div style={{
          width: 1, height: 22, borderLeft: `1px dashed ${ROAM.ruleStrong}`,
        }} />
      </div>
      <div style={{ flex: 1, color: ROAM.captionSoft }}>
        <Italic size={13} color={ROAM.captionSoft}>{label}</Italic>
      </div>
      <button style={{
        background: 'transparent', border: 'none',
        fontFamily: UI_FONT, fontWeight: 500, fontSize: 12,
        color: ROAM.caption, letterSpacing: '0.04em',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <Ph.Plus size={11} sw={1.5} /> Add
      </button>
    </div>
  );
}

// ─── A stylized print-style map of Day 1 (YYZ → LGA + LES stops) ──
// Hand-built SVG — no Mapbox tile, no API token. Tones match Parchment;
// pins are filled ink with numerals, as in the mobile app.
function MiniMap({ height = 460, talkButton = true, onTalk }) {
  return (
    <div style={{
      position: 'relative', width: '100%', height,
      borderRadius: 14, overflow: 'hidden',
      background: ROAM.parchmentDeep,
      boxShadow: `0 1px 2px rgba(26,26,46,0.04), 0 0 0 1px ${ROAM.rule}`,
    }}>
      <svg viewBox="0 0 600 460" preserveAspectRatio="xMidYMid slice"
           width="100%" height="100%"
           style={{ display: 'block', position: 'absolute', inset: 0 }}>
        {/* Land — soft parchment */}
        <rect x="0" y="0" width="600" height="460" fill="#EEE9DC" />

        {/* Water bodies (Hudson, East River, harbor) — pale ink wash */}
        <path d="M0 280 Q 90 250 200 270 T 460 260 Q 540 260 600 235 L 600 460 L 0 460 Z"
              fill="rgba(26,26,46,0.06)" />
        <path d="M450 0 Q 470 60 460 120 Q 450 170 470 230 L 600 230 L 600 0 Z"
              fill="rgba(26,26,46,0.05)" />

        {/* Faint street grid */}
        <g stroke="rgba(26,26,46,0.08)" strokeWidth="0.8">
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={'h' + i} x1="0" y1={40 + i * 22} x2="600" y2={40 + i * 22 - 8} />
          ))}
          {Array.from({ length: 22 }).map((_, i) => (
            <line key={'v' + i} x1={40 + i * 26} y1="0" x2={40 + i * 26 + 12} y2="460" />
          ))}
        </g>

        {/* A couple of avenues drawn slightly heavier */}
        <g stroke="rgba(26,26,46,0.18)" strokeWidth="1.1" fill="none">
          <path d="M180 0 L 200 460" />
          <path d="M300 0 L 320 460" />
          <path d="M0 180 L 600 168" />
        </g>

        {/* Place labels — DM Sans small caps */}
        <g fontFamily='"DM Sans", sans-serif' fontSize="9" fill="rgba(26,26,46,0.55)"
           letterSpacing="1.2" style={{ textTransform: 'uppercase' }}>
          <text x="22" y="22" letterSpacing="2">TORONTO</text>
          <text x="520" y="320" letterSpacing="2">MANHATTAN</text>
          <text x="480" y="380" letterSpacing="1.5">L.E.S.</text>
        </g>

        {/* Arc — YYZ → LGA */}
        <path d="M70 50 Q 280 30 400 280"
              stroke="rgba(26,26,46,0.35)" strokeWidth="1" strokeDasharray="3 4" fill="none" />
      </svg>

      {/* Numbered pins — absolute positioned over the SVG */}
      <Pin x="58" y="38"  n="1" airport />
      <Pin x="362" y="280" n="2" />
      <Pin x="386" y="306" n="3" />
      <Pin x="408" y="334" n="4" />
      <Pin x="430" y="358" n="5" />

      {/* Mapbox-style attribution tile, very small */}
      <div style={{
        position: 'absolute', bottom: 8, right: 10,
        fontFamily: UI_FONT, fontSize: 9, color: ROAM.captionSoft,
        letterSpacing: '0.04em',
      }}>roam · map</div>

      {/* Talk button — kept Sienna because this is the single accent place */}
      {talkButton && (
        <button onClick={onTalk} style={{
          position: 'absolute', left: '50%', top: 18, transform: 'translateX(-50%)',
          background: ROAM.parchment,
          border: `1px solid ${ROAM.rule}`,
          color: ROAM.sienna,
          borderRadius: 999, padding: '8px 16px',
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
          fontSize: 14, letterSpacing: '-0.005em',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 1px 4px rgba(26,26,46,0.06)', cursor: 'pointer',
        }}>
          <Ph.ChatTeardrop size={14} sw={1.4} color={ROAM.sienna} />
          Talk this journey through
        </button>
      )}
    </div>
  );
}

function Pin({ x, y, n, airport = false }) {
  return (
    <div style={{
      position: 'absolute', left: `${(parseFloat(x) / 600) * 100}%`,
      top: `${(parseFloat(y) / 460) * 100}%`,
      transform: 'translate(-50%, -100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 13,
        background: ROAM.ink, color: ROAM.parchment,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: UI_FONT, fontWeight: 600, fontSize: 11,
        boxShadow: '0 2px 6px rgba(26,26,46,0.25)',
        border: `1.5px solid ${ROAM.parchment}`,
      }}>
        {airport ? <Ph.Airplane size={12} sw={1.4} color={ROAM.parchment} /> : n}
      </div>
      <div style={{
        width: 1, height: 6, background: ROAM.ink, marginTop: -1,
      }} />
    </div>
  );
}

// Day tabs — pill segmented in mobile; on desktop, a flatter editorial
// chip row sitting on a hairline rule.
function DayTabs({ active = 0, days = ['Day 1', 'Day 2', 'Day 3', 'Day 4'] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      paddingBottom: 0,
      borderBottom: `1px solid ${ROAM.rule}`,
    }}>
      {days.map((d, i) => {
        const on = i === active;
        return (
          <button key={d} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '12px 16px',
            fontFamily: UI_FONT, fontWeight: on ? 600 : 500,
            fontSize: 14, color: on ? ROAM.ink : ROAM.caption,
            letterSpacing: '-0.005em',
            borderBottom: on ? `1.5px solid ${ROAM.ink}` : '1.5px solid transparent',
            marginBottom: -1,
          }}>{d}</button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '12px 8px', color: ROAM.captionSoft,
      }}>
        <Ph.DotsThree size={18} color={ROAM.captionSoft} />
      </button>
    </div>
  );
}

Object.assign(window, {
  PHOTOS_DT, PhDT, GoogleG, ProfileAvatar,
  TripCard, ActivityRow, GapRow, MiniMap, DayTabs,
});
