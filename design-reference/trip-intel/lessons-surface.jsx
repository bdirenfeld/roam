// Roam · Trip Intelligence — Lessons surface
//
// A running travel playbook that belongs to the user, not to any one
// journey. Lives on the Profile page (global). Flat list of short, one-line
// entries, no checkboxes (a lesson isn't "done", it's either still true or
// stale), each entry edit/remove-able, "Add a lesson" at the foot.
//
// Two directions explored:
//   A. Pull-rule         — italic Playfair body, hairline-separated rows
//   B. Numbered notes    — small numeral marginalia, DM Sans body, denser
//
// Plus: empty state, inline add, inline edit, and a desktop layout.

const LESSONS = [
  'Book restaurants by Day 2 — the good ones fill up fast.',
  'No red-eye flights when travelling with the kids.',
  'Keep one day completely unplanned — always the best day.',
  'Pack reef shoes anywhere coastal.',
  'Pace museums — one big one per day, max.',
  'Always confirm the apartment check-in window the day before.',
  'Carry small bills for tips and taxis in cash-first countries.',
];

// ─────────────────────────────────────────────────────────────────
// Direction A — Pull-rule.
// Each lesson is an italic Playfair sentence sitting on a hairline. Reads
// like a margin-quote from a notebook. Edit / × float quietly at the right;
// they're visible at low opacity so the affordance is discoverable, and
// solidify to full opacity on the row that's hovered (we show one such row
// per artboard so the state is legible).
// ─────────────────────────────────────────────────────────────────
function LessonRow_A({ text, hovered = false, padX = 22 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: `15px ${padX}px`,
      borderTop: `1px solid ${ROAM.rule}`,
      background: hovered ? ROAM.parchmentTint : 'transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
          fontSize: 16.5, lineHeight: 1.5, color: ROAM.ink,
          letterSpacing: '-0.005em',
        }}>
          {text}
        </span>
      </div>
      <div style={{ paddingTop: 2 }}>
        <RowControls visible={hovered ? 'hover' : 'rest'}/>
      </div>
    </div>
  );
}

function LessonsList_A({ lessons = LESSONS, hoveredIndex = 2, padX = 22 }) {
  return (
    <div>
      {lessons.map((t, i) => (
        <LessonRow_A key={i} text={t} hovered={i === hoveredIndex} padX={padX}/>
      ))}
      {/* Closing rule under the last row — the list has top and bottom edges */}
      <div style={{ borderTop: `1px solid ${ROAM.rule}` }}/>
      <AddRow label="Add a lesson" padX={padX}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Direction B — Numbered field notes.
// Small numeral in the gutter sets up an editorial rhythm. Body sets in DM
// Sans so the numbers do more work; lesson text in a slightly tighter size.
// No hairlines between rows — vertical spacing carries the rhythm.
// ─────────────────────────────────────────────────────────────────
function LessonRow_B({ index, text, hovered = false, padX = 22 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 16,
      padding: `12px ${padX}px`,
      background: hovered ? ROAM.parchmentTint : 'transparent',
    }}>
      <span style={{
        flex: '0 0 24px',
        fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
        fontSize: 18, color: ROAM.sienna, lineHeight: 1.3,
        letterSpacing: '-0.01em', textAlign: 'right',
      }}>{String(index + 1).padStart(2, '0')}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: UI_FONT, fontSize: 15, fontWeight: 400,
          lineHeight: 1.5, color: ROAM.ink, letterSpacing: '-0.005em',
        }}>{text}</span>
      </div>
      <div style={{ paddingTop: 2 }}>
        <RowControls visible={hovered ? 'hover' : 'rest'}/>
      </div>
    </div>
  );
}

