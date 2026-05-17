import { createTransport, Transporter } from 'nodemailer';

let cached: { transporter: Transporter; from: string } | null = null;

function getMailer(): { transporter: Transporter; from: string } {
  if (cached) return cached;

  const { SMTP_HOST, SMTP_PORT, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
    throw new Error('Missing required SMTP environment variables: SMTP_HOST, SMTP_PORT, SMTP_FROM');
  }

  cached = {
    transporter: createTransport({ host: SMTP_HOST, port: parseInt(SMTP_PORT, 10), secure: false }),
    from: SMTP_FROM,
  };
  return cached;
}

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { transporter, from } = getMailer();
  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    throw new Error(`Failed to send email to ${to}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
