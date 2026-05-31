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

  // Public paths — no auth required. The Stripe webhook is called by Stripe
  // with no user session and must pass through to its signature-verified
  // handler; bouncing it to /login would silently break all payment events.
  const publicPaths = ['/login', '/auth', '/api/stripe/webhook']
  // `/` is the logged-out marketing front door — exempt by EXACT match only.
  // (Adding '/' to publicPaths would make every path startsWith('/') public.)
  // The page itself redirects authenticated visitors on to /trips.
  const isPublic = pathname === '/' || publicPaths.some((p) => pathname.startsWith(p))

  if (!user && !isPublic) {
    // Build a fresh URL — do NOT clone request.nextUrl, which would carry over
    // existing query params (e.g. code=... from an OAuth redirect) into /login.
    const loginUrl = new URL('/login', request.nextUrl.origin)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Payment gate — page routes only. /api/* stays auth-only by design;
  // /checkout (the session-creating route + its cancel target) must remain
  // reachable for unpaid users, or the gate would loop on itself.
  if (user) {
    const isApiRoute = pathname.startsWith('/api/')
    const isCheckoutRoute = pathname.startsWith('/checkout')
    const needsGate = !isApiRoute && !isCheckoutRoute && !isPublic

    if (needsGate) {
      const { data: profile } = await supabase
        .from('users')
        .select('has_paid')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.has_paid) {
        return NextResponse.redirect(new URL('/checkout', request.nextUrl.origin))
      }
    }
  }

  return supabaseResponse
}
