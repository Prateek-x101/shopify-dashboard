import { Router } from "express";
import nodemailer from "nodemailer";
import { SendEmailBody } from "@workspace/api-zod";
import { config } from "../config";

const router = Router();

interface LoggedEmail {
  id: string;
  order_id: string;
  to_email: string;
  subject: string;
  body: string;
  timestamp: string;
}

const emailHistory: LoggedEmail[] = [];

router.post("/email/send", async (req, res) => {
  const parsed = SendEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.format() });
    return;
  }

  const { to_email, subject, body, order_id } = parsed.data;

  if (!config.emailUser || !config.emailPass) {
    res.status(503).json({ error: "Email service not configured. Please enter your Gmail Address and App Password in Settings." });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.emailUser,
        pass: config.emailPass,
      },
    });

    const info = await transporter.sendMail({
      from: `"${config.emailUser}" <${config.emailUser}>`,
      to: to_email,
      subject: subject,
      text: body,
    });

    const newMsg: LoggedEmail = {
      id: info.messageId || `msg-${Date.now()}`,
      order_id,
      to_email,
      subject,
      body,
      timestamp: new Date().toISOString(),
    };

    emailHistory.push(newMsg);

    res.json(newMsg);
  } catch (err: any) {
    console.error("Failed to send email via Gmail:", err);
    res.status(500).json({ error: "Failed to send email", details: err.message || err });
  }
});

router.get("/email/messages/:order_id", (req, res) => {
  const { order_id } = req.params;
  const filtered = emailHistory.filter((m) => m.order_id === order_id);
  res.json({ messages: filtered });
});

export default router;
