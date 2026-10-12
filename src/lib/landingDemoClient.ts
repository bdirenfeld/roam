// The public sample never constructs a real Supabase client or reads cookies.
// Its adapter fills this object before mounting the native app components.
const demoClient: Record<string, unknown> = {
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
};
export function isLandingDemoPath(path: string) {
  return path === '/demo' || path.startsWith('/demo/') || /^\/trips\/landing-(?:sample|practice)(?:\/|$)/.test(path);
}
export function getLandingDemoClient() { return demoClient; }
