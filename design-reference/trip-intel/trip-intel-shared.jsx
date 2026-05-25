// Roam · Trip Intelligence — shared chrome and primitives.
//
// Loaded AFTER companion-shared.jsx, which already published ROAM, UI_FONT,
// DISPLAY_FONT, Ph, Italic, SmallCaps, Body, HRule to window. We reuse those
// tokens so these surfaces sit alongside the existing companion mockups as
// one product.
//
// What lives here:
//   – PROFILE / TRIP sample state
//   – Status bar + Profile / Trip-Settings shell chrome
//   – Monogram, AvatarStub, FactInline — small content primitives
//   – Section header (small-caps kicker + italic display title)
//   – Editorial buttons (ink button, ghost link)
//   – RowControls — the hover-revealed edit / remove pair both surfaces share

const PROFILE = {
  name: 'Brennan Direnfeld',
  email: 'bdirenfeld@gmail.com',
  airport: 'YYZ',
  home: 'Canada',
  passport: 'Canada',
};

const TRIP = {
  name: 'Rome April 2026',
  destination: 'Rome, Italy',
  dates: 'Apr 22 → Apr 28',
  nights: '6 nights',
  travellers: 3,
};

// ─────────────────────────────────────────────────────────────────
// iOS-y status bar — quiet, no battery icons, just the clock.
// ─────────────────────────────────────────────────────────────────
function StatusBar() {
  return (
    <div style={{
      height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '0 26px 8px', fontFamily: UI_FONT, fontSize: 14, fontWeight: 600, color: ROAM.ink,
      letterSpacing: '-0.01em',
    }}>
      <span>9:41</span>
      <span style={{ fontSize: 12, color: ROAM.label, letterSpacing: '0.04em' }}>•••  ◑  ▮</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AvatarStub — small profile circle (top-right of Profile masthead).
// Filled parchment-deep with an italic single letter.
// ─────────────────────────────────────────────────────────────────
function AvatarStub({ size = 30, letter = 'B' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: ROAM.parchmentDeep, color: ROAM.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
      fontSize: size * 0.5, lineHeight: 1, paddingBottom: 2,
      border: `1px solid ${ROAM.rule}`,
    }}>{letter}</div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Monogram — the People-surface mark. Two visual modes:
//   filled (default) — parchment-deep disc, italic Playfair letter
//   outline           — hairline ring, italic letter floating inside
// We use filled in the directions; outline is held in reserve for empty
// placeholders.
// ─────────────────────────────────────────────────────────────────
function Monogram({ size = 44, letter = 'M', mode = 'filled' }) {
  const filled = mode === 'filled';
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: filled ? ROAM.parchmentDeep : 'transparent',
      border: filled ? `1px solid ${ROAM.rule}` : `1px dashed ${ROAM.ruleStrong}`,
      color: ROAM.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
      fontSize: size * 0.5, lineHeight: 1,
      flex: '0 0 auto',
    }}>{letter}</div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Editorial nav header. Used at the top of both shells.
//   Trip Settings : back chevron · centered italic title · Save
//   Profile       : italic "Roam" wordmark left · avatar right
// ─────────────────────────────────────────────────────────────────
function NavHeader({ kind = 'profile' }) {
  if (kind === 'profile') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 22px 14px',
      }}>
        <Italic size={20} weight={500}>Roam</Italic>
        <AvatarStub letter="B"/>
      </div>
    );
  }
  // trip-settings
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '4px 18px 12px',
    }}>
      <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', color: ROAM.ink }}>
        <Ph.CaretLeft size={16} color={ROAM.ink} sw={1.6}/>
      </button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <Italic size={18} weight={500}>Trip settings</Italic>
      </div>
      <button style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
        fontFamily: UI_FONT, fontSize: 14, fontWeight: 600, color: ROAM.ink, letterSpacing: '-0.01em',
      }}>Save</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Profile masthead — avatar, name, sienna email.
// ─────────────────────────────────────────────────────────────────
function ProfileMasthead() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 22px 22px' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 26,
        background: ROAM.parchmentDeep, border: `1px solid ${ROAM.rule}`,
        color: ROAM.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 24,
      }}>B</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: UI_FONT, fontSize: 16, fontWeight: 600, color: ROAM.ink, letterSpacing: '-0.01em' }}>
          {PROFILE.name}
        </span>
        <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.sienna }}>
          {PROFILE.email}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Compact "Travel profile" row — preserves context but doesn't dominate.
// In the real app these are three large fields; here we collapse them to a
// single line so the new Lessons section gets the page below it.
// ─────────────────────────────────────────────────────────────────
function TravelProfileCompact() {
  return (
    <div style={{ padding: '4px 22px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SmallCaps size={10} color={ROAM.caption}>Travel profile</SmallCaps>
        <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13, color: ROAM.caption }}>
          Edit
        </span>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FactInline label="Home airport" value={PROFILE.airport}/>
        <FactInline label="Home country" value={PROFILE.home}/>
        <FactInline label="Passport" value={PROFILE.passport}/>
      </div>
    </div>
  );
}

