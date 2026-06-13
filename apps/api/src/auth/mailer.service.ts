import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";

type PasswordResetEmail = {
  to: string;
  name: string;
  resetUrl: string;
};

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset({ to, name, resetUrl }: PasswordResetEmail) {
    const host = this.config.get<string>("SMTP_HOST");
    const port = Number(this.config.get<string>("SMTP_PORT", "587"));
    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASS");
    const from = this.config.get<string>("SMTP_FROM");

    if (!host || !user || !pass || !from) {
      this.logger.error("SMTP config is incomplete. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM");
      throw new InternalServerErrorException("Email service is not configured");
    }

    const transport = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    await transport.sendMail({
      from,
      to,
      subject: "รีเซ็ตรหัสผ่าน Zentory",
      text: [
        `สวัสดี ${name}`,
        "",
        "เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี Zentory ของคุณ",
        `กดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่: ${resetUrl}`,
        "",
        "ลิงก์นี้จะหมดอายุภายใน 1 ชั่วโมง หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน สามารถละเว้นอีเมลนี้ได้"
      ].join("\n"),
      html: `
        <div style="font-family: 'Noto Sans Thai', Arial, sans-serif; line-height: 1.7; color: #17201b;">
          <h1 style="font-size: 22px; margin: 0 0 12px;">รีเซ็ตรหัสผ่าน Zentory</h1>
          <p>สวัสดี ${name}</p>
          <p>เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี Zentory ของคุณ</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
              ตั้งรหัสผ่านใหม่
            </a>
          </p>
          <p>ลิงก์นี้จะหมดอายุภายใน 1 ชั่วโมง หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน สามารถละเว้นอีเมลนี้ได้</p>
        </div>
      `
    });
  }
}
