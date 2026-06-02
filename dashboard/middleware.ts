import { NextRequest, NextResponse } from "next/server";

const PASSWORD = process.env.DASHBOARD_PASSWORD || "chonky";
const COOKIE_NAME = "mm_auth";

export function middleware(req: NextRequest) {
  // Allow API routes through (they have their own auth)
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === PASSWORD) {
    return NextResponse.next();
  }

  // Redirect to login
  if (req.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
