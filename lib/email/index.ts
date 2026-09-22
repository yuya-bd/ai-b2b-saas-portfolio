import { getEmailConfig } from "./config";
import { DevEmailSender } from "./dev-email-sender";
import type { EmailSender } from "./email-sender.interface";
import { SesEmailSender } from "./ses-email-sender";

/** The only place a concrete sender is named. */
export function createEmailSender(): EmailSender {
  if (getEmailConfig().provider === "ses") {
    return new SesEmailSender();
  }
  return new DevEmailSender();
}

export const emailSender = createEmailSender();

export type { EmailConfig, EmailProvider } from "./config";
export type { EmailSender } from "./email-sender.interface";
