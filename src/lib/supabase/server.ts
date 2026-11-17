import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, adminHeaders, cleanTripId } from '@/lib/adminView'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // The admin view's journey (lib/adminView); the database opens it to the admin account only.
      global: { headers: adminHeaders(cleanTripId(cookieStore.get(ADMIN_COOKIE)?.value)) },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — safe to ignore
          }
        },
      },
    }
  )
}
