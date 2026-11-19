"use server";

import { signIn } from "@/auth";

export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "discord") throw new Error("Unsupported sign-in provider.");
  await signIn(provider, { redirectTo: "/" });
}

export async function signOutUser() {
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/" });
}
