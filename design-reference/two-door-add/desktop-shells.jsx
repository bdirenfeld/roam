// desktop-shells.jsx
// Two ways to re-house the centered 390-wide column on desktop:
//   A · "Masthead"  — horizontal top bar, italic wordmark left, nav right
//   B · "Left rail" — slim 220-wide vertical rail, nav stacked
//
// Both share parchment ground, the same content components, and the same
// in-trip sub-bar (Agenda · Plan · Map).

const { ROAM: ROAM_S, UI_FONT: UI_FONT_S, DISPLAY_FONT: DISPLAY_FONT_S,
        Ph: Ph_S, Italic: Italic_S, SmallCaps: SmallCaps_S } = window;
const { ProfileAvatar: ProfileAvatar_S, PhDT: PhDT_S } = window;

// ───────────────────────────────────────────────────────────────
// MASTHEAD SHELL — single bar, absorbs trip context + tabs
// ───────────────────────────────────────────────────────────────
function MastheadShell({ children, activeNav = 'journeys', trip = null, tab = 'agenda' }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: ROAM_S.parchment,
      display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT_S, color: ROAM_S.ink,
    }}>
      <MastheadBar activeNav={activeNav} trip={trip} tab={tab} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function MastheadBar({ activeNav, trip, tab }) {
  const TABS = [
    { id: 'agenda', label: 'Agenda', icon: PhDT_S.Calendar },
    { id: 'plan',   label: 'Plan',   icon: PhDT_S.Columns },
    { id: 'map',    label: 'Map',    icon: Ph_S.MapPin },
  ];
  const onJourneys = activeNav === 'journeys' && !trip;

  return (
    <div style={{
      height: 64, paddingLeft: 28, paddingRight: 28,
      display: 'flex', alignItems: 'center', gap: 0,
      borderBottom: `1px solid ${ROAM_S.rule}`,
      background: ROAM_S.parchment,
    }}>
      {/* Wordmark */}
      <div style={{
        fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontWeight: 500,
        fontSize: 24, letterSpacing: '-0.015em', color: ROAM_S.ink,
      }}>Roam</div>

      {/* Vertical hairline */}
      <div style={{ width: 1, height: 22, background: ROAM_S.rule, margin: '0 22px' }} />

      {/* Breadcrumb: Journeys ( › Trip name ) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <button style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '6px 2px',
          fontFamily: DISPLAY_FONT_S, fontStyle: 'italic',
          fontWeight: onJourneys ? 500 : 400, fontSize: 17,
          color: onJourneys ? ROAM_S.ink : (trip ? ROAM_S.caption : ROAM_S.ink),
          letterSpacing: '-0.005em',
          borderBottom: onJourneys ? `1px solid ${ROAM_S.ink}` : '1px solid transparent',
        }}>Journeys</button>

        {trip && (
          <React.Fragment>
            <span style={{
              color: ROAM_S.captionSoft, padding: '0 10px',
              fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontSize: 17,
            }}>›</span>
            <span style={{
              fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontWeight: 500,
              fontSize: 17, color: ROAM_S.ink, letterSpacing: '-0.005em',
            }}>{trip.name}</span>
          </React.Fragment>
        )}
      </div>

      {/* Tabs (only inside a trip) */}
      {trip && (
        <React.Fragment>
          <div style={{ width: 1, height: 22, background: ROAM_S.rule, margin: '0 22px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {TABS.map((t) => {
              const on = t.id === tab;
              const Ic = t.icon;
              return (
                <button key={t.id} style={{
                  background: on ? '#fff' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  padding: '8px 14px', borderRadius: 999,
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontFamily: UI_FONT_S, fontWeight: on ? 600 : 500,
                  fontSize: 13, color: on ? ROAM_S.ink : ROAM_S.caption,
                  boxShadow: on ? `0 0 0 1px ${ROAM_S.rule}, 0 1px 2px rgba(26,26,46,0.05)` : 'none',
                  letterSpacing: '-0.005em',
                }}>
                  <Ic size={14} sw={1.4} color={on ? ROAM_S.ink : ROAM_S.caption} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      )}

      <div style={{ flex: 1 }} />

      {/* Right-side cluster: new journey + search + avatar */}
      <button title="Plan a journey" style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 8, color: ROAM_S.caption, marginRight: 2,
        display: 'inline-flex',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
             stroke={ROAM_S.caption} strokeWidth="1.4"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <button style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 8, color: ROAM_S.caption, marginRight: 6,
      }}>
        <PhDT_S.Magnifier size={17} sw={1.4} />
      </button>

      <div style={{ width: 1, height: 22, background: ROAM_S.rule, margin: '0 12px 0 6px' }} />

      <AvatarMenu />
    </div>
  );
}

// Avatar + dropdown menu — the only door into profile/account/sign-out.
function AvatarMenu() {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 2, borderRadius: 999,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontSize: 15,
          color: ROAM_S.ink,
        }}>Brennan</span>
        <ProfileAvatar_S size={30} ring />
      </button>

      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 50,
          }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            width: 280, zIndex: 51,
            background: ROAM_S.parchment,
            border: `1px solid ${ROAM_S.rule}`, borderRadius: 12,
            boxShadow: '0 8px 28px rgba(26,26,46,0.08), 0 0 0 1px rgba(26,26,46,0.03)',
            padding: 6,
          }}>
            {/* Identity block — avatar + name + email */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 12px 14px',
            }}>
              <ProfileAvatar_S size={40} ring />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontWeight: 500,
                  fontSize: 16, color: ROAM_S.ink, letterSpacing: '-0.005em',
                }}>Brennan Direnfeld</div>
                <div style={{
                  fontFamily: UI_FONT_S, fontSize: 12,
                  color: ROAM_S.captionSoft, marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>bdirenfeld@gmail.com</div>
              </div>
            </div>

            {/* Hairline */}
            <div style={{ height: 1, background: ROAM_S.rule, margin: '0 4px' }} />

            {/* Menu items */}
            <MenuItem icon={PhDT_S.User}>Profile</MenuItem>

            <div style={{ height: 1, background: ROAM_S.rule, margin: '6px 4px' }} />

            <MenuItem muted>Sign out</MenuItem>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, children, muted = false }) {
  return (
    <button style={{
      width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '9px 12px', borderRadius: 6,
      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
      fontFamily: UI_FONT_S, fontWeight: 500, fontSize: 13,
      color: muted ? ROAM_S.caption : ROAM_S.ink,
      letterSpacing: '-0.005em',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      {Icon && <Icon size={15} sw={1.4} color={muted ? ROAM_S.caption : ROAM_S.ink} />}
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}

// Sub-bar that sits below the masthead when you're inside a trip.
// Carries the trip name + the Agenda · Plan · Map tabs that on mobile
// live in the bottom nav.
function TripSubBar({ tripName, dates, tab = 'agenda' }) {
  const TABS = [
    { id: 'agenda', label: 'Agenda', icon: PhDT_S.Calendar },
    { id: 'plan',   label: 'Plan',   icon: PhDT_S.Columns },
    { id: 'map',    label: 'Map',    icon: Ph_S.MapPin },
  ];
  return (
    <div style={{
      height: 56, paddingLeft: 28, paddingRight: 28,
      display: 'flex', alignItems: 'center', gap: 20,
      borderBottom: `1px solid ${ROAM_S.rule}`,
      background: ROAM_S.parchment,
    }}>
      {/* Trip title — anchor */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontWeight: 500,
          fontSize: 19, color: ROAM_S.ink, letterSpacing: '-0.01em',
        }}>{tripName}</span>
        <SmallCaps_S color={ROAM_S.caption} size={10}>{dates}</SmallCaps_S>
      </div>

      {/* Hairline */}
      <div style={{ width: 1, height: 22, background: ROAM_S.rule }} />

      {/* Tabs — primary actions, kept in left scan zone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          const Ic = t.icon;
          return (
            <button key={t.id} style={{
              background: on ? '#fff' : 'transparent',
              border: 'none', cursor: 'pointer',
              padding: '8px 14px', borderRadius: 999,
              display: 'flex', alignItems: 'center', gap: 7,
              fontFamily: UI_FONT_S, fontWeight: on ? 600 : 500,
              fontSize: 13, color: on ? ROAM_S.ink : ROAM_S.caption,
              boxShadow: on ? `0 0 0 1px ${ROAM_S.rule}, 0 1px 2px rgba(26,26,46,0.05)` : 'none',
              letterSpacing: '-0.005em',
            }}>
              <Ic size={14} sw={1.4} color={on ? ROAM_S.ink : ROAM_S.caption} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// DIRECTION B · LEFT RAIL
// ───────────────────────────────────────────────────────────────
function RailShell({ children, activeNav = 'journeys', topBar = null }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: ROAM_S.parchment,
      display: 'flex',
      fontFamily: UI_FONT_S, color: ROAM_S.ink,
    }}>
      <SideRail activeNav={activeNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {topBar}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SideRail({ activeNav }) {
  const NAV = [
    { id: 'journeys', label: 'Journeys', icon: PhDT_S.Compass },
    { id: 'map',      label: 'Atlas',    icon: PhDT_S.Globe },
    { id: 'profile',  label: 'Profile',  icon: PhDT_S.User },
  ];
  return (
    <div style={{
      width: 220, flex: '0 0 220px',
      background: ROAM_S.parchment,
      borderRight: `1px solid ${ROAM_S.rule}`,
      display: 'flex', flexDirection: 'column',
      padding: '26px 22px 22px',
    }}>
      {/* Wordmark */}
      <div style={{
        fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontWeight: 500,
        fontSize: 26, color: ROAM_S.ink, letterSpacing: '-0.015em',
        marginBottom: 30,
      }}>Roam</div>

      {/* Nav items — italic Playfair w/ small Phosphor icon */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => {
          const on = n.id === activeNav;
          const Ic = n.icon;
          return (
            <button key={n.id} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '9px 10px', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 12,
              fontFamily: DISPLAY_FONT_S, fontStyle: 'italic',
              fontWeight: on ? 500 : 400, fontSize: 17,
              color: on ? ROAM_S.ink : ROAM_S.caption,
              letterSpacing: '-0.005em',
              textAlign: 'left',
            }}>
              <Ic size={15} sw={1.4} color={on ? ROAM_S.ink : ROAM_S.caption} />
              <span>{n.label}</span>
              {on && (
                <span style={{
                  marginLeft: 'auto',
                  width: 4, height: 4, borderRadius: 2,
                  background: ROAM_S.ink,
                }} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Profile chip at the bottom */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 4px', borderTop: `1px solid ${ROAM_S.rule}`,
        paddingTop: 16,
      }}>
        <ProfileAvatar_S size={30} ring />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: UI_FONT_S, fontWeight: 500, fontSize: 13,
            color: ROAM_S.ink, letterSpacing: '-0.005em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>Brennan</div>
          <div style={{
            fontFamily: UI_FONT_S, fontSize: 11,
            color: ROAM_S.captionSoft,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>bdirenfeld@gmail.com</div>
        </div>
      </div>
    </div>
  );
}

// Trip sub-bar for the rail variant — same Agenda/Plan/Map tabs, but the
// rail already shows the global nav, so this carries trip name + back link
// + tabs in a single line above the content body.
function TripStripRail({ tripName, dates, tab = 'agenda' }) {
  const TABS = [
    { id: 'agenda', label: 'Agenda', icon: PhDT_S.Calendar },
    { id: 'plan',   label: 'Plan',   icon: PhDT_S.Columns },
    { id: 'map',    label: 'Map',    icon: Ph_S.MapPin },
  ];
  return (
    <div style={{
      height: 64, paddingLeft: 36, paddingRight: 36,
      display: 'flex', alignItems: 'center', gap: 16,
      borderBottom: `1px solid ${ROAM_S.rule}`,
      background: ROAM_S.parchment,
    }}>
      <button style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        color: ROAM_S.caption, padding: '6px 4px',
        fontFamily: UI_FONT_S, fontSize: 13, fontWeight: 500,
      }}>
        <Ph_S.CaretLeft size={12} sw={1.6} color={ROAM_S.caption} />
        All journeys
      </button>
      <div style={{ width: 1, height: 22, background: ROAM_S.rule, margin: '0 4px' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontFamily: DISPLAY_FONT_S, fontStyle: 'italic', fontWeight: 500,
          fontSize: 21, color: ROAM_S.ink, letterSpacing: '-0.01em',
        }}>{tripName}</span>
        <SmallCaps_S color={ROAM_S.caption} size={10}>{dates}</SmallCaps_S>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          const Ic = t.icon;
          return (
            <button key={t.id} style={{
              background: on ? '#fff' : 'transparent',
              border: 'none', cursor: 'pointer',
              padding: '8px 14px', borderRadius: 999,
              display: 'flex', alignItems: 'center', gap: 7,
              fontFamily: UI_FONT_S, fontWeight: on ? 600 : 500,
              fontSize: 13, color: on ? ROAM_S.ink : ROAM_S.caption,
              boxShadow: on ? `0 0 0 1px ${ROAM_S.rule}, 0 1px 2px rgba(26,26,46,0.05)` : 'none',
              letterSpacing: '-0.005em',
            }}>
              <Ic size={14} sw={1.4} color={on ? ROAM_S.ink : ROAM_S.caption} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  MastheadShell, MastheadBar, TripSubBar,
  RailShell, SideRail, TripStripRail,
});
