// tda-picker.jsx — Touchpoint 2. The "Link place from map" sheet, reused
// as a multi-select place-picker in create mode. Right-docked sheet on the
// same parchment vocabulary as the place-detail panel.

const { ROAM: PK_R, UI_FONT: PK_UF, DISPLAY_FONT: PK_DF, Ph: PK_P,
        SmallCaps: PK_SC } = window;
const { TdaBookmark: PK_BM } = window;

// Saved pile, grouped by type. `sched` = already scheduled somewhere.
const SAVED = [
  { group: 'Food', items: [
    { icon: PK_P.ForkKnife, name: 'Rubirosa',            meta: "Nolita · Restaurant · ★ 4.6", sched: true },
    { icon: PK_P.ForkKnife, name: 'Lilia',               meta: 'Williamsburg · Restaurant · ★ 4.7' },
    { icon: PK_P.ForkKnife, name: "Katz's Delicatessen", meta: 'Lower East Side · Deli · ★ 4.5' },
    { icon: PK_P.Coffee,    name: 'Devoción',            meta: 'Williamsburg · Coffee · ★ 4.6' },
  ] },
  { group: 'Activities', items: [
    { icon: PK_P.Flag,    name: 'Tenement Museum',  meta: 'Orchard St · Guided · ★ 4.8' },
    { icon: PK_P.Compass, name: 'The High Line',    meta: 'Chelsea · Self-directed' },
    { icon: PK_P.Flag,    name: 'Whitney Museum',   meta: 'Meatpacking · Guided · ★ 4.7', sched: true },
  ] },
  { group: 'Logistics', items: [
    { icon: PK_P.Bed,      name: '11 Howard',        meta: 'SoHo · Hotel', sched: true },
    { icon: PK_P.Storefront, name: 'Whole Foods Bowery', meta: 'Bowery · Grocery' },
  ] },
];

function PkCheckRing({ on }) {
  if (on) {
    return (
      <span style={{
        width: 22, height: 22, borderRadius: 11, background: PK_R.ink, flex: '0 0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <PK_P.Check size={12} color={PK_R.parchment} sw={1.8} />
      </span>
    );
  }
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 11, flex: '0 0 auto',
      boxShadow: `inset 0 0 0 1.4px ${PK_R.ruleStrong}`, background: 'transparent',
    }} />
  );
}

function PkRow({ item, selected, last }) {
  const Icon = item.icon;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13, padding: '12px 4px',
      borderBottom: last ? 'none' : `1px solid ${PK_R.rule}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18, flex: '0 0 auto',
        background: selected ? PK_R.parchmentDeep : PK_R.parchmentTint,
        boxShadow: `inset 0 0 0 1px ${PK_R.rule}`, color: PK_R.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} sw={1.35} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: PK_UF, fontWeight: 500, fontSize: 14, color: PK_R.ink,
          letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.name}</div>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: PK_UF, fontSize: 11.5, color: PK_R.caption, letterSpacing: '-0.005em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{item.meta}</span>
          {item.sched && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
              <PK_P.Check size={11} color={PK_R.caption} sw={1.7} />
              <span style={{
                fontFamily: PK_UF, fontWeight: 500, fontSize: 9, color: PK_R.caption,
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>Scheduled</span>
            </span>
          )}
        </div>
      </div>
      <PkCheckRing on={selected} />
    </div>
  );
}

// selectedNames: array of names currently selected.
function TdaPickerSheet({ selectedNames = [], docked = false }) {
  const sel = new Set(selectedNames);
  const n = selectedNames.length;
  return (
    <div style={{
      width: 380, background: PK_R.parchment, display: 'flex', flexDirection: 'column',
      height: '100%', fontFamily: PK_UF,
      boxShadow: docked ? `-1px 0 0 ${PK_R.rule}, -18px 0 40px rgba(26,26,46,0.06)` : 'none',
    }}>
      {/* grab handle */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 2 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: PK_R.ruleStrong }} />
      </div>
      {/* header */}
      <div style={{ padding: '14px 22px 16px', borderBottom: `1px solid ${PK_R.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <PK_SC color={PK_R.sienna} size={9.5}>Day 1 · Thursday</PK_SC>
            <div style={{ marginTop: 6, fontFamily: PK_DF, fontStyle: 'italic', fontWeight: 500, fontSize: 23, color: PK_R.ink, letterSpacing: '-0.01em' }}>
              Add from saved
            </div>
          </div>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: PK_R.caption, marginTop: 2 }}>
            <PK_P.X size={16} color={PK_R.caption} sw={1.5} />
          </button>
        </div>
        {/* search */}
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', gap: 10,
          background: PK_R.parchmentDeep, borderRadius: 999, padding: '9px 14px',
        }}>
          <window.PhDT.Magnifier size={13} sw={1.4} color={PK_R.caption} />
          <span style={{ fontFamily: PK_UF, fontSize: 13, color: PK_R.captionSoft, letterSpacing: '-0.005em' }}>
            Search saved places…
          </span>
        </div>
      </div>
      {/* list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 22px 12px' }}>
        {SAVED.map((g) => (
          <div key={g.group} style={{ marginTop: 16 }}>
            <div style={{ padding: '4px 0 6px' }}>
              <PK_SC color={PK_R.captionSoft} size={9.5}>{g.group}</PK_SC>
            </div>
            {g.items.map((it, i) => (
              <PkRow key={it.name} item={it} selected={sel.has(it.name)} last={i === g.items.length - 1} />
            ))}
          </div>
        ))}
      </div>
      {/* footer — commit */}
      <div style={{
        padding: '16px 22px 18px', borderTop: `1px solid ${PK_R.rule}`, background: PK_R.parchmentTint,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ flex: 1, fontFamily: PK_DF, fontStyle: 'italic', fontSize: 13.5, color: PK_R.caption }}>
          {n === 0 ? 'Select places to place on this day.' : 'The saved pile keeps its copy.'}
        </span>
        <button style={{
          fontFamily: PK_UF, fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em',
          color: n === 0 ? PK_R.captionSoft : PK_R.parchment,
          background: n === 0 ? PK_R.parchmentDeep : PK_R.ink,
          boxShadow: n === 0 ? `inset 0 0 0 1px ${PK_R.rule}` : 'none',
          border: 'none', cursor: n === 0 ? 'default' : 'pointer',
          padding: '11px 20px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          {n === 0 ? 'Add' : `Add ${n}`}
          {n > 0 && <PK_P.Check size={13} color={PK_R.parchment} sw={1.7} />}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { SAVED, TdaPickerSheet });
