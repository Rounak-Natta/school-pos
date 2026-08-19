"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccessScope } from "@/lib/rbac";

export async function markNotificationReadAction(formData: FormData) {
  const access = await getAccessScope();
  const id = String(formData.get("notificationId") ?? "").trim();
  if (!id) return;

  await prisma.notification.updateMany({
    where: { id, userId: access.userId },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const access = await getAccessScope();
  await prisma.notification.updateMany({
    where: { userId: access.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
