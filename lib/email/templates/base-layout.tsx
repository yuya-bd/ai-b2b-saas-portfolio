import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { APP_NAME } from "@/lib/constants/app";

interface BaseLayoutProps {
  /** The line shown after the subject in an inbox list. */
  preview: string;
  children: React.ReactNode;
}

/**
 * Shared shell for every email.
 *
 * Styles are inline objects rather than CSS classes because most email
 * clients strip <style> blocks. Anything added here has to follow that rule.
 */
export default function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={content}>{children}</Section>
          <Section style={footer}>
            <Text style={footerText}>
              If you were not expecting this email, you can safely delete it.
            </Text>
            <Text style={footerCompany}>{APP_NAME}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const content = {
  padding: "0 48px",
};

const footer = {
  padding: "0 48px",
  marginTop: "32px",
  borderTop: "1px solid #e6ebf1",
  paddingTop: "24px",
};

const footerText = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  marginBottom: "8px",
};

const footerCompany = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
};
