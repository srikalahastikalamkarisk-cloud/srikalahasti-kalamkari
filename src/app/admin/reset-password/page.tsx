import type { Metadata } from "next";
import ResetPasswordForm from "@/components/admin/reset-password-form";
import "../forgot-password/forgot-password.css";

export const metadata: Metadata = {
  title: "Reset Admin Password | Srikalahasti Kalamkari",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AdminResetPasswordPage() {
  return <ResetPasswordForm />;
}
