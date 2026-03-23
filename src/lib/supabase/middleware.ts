import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const isConfigured =
  !!SUPABASE_URL &&
  SUPABASE_URL !== 'https://your-project-ref.supabase.co' &&
  !!SUPABASE_ANON_KEY

export async function updateSession(request: NextRequest) {
  // If Supabase isn't configured yet (dev setup) skip auth checks entirely
  if (!isConfigured) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not add logic between createServerClient and getUser()
  // A stale session gets silently refreshed here.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public paths — no auth required
  const publicPaths = ['/login', '/auth']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))

  if (!user && !isPublic) {
    // Build a fresh URL — do NOT clone request.nextUrl, which would carry over
    // existing query params (e.g. code=... from an OAuth redirect) into /login.
    const loginUrl = new URL('/login', request.nextUrl.origin)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}
