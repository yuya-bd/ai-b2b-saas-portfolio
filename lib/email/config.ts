export type EmailProvider = "ses" | "dev";

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  appUrl: string;
  ses?: {
    region: string;
  };
  smtp?: {
    host: string;
    port: number;
  };
}

export function getEmailConfig(): EmailConfig {
  const provider = (process.env.EMAIL_PROVIDER || "dev") as EmailProvider;

  const config: EmailConfig = {
    provider,
    from: process.env.EMAIL_FROM || "noreply@localhost",
    appUrl: process.env.APP_URL || "http://localhost:3000",
  };

  if (provider === "ses") {
    config.ses = {
      region:
        process.env.AWS_SES_REGION ||
        process.env.AWS_REGION ||
        "ap-northeast-1",
    };
  } else if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    config.smtp = {
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT, 10),
    };
  }
  // With no SMTP host configured the dev sender logs to the console instead,
  // so a fresh checkout can exercise the email paths with nothing running.

  return config;
}