function LessonsList_B({ lessons = LESSONS, hoveredIndex = 2, padX = 22 }) {
  return (
    <div>
      {lessons.map((t, i) => (
        <LessonRow_B key={i} index={i} text={t} hovered={i === hoveredIndex} padX={padX}/>
      ))}
      <div style={{ padding: `4px ${padX}px`, marginTop: 6 }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
          background: 'transparent', border: 'none', cursor: 'pointer',
        }}>
          <span style={{
            flex: '0 0 24px',
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
            fontSize: 18, color: ROAM.captionSoft, textAlign: 'right',
          }}>+</span>
          <span style={{
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
            fontSize: 16, color: ROAM.caption,
          }}>Add a lesson</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LessonsHeader — the editorial framing for the section.
// ─────────────────────────────────────────────────────────────────
function LessonsHeader() {
  // Plain, no kicker / no lede / no count. Just the title.
  return (
    <div style={{ padding: '4px 22px 14px' }}>
      <Italic size={24} weight={500}>Lessons learned</Italic>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1A — Mobile · Direction A (default state with one row hovered)
// ─────────────────────────────────────────────────────────────────
function Lessons_M_A() {
  return (
    <ProfileShell foot={<SignOutLink/>}>
      <LessonsHeader/>
      <LessonsList_A hoveredIndex={2}/>
    </ProfileShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1B — Mobile · Direction B (numbered)
// ─────────────────────────────────────────────────────────────────
function Lessons_M_B() {
  return (
    <ProfileShell foot={<SignOutLink/>}>
      <LessonsHeader/>
      <LessonsList_B hoveredIndex={2}/>
    </ProfileShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1C — Mobile · Empty state (Direction A baseline)
// Editorial: the section header reads as an invitation, and a single
// example lesson sits in italic caption as a ghost row.
// ─────────────────────────────────────────────────────────────────
function Lessons_M_Empty() {
  return (
    <ProfileShell foot={<SignOutLink/>}>
      <LessonsHeader/>
      <div style={{ borderTop: `1px solid ${ROAM.rule}`, borderBottom: `1px solid ${ROAM.rule}`, padding: '36px 22px', textAlign: 'left' }}>
        <span style={{
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
          fontSize: 16, color: ROAM.captionSoft, lineHeight: 1.55,
        }}>
          e.g. "Keep one day completely unplanned — always the best day."
        </span>
        <div style={{ marginTop: 18 }}>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 4,
            background: ROAM.ink, color: ROAM.parchment,
            border: 'none', cursor: 'pointer',
            fontFamily: UI_FONT, fontSize: 14, fontWeight: 500, letterSpacing: '-0.005em',
          }}>
            <Ph.Plus size={12} color={ROAM.parchment} sw={1.6}/>
            Add a lesson
          </button>
        </div>
      </div>
    </ProfileShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1D — Adding (inline). The "Add a lesson" affordance has expanded into an
// editable row in place — same column, same typography, no modal. A small
// hint at the right tells the user pressing return saves the line.
// ─────────────────────────────────────────────────────────────────
function Lessons_M_Adding() {
  // Cap the list to four so the active editor sits well within the fold.
  const lessons = LESSONS.slice(0, 4);
  return (
    <ProfileShell foot={<SignOutLink/>}>
      <LessonsHeader/>
      <div>
        {lessons.map((t, i) => (
          <LessonRow_A key={i} text={t}/>
        ))}

        {/* Active inline editor — replaces the "Add a lesson" affordance */}
        <div style={{
          ...activeRowWash,
          borderTop: `1px solid ${ROAM.rule}`,
          borderBottom: `1px solid ${ROAM.rule}`,
          padding: '18px 22px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <SmallCaps size={9.5} color={ROAM.sienna}>Writing a lesson</SmallCaps>
            <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 12, color: ROAM.captionSoft }}>
              One short line — keep it true of you, not the trip.
            </span>
          </div>
          <div style={{
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
            fontSize: 16.5, lineHeight: 1.5, color: ROAM.ink,
            letterSpacing: '-0.005em',
          }}>
            Make a reservation for the first night's dinner before flying<CursorBar/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
            <span style={{ fontFamily: UI_FONT, fontSize: 11, color: ROAM.captionSoft, letterSpacing: '0.02em' }}>
              <Ph.CornerDownLeft size={11} color={ROAM.captionSoft} sw={1.5}/>{' '}
              Return to save · Esc to discard
            </span>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <GhostLink>Discard</GhostLink>
              <button style={{
                fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, color: ROAM.parchment,
                background: ROAM.ink, border: 'none', cursor: 'pointer',
                padding: '7px 14px', borderRadius: 4, letterSpacing: '-0.005em',
              }}>Save lesson</button>
            </div>
          </div>
        </div>

        <AddRow label="Add another lesson"/>
      </div>
    </ProfileShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1E — Editing (existing row). The same in-place editor pattern as Adding,
// but anchored on an existing row. Other rows dim slightly so the focus is
// unambiguous.
// ─────────────────────────────────────────────────────────────────
function Lessons_M_Editing() {
  return (
    <ProfileShell foot={<SignOutLink/>}>
      <LessonsHeader/>
      <div>
        {LESSONS.map((t, i) => {
          if (i === 2) {
            return (
              <div key={i} style={{
                ...activeRowWash,
                borderTop: `1px solid ${ROAM.rule}`,
                borderBottom: `1px solid ${ROAM.rule}`,
                padding: '18px 22px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <SmallCaps size={9.5} color={ROAM.sienna}>Editing</SmallCaps>
                  <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Ph.X size={13} color={ROAM.caption}/>
                  </button>
                </div>
                <div style={{
                  fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
                  fontSize: 16.5, lineHeight: 1.5, color: ROAM.ink,
                  letterSpacing: '-0.005em',
                }}>
                  Keep one day completely unplanned — always the best day<CursorBar/>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                  <button style={{
                    fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
                    fontSize: 14, color: ROAM.caption,
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}>Remove this lesson</button>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <GhostLink>Cancel</GhostLink>
                    <button style={{
                      fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, color: ROAM.parchment,
                      background: ROAM.ink, border: 'none', cursor: 'pointer',
                      padding: '7px 14px', borderRadius: 4, letterSpacing: '-0.005em',
                    }}>Save</button>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={i} style={{ opacity: 0.5 }}>
              <LessonRow_A text={t}/>
            </div>
          );
        })}
        <div style={{ borderTop: `1px solid ${ROAM.rule}` }}/>
        <div style={{ opacity: 0.5 }}>
          <AddRow label="Add a lesson"/>
        </div>
      </div>
    </ProfileShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// SignOutLink — bottom of the Profile page, matches the screenshot.
// ─────────────────────────────────────────────────────────────────
function SignOutLink() {
  return (
    <div style={{ padding: '0 22px' }}>
      <HRule/>
      <div style={{ padding: '20px 0 0' }}>
        <GhostLink>Sign out</GhostLink>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1F — Desktop · Direction A
// Same flat list, two-column page: a left-rail mini-nav for the Profile
// area (Account · Travel profile · Lessons), and the active surface in the
// center column at a comfortable measure (~580px). The list typography is
// the mobile typography scaled up modestly.
// ─────────────────────────────────────────────────────────────────
function Lessons_D_A() {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: ROAM.parchment, display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT, overflow: 'hidden',
    }}>
      {/* Top bar — same Roam wordmark + avatar pattern */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: `1px solid ${ROAM.rule}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Italic size={22} weight={500}>Roam</Italic>
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption }}>
            Journeys · Profile
          </span>
        </div>
        <AvatarStub letter="B" size={32}/>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left rail */}
        <aside style={{
          flex: '0 0 220px', borderRight: `1px solid ${ROAM.rule}`,
          padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <SmallCaps size={10} color={ROAM.caption} style={{ marginBottom: 14 }}>Profile</SmallCaps>
          {['Account', 'Travel profile', 'Lessons', 'Notifications', 'Sign out'].map((label) => (
            <div key={label} style={{
              padding: '8px 0',
              fontFamily: UI_FONT, fontSize: 14, fontWeight: label === 'Lessons' ? 600 : 400,
              color: label === 'Lessons' ? ROAM.ink : ROAM.caption,
              letterSpacing: '-0.005em',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {label === 'Lessons' && <span style={{ width: 3, height: 14, background: ROAM.sienna, borderRadius: 1 }}/>}
              {label}
            </div>
          ))}
        </aside>

        {/* Center column */}
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '40px 32px 80px' }}>
          <div style={{ width: '100%', maxWidth: 620 }}>
            <SmallCaps size={10} color={ROAM.caption}>The playbook</SmallCaps>
            <div style={{ marginTop: 10 }}>
              <Italic size={34} weight={500}>Lessons I travel by</Italic>
            </div>
            <div style={{ marginTop: 10, maxWidth: '52ch' }}>
              <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 15.5, color: ROAM.caption, lineHeight: 1.6 }}>
                Quiet notes I review before each journey. Keep what still holds, drop what's stale.
                They travel with me, not with any one trip.
              </span>
            </div>
            <div style={{ marginTop: 24 }}>
              {LESSONS.map((t, i) => (
                <DesktopLessonRow_A key={i} text={t} hovered={i === 2}/>
              ))}
              <div style={{ borderTop: `1px solid ${ROAM.rule}` }}/>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '18px 0',
                background: 'transparent', border: 'none', cursor: 'pointer',
                width: '100%', textAlign: 'left',
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 12,
                  border: `1px dashed ${ROAM.ruleStrong}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ROAM.caption,
                }}>
                  <Ph.Plus size={12} color={ROAM.caption} sw={1.4}/>
                </span>
                <span style={{
                  fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 17, color: ROAM.caption,
                  letterSpacing: '-0.005em',
                }}>Add a lesson</span>
              </button>
            </div>
          </div>
        </main>

        {/* Right column — small contextual note. Optional; gives the page
            air on a wide desktop without padding it with empty space. */}
        <aside style={{
          flex: '0 0 280px', borderLeft: `1px solid ${ROAM.rule}`,
          padding: '40px 28px', background: ROAM.parchment,
        }}>
          <SmallCaps size={10} color={ROAM.caption}>From the field</SmallCaps>
          <div style={{ marginTop: 12, maxWidth: '32ch' }}>
            <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 16, color: ROAM.ink, lineHeight: 1.55 }}>
              The companion reads these when it plans. You're the only one who writes them.
            </span>
          </div>
          <div style={{ marginTop: 24, padding: '14px 16px', background: ROAM.parchmentTint, borderRadius: 4 }}>
            <SmallCaps size={9} color={ROAM.captionSoft}>Soon</SmallCaps>
            <div style={{ marginTop: 6, fontFamily: UI_FONT, fontSize: 13, color: ROAM.label, lineHeight: 1.55 }}>
              Before a new journey, Roam will offer to walk you through these and prune what's gone stale.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DesktopLessonRow_A({ text, hovered }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '16px 0',
      borderTop: `1px solid ${ROAM.rule}`,
      background: hovered ? ROAM.parchmentTint : 'transparent',
      marginLeft: hovered ? -16 : 0,
      marginRight: hovered ? -16 : 0,
      paddingLeft: hovered ? 16 : 0,
      paddingRight: hovered ? 16 : 0,
      transition: 'background 120ms',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
          fontSize: 18.5, lineHeight: 1.5, color: ROAM.ink,
          letterSpacing: '-0.005em',
        }}>{text}</span>
      </div>
      <div style={{ paddingTop: 3 }}>
        <RowControls visible={hovered ? 'hover' : 'rest'}/>
      </div>
    </div>
  );
}

Object.assign(window, {
  LESSONS,
  Lessons_M_A, Lessons_M_B, Lessons_M_Empty,
  Lessons_M_Adding, Lessons_M_Editing,
  Lessons_D_A,
  LessonRow_A, LessonRow_B, LessonsList_A, LessonsList_B,
  LessonsHeader, SignOutLink,
});
