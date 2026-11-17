import { createBrowserClient } from '@supabase/ssr'
import { getLandingDemoClient, isLandingDemoPath } from '@/lib/landingDemoClient'
import { adminHeaders, adminTripFromCookies } from '@/lib/adminView'

function realClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // The admin view's journey, if one is open (lib/adminView). Read once per
    // page load; entering and leaving the view are full page loads.
    { global: { headers: adminHeaders(typeof document !== 'undefined' ? adminTripFromCookies(document.cookie) : null) } }
  )
}

export function createClient(): ReturnType<typeof realClient> {
  if (typeof window !== 'undefined' && isLandingDemoPath(window.location.pathname)) {
    return getLandingDemoClient() as unknown as ReturnType<typeof realClient>
  }
  return realClient()
}
