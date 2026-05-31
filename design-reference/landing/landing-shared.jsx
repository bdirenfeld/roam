// landing-shared.jsx
// Roam · landing-page exploration — shared atoms + reusable parchment screen
// mocks (recreating the live app: home, discovery/saved, map, day view).
//
// Design system (non-negotiable):
//   Parchment #FAF7F2 · Ink #1A1A2E · Sienna #C4622D (accent only, never alarm)
//   Display: Playfair Display, italic · UI/body: DM Sans · Icons: Phosphor-light
//   Voice: editorial, "journey" not "trip". No SaaS chrome, no feature grid.

const ROAM = {
  parchment:     '#FAF7F2',
  parchmentDeep: '#F2EDE3',
  parchmentTint: '#F7F3EA',
  parchmentWash: '#EEE9DC',
  ink:           '#1A1A2E',
  inkSoft:       '#3A3A4E',
  sienna:        '#C4622D',
  siennaDeep:    '#A0501F',
  rule:          'rgba(26,26,46,0.10)',
  ruleStrong:    'rgba(26,26,46,0.20)',
  caption:       'rgba(26,26,46,0.55)',
  captionSoft:   'rgba(26,26,46,0.40)',
  label:         'rgba(26,26,46,0.85)',
};

const UI_FONT = '"DM Sans", system-ui, sans-serif';
const DISPLAY_FONT = '"Playfair Display", serif';

// Verified Unsplash URLs reused from the live login + trips list.
const PHOTOS = {
  manhattan: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1700&q=80&auto=format&fit=crop',
  rome:      'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1400&q=80&auto=format&fit=crop',
  paris:     'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1400&q=80&auto=format&fit=crop',
  venice:    'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?w=1600&q=80&auto=format&fit=crop',
  kyoto:     'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1400&q=80&auto=format&fit=crop',
  tokyo:     'https://images.unsplash.com/photo-1554797589-7241bb691973?w=1100&q=80&auto=format&fit=crop',
  amalfi:    'https://images.unsplash.com/photo-1633321088355-d0f81134ca3b?w=1500&q=80&auto=format&fit=crop',
  avatar:    'https://images.unsplash.com/photo-1463453091185-61582044d556?w=160&q=80&auto=format&fit=crop',
};

