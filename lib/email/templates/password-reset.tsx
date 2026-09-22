import { Button, Heading, Text } from "@react-email/components";
import type { PasswordResetEmailData } from "@/lib/types/email";
import BaseLayout from "./base-layout";

export default function PasswordResetEmail({
  userName,
  resetLink,
  expiresAt,
}: PasswordResetEmailData) {
  return (
    <BaseLayout preview="Reset your password">
      <Heading style={heading}>Reset your password</Heading>
      <Text style={paragraph}>
        Hello {userName}, use the link below to choose a new password.
      </Text>
      <Button style={button} href={resetLink}>
        Reset password
      </Button>
      <Text style={note}>
        This link expires on {expiresAt.toISOString().slice(0, 10)}. If you did
        not request a reset, no action is needed — your password stays as it is.
      </Text>
      <Text style={fallback}>{resetLink}</Text>
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
