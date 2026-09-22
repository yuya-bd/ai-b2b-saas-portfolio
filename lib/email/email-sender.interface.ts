import type {
  EmailRecipient,
  EmailSendResult,
  InvitationEmailData,
  PasswordResetEmailData,
} from "@/lib/types/email";

/**
 * What the application depends on. Callers name this type, never a concrete
 * sender, so swapping SES for something else touches only the factory in
 * index.ts.
 */
export interface EmailSender {
  sendInvitation(
    data: InvitationEmailData,
    to: EmailRecipient,
  ): Promise<EmailSendResult>;

  sendPasswordReset(
    data: PasswordResetEmailData,
    to: EmailRecipient,
  ): Promise<EmailSendResult>;
}