// ─────────────────────────────────────────────────────────────────
// Phosphor-light icons (1.4 stroke, round caps, no fill)
// ─────────────────────────────────────────────────────────────────
const Ph = {
  Compass: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M15.5 8.5L13 13l-4.5 2.5L11 11z" />
    </svg>
  ),
  MapTrifold: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4zM9 4v13M15 7v12.5" />
    </svg>
  ),
  Calendar: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  Bookmark: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12v16l-6-4-6 4V4z" />
    </svg>
  ),
  Heart: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.6-9-9.2C1.6 7.3 3.4 4.5 6.5 4.5c2 0 3.5 1.3 5.5 3.6 2-2.3 3.5-3.6 5.5-3.6 3.1 0 4.9 2.8 3.5 6.3C19 15.4 12 20 12 20z" />
    </svg>
  ),
  Link: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15l6-6M10 6l1.5-1.5a4 4 0 015.7 5.7L15 12M14 18l-1.5 1.5a4 4 0 01-5.7-5.7L9 12" />
    </svg>
  ),
  Magnifier: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
    </svg>
  ),
  MapPin: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  Plus: ({ size = 14, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  CaretRight: ({ size = 12, color = 'currentColor', sw = 1.6 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  ArrowRight: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  Check: ({ size = 16, color = 'currentColor', sw = 1.5 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4 4 10-10" />
    </svg>
  ),
  DotsThree: ({ size = 16, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
  Airplane: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 14L10 10l-2-7 2-.5L15 8l4.5-1c1 0 1.5.5 1.5 1.3s-.5 1.2-1.3 1.5L15 11l1.5 5.5-1.5.7-4.5-4-5 3 .5 2.5-1 .8-2-3-3-2 .8-1z" />
    </svg>
  ),
  Bed: ({ size = 16, color = 'currentColor', sw = 1.3 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18V7M21 18v-6a3 3 0 00-3-3H10v6M3 14h18M3 18h18" /><circle cx="7" cy="11" r="1.5" />
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
  ChatTeardrop: ({ size = 16, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20l1.6-3.5A9 9 0 1112 21H3.2a.2.2 0 01-.2-.3z" />
    </svg>
  ),
  ListBullets: ({ size = 18, color = 'currentColor', sw = 1.4 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" fill={color} /><circle cx="3.5" cy="12" r="1" fill={color} /><circle cx="3.5" cy="18" r="1" fill={color} />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────
// Google CTA — the single conversion verb
// ─────────────────────────────────────────────────────────────────
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

function GoogleButton({ skin = 'dark', size = 'md', full = false }) {
  const dark = skin === 'dark';
  const h = size === 'lg' ? 58 : size === 'sm' ? 46 : 54;
  const fs = size === 'lg' ? 16 : 15;
  return (
    <button type="button" style={{
      fontFamily: UI_FONT,
      width: full ? '100%' : 'auto', height: h,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      background: dark ? ROAM.ink : '#fff',
      color: dark ? ROAM.parchment : ROAM.ink,
      border: dark ? 'none' : `1px solid ${ROAM.ruleStrong}`,
      borderRadius: 12, padding: full ? 0 : '0 28px',
      fontSize: fs, fontWeight: 500, letterSpacing: '-0.005em',
      cursor: 'pointer',
    }}>
      <GoogleG size={fs + 3} />
      <span>Continue with Google</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Type atoms
// ─────────────────────────────────────────────────────────────────
function Wordmark({ size = 28, color = ROAM.ink }) {
  return (
    <span style={{
      fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
      fontSize: size, lineHeight: 0.95, letterSpacing: '-0.015em', color,
    }}>Roam</span>
  );
}
function Italic({ children, size = 17, color = ROAM.ink, weight = 500, lh = 1.2, style = {} }) {
  return (
    <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: weight, fontSize: size, lineHeight: lh, letterSpacing: '-0.01em', color, ...style }}>
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
function Body({ children, size = 15, color = ROAM.inkSoft, lh = 1.6, weight = 400, style = {} }) {
  return (
    <span style={{ fontFamily: UI_FONT, fontWeight: weight, fontSize: size, lineHeight: lh, letterSpacing: '-0.005em', color, ...style }}>
      {children}
    </span>
  );
}
function Terms({ color = ROAM.caption, align = 'left' }) {
  return (
    <div style={{ fontFamily: UI_FONT, fontSize: 11.5, lineHeight: 1.55, color, textAlign: align, letterSpacing: '-0.003em' }}>
      By continuing you accept Roam's <u style={{ textUnderlineOffset: 2 }}>Terms</u> and <u style={{ textUnderlineOffset: 2 }}>Privacy Policy</u>.
    </div>
  );
}

// Photographic plate
function Photo({ src, position = 'center', radius = 0, style = {}, children, overlay }) {
  return (
    <div style={{
      position: 'relative', backgroundColor: '#2a2620',
      backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: position,
      borderRadius: radius, overflow: 'hidden', ...style,
    }}>
      {overlay}
      {children}
    </div>
  );
}

// A thin "$10, once" coin/seal mark — quiet, editorial, not a badge
function PriceLine({ size = 'md', align = 'left' }) {
  const big = size === 'lg';
  return (
    <div style={{ textAlign: align }}>
      <SmallCaps color={ROAM.sienna} size={big ? 11 : 10}>The whole of Roam</SmallCaps>
      <div style={{ marginTop: big ? 14 : 10 }}>
        <Italic size={big ? 52 : 40} weight={500} color={ROAM.ink}>$10</Italic>
        <Italic size={big ? 26 : 21} weight={400} color={ROAM.caption} style={{ marginLeft: 12 }}>once.</Italic>
      </div>
      <div style={{ marginTop: big ? 14 : 10, maxWidth: 430, marginLeft: align === 'center' ? 'auto' : 0, marginRight: align === 'center' ? 'auto' : 0 }}>
        <Body size={big ? 15.5 : 14} color={ROAM.caption} lh={1.6}>
          Paid one time, after you sign in. No tiers, no subscription, no asterisk — every part of Roam, kept.
        </Body>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Framing chrome
// ═════════════════════════════════════════════════════════════════

// Minimal browser frame for desktop UI shots — a quiet parchment chrome,
// faint url pill. Not glossy macOS; editorial.
function BrowserFrame({ children, url = 'roam.app', style = {}, radius = 14 }) {
  return (
    <div style={{
      borderRadius: radius, overflow: 'hidden', background: ROAM.parchment,
      border: `1px solid ${ROAM.ruleStrong}`,
      boxShadow: '0 1px 2px rgba(26,26,46,0.04), 0 30px 70px -30px rgba(26,26,46,0.30)',
      ...style,
    }}>
      <div style={{
        height: 40, background: ROAM.parchmentDeep, borderBottom: `1px solid ${ROAM.rule}`,
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
      }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: ROAM.ruleStrong }} />
        <span style={{ width: 9, height: 9, borderRadius: 5, background: ROAM.ruleStrong }} />
        <span style={{ width: 9, height: 9, borderRadius: 5, background: ROAM.ruleStrong }} />
        <div style={{
          marginLeft: 12, height: 22, flex: 1, maxWidth: 360, borderRadius: 6,
          background: ROAM.parchment, border: `1px solid ${ROAM.rule}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: UI_FONT, fontSize: 11.5, color: ROAM.caption, letterSpacing: '0.01em',
        }}>{url}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

// Phone frame for mobile screen shots — slim parchment bezel.
function PhoneFrame({ children, width = 280, style = {} }) {
  const h = Math.round(width * (844 / 390));
  return (
    <div style={{
      width, height: h, borderRadius: 36, background: ROAM.ink, padding: 8,
      boxShadow: '0 1px 2px rgba(26,26,46,0.06), 0 40px 80px -30px rgba(26,26,46,0.45)',
      flex: '0 0 auto', ...style,
    }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden', background: ROAM.parchment, position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, {
  ROAM, UI_FONT, DISPLAY_FONT, PHOTOS, Ph,
  GoogleG, GoogleButton, Wordmark, Italic, SmallCaps, Body, Terms, Photo,
  PriceLine, BrowserFrame, PhoneFrame,
});