function FactInline({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: UI_FONT, fontSize: 10.5, color: ROAM.captionSoft, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: UI_FONT, fontSize: 14, fontWeight: 500, color: ROAM.ink, letterSpacing: '-0.005em' }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SectionHeader — the editorial title block both Lessons & People use.
//   kicker  : small caps, color caption
//   title   : Playfair italic display, 22–26px
//   lede    : optional one-line context note in caption italic
//   aside   : right-aligned helper (e.g. "8 lessons")
// ─────────────────────────────────────────────────────────────────
function SectionHeader({ kicker, title, lede, aside, padX = 22 }) {
  return (
    <div style={{ padding: `0 ${padX}px 16px` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <SmallCaps size={10} color={ROAM.caption}>{kicker}</SmallCaps>
        {aside && (
          <span style={{ fontFamily: UI_FONT, fontSize: 11, color: ROAM.captionSoft, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {aside}
          </span>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <Italic size={24} weight={500}>{title}</Italic>
      </div>
      {lede && (
        <div style={{ marginTop: 8, maxWidth: '46ch' }}>
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.caption, lineHeight: 1.55 }}>
            {lede}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RowControls — the hover-revealed edit / remove pair. Used on both
// lesson rows and traveller rows. We render at low opacity by default so
// users discover them; full opacity when the parent has data-hover="true".
// ─────────────────────────────────────────────────────────────────
function RowControls({ visible = 'rest', stack = false }) {
  const opacity = visible === 'hover' ? 1 : visible === 'rest' ? 0.55 : 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: stack ? 6 : 12,
      flexDirection: stack ? 'column' : 'row',
      opacity, transition: 'opacity 120ms ease',
      flex: '0 0 auto',
    }}>
      <button title="Edit" style={iconBtn}>
        <PencilGlyph/>
      </button>
      <button title="Remove" style={iconBtn}>
        <Ph.X size={13} color={ROAM.caption} sw={1.5}/>
      </button>
    </div>
  );
}

const iconBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: ROAM.caption, lineHeight: 0,
};

// Phosphor-light pencil — kept here (not in companion-shared) because only
// these surfaces need it. 1.4 stroke, round caps, no fill.
function PencilGlyph({ size = 13, color = ROAM.caption }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4l6 6L9 21H3v-6z"/>
      <path d="M13 5l6 6"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// AddRow — italic affordance at the foot of a list. The "+" mark is a
// thin glyph, never a chunky pill.
// Variants: 'lesson' (single text line), 'person' (multi-field).
// ─────────────────────────────────────────────────────────────────
function AddRow({ label = 'Add a lesson', padX = 0 }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: `16px ${padX}px`, width: '100%',
      background: 'transparent', border: 'none', cursor: 'pointer',
      textAlign: 'left',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 11,
        border: `1px dashed ${ROAM.ruleStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: ROAM.caption,
      }}>
        <Ph.Plus size={11} color={ROAM.caption} sw={1.4}/>
      </span>
      <span style={{
        fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
        fontSize: 16, color: ROAM.caption, letterSpacing: '-0.005em',
      }}>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// InkLink / GhostLink — used in shell footers ("Archive · Delete", etc.)
// Sienna is fine for delete (it's our accent), but never as alarm-red. The
// brief explicitly approves sienna for the delete affordance on the existing
// Trip Settings — we mirror that here.
// ─────────────────────────────────────────────────────────────────
function GhostLink({ children, color = ROAM.caption }) {
  return (
    <span style={{
      fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
      fontSize: 14, color, letterSpacing: '-0.005em',
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────────
// ProfileShell — outer chrome for the Profile page. Slot children where
// the Lessons surface goes.
// ─────────────────────────────────────────────────────────────────
function ProfileShell({ children, foot }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: ROAM.parchment,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: UI_FONT,
    }}>
      <StatusBar/>
      <NavHeader kind="profile"/>
      <HRule style={{ margin: '0 22px' }}/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ height: 4 }}/>
        <ProfileMasthead/>
        <HRule style={{ margin: '0 22px' }}/>
        <div style={{ height: 16 }}/>
        <TravelProfileCompact/>
        <HRule style={{ margin: '0 22px' }}/>
        <div style={{ height: 22 }}/>
        {children}
        <div style={{ height: 28 }}/>
        {foot}
        <div style={{ height: 40 }}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TripSettingsShell — outer chrome for Trip Settings. Cover photo + the
// existing rows (name / destination / dates), then a slot for the new
// People surface, then the archive / delete footer.
// ─────────────────────────────────────────────────────────────────
function TripSettingsShell({ children, hideExistingTravellers = true }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: ROAM.parchment,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: UI_FONT,
    }}>
      <StatusBar/>
      <NavHeader kind="trip-settings"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <CoverPhoto/>
        <SettingsRow label="Name" value={TRIP.name} valueColor={ROAM.sienna} trail={<EditDots/>}/>
        <SettingsRow label="Destination" value={TRIP.destination}/>
        <SettingsRow label="Dates" value={TRIP.dates} trail={<span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption }}>{TRIP.nights}</span>}/>
        {!hideExistingTravellers && (
          <SettingsRow label="Travellers" value={
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StepperBtn>−</StepperBtn>
              <span style={{ fontFamily: UI_FONT, fontSize: 15, fontWeight: 500 }}>2</span>
              <StepperBtn>+</StepperBtn>
            </span>
          }/>
        )}
        <div style={{ height: 18 }}/>
        {children}
        <div style={{ height: 24 }}/>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, padding: '20px 22px' }}>
          <GhostLink>Archive this journey</GhostLink>
          <span style={{ color: ROAM.captionSoft }}>·</span>
          <GhostLink color={ROAM.sienna}>Delete permanently</GhostLink>
        </div>
        <div style={{ height: 40 }}/>
      </div>
    </div>
  );
}

function CoverPhoto() {
  // Editorial placeholder — soft parchment wash with the suggestion of a
  // skyline silhouette. Not literal — just enough that you read "cover".
  return (
    <div style={{
      position: 'relative', height: 132, margin: '4px 18px 14px',
      borderRadius: 4, overflow: 'hidden',
      background: ROAM.parchmentWash,
      border: `1px solid ${ROAM.rule}`,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 360 132" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <rect width="360" height="132" fill={ROAM.parchmentWash}/>
        <g fill="rgba(26,26,46,0.10)">
          <rect x="0" y="92" width="360" height="40"/>
          <path d="M40 92 L40 70 L60 70 L60 60 L80 60 L80 78 L100 78 L100 70 L120 70 L120 92 Z"/>
          <ellipse cx="180" cy="74" rx="34" ry="18"/>
          <rect x="146" y="62" width="68" height="14"/>
          <path d="M250 92 L250 64 Q 270 50 290 64 L290 78 L310 78 L310 92 Z"/>
          <rect x="160" y="40" width="4" height="22"/>
          <circle cx="162" cy="38" r="3"/>
          <rect x="278" y="46" width="4" height="20"/>
        </g>
      </svg>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 0', color: ROAM.parchment,
        background: 'linear-gradient(180deg, rgba(26,26,46,0) 0%, rgba(26,26,46,0.45) 100%)',
      }}>
        <CameraGlyph color={ROAM.parchment} size={13}/>
        <SmallCaps size={9.5} color={ROAM.parchment}>Change cover</SmallCaps>
      </div>
    </div>
  );
}

function CameraGlyph({ size = 14, color = ROAM.ink }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/>
      <circle cx="12" cy="13" r="3.5"/>
    </svg>
  );
}

function SettingsRow({ label, value, trail }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 22px',
      borderTop: `1px solid ${ROAM.rule}`,
    }}>
      <span style={{
        flex: '0 0 86px',
        fontFamily: UI_FONT, fontSize: 10.5, fontWeight: 500,
        color: ROAM.captionSoft, letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{ flex: 1, fontFamily: UI_FONT, fontSize: 14, color: ROAM.ink, letterSpacing: '-0.005em' }}>
        {value}
      </span>
      {trail}
    </div>
  );
}

function EditDots() {
  return (
    <button style={{
      width: 26, height: 26, borderRadius: 4,
      background: ROAM.parchmentDeep, border: `1px solid ${ROAM.rule}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', padding: 0,
    }}>
      <Ph.DotsThree size={14} color={ROAM.caption}/>
    </button>
  );
}

function StepperBtn({ children }) {
  return (
    <span style={{
      width: 26, height: 26, borderRadius: 13,
      background: ROAM.parchmentDeep, border: `1px solid ${ROAM.rule}`,
      color: ROAM.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: UI_FONT, fontSize: 14, fontWeight: 500,
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────────
// CursorBar — a 1px blinking caret used in the Adding/Editing artboards.
// ─────────────────────────────────────────────────────────────────
function CursorBar({ height = 18 }) {
  return (
    <span style={{
      display: 'inline-block', width: 1.5, height,
      background: ROAM.ink, verticalAlign: '-2px', marginLeft: 1,
      animation: 'roam-caret 1s steps(2) infinite',
    }}/>
  );
}

// Inline "selected/active row" wash. Used to show edit state on a row.
const activeRowWash = {
  background: ROAM.parchmentTint,
  boxShadow: `inset 3px 0 0 0 ${ROAM.sienna}`,
};

Object.assign(window, {
  PROFILE, TRIP,
  StatusBar, NavHeader, AvatarStub, Monogram, PencilGlyph, CameraGlyph,
  ProfileMasthead, TravelProfileCompact, FactInline,
  SectionHeader, RowControls, AddRow, GhostLink,
  ProfileShell, TripSettingsShell, SettingsRow, EditDots, StepperBtn,
  CursorBar, activeRowWash,
});
