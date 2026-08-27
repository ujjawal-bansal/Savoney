import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Mail delivery with a development fallback.
 *
 * When `SMTP_URL` is set, mail is sent for real. When it is not — the default
 * locally — the message is written to the log instead, so the whole
 * password-reset flow can be exercised end to end without a mail account or
 * any third-party signup. Production boot refuses to start without SMTP_URL,
 * so the fallback can never silently swallow a real user's reset link.
 */
let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!env.SMTP_URL) return null;
  transporter ??= nodemailer.createTransport(env.SMTP_URL);
  return transporter;
};

export const sendMail = async (mail: Mail): Promise<void> => {
  const transport = getTransporter();

  if (!transport) {
    logger.warn(
      { to: mail.to, subject: mail.subject, body: mail.text },
      'SMTP not configured; logging the message instead of sending it',
    );
    return;
  }

  try {
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    logger.info({ to: mail.to, subject: mail.subject }, 'mail sent');
  } catch (error) {
    // A delivery failure must not leak back to the caller: the forgot-password
    // endpoint answers identically whether or not the address exists, and a
    // 500 here would break that guarantee.
    logger.error({ err: error, to: mail.to }, 'failed to send mail');
    if (isProduction) throw error;
  }
};

export const passwordResetEmail = (
  name: string,
  link: string,
  ttlMinutes: number,
): Omit<Mail, 'to'> => ({
  subject: 'Reset your Savoney password',
  text: [
    `Hi ${name},`,
    '',
    'Use the link below to choose a new password. It expires in ' +
      ttlMinutes +
      ' minutes and can only be used once.',
    '',
    link,
    '',
    'If you did not ask for this, you can ignore this email. Your password will not change.',
  ].join('\n'),
  html: `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;color:#0f172a">
      <h2 style="margin:0 0 16px">Reset your password</h2>
      <p style="margin:0 0 12px">Hi ${name},</p>
      <p style="margin:0 0 20px">Use the button below to choose a new password. It expires in ${ttlMinutes} minutes and can only be used once.</p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Choose a new password</a>
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:13px">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;color:#475569;font-size:13px;word-break:break-all">${link}</p>
      <p style="margin:0;color:#94a3b8;font-size:13px">If you did not ask for this, you can ignore this email. Your password will not change.</p>
    </div>`,
});
