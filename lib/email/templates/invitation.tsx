import { Button, Heading, Text } from "@react-email/components";
import type { InvitationEmailData } from "@/lib/types/email";
import BaseLayout from "./base-layout";

export default function InvitationEmail({
  inviterName,
  organizationName,
  inviteLink,
  expiresAt,
}: InvitationEmailData) {
  return (
    <BaseLayout preview={`${inviterName} invited you to ${organizationName}`}>
      <Heading style={heading}>You have been invited</Heading>
      <Text style={paragraph}>
        {inviterName} has invited you to join {organizationName}.
      </Text>
      <Button style={button} href={inviteLink}>
        Accept invitation
      </Button>
      <Text style={note}>
        This link expires on {expiresAt.toISOString().slice(0, 10)}. After that
        you will need a new invitation.
      </Text>
      {/* Some clients strip buttons, so the URL is also given as text. */}
      <Text style={fallback}>{inviteLink}</Text>
    </BaseLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#1a1a1a",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#404040",
};

const button = {
  backgroundColor: "#1a1a1a",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 0",
  margin: "24px 0",
};

const note = {
  fontSize: "14px",
  lineHeight: "20px",
  color: "#6b7280",
};

const fallback = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#8898aa",
  wordBreak: "break-all" as const,
};
