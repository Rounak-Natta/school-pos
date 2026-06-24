import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "school_pos_session";

const protectedRoutes = [
  "/dashboard",
  "/schools",
  "/users",
  "/students",
  "/products",
  "/inventory",
  "/transfers",
  "/pos",
  "/invoices",
  "/payments",
  "/reports",
  "/import-export",
  "/audit-logs",
  "/settings",
];

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

function isProtectedRoute(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

async function isValidSession(token: string) {
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  const isLoginPage = pathname === "/login";
  const isProtectedPage = isProtectedRoute(pathname);

  if (isLoginPage && token) {
    const valid = await isValidSession(token);

    if (valid) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (!isProtectedPage) {
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);

    return NextResponse.redirect(loginUrl);
  }

  const valid = await isValidSession(token);

  if (!valid) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};