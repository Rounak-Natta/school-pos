import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { RoleName } from "@/generated/prisma/client";

const SESSION_COOKIE_NAME = "school_pos_session";

export type SessionRole = {
  schoolId: string;
  schoolName: string;
  role: RoleName;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: SessionRole[];
};

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    name: user.name,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);

    if (!payload.sub || !payload.email || !payload.name) {
      return null;
    }

    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      roles: (payload.roles as SessionRole[]) ?? [],
    };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}