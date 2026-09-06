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
  // `/journey/` is the guest claim link: it must be reachable logged-out (it
  // initiates OAuth itself, carrying the claim path as `next`), so a real
  // '/journey/' prefix match — NOT a bare '/journey' that could catch a future
  // '/journeys' — exempts it from the auth bounce.
  //
  // NOTE (Sept 2026): earlier comments here described a has_paid gate "below".
  // There is none. `has_paid` is written by the Stripe webhook and read only
  // by /checkout; nothing requires payment to use the app. Signing in is the
  // only gate. Left as-is deliberately — whether Roam is free is Brennan's
  // call, not a bug to fix in passing.
  // `/guide.html` is the static quick-start guide in /public — linked from the
  // landing page and sent to people who can't log in yet, so it must be public.
  // `/sw.js` + `/offline.html` power offline mode and must load without auth,
  // or the service worker can never register from the logged-out landing page.
  // '/privacy' and '/terms' are public by law and for Google's OAuth review.
  const publicPaths = ['/login', '/auth', '/api/stripe/webhook', '/journey/', '/guide.html', '/sw.js', '/offline.html', '/privacy', '/terms']
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

  return supabaseResponse
}
