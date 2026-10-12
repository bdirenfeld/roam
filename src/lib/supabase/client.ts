import { createBrowserClient } from '@supabase/ssr'
import { getLandingDemoClient, isLandingDemoPath } from '@/lib/landingDemoClient'

function realClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createClient(): ReturnType<typeof realClient> {
  if (typeof window !== 'undefined' && isLandingDemoPath(window.location.pathname)) {
    return getLandingDemoClient() as unknown as ReturnType<typeof realClient>
  }
  return realClient()
}
