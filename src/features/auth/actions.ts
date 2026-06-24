"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import { loginSchema } from "@/features/auth/schemas";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: "Please enter a valid email and password.",
    };
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    include: {
      schoolRoles: {
        where: {
          isActive: true,
        },
        include: {
          school: true,
        },
      },
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    return {
      error: "Invalid email or password.",
    };
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    return {
      error: "Invalid email or password.",
    };
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.schoolRoles.map((schoolRole) => ({
      schoolId: schoolRole.schoolId,
      schoolName: schoolRole.school.name,
      role: schoolRole.role,
    })),
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}