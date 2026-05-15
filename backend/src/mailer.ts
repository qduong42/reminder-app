import { createTransport } from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_FROM } = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
  throw new Error('Missing required SMTP environment variables: SMTP_HOST, SMTP_PORT, SMTP_FROM');
}

const transporter = createTransport({
  host: SMTP_HOST,
  port: parseInt(SMTP_PORT, 10),
  secure: false,
});

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    throw new Error(`Failed to send email to ${to}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
