// tda-plan.jsx — Plan board context for the Two-Door Add work.
// Re-implements the Plan view's day columns (desktop-plan.jsx is not split
// into exported parts) so the new footer affordances + blank-card composer
// can be dropped into situ. Styling tracks desktop-plan.jsx exactly.

const { ROAM: TP_R, UI_FONT: TP_UF, DISPLAY_FONT: TP_DF, Ph: TP_P,
        SmallCaps: TP_SC, Italic: TP_I } = window;
const { PHOTOS_DT: TP_PH, MastheadShell: TP_MS } = window;

const TDA_CATS = {
  arrival:    { icon: TP_P.Airplane,  label: 'Arrival' },
  hotel:      { icon: TP_P.Bed,       label: 'Hotel' },
  guided:     { icon: TP_P.Flag,      label: 'Guided' },
  selfdir:    { icon: TP_P.Compass,   label: 'Self-directed' },
  restaurant: { icon: TP_P.ForkKnife, label: 'Restaurant' },
  dessert:    { icon: TP_P.IceCream,  label: 'Dessert' },
  coffee:     { icon: TP_P.Coffee,    label: 'Coffee' },
};

const TDA_DAYS = [
  { n: 1, day: 'Thursday', date: 'JUL 23', hours: '7h', cards: [
    { cat: 'arrival',    name: 'LaGuardia Airport',                 time: '9:20am – 10:55am' },
    { cat: 'hotel',      name: '11 Howard',                         time: '12:00pm – 1:00pm' },
    { cat: 'guided',     name: 'Sloomoo Institute',                 time: '2:00pm – 3:30pm' },
    { cat: 'restaurant', name: 'Rubirosa',                          time: '6:00pm – 7:30pm' },
    { cat: 'dessert',    name: "Morgenstern's Finest Ice Cream",    time: '7:30pm – 8:00pm', star: true },
  ] },
  { n: 2, day: 'Friday', date: 'JUL 24', hours: '6h', cards: [
    { cat: 'restaurant', name: "Jack's Wife Freda",                 time: '8:30am – 9:30am' },
    { cat: 'guided',     name: 'Museum of Ice Cream',               time: '10:30am – 12:30pm' },
    { cat: 'selfdir',    name: 'Pearl & The Beast',                 time: '1:30pm – 3:30pm' },
    { cat: 'restaurant', name: 'Parm Mulberry Street',              time: '5:00pm – 6:15pm' },
  ] },
  { n: 3, day: 'Saturday', date: 'JUL 25', hours: '8h', cards: [
    { cat: 'coffee',     name: "Sadelle's New York",                time: '8:00am – 8:30am', star: true },
    { cat: 'guided',     name: 'Museum of Natural History',         time: '9:30am – 11:45am' },
    { cat: 'dessert',    name: 'Levain Bakery',                     time: '11:45am – 12:00pm', star: true },
    { cat: 'restaurant', name: 'Shake Shack Upper West Side',       time: '12:00pm – 12:45pm' },
  ] },
];

