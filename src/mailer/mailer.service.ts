import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { MailTemplates } from "./mail-templates";

/**
 * Servicio de correo desacoplado del proveedor (igual que el MailerService del
 * proyecto original, que envuelve a Resend). Aquí usamos SMTP vía nodemailer
 * apuntando a MailHog, para que el sistema sea 100% autocontenido en Docker:
 * NO requiere API keys ni servicios externos. Los correos se ven en
 * http://localhost:8025.
 *
 * En producción se cambiaría el transporte por Resend/SES/SendGrid sin tocar
 * a los que llaman a este servicio.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger("MailerService");
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from =
      this.config.get<string>("MAIL_FROM") ??
      "MiniWallet <no-reply@miniwallet.local>";
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>("MAIL_HOST") ?? "localhost",
      port: Number(this.config.get("MAIL_PORT") ?? 1025),
      secure: false,
    });
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Correo enviado a ${to}: "${subject}"`);
    } catch (e: any) {
      this.logger.warn(`Fallo enviando correo a ${to}: ${e.message}`);
    }
  }

  async sendWelcome(to: string, name: string) {
    const t = MailTemplates.welcome(name);
    await this.send(to, t.subject, t.html);
  }

  async sendPasswordRecovery(to: string, name: string, resetUrl: string) {
    const t = MailTemplates.passwordRecovery(name, resetUrl);
    await this.send(to, t.subject, t.html);
  }

  async sendPasswordChanged(to: string, name: string) {
    const t = MailTemplates.passwordChanged(name);
    await this.send(to, t.subject, t.html);
  }

  async sendTransferOtp(
    to: string,
    name: string,
    code: string,
    amount: number,
  ) {
    const t = MailTemplates.transferOtp(name, code, amount);
    await this.send(to, t.subject, t.html);
  }

  async sendTransferReceived(
    to: string,
    name: string,
    amount: number,
    from: string,
  ) {
    const t = MailTemplates.transferReceived(name, amount, from);
    await this.send(to, t.subject, t.html);
  }

  async sendTransferHeld(to: string, name: string, amount: number) {
    const t = MailTemplates.transferHeld(name, amount);
    await this.send(to, t.subject, t.html);
  }
}
