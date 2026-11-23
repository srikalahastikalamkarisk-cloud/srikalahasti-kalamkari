import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import AccountDashboard from "@/components/customer-account";
import { getCurrentCustomer } from "@/lib/customer-auth";
export const metadata: Metadata = { title: "My Account | Srikalahasti Kalamkari" };
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?returnTo=%2Faccount");
  if (!customer.emailVerifiedAt) return <><PremiumHeader/><main className="skauth-page"><section className="skauth-shell"><h1>Verify your email</h1><p>Please verify your email address to access your account.</p><Link href="/resend-verification">Resend verification email</Link></section></main><PremiumFooter/></>;
  return <><PremiumHeader/><AccountDashboard/><PremiumFooter/></>;
}
