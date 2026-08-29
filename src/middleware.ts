import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // manifest.json and sw.js are public static files. Running them through
    // session handling redirects them for an unauthenticated fetch, and Chrome
    // can't install or update a PWA whose manifest 307s — which is what kept
    // the share target from appearing.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
