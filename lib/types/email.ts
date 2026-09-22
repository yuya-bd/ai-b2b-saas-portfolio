export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Sending never throws. Callers are usually mid-transaction or inside
 * `after()`, where an exception would either roll back real work or surface as
 * an unhandled rejection, so failure is reported in the return value instead.
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface InvitationEmailData {
  inviterName: string;
  organizationName: string;
  inviteLink: string;
  expiresAt: Date;
}

export interface PasswordResetEmailData {
  userName: string;
  resetLink: string;
  expiresAt: Date;
}
