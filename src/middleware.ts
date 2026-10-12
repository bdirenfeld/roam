import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { DEV_PREVIEW_PREFIX, devPreviewAllowed } from '@/app/dev/phone/devOnly'

export async function middleware(request: NextRequest) {
  // Public, local-only sample screens. These IDs can never identify UUID trips.
  const path = request.nextUrl.pathname;
  if (path === '/welcome') return NextResponse.next({ request });
  if (path === '/demo' || path.startsWith('/demo/')) return NextResponse.next({ request });
  if (path === '/api/places/photo' && request.nextUrl.searchParams.get('place_id')?.startsWith('demo-')) {
    const target = request.nextUrl.clone(); target.pathname = '/demo/photo';
    return NextResponse.rewrite(target);
  }
  if (/^\/trips\/landing-(?:sample|practice)(?:\/|$)/.test(path)) {
    const target = request.nextUrl.clone(); const pieces = path.split('/');
    target.pathname = '/demo';
    target.searchParams.set('view', pieces[3] === 'map' ? 'map' : pieces[3] === 'plan' ? 'week' : 'day');
    if (pieces[2] === 'landing-practice') target.searchParams.set('training', 'true');
    if (pieces[3] === 'days' && pieces[4]) target.searchParams.set('day', pieces[4]);
    return NextResponse.rewrite(target);
  }
  // The phone preview (app/dev/phone) runs on fixtures with no account, so it
  // skips sign-in — in `next dev` only. In production /dev/ goes through the
  // normal check and the page itself is a 404 (devOnly.test.ts).
  if (devPreviewAllowed() && request.nextUrl.pathname.startsWith(DEV_PREVIEW_PREFIX)) {
    return NextResponse.next({ request })
  }
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
