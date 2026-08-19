"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, requirePermission, resolveAccessibleSchoolId } from "@/lib/rbac";
import { approveTransfer, createTransfer, dispatchTransfer, receiveTransfer } from "@/features/transfers/transfer-service";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function createTransferAction(formData: FormData) {
  const access = await getAccessScope();
  const fromSchoolId = await resolveAccessibleSchoolId({ postedSchoolId: clean(formData.get("fromSchoolId")), access, permission: Permission.MANAGE_TRANSFERS });
  const toSchoolId = clean(formData.get("toSchoolId"));
  if (!toSchoolId || toSchoolId === fromSchoolId) throw new Error("Choose a different destination school.");
  const destination = await prisma.school.findFirst({ where: { id: toSchoolId, isActive: true }, select: { id: true } });
  if (!destination) throw new Error("Destination school is invalid.");
  const items: Array<{ productVariantId: string; quantity: number }> = [];
  for (let i = 0; i < 50; i++) {
    const productVariantId = clean(formData.get(`productVariantId_${i}`));
    const quantity = Number(clean(formData.get(`quantity_${i}`)));
    if (!productVariantId && !quantity) continue;
    if (!productVariantId || !Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid item at row ${i + 1}.`);
    items.push({ productVariantId, quantity });
  }
  if (!items.length) throw new Error("Add at least one item.");
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.productVariantId, (merged.get(item.productVariantId) ?? 0) + item.quantity);
  const normalizedItems = Array.from(merged, ([productVariantId, quantity]) => ({ productVariantId, quantity }));
  const transfer = await prisma.$transaction(tx => createTransfer(tx, { fromSchoolId, toSchoolId, note: clean(formData.get("note")) || null, requestedById: access.userId, requestedByEmail: access.email, items: normalizedItems }));
  revalidatePath("/transfers"); revalidatePath("/inventory");
  redirect(`/transfers/${transfer.id}`);
}

async function transferForPermission(id: string) {
  const transfer = await prisma.transfer.findUnique({ where: { id }, select: { id: true, fromSchoolId: true, toSchoolId: true } });
  if (!transfer) throw new Error("Transfer not found.");
  return transfer;
}

export async function approveTransferAction(formData: FormData) {
  const access = await getAccessScope(); const id = clean(formData.get("transferId")); const t = await transferForPermission(id);
  requirePermission(access, Permission.MANAGE_TRANSFERS, t.fromSchoolId);
  await prisma.$transaction(tx => approveTransfer(tx, { transferId: id, userId: access.userId }));
  revalidatePath("/transfers"); revalidatePath(`/transfers/${id}`);
}
export async function dispatchTransferAction(formData: FormData) {
  const access = await getAccessScope(); const id = clean(formData.get("transferId")); const t = await transferForPermission(id);
  requirePermission(access, Permission.MANAGE_TRANSFERS, t.fromSchoolId);
  await prisma.$transaction(tx => dispatchTransfer(tx, { transferId: id, userId: access.userId, userEmail: access.email }), { timeout: 15000, maxWait: 5000 });
  revalidatePath("/transfers"); revalidatePath(`/transfers/${id}`); revalidatePath("/inventory"); revalidatePath("/inventory/movements");
}
export async function receiveTransferAction(formData: FormData) {
  const access = await getAccessScope(); const id = clean(formData.get("transferId")); const t = await transferForPermission(id);
  requirePermission(access, Permission.MANAGE_TRANSFERS, t.toSchoolId);
  await prisma.$transaction(tx => receiveTransfer(tx, { transferId: id, userId: access.userId, userEmail: access.email }), { timeout: 15000, maxWait: 5000 });
  revalidatePath("/transfers"); revalidatePath(`/transfers/${id}`); revalidatePath("/inventory"); revalidatePath("/inventory/movements");
}
