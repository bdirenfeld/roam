import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminView";

/** Leaves the admin view: the cookie goes, and with it the database's door. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", req.url));
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