function TdaPlanCard({ card }) {
  const cat = TDA_CATS[card.cat] || TDA_CATS.selfdir;
  const Icon = cat.icon;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
      background: '#fff', borderRadius: 12,
      boxShadow: `0 1px 2px rgba(26,26,46,0.04), 0 0 0 1px ${TP_R.rule}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18,
        background: TP_R.parchmentDeep, color: TP_R.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
      }}>
        <Icon size={16} sw={1.35} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            flex: 1, minWidth: 0, fontFamily: TP_UF, fontWeight: 500, fontSize: 13.5,
            color: TP_R.ink, letterSpacing: '-0.005em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{card.name}</span>
          {card.star && <span style={{ color: TP_R.sienna, lineHeight: 1, fontSize: 11 }}>★</span>}
        </div>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: TP_UF, fontSize: 11, color: TP_R.caption, letterSpacing: '-0.005em' }}>{card.time}</span>
          <span style={{ color: TP_R.captionSoft, fontSize: 10 }}>·</span>
          <span style={{
            fontFamily: TP_UF, fontSize: 9.5, fontWeight: 500, color: TP_R.captionSoft,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>{cat.label}</span>
        </div>
      </div>
    </div>
  );
}

// The existing quiet dashed "+ Add a card" (unchanged baseline).
function TdaAddCard({ muted = false }) {
  return (
    <button style={{
      background: 'transparent', border: `1px dashed ${TP_R.ruleStrong}`, borderRadius: 12,
      cursor: 'pointer', padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: TP_DF, fontStyle: 'italic', fontWeight: 400, fontSize: 14,
      color: muted ? TP_R.captionSoft : TP_R.caption, letterSpacing: '-0.005em',
    }}>
      <TP_P.Plus size={11} sw={1.5} color={muted ? TP_R.captionSoft : TP_R.caption} />
      Add a card
    </button>
  );
}

// Small bookmark-tab glyph (Phosphor-light hand) used to signal "saved".
function TdaBookmark({ size = 14, color = 'currentColor', sw = 1.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12v17l-6-4-6 4V4z" />
    </svg>
  );
}

// ── Touchpoint 1 footer variants ───────────────────────────────────

// A · Combined, splits on tap. Shown in its OPEN state so the two doors
// are visible — but at rest it is a single button (the saved path hides
// behind a click, which is the discoverability risk).
function TdaFooterSplit() {
  return (
    <div style={{ position: 'relative' }}>
      <button style={{
        width: '100%', background: 'transparent', border: `1px dashed ${TP_R.ruleStrong}`,
        borderRadius: 12, cursor: 'pointer', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: TP_DF, fontStyle: 'italic', fontSize: 14, color: TP_R.caption,
      }}>
        <TP_P.Plus size={11} sw={1.5} color={TP_R.caption} /> Add a card
        <TP_P.CaretDown size={11} sw={1.5} color={TP_R.captionSoft} />
      </button>
      {/* opened menu */}
      <div style={{
        marginTop: 6, background: '#fff', borderRadius: 12,
        boxShadow: `0 8px 24px rgba(26,26,46,0.10), 0 0 0 1px ${TP_R.rule}`, padding: 5,
      }}>
        {[['From saved places', TdaBookmark], ['Blank card', TP_P.Plus]].map(([label, Ic], i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 8, fontFamily: TP_UF, fontWeight: 500, fontSize: 13, color: TP_R.ink,
          }}>
            <Ic size={14} sw={1.4} color={TP_R.caption} /> {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// B · Two stacked quiet actions — RECOMMENDED.
// "Add from saved" is a filled-quiet action (parchmentDeep, ink, bookmark)
// reading first; the blank-card path stays as the demoted dashed ghost.
function TdaFooterStacked() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button style={{
        width: '100%', background: TP_R.parchmentDeep, border: 'none',
        boxShadow: `inset 0 0 0 1px ${TP_R.rule}`, borderRadius: 12, cursor: 'pointer',
        padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        fontFamily: TP_UF, fontWeight: 600, fontSize: 13.5, color: TP_R.ink, letterSpacing: '-0.005em',
      }}>
        <TdaBookmark size={14} sw={1.5} color={TP_R.ink} />
        Add from saved
      </button>
      <TdaAddCard muted />
    </div>
  );
}

// C · Two-door footer — one block, hairline split, both doors visible.
function TdaFooterTwoDoor() {
  const Door = ({ Ic, label, primary }) => (
    <button style={{
      flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '13px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      fontFamily: TP_UF, fontWeight: primary ? 600 : 500, fontSize: 12.5,
      color: primary ? TP_R.ink : TP_R.caption, letterSpacing: '-0.005em',
    }}>
      <Ic size={16} sw={1.4} color={primary ? TP_R.ink : TP_R.caption} />
      {label}
    </button>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', background: '#fff', borderRadius: 12,
      boxShadow: `0 1px 2px rgba(26,26,46,0.04), 0 0 0 1px ${TP_R.rule}`, overflow: 'hidden',
    }}>
      <Door Ic={TdaBookmark} label="From saved" primary />
      <div style={{ width: 1, background: TP_R.rule }} />
      <Door Ic={TP_P.Plus} label="New card" />
    </div>
  );
}

// ── Touchpoint 4 · blank-card composer ─────────────────────────────
// Inline new card created on a day. Quiet preset chips accelerate the
// common case without advertising themselves.
function TdaBlankComposer() {
  const chips = ['Dinner', 'Lunch', 'Free time'];
  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      boxShadow: `0 1px 2px rgba(26,26,46,0.05), 0 0 0 1px ${TP_R.ruleStrong}`,
      padding: '12px 13px 13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 18, flex: '0 0 auto',
          border: `1px dashed ${TP_R.ruleStrong}`, background: TP_R.parchmentTint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TP_P.Plus size={14} sw={1.4} color={TP_R.captionSoft} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: TP_DF, fontStyle: 'italic', fontSize: 15, color: TP_R.captionSoft }}>
            Name this stop
          </span>
          <span style={{
            display: 'inline-block', width: 1.5, height: 15, background: TP_R.ink,
            marginLeft: 3, verticalAlign: '-2px', animation: 'roam-caret 1s steps(2) infinite',
          }} />
        </div>
      </div>
      {/* preset chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingLeft: 44 }}>
        {chips.map((c) => (
          <span key={c} style={{
            padding: '5px 11px', borderRadius: 999,
            background: 'transparent', boxShadow: `inset 0 0 0 1px ${TP_R.rule}`,
            fontFamily: TP_UF, fontWeight: 500, fontSize: 12, color: TP_R.caption,
            letterSpacing: '-0.005em', cursor: 'pointer',
          }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

// ── Plan board ─────────────────────────────────────────────────────
// renderFooter(day, idx) -> node for the column footer.
// composerAt: idx of a column whose footer is replaced by the blank composer.
function TdaDayColumn({ day, idx, renderFooter, composer }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <TP_SC color={TP_R.caption} size={10}>Day {day.n}</TP_SC>
        <div style={{
          marginTop: 4, fontFamily: TP_DF, fontStyle: 'italic', fontWeight: 500,
          fontSize: 22, color: TP_R.ink, letterSpacing: '-0.01em',
        }}>{day.day}</div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <TP_SC color={TP_R.caption} size={9.5}>{day.date}</TP_SC>
          <span style={{ color: TP_R.captionSoft, fontSize: 11 }}>·</span>
          <span style={{ fontFamily: TP_UF, fontSize: 11, color: TP_R.caption, letterSpacing: '-0.005em' }}>
            {day.cards.length} stops · {day.hours}
          </span>
        </div>
      </div>
      <div style={{ height: 1, background: TP_R.rule, marginBottom: 12 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {day.cards.map((c, i) => <TdaPlanCard key={i} card={c} />)}
        {composer}
        <div style={{ marginTop: composer ? 2 : 2 }}>
          {renderFooter ? renderFooter(day, idx) : <TdaAddCard />}
        </div>
      </div>
    </div>
  );
}

function TdaPlanBoard({ renderFooter, composerAt = -1, days = TDA_DAYS }) {
  return (
    <div style={{ height: '100%', overflow: 'auto', fontFamily: TP_UF, color: TP_R.ink, background: TP_R.parchment }}>
      {/* Hero band */}
      <div style={{
        position: 'relative', width: '100%', height: 180, background: '#2a2620',
        backgroundImage: `url(${TP_PH.manhattanGolden})`, backgroundSize: 'cover', backgroundPosition: '50% 55%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(26,26,46,0) 0%, rgba(26,26,46,0.35) 100%)' }} />
        <div style={{ position: 'absolute', left: 32, bottom: 20, right: 32, display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{
            fontFamily: TP_DF, fontStyle: 'italic', fontWeight: 500, fontSize: 22,
            color: TP_R.parchment, letterSpacing: '-0.005em', textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}>New York (Mia &amp; Daddy)</span>
          <span style={{
            fontFamily: TP_UF, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.18em',
            color: 'rgba(250,247,242,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}>JUL 23 → JUL 26 · 3 NIGHTS</span>
        </div>
      </div>
      {/* Kanban */}
      <div style={{ padding: '32px 32px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
          {days.map((d, i) => (
            <TdaDayColumn key={d.n} day={d} idx={i} renderFooter={renderFooter}
                          composer={i === composerAt ? <TdaBlankComposer /> : null} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Full 1440 plan surface under the masthead, with a footer renderer.
function TdaPlanSurface({ renderFooter, composerAt = -1 }) {
  return (
    <TP_MS activeNav="journeys" trip={{ name: 'New York (Mia & Daddy)' }} tab="plan">
      <TdaPlanBoard renderFooter={renderFooter} composerAt={composerAt} />
    </TP_MS>
  );
}

// ── After-commit · untimed cluster ─────────────────────────────────
// Copies arrive untimed and append to the END of the day, in sheet order
// (Food → Activities → Logistics), ready to be timed / dragged into place.
function TdaUntimedCard({ card }) {
  const cat = TDA_CATS[card.cat] || TDA_CATS.selfdir;
  const Icon = cat.icon;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
      background: '#fff', borderRadius: 12,
      boxShadow: `0 1px 2px rgba(26,26,46,0.04), 0 0 0 1px ${TP_R.rule}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18, flex: '0 0 auto',
        background: TP_R.parchmentDeep, color: TP_R.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} sw={1.35} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: TP_UF, fontWeight: 500, fontSize: 13.5, color: TP_R.ink, letterSpacing: '-0.005em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
        }}>{card.name}</span>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: TP_DF, fontStyle: 'italic', fontSize: 12, color: TP_R.caption,
          }}>Add a time</span>
          <span style={{ color: TP_R.captionSoft, fontSize: 10 }}>·</span>
          <span style={{
            fontFamily: TP_UF, fontSize: 9.5, fontWeight: 500, color: TP_R.captionSoft,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>{cat.label}</span>
        </div>
      </div>
      <span style={{ color: TP_R.captionSoft, display: 'flex' }}>
        <TP_P.DotsThree size={16} color={TP_R.captionSoft} />
      </span>
    </div>
  );
}

