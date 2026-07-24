// Roam — feature flags
//
// Single source of truth for gating features on or off. Flipping a flag here
// is the whole switch: no props to thread, no duplicated booleans elsewhere.

// The AI companion (desktop third column, mobile slide-over, guest view) is
// switched off for all users for the time being. This is a hide, not a delete
// — all companion code remains in the repo. Set back to true to fully restore.
export const COMPANION_ENABLED = false;
