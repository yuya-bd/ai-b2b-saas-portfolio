import nodemailer from "nodemailer";
import type { EmailRecipient, EmailSendResult } from "@/lib/types/email";
import { BaseEmailSender } from "./base-email-sender";
import { getEmailConfig } from "./config";

/**
 * Local sender. With SMTP configured it posts to Mailpit, where the rendered
 * message can be opened in a browser; without it, the message is logged so a
 * fresh checkout still exercises the code path.
 */
export class DevEmailSender extends BaseEmailSender {
  private config = getEmailConfig();

  protected async deliver(
    to: EmailRecipient,
    subject: string,
    html: string,
  ): Promise<EmailSendResult> {
    if (!this.config.smtp) {
      console.log("==================== EMAIL ====================");
      console.log(`To: ${to.email}`);
      console.log(`Subject: ${subject}`);
      console.log("(set SMTP_HOST and SMTP_PORT to deliver to Mailpit)");
      console.log("===============================================");
      return { success: true, messageId: `dev-${Date.now()}` };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        // Mailpit speaks plain SMTP locally.
        ignoreTLS: true,
      });

      const info = await transporter.sendMail({
        from: this.config.from,
        to: to.email,
        subject,
        html,
      });

      console.log(`[DevEmailSender] Sent via SMTP: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("[DevEmailSender] Failed to send:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
