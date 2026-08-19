import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { LoginForm } from "./_components/login-form";

export default async function LoginPage() {
  // Do not trust a signed JWT by itself here. The database may have been
  // reset/reseeded, leaving the browser with a valid token for an old user id.
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-950">
            School POS Login
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Billing, inventory and school-wise stock management.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
