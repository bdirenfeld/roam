// tda-map.jsx — Touchpoint 3. Map pin popup gains one "Add to day" action,
// which swaps the action area for a compact flat day list. The popup must
// not grow into a panel — the list replaces, it doesn't append.

const { ROAM: MM_R, UI_FONT: MM_UF, DISPLAY_FONT: MM_DF, Ph: MM_P,
        SmallCaps: MM_SC, PhDT: MM_PD } = window;
const { StaticMapDesktop: MM_MAP, MastheadShell: MM_MS, TdaBookmark: MM_BM } = window;

const TRIP_DAYS = [
  { n: 1, date: 'Jul 23', day: 'Thursday' },
  { n: 2, date: 'Jul 24', day: 'Friday' },
  { n: 3, date: 'Jul 25', day: 'Saturday' },
  { n: 4, date: 'Jul 26', day: 'Sunday' },
];

// small utility pill (Maps / Website / Call)
function MmPill({ Icon, label }) {
  return (
    <button style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '8px 6px', borderRadius: 999, background: '#fff',
      boxShadow: `inset 0 0 0 1px ${MM_R.rule}`, border: 'none', cursor: 'pointer',
      fontFamily: MM_UF, fontWeight: 500, fontSize: 12, color: MM_R.ink, letterSpacing: '-0.005em',
    }}>
      <Icon size={13} sw={1.4} color={MM_R.inkSoft} />
      {label}
    </button>
  );
}

function Phone({ size = 14, color = 'currentColor', sw = 1.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L16 13l5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
    </svg>
  );
}
function Pencil({ size = 13, color = 'currentColor', sw = 1.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
    </svg>
  );
}

// Shared popup chrome: photo header + identity block. Children fill the
// lower (action / list) region. Fixed width — never widens into a panel.
function MmPopupShell({ children }) {
  return (
    <div style={{
      width: 296, background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(26,26,46,0.18), 0 0 0 1px rgba(26,26,46,0.06)',
      fontFamily: MM_UF,
    }}>
      {/* photo */}
      <div style={{
        position: 'relative', height: 132, background: '#2a2620',
        backgroundImage: `url(${window.PHOTOS_DT.manhattanGolden})`, backgroundSize: 'cover', backgroundPosition: '50% 40%',
      }}>
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
          {[MM_P.X].map((Ic, i) => (
            <span key={i} style={{
              width: 24, height: 24, borderRadius: 12, background: 'rgba(26,26,46,0.45)',
              backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ic size={12} color="#fff" sw={1.6} />
            </span>
          ))}
        </div>
        <span style={{
          position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)',
          width: 26, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MM_P.CaretRight size={13} color={MM_R.ink} sw={1.6} />
        </span>
      </div>
      {/* identity */}
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
            background: MM_R.parchmentDeep, fontFamily: MM_UF, fontWeight: 500, fontSize: 11, color: MM_R.ink,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: MM_R.sienna }} />
            Self-directed
          </span>
          <Pencil size={12} color={MM_R.captionSoft} />
        </div>
        <div style={{ marginTop: 9, fontFamily: MM_UF, fontWeight: 600, fontSize: 18, color: MM_R.ink, letterSpacing: '-0.01em' }}>
          Rockefeller Center
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: MM_R.sienna, fontSize: 12, letterSpacing: '0.5px' }}>★★★★<span style={{ color: MM_R.ruleStrong }}>★</span></span>
          <span style={{ fontFamily: MM_UF, fontSize: 12, color: MM_R.caption }}>4.7</span>
        </div>
      </div>
      {children}
    </div>
  );
}

// State A — popup with the new "Add to day" action.
function TdaPinPopupActions() {
  return (
    <MmPopupShell>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          <MmPill Icon={MM_P.MapPin} label="Maps" />
          <MmPill Icon={MM_PD.Globe} label="Website" />
          <MmPill Icon={Phone} label="Call" />
        </div>
        {/* the new door */}
        <button style={{
          marginTop: 9, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          padding: '11px 14px', borderRadius: 10, background: MM_R.parchmentDeep,
          boxShadow: `inset 0 0 0 1px ${MM_R.rule}`, border: 'none', cursor: 'pointer',
          fontFamily: MM_UF, fontWeight: 600, fontSize: 13.5, color: MM_R.ink, letterSpacing: '-0.005em',
        }}>
          <MM_BM size={14} sw={1.5} color={MM_R.ink} />
          Add to day
        </button>
      </div>
    </MmPopupShell>
  );
}

// State B — day list open. Replaces the action area; same width, compact
// scroll. Flat list: day number + date, no other logic.
function TdaPinPopupDayList() {
  return (
    <MmPopupShell>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px 8px' }}>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: MM_R.caption }}>
            <MM_P.CaretLeft size={13} color={MM_R.caption} sw={1.6} />
          </button>
          <MM_SC color={MM_R.captionSoft} size={9}>Add to which day</MM_SC>
        </div>
        <div style={{ maxHeight: 168, overflow: 'auto', borderRadius: 10, boxShadow: `inset 0 0 0 1px ${MM_R.rule}` }}>
          {TRIP_DAYS.map((d, i) => (
            <div key={d.n} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              borderBottom: i < TRIP_DAYS.length - 1 ? `1px solid ${MM_R.rule}` : 'none', cursor: 'pointer',
              background: '#fff',
            }}>
              <span style={{ fontFamily: MM_UF, fontWeight: 600, fontSize: 13.5, color: MM_R.ink, letterSpacing: '-0.005em' }}>
                Day {d.n}
              </span>
              <span style={{ color: MM_R.captionSoft, fontSize: 11 }}>·</span>
              <span style={{ flex: 1, fontFamily: MM_UF, fontSize: 13, color: MM_R.caption, letterSpacing: '-0.005em' }}>
                {d.date}
              </span>
              <MM_P.CaretRight size={12} color={MM_R.captionSoft} sw={1.4} />
            </div>
          ))}
        </div>
      </div>
    </MmPopupShell>
  );
}

// Map surface with a popup floated over it (in situ, 1440 under masthead).
function TdaMapSurface({ state = 'actions' }) {
  return (
    <MM_MS activeNav="journeys" trip={{ name: 'New York (Mia & Daddy)' }} tab="map">
      <div style={{ position: 'relative', height: '100%', display: 'flex', background: MM_R.parchment }}>
        <MM_MAP />
        {/* search bar to anchor the map as the Map surface */}
        <div style={{
          position: 'absolute', top: 18, left: 18, background: '#fff', borderRadius: 999,
          boxShadow: `0 1px 2px rgba(26,26,46,0.06), inset 0 0 0 1px ${MM_R.rule}`,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, width: 320,
        }}>
          <MM_PD.Magnifier size={13} sw={1.4} color={MM_R.caption} />
          <span style={{ fontFamily: MM_UF, fontSize: 13, color: MM_R.captionSoft }}>Search places in New York…</span>
        </div>
        {/* popup near a pin */}
        <div style={{ position: 'absolute', top: 96, left: '38%' }}>
          {state === 'actions' ? <TdaPinPopupActions /> : <TdaPinPopupDayList />}
        </div>
      </div>
    </MM_MS>
  );
}

Object.assign(window, { TRIP_DAYS, TdaPinPopupActions, TdaPinPopupDayList, TdaMapSurface });
