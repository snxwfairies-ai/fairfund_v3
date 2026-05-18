import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import * as nodemailer        from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get('NODE_ENV') === 'production' &&
                   !!config.get('SMTP_HOST');
    this.from    = `"FairFund" <${config.get('SMTP_FROM', 'noreply@fairfund.in')}>`;

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host:   config.get('SMTP_HOST'),
        port:   config.get<number>('SMTP_PORT', 587),
        secure: config.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user: config.get('SMTP_USER'),
          pass: config.get('SMTP_PASS'),
        },
      });
    } else {
      // Dev: log emails to console
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.warn('Email in DEV mode — emails logged to console, not sent');
    }
  }

  async send(options: MailOptions): Promise<void> {
    try {
      const info = await this.transporter.sendMail({ from: this.from, ...options });
      if (!this.enabled) {
        this.logger.debug(`[DEV EMAIL] To: ${options.to} | ${options.subject}`);
      } else {
        this.logger.log(`Email sent: ${info.messageId} → ${options.to}`);
      }
    } catch (err) {
      this.logger.error(`Email failed to ${options.to}: ${err.message}`);
    }
  }

  // ── Template: OTP / verification ─────────────────────────────────────────
  async sendOTP(to: string, name: string, otp: string) {
    return this.send({
      to,
      subject: 'Your FairFund verification code',
      html: this.layout(`
        <h2>Hello ${name},</h2>
        <p>Your verification code is:</p>
        <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#0B1D3A;
                    background:#F5F0E8;padding:16px 24px;border-radius:8px;text-align:center;
                    margin:24px 0;">${otp}</div>
        <p style="color:#718096;font-size:13px;">This code expires in 10 minutes. Do not share it with anyone.</p>
      `),
    });
  }

  // ── Template: Investment confirmation ─────────────────────────────────────
  async sendInvestmentConfirmation(to: string, name: string, smeName: string, amount: number) {
    return this.send({
      to,
      subject: `Investment confirmed: ₹${amount.toLocaleString('en-IN')} in ${smeName}`,
      html: this.layout(`
        <h2>Investment Confirmed ✅</h2>
        <p>Dear ${name},</p>
        <p>Your investment has been successfully processed:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#718096;">Company</td><td style="padding:8px;font-weight:700;">${smeName}</td></tr>
          <tr style="background:#F5F0E8;"><td style="padding:8px;color:#718096;">Amount</td><td style="padding:8px;font-weight:700;">₹${amount.toLocaleString('en-IN')}</td></tr>
          <tr><td style="padding:8px;color:#718096;">Status</td><td style="padding:8px;color:#2D7A4F;font-weight:700;">Active</td></tr>
        </table>
        <a href="${this.config.get('APP_URL', 'https://fairfund.in')}/dashboard/portfolio"
           style="background:#C9A84C;color:#0B1D3A;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;">
          View Portfolio →
        </a>
      `),
    });
  }

  // ── Template: KYC status ──────────────────────────────────────────────────
  async sendKYCUpdate(to: string, name: string, status: 'verified' | 'rejected', reason?: string) {
    const approved = status === 'verified';
    return this.send({
      to,
      subject: approved ? 'KYC Verified — You can now invest!' : 'KYC Update Required',
      html: this.layout(`
        <h2>${approved ? '🎉 KYC Verified!' : '⚠️ KYC Update Required'}</h2>
        <p>Dear ${name},</p>
        ${approved
          ? '<p>Your identity has been verified. You can now invest on FairFund.</p>'
          : `<p>Your KYC verification could not be completed.</p>
             ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
             <p>Please re-submit your documents with the corrections.</p>`
        }
        <a href="${this.config.get('APP_URL', 'https://fairfund.in')}/dashboard/profile"
           style="background:#0B1D3A;color:white;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;margin-top:16px;">
          ${approved ? 'Start Investing →' : 'Update Documents →'}
        </a>
      `),
    });
  }

  // ── Template: Commission payout ───────────────────────────────────────────
  async sendCommissionPayout(to: string, name: string, amount: number, ref: string) {
    return this.send({
      to,
      subject: `Commission Payout: ₹${amount.toLocaleString('en-IN')} — ${ref}`,
      html: this.layout(`
        <h2>Commission Paid 💰</h2>
        <p>Dear ${name},</p>
        <p>Your commission payout has been processed:</p>
        <div style="background:#F5F0E8;padding:16px;border-radius:8px;margin:16px 0;">
          <div style="font-size:28px;font-weight:900;color:#0B1D3A;">₹${amount.toLocaleString('en-IN')}</div>
          <div style="color:#718096;font-size:12px;margin-top:4px;">Reference: ${ref}</div>
        </div>
        <p style="color:#718096;font-size:13px;">Funds will reflect in your bank account within 2 business days.</p>
      `),
    });
  }

  // ── Shared layout wrapper ─────────────────────────────────────────────────
  private layout(content: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;font-family:'DM Sans',Arial,sans-serif;background:#F0F4F8;">
      <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0B1D3A,#1a3a6e);padding:24px 32px;text-align:center;">
          <div style="width:44px;height:44px;background:linear-gradient(135deg,#C9A84C,#E8C96A);
                      border-radius:10px;display:inline-flex;align-items:center;justify-content:center;
                      font-size:22px;font-weight:900;color:#0B1D3A;">F</div>
          <div style="color:white;font-size:16px;font-weight:700;margin-top:8px;">FairFund</div>
          <div style="color:#C9A84C;font-size:10px;letter-spacing:2px;">MSME EXCHANGE</div>
        </div>
        <!-- Content -->
        <div style="padding:32px;color:#1a202c;line-height:1.6;">
          ${content}
        </div>
        <!-- Footer -->
        <div style="background:#F5F0E8;padding:16px 32px;text-align:center;color:#718096;font-size:11px;">
          © 2025 FairFund · <a href="#" style="color:#C9A84C;">Unsubscribe</a> ·
          <a href="${this.config.get('APP_URL','https://fairfund.in')}/compliance" style="color:#C9A84C;">Compliance</a>
        </div>
      </div>
    </body>
    </html>`;
  }
}
