import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type ResetEmailEnvironment = {
  APP_BASE_URL?: string;
  EMAIL_PROVIDER?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_USER?: string;
  SMTP_APP_PASSWORD?: string;
  PASSWORD_RESET_EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
};

type CommonConfig = { appOrigin: string; from: string };
export type ResetEmailConfig =
  | (CommonConfig & { provider: "gmail"; host: string; port: number; secure: boolean; user: string; password: string })
  | (CommonConfig & { provider: "resend"; apiKey: string });

export type ResetEmailDependencies = {
  fetcher?: typeof fetch;
  smtpFactory?: (options: SMTPTransport.Options) => Pick<Transporter, "sendMail">;
};

function trustedOrigin(appBase: string | undefined, nodeEnv = process.env.NODE_ENV) {
  if (!appBase?.trim()) return null;
  try {
    const parsed = new URL(appBase.trim());
    const isLocalDevelopment =
      nodeEnv === "development" &&
      parsed.protocol === "http:" &&
      parsed.hostname === "localhost" &&
      parsed.port === "3000";

    if (
      (parsed.protocol !== "https:" && !isLocalDevelopment) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getResetEmailConfig(
  env: ResetEmailEnvironment = process.env as ResetEmailEnvironment,
  nodeEnv = process.env.NODE_ENV,
): ResetEmailConfig | null {
  const appOrigin = trustedOrigin(env.APP_BASE_URL, nodeEnv);
  const from = env.PASSWORD_RESET_EMAIL_FROM?.trim();
  if (!appOrigin || !from) return null;

  const configuredProvider = env.EMAIL_PROVIDER?.trim().toLowerCase();
  const hasSmtpCredentials = Boolean(env.SMTP_USER?.trim() && env.SMTP_APP_PASSWORD?.trim());
  const provider = configuredProvider || (hasSmtpCredentials ? "gmail" : "resend");

  if (provider === "gmail" || provider === "smtp") {
    const host = env.SMTP_HOST?.trim().toLowerCase();
    const port = Number(env.SMTP_PORT);
    const secureValue = env.SMTP_SECURE?.trim().toLowerCase();
    if (host !== "smtp.gmail.com" || ![465, 587].includes(port)) return null;
    if (secureValue !== "true" && secureValue !== "false") return null;
    const secure = secureValue === "true";
    if ((port === 465) !== secure) return null;
    const user = env.SMTP_USER?.trim();
    const password = env.SMTP_APP_PASSWORD?.trim();
    if (!user || !password) return null;
    return { provider: "gmail", appOrigin, from, host, port, secure, user, password };
  }

  if (provider === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    return apiKey ? { provider: "resend", appOrigin, from, apiKey } : null;
  }

  return null;
}

export async function sendAdminPasswordResetEmail(
  email: string,
  token: string,
  dependencies: ResetEmailDependencies = {},
  config: ResetEmailConfig | null = getResetEmailConfig(),
) {
  if (!config) throw new Error("Password reset email is not configured");
  const resetUrl = new URL("/admin/reset-password", config.appOrigin);
  resetUrl.hash = new URLSearchParams({ token }).toString();
  const subject = "Reset your Srikalahasti Kalamkari admin password";
  const text = `A password reset was requested for your administrator account. Use this secure link within 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`;
  const html = `<p>A password reset was requested for your administrator account.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this message.</p>`;

  if (config.provider === "gmail") {
    const smtpFactory = dependencies.smtpFactory ?? (options => nodemailer.createTransport(options));
    const transport = smtpFactory({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      requireTLS: config.port === 587,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    await transport.sendMail({ from: config.from, to: email, subject, text, html });
    return;
  }

  const response = await (dependencies.fetcher ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.from, to: [email], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Password reset email delivery failed");
}
