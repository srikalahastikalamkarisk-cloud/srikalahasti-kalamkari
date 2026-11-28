import CustomerOtpSettings from "@/components/admin/customer-otp-settings";

export default function OtpManagementPage() {
  return (
    <div className="skotp-page">
      <header className="skotp-heading">
        <h1>OTP Management</h1>
        <p>Customer authentication, SMS usage and recharge.</p>
      </header>
      <CustomerOtpSettings />
    </div>
  );
}