// Day 1 close-up just after committing the 3 picked places.
function TdaAfterCommitColumn() {
  const day = TDA_DAYS[0];
  const timed = day.cards.slice(3); // last two timed stops, for context
  const added = [
    { cat: 'restaurant', name: 'Rubirosa' },
    { cat: 'guided',     name: 'Tenement Museum' },
    { cat: 'selfdir',    name: 'The High Line' },
  ];
  return (
    <div style={{ background: TP_R.parchment, height: '100%', padding: '22px 22px 0',
                  display: 'flex', flexDirection: 'column' }}>
      <TP_SC color={TP_R.caption} size={10}>Day 1</TP_SC>
      <div style={{ marginTop: 4, fontFamily: TP_DF, fontStyle: 'italic', fontWeight: 500,
                    fontSize: 22, color: TP_R.ink, letterSpacing: '-0.01em' }}>Thursday</div>
      <div style={{ height: 1, background: TP_R.rule, margin: '12px 0' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {timed.map((c, i) => <TdaPlanCard key={i} card={c} />)}
        {/* untimed divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 2px' }}>
          <TP_SC color={TP_R.sienna} size={9}>Just added · untimed</TP_SC>
          <div style={{ flex: 1, height: 1, background: TP_R.rule }} />
        </div>
        {added.map((c, i) => <TdaUntimedCard key={i} card={c} />)}
      </div>
    </div>
  );
}

Object.assign(window, {
  TDA_CATS, TDA_DAYS, TdaPlanCard, TdaAddCard, TdaBookmark,
  TdaFooterSplit, TdaFooterStacked, TdaFooterTwoDoor, TdaBlankComposer,
  TdaDayColumn, TdaPlanBoard, TdaPlanSurface,
  TdaUntimedCard, TdaAfterCommitColumn,
});
