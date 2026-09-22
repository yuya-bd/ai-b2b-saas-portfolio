import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailRecipient, EmailSendResult } from "@/lib/types/email";
import { BaseEmailSender } from "./base-email-sender";
import { getEmailConfig } from "./config";

/** Deployed sender, backed by AWS SES. */
export class SesEmailSender extends BaseEmailSender {
  private config = getEmailConfig();
  private client: SESClient;

  constructor() {
    super();
    this.client = new SESClient({ region: this.config.ses?.region });
  }

  protected async deliver(
    to: EmailRecipient,
    subject: string,
    html: string,
  ): Promise<EmailSendResult> {
    try {
      const response = await this.client.send(
        new SendEmailCommand({
          Source: this.config.from,
          Destination: { ToAddresses: [to.email] },
          Message: {
            // Charset must be set explicitly; SES assumes ASCII otherwise and
            // non-ASCII subjects arrive mangled.
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
        }),
      );

      return { success: true, messageId: response.MessageId };
    } catch (error) {
      console.error("[SesEmailSender] Failed to send:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
