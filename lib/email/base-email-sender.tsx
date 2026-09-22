import { render } from "@react-email/components";
import { APP_NAME } from "@/lib/constants/app";
import type {
  EmailRecipient,
  EmailSendResult,
  InvitationEmailData,
  PasswordResetEmailData,
} from "@/lib/types/email";
import type { EmailSender } from "./email-sender.interface";
import InvitationEmail from "./templates/invitation";
import PasswordResetEmail from "./templates/password-reset";

/**
 * Everything about an email except how it leaves the building.
 *
 * Subjects and templates are decided once here, so the dev and SES senders
 * cannot drift apart — a change to a subject line applies to both. Each
 * concrete sender implements `deliver` and nothing else.
 */
export abstract class BaseEmailSender implements EmailSender {
  /** Hand a rendered message to the transport. Must not throw. */
  protected abstract deliver(
    to: EmailRecipient,
    subject: string,
    html: string,
  ): Promise<EmailSendResult>;

  async sendInvitation(
    data: InvitationEmailData,
    to: EmailRecipient,
  ): Promise<EmailSendResult> {
    const subject = `You have been invited to ${data.organizationName} on ${APP_NAME}`;
    const html = await render(<InvitationEmail {...data} />);
    return this.deliver(to, subject, html);
  }

  async sendPasswordReset(
    data: PasswordResetEmailData,
    to: EmailRecipient,
  ): Promise<EmailSendResult> {
    const subject = `Reset your ${APP_NAME} password`;
    const html = await render(<PasswordResetEmail {...data} />);
    return this.deliver(to, subject, html);
  }
}
