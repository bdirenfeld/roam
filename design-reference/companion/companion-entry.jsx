// Roam · Companion — entry points
// Restrained, magazine-quiet ways to invoke the companion from within a trip.
// No sparkles, no glowing AI button, no "✨".
//
// Mobile (1A–1D)
//   1A. Editorial pull — italic phrase floating between thin rules,
//       sitting between the day chips and the map. Like a chapter break.
//   1B. Nav annotation — Phosphor compass icon paired with the existing
//       overflow, on the right of the day's masthead.
//   1C. Day footer — centered italic invitation under the last card.
//       "Talk this day through with Roam ↗"  — reads like a colophon.
//   1D. Margin bookmark — a vertical parchment-deep ribbon clipped to
//       the right edge, with the wordmark running bottom-to-top.
//
// Desktop (2A–2B)
//   2A. Masthead link — compass + italic "Companion" sitting in the top
//       bar between the place-search field and the avatar.
//   2B. Sidebar foot — italic invitation at the bottom of the filter rail,
//       paired with the existing "Enrich all cards" line.

// ─────────────────────────────────────────────────────────────────
// 1A · Editorial pull
// ─────────────────────────────────────────────────────────────────
function Entry_M_EditorialPull() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <TripDayMobile chrome={{
        betweenChipsAndMap: (
          <div style={{ padding: '0 24px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, height: 1, background: ROAM.rule }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Ph.Compass size={14} color={ROAM.sienna} sw={1.3}/>
              <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 14, color: ROAM.sienna, letterSpacing: '-0.005em' }}>
                Talk this day through
              </span>
            </div>
            <div style={{ flex: 1, height: 1, background: ROAM.rule }} />
          </div>
        ),
      }} />
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1B · Nav annotation
// ─────────────────────────────────────────────────────────────────
function Entry_M_NavAnnotation() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <TripDayMobile chrome={{
        headerEntry: (
          <button style={{
            width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: ROAM.label,
          }}>
            <Ph.Compass size={19} color={ROAM.ink} sw={1.3} />
          </button>
        ),
      }} />
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1C · Day footer — italic invitation under the last card
// ─────────────────────────────────────────────────────────────────
function Entry_M_DayFooter() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <TripDayMobile chrome={{
        footerEntry: (
          <div style={{ padding: '28px 24px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 36, height: 1, background: ROAM.ruleStrong }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 16, color: ROAM.sienna, letterSpacing: '-0.005em' }}>
                Talk this day through with Roam
              </span>
              <Ph.ArrowRight size={13} color={ROAM.sienna} sw={1.4} />
            </div>
            <SmallCaps size={9.5} color={ROAM.captionSoft}>A thinking partner · not autopilot</SmallCaps>
          </div>
        ),
      }} />
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1D · Margin bookmark — vertical parchment-deep ribbon on right edge
// ─────────────────────────────────────────────────────────────────
function Entry_M_Bookmark() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <TripDayMobile chrome={{
        sideRibbon: (
          <div style={{
            position: 'absolute',
            right: 0, top: 280,
            width: 32, height: 230,
            background: ROAM.ink, color: ROAM.parchment,
            borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0',
            boxShadow: '0 2px 10px rgba(26,26,46,0.10), 0 0 0 0.5px rgba(26,26,46,0.4)',
            zIndex: 30,
          }}>
            <Ph.Compass size={15} color={ROAM.parchment} sw={1.3} />
            <div style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
              fontSize: 14, letterSpacing: '0.04em',
              color: ROAM.parchment,
            }}>
              Roam · Companion
            </div>
            <Ph.CaretLeft size={11} color="rgba(250,247,242,0.55)" sw={1.5} />
          </div>
        ),
      }} />
    </IOSDevice>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2A · Desktop masthead link
// ─────────────────────────────────────────────────────────────────
function Entry_D_MastheadLink() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TripDesktop chrome={{
        topRightEntry: (
          <button style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '6px 12px', color: ROAM.ink,
            borderRight: `1px solid ${ROAM.rule}`,
            marginRight: 6,
          }}>
            <Ph.Compass size={16} color={ROAM.ink} sw={1.3} />
            <span style={{
              fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
              fontSize: 16, color: ROAM.ink, letterSpacing: '-0.005em',
            }}>Companion</span>
          </button>
        ),
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2B · Desktop sidebar foot
// ─────────────────────────────────────────────────────────────────
function Entry_D_SidebarFoot() {
  // Custom sidebar replacement that adds an "ask Roam" foot above the
  // existing "Enrich all cards" line.
  const CustomSidebar = (() => {
    return (
      <div style={{ width: 232, flex: '0 0 232px', borderRight: `1px solid ${ROAM.rule}`, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <DesktopSidebar />
      </div>
    );
  });
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TripDesktop chrome={{
        sidebarReplacement: (
          <div style={{ width: 232, flex: '0 0 232px', borderRight: `1px solid ${ROAM.rule}`, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
            {/* render the original sidebar inline so it stays in sync */}
            <DesktopSidebarWithFoot />
          </div>
        ),
      }} />
    </div>
  );
}

// Sidebar with an editorial foot added above "Enrich all cards"
function DesktopSidebarWithFoot() {
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
    <React.Fragment>
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
      {/* THE ENTRY POINT */}
      <div style={{ padding: '14px 18px 10px', borderTop: `1px solid ${ROAM.rule}`, background: ROAM.parchmentTint }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ph.Compass size={16} color={ROAM.sienna} sw={1.3} />
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 15.5, color: ROAM.sienna, letterSpacing: '-0.005em' }}>
            Talk it through
          </span>
        </div>
        <div style={{ fontFamily: UI_FONT, fontSize: 11.5, color: ROAM.caption, marginTop: 5, lineHeight: 1.45 }}>
          A thinking partner for this trip.
        </div>
      </div>
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${ROAM.rule}` }}>
        <span style={{ fontFamily: UI_FONT, fontSize: 12.5, color: ROAM.caption }}>Enrich all cards</span>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, {
  Entry_M_EditorialPull, Entry_M_NavAnnotation, Entry_M_DayFooter, Entry_M_Bookmark,
  Entry_D_MastheadLink, Entry_D_SidebarFoot,
});
