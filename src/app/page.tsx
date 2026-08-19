import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
