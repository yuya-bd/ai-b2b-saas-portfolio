/**
 * Send one of each email template to the local inbox, so the rendered result
 * can be looked at rather than guessed at.
 *
 *   docker compose up -d mailpit
 *   pnpm dev:email-preview
 *
 * Then open http://localhost:8026.
 *
 * Loads .env first and reaches for the sender dynamically, for the same
 * ordering reason as db/seed-env.ts.
 */

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const TO = process.env.PREVIEW_EMAIL_TO || "preview@example.com";

async function main() {
  const { emailSender } = await import("@/lib/email");

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await emailSender.sendInvitation(
    {
      inviterName: "Preview Sender",
      organizationName: "Preview Organization",
      inviteLink: "http://localhost:3000/invite/preview-token",
      expiresAt,
    },
    { email: TO },
  );

  await emailSender.sendPasswordReset(
    {
      userName: "Preview User",
      resetLink: "http://localhost:3000/reset-password?token=preview-token",
      expiresAt,
    },
    { email: TO },
  );

  console.log(`[email-preview] Sent to ${TO}. Open http://localhost:8026`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[email-preview] Failed:", error);
    process.exit(1);
  });
