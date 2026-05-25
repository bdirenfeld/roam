// Roam · Trip Intelligence — People surface
//
// Who is coming on THIS journey, with a little about each person so the
// companion can plan around them. Lives in Trip Settings (per-trip).
//
// Each person has three fields:
//   – Name
//   – Birthday (date)
//   – Likes / dislikes (one freeform line)
//
// Brief: warm and editorial — a guest list at a beautifully set table, not
// a contacts CRM. Initials/monogram only, no photo uploads in v1.
//
// Two directions explored:
//   A. Place setting — large monogram disc, italic name, blockquote bio
//   B. Guest line    — compact row, monogram inline with name, bio below
//
// Plus: empty state, "Add traveller" sheet, edit state, and desktop.

const PEOPLE = [
  {
    name: 'Mia',
    birthday: 'Jul 24',
    age: 8,
    bio: 'Loves craft studios and dessert, dislikes long museum days.',
  },
  {
    name: 'Dad',
    birthday: 'Mar 3',
    age: 68,
    bio: 'Early riser, wants good coffee, no late dinners.',
  },
  {
    name: 'Sophie',
    birthday: 'May 11',
    age: 41,
    bio: 'Happy anywhere with a swimmable beach and a quiet morning.',
  },
];

// ─────────────────────────────────────────────────────────────────
// Direction A — Place setting card.
// Monogram disc (filled parchment-deep, italic Playfair letter) sits left,
// italic Playfair name + small-caps birthday meta line, then the bio set
// as an italic editorial blockquote below. Generous whitespace.
// ─────────────────────────────────────────────────────────────────
function PersonCard_A({ person, hovered = false, padX = 22 }) {
  return (
    <div style={{
      padding: `18px ${padX}px`,
      borderTop: `1px solid ${ROAM.rule}`,
      background: hovered ? ROAM.parchmentTint : 'transparent',
      display: 'flex', gap: 16, alignItems: 'flex-start',
    }}>
      <Monogram letter={person.name[0]} size={48}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <Italic size={20} weight={500}>{person.name}</Italic>
            <span style={{
              fontFamily: UI_FONT, fontSize: 11, color: ROAM.captionSoft,
              letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>
              Born {person.birthday}
            </span>
          </div>
          <RowControls visible={hovered ? 'hover' : 'rest'}/>
        </div>
        <div style={{ marginTop: 8, maxWidth: '38ch' }}>
          <span style={{
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
            fontSize: 14.5, color: ROAM.label, lineHeight: 1.55,
            letterSpacing: '-0.005em',
          }}>
            {person.bio}
          </span>
        </div>
      </div>
    </div>
  );
}

function PeopleList_A({ people = PEOPLE, hoveredIndex = 0, padX = 22 }) {
  return (
    <div>
      {people.map((p, i) => (
        <PersonCard_A key={i} person={p} hovered={i === hoveredIndex} padX={padX}/>
      ))}
      <div style={{ borderTop: `1px solid ${ROAM.rule}` }}/>
      <AddRow label="Add traveller" padX={padX}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Direction B — Guest line.
// Compact single row per person: monogram + name + dot + birthday on one
// line; bio span across full width below. Hairline rules between.
// Denser than A — fits more people in the fold; less ceremonial.
// ─────────────────────────────────────────────────────────────────
function PersonRow_B({ person, hovered = false, padX = 22 }) {
  return (
    <div style={{
      padding: `14px ${padX}px`,
      borderTop: `1px solid ${ROAM.rule}`,
      background: hovered ? ROAM.parchmentTint : 'transparent',
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <Monogram letter={person.name[0]} size={34}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <span style={{
              fontFamily: UI_FONT, fontSize: 15, fontWeight: 600, color: ROAM.ink, letterSpacing: '-0.01em',
            }}>{person.name}</span>
            <span style={{ color: ROAM.captionSoft, fontSize: 13 }}>·</span>
            <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption }}>
              {person.birthday}
            </span>
          </div>
          <RowControls visible={hovered ? 'hover' : 'rest'}/>
        </div>
        <div style={{ marginTop: 4, maxWidth: '42ch' }}>
          <span style={{
            fontFamily: UI_FONT, fontSize: 13.5, color: ROAM.label, lineHeight: 1.55, letterSpacing: '-0.005em',
          }}>
            {person.bio}
          </span>
        </div>
      </div>
    </div>
  );
}

function PeopleList_B({ people = PEOPLE, hoveredIndex = 1, padX = 22 }) {
  return (
    <div>
      {people.map((p, i) => (
        <PersonRow_B key={i} person={p} hovered={i === hoveredIndex} padX={padX}/>
      ))}
      <div style={{ borderTop: `1px solid ${ROAM.rule}` }}/>
      <AddRow label="Add traveller" padX={padX}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Header — the same SectionHeader shape, with a count aside.
// ─────────────────────────────────────────────────────────────────
function PeopleHeader() {
  // Plain, no kicker / no lede / no count. Just the title.
  return (
    <div style={{ padding: '18px 22px 14px' }}>
      <Italic size={22} weight={500}>Travellers</Italic>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2A — Mobile · Direction A
// ─────────────────────────────────────────────────────────────────
function People_M_A() {
  return (
    <TripSettingsShell>
      <PeopleHeader/>
      <PeopleList_A hoveredIndex={0}/>
    </TripSettingsShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2B — Mobile · Direction B
// ─────────────────────────────────────────────────────────────────
function People_M_B() {
  return (
    <TripSettingsShell>
      <PeopleHeader/>
      <PeopleList_B hoveredIndex={1}/>
    </TripSettingsShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2C — Mobile · Empty state
// First-run framing: a single dashed monogram + an inviting prompt to add
// the first traveller. The directness here matters — without travellers
// the companion can't tailor anything, and the empty state should make
// that feel like an opportunity rather than an error.
// ─────────────────────────────────────────────────────────────────
function People_M_Empty() {
  return (
    <TripSettingsShell>
      <PeopleHeader/>
      <div style={{
        margin: '4px 22px 0',
        border: `1px dashed ${ROAM.ruleStrong}`,
        borderRadius: 6,
        padding: '32px 22px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14,
      }}>
        <div style={{ display: 'flex', gap: -10 }}>
          <Monogram letter="" mode="outline" size={40}/>
        </div>
        <div>
          <Italic size={18} weight={500}>No one added yet.</Italic>
        </div>
        <div style={{ maxWidth: '32ch' }}>
          <span style={{
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.caption, lineHeight: 1.55,
          }}>
            Tell Roam who's coming and a small note on each. It plans around birthdays, pace, and tastes.
          </span>
        </div>
        <div style={{ marginTop: 6 }}>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 4,
            background: ROAM.ink, color: ROAM.parchment,
            border: 'none', cursor: 'pointer',
            fontFamily: UI_FONT, fontSize: 14, fontWeight: 500, letterSpacing: '-0.005em',
          }}>
            <Ph.Plus size={12} color={ROAM.parchment} sw={1.6}/>
            Add the first traveller
          </button>
        </div>
      </div>
    </TripSettingsShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2D — Adding (sheet). People has three fields, so an inline expansion is
// noisy — a small sheet sliding up from the bottom carries the form better.
// The sheet is half-height; the trip-settings page is visible dimmed
// behind it. Three labelled fields, Save / Cancel in the sheet header.
// ─────────────────────────────────────────────────────────────────
function People_M_Adding() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ opacity: 0.42, filter: 'saturate(0.7)', pointerEvents: 'none' }}>
        <TripSettingsShell>
          <PeopleHeader/>
          <PeopleList_A hoveredIndex={-1}/>
        </TripSettingsShell>
      </div>
      {/* Dim overlay above the dimmed shell */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(26,26,46,0.18)',
      }}/>
      {/* The sheet */}
      <AddTravellerSheet/>
    </div>
  );
}

function AddTravellerSheet({ values, title = 'Add traveller', kicker = 'On this journey' }) {
  const v = values ?? {
    name: 'Mia',
    birthday: 'Jul 24, 2017',
    bio: 'Loves craft studios and dessert; dislikes long museum days.',
  };
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      background: ROAM.parchment,
      borderTop: `1px solid ${ROAM.ruleStrong}`,
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      padding: '14px 0 22px',
      boxShadow: '0 -12px 40px rgba(26,26,46,0.18)',
      fontFamily: UI_FONT,
      maxHeight: '74%', overflowY: 'auto',
    }}>
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <div style={{ width: 36, height: 4, background: ROAM.ruleStrong, borderRadius: 2 }}/>
      </div>

      {/* Sheet header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 22px 16px',
      }}>
        <button style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.caption,
        }}>Cancel</button>
        <Italic size={17} weight={500}>{title}</Italic>
        <button style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: UI_FONT, fontSize: 14, fontWeight: 600, color: ROAM.ink, letterSpacing: '-0.005em',
        }}>Save</button>
      </div>

      <HRule style={{ margin: '0 22px' }}/>

      <div style={{ padding: '4px 22px 0' }}>
        {/* Monogram preview — derived from name field */}
        <div style={{ padding: '20px 0 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Monogram letter={(v.name || '?')[0] || '?'} size={56}/>
          <div>
            <SmallCaps size={9.5} color={ROAM.captionSoft}>Monogram</SmallCaps>
            <div style={{ marginTop: 4, fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13, color: ROAM.caption, lineHeight: 1.5, maxWidth: '24ch' }}>
              We use the first letter of the name. No photos in v1.
            </div>
          </div>
        </div>

        <SheetField label="Name" value={v.name} active/>
        <SheetField label="Birthday" value={v.birthday} icon={<CalendarGlyph/>}/>
        <SheetField label="Likes &amp; dislikes" value={v.bio} multiline hint="One line is enough."/>
      </div>
    </div>
  );
}

function SheetField({ label, value, multiline = false, active = false, icon, hint }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${ROAM.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: UI_FONT, fontSize: 10.5, fontWeight: 500,
          color: ROAM.captionSoft, letterSpacing: '0.14em', textTransform: 'uppercase',
        }} dangerouslySetInnerHTML={{ __html: label }}/>
        {hint && (
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 12, color: ROAM.captionSoft }}>
            {hint}
          </span>
        )}
      </div>
      <div style={{
        marginTop: 8, paddingBottom: 6,
        borderBottom: `1px solid ${active ? ROAM.sienna : 'transparent'}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: UI_FONT, fontSize: multiline ? 14.5 : 15.5,
            fontWeight: multiline ? 400 : 500,
            color: ROAM.ink, letterSpacing: '-0.005em',
            lineHeight: multiline ? 1.5 : 1.3,
            display: 'inline',
          }}>{value}</span>
          {active && <CursorBar height={16}/>}
        </div>
        {icon}
      </div>
    </div>
  );
}

function CalendarGlyph({ size = 16, color = ROAM.caption }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="1.5"/>
      <path d="M3 10h18M8 3v4M16 3v4"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2E — Editing. Same sheet shape with the traveller's existing values
// loaded in, plus a quiet "Remove from this journey" affordance at the
// bottom of the sheet.
// ─────────────────────────────────────────────────────────────────
function People_M_Editing() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ opacity: 0.42, filter: 'saturate(0.7)', pointerEvents: 'none' }}>
        <TripSettingsShell>
          <PeopleHeader/>
          <PeopleList_A hoveredIndex={1}/>
        </TripSettingsShell>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,46,0.18)' }}/>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: ROAM.parchment,
        borderTop: `1px solid ${ROAM.ruleStrong}`,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: '14px 0 22px',
        boxShadow: '0 -12px 40px rgba(26,26,46,0.18)',
        fontFamily: UI_FONT, maxHeight: '78%', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, background: ROAM.ruleStrong, borderRadius: 2 }}/>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 22px 16px',
        }}>
          <button style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.caption,
          }}>Cancel</button>
          <Italic size={17} weight={500}>Edit traveller</Italic>
          <button style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: UI_FONT, fontSize: 14, fontWeight: 600, color: ROAM.ink, letterSpacing: '-0.005em',
          }}>Save</button>
        </div>
        <HRule style={{ margin: '0 22px' }}/>
        <div style={{ padding: '4px 22px 0' }}>
          <div style={{ padding: '20px 0 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Monogram letter="D" size={56}/>
            <div>
              <Italic size={18} weight={500}>Dad</Italic>
              <div style={{ marginTop: 2, fontFamily: UI_FONT, fontSize: 12, color: ROAM.caption, letterSpacing: '0.04em' }}>
                Added Apr 12 · still on the journey
              </div>
            </div>
          </div>

          <SheetField label="Name" value="Dad"/>
          <SheetField label="Birthday" value="Mar 3, 1957" icon={<CalendarGlyph/>}/>
          <SheetField
            label="Likes &amp; dislikes"
            value="Early riser, wants good coffee, no late dinners."
            multiline
            active
          />

          <div style={{ padding: '20px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.sienna,
            }}>
              Remove from this journey
            </button>
            <span style={{ fontFamily: UI_FONT, fontSize: 11, color: ROAM.captionSoft, letterSpacing: '0.04em' }}>
              They stay on other journeys.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2F — Desktop · Direction A
// Trip Settings as a wide page: trip masthead at the top, then the
// People surface as the body. We keep the place-setting card layout —
// monogram + italic name + bio — but in a 3-up grid since desktop has
// room for it. An "Add traveller" tile lives as the n+1 grid slot.
// ─────────────────────────────────────────────────────────────────
function People_D_A() {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: ROAM.parchment, display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT, overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: `1px solid ${ROAM.rule}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Ph.CaretLeft size={14} color={ROAM.ink} sw={1.6}/>
          <Italic size={20} weight={500}>Roam</Italic>
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption }}>
            Journeys · Rome, April 2026 · Trip settings
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.caption }}>
            Archive
          </span>
          <button style={{
            padding: '8px 16px', borderRadius: 4, background: ROAM.ink, color: ROAM.parchment,
            border: 'none', cursor: 'pointer',
            fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
          }}>Save</button>
          <AvatarStub letter="B" size={32}/>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Trip masthead */}
        <div style={{ padding: '32px 56px 28px', display: 'flex', gap: 32, alignItems: 'flex-end', borderBottom: `1px solid ${ROAM.rule}` }}>
          <div style={{ flex: 1 }}>
            <SmallCaps size={10} color={ROAM.caption}>Journey</SmallCaps>
            <div style={{ marginTop: 8 }}>
              <Italic size={42} weight={500}>Rome, April 2026</Italic>
            </div>
            <div style={{ marginTop: 8, fontFamily: UI_FONT, fontSize: 14, color: ROAM.caption, letterSpacing: '-0.005em' }}>
              Apr 22 → Apr 28 · 6 nights · 3 travellers
            </div>
          </div>
          <div style={{
            width: 220, height: 110, borderRadius: 4, background: ROAM.parchmentWash,
            border: `1px solid ${ROAM.rule}`, position: 'relative', overflow: 'hidden',
          }}>
            <svg width="100%" height="100%" viewBox="0 0 220 110" preserveAspectRatio="xMidYMid slice">
              <rect width="220" height="110" fill={ROAM.parchmentWash}/>
              <g fill="rgba(26,26,46,0.10)">
                <rect x="0" y="76" width="220" height="34"/>
                <ellipse cx="110" cy="60" rx="36" ry="20"/>
                <rect x="74" y="46" width="72" height="14"/>
                <path d="M14 76 L14 56 L34 56 L34 46 L54 46 L54 64 L74 64 L74 56 L94 56 L94 76 Z"/>
                <path d="M150 76 L150 50 Q 170 36 190 50 L190 62 L210 62 L210 76 Z"/>
              </g>
            </svg>
          </div>
        </div>

        {/* Section */}
        <div style={{ padding: '36px 56px 80px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <SmallCaps size={10} color={ROAM.caption}>Travellers</SmallCaps>
            <span style={{ fontFamily: UI_FONT, fontSize: 12, color: ROAM.captionSoft, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              3 on this journey
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <Italic size={30} weight={500}>Who's coming to Rome</Italic>
          </div>
          <div style={{ marginTop: 8, maxWidth: '52ch' }}>
            <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 15, color: ROAM.caption, lineHeight: 1.6 }}>
              A short note on each traveller — Roam reads it when it plans, so birthdays, pace, and tastes get factored in.
            </span>
          </div>

          <div style={{
            marginTop: 26,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}>
            {PEOPLE.map((p, i) => (
              <DesktopPersonCard key={i} person={p} hovered={i === 0}/>
            ))}
            <AddTravellerTile/>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopPersonCard({ person, hovered }) {
  return (
    <div style={{
      position: 'relative',
      padding: '22px 22px 20px',
      background: hovered ? ROAM.parchmentTint : ROAM.parchment,
      border: `1px solid ${ROAM.rule}`,
      borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 14,
      minHeight: 200,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Monogram letter={person.name[0]} size={52}/>
        <RowControls visible={hovered ? 'hover' : 'rest'}/>
      </div>
      <div>
        <Italic size={22} weight={500}>{person.name}</Italic>
        <div style={{ marginTop: 4, fontFamily: UI_FONT, fontSize: 11, color: ROAM.captionSoft, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          Born {person.birthday}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <span style={{
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 15, color: ROAM.label,
          lineHeight: 1.55, letterSpacing: '-0.005em',
        }}>
          {person.bio}
        </span>
      </div>
    </div>
  );
}

function AddTravellerTile() {
  return (
    <button style={{
      padding: '22px', background: 'transparent',
      border: `1px dashed ${ROAM.ruleStrong}`, borderRadius: 6,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, minHeight: 200, cursor: 'pointer', color: ROAM.caption,
    }}>
      <span style={{
        width: 44, height: 44, borderRadius: 22,
        border: `1px dashed ${ROAM.ruleStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Ph.Plus size={16} color={ROAM.caption} sw={1.4}/>
      </span>
      <span style={{
        fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 16,
        color: ROAM.caption, letterSpacing: '-0.005em',
      }}>Add traveller</span>
    </button>
  );
}

Object.assign(window, {
  PEOPLE,
  People_M_A, People_M_B, People_M_Empty,
  People_M_Adding, People_M_Editing,
  People_D_A,
  PersonCard_A, PersonRow_B,
  PeopleList_A, PeopleList_B,
  PeopleHeader,
  AddTravellerSheet, AddTravellerTile,
});
