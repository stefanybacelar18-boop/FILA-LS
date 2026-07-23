import nodemailer from 'nodemailer';
import { startOfDay } from 'date-fns';
import { prisma } from '../lib/prisma';

export type FirstRouteNotifyPayload = {
  routeId: string;
  routeName: string;
  routeDate: string;
  createdByName: string;
};

/** Destinatários fixos do aviso do 1º roteiro do dia (LSL + AG). */
export const DEFAULT_FIRST_ROUTE_NOTIFY_EMAILS = [
  'lucas_souza@lslgr.com.br',
  'rodrigo_almeida@lslgr.com.br',
  'agtransportes2020@outlook.com',
] as const;

function mailConfigured(): boolean {
  if (process.env.RESEND_API_KEY?.trim()) return true;
  return !!(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS?.trim()
  );
}

function fromAddress(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'FrotaTMS <noreply@frotatms.local>'
  );
}

function appBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL?.trim().replace(/\/$/, '') ||
    process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/$/, '') ||
    'https://frota-tms.onrender.com'
  );
}

async function sendViaResend(to: string[], subject: string, text: string, html: string) {
  const key = process.env.RESEND_API_KEY!.trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function sendViaSmtp(to: string[], subject: string, text: string, html: string) {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: fromAddress(),
    to: to.join(', '),
    subject,
    text,
    html,
  });
}

function parseEmailList(raw: string | undefined): string[] {
  return (raw || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@') && !e.endsWith('@.com'));
}

/** Lista final: e-mails fixos LSL/AG + NOTIFY_EXTRA_EMAILS (se houver). */
export function firstRouteNotifyRecipients(): string[] {
  const set = new Set<string>([
    ...DEFAULT_FIRST_ROUTE_NOTIFY_EMAILS.map((e) => e.toLowerCase()),
    ...parseEmailList(process.env.NOTIFY_EXTRA_EMAILS),
  ]);
  return [...set];
}

function buildMessage(payload: FirstRouteNotifyPayload) {
  const link = `${appBaseUrl()}/definir-placas?routeId=${payload.routeId}`;
  const subject = `FrotaTMS — primeiro roteiro do dia: ${payload.routeName}`;
  const text = [
    'O Admin disponibilizou o primeiro roteiro do dia.',
    '',
    `Roteiro: ${payload.routeName}`,
    `Data do roteiro: ${payload.routeDate}`,
    `Por: ${payload.createdByName}`,
    '',
    `Abrir Pendentes de placa: ${link}`,
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
      <p><strong>O Admin disponibilizou o primeiro roteiro do dia.</strong></p>
      <p>
        Roteiro: <strong>${escapeHtml(payload.routeName)}</strong><br/>
        Data do roteiro: ${escapeHtml(payload.routeDate)}<br/>
        Por: ${escapeHtml(payload.createdByName)}
      </p>
      <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir Pendentes de placa</a></p>
    </div>
  `;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** True se ainda não houve roteiro disponibilizado hoje (calendário do servidor). */
export async function isFirstRouteSentToday(excludeRouteId?: string): Promise<boolean> {
  const today = startOfDay(new Date());
  const count = await prisma.route.count({
    where: {
      sentToOperationAt: { gte: today },
      ...(excludeRouteId ? { id: { not: excludeRouteId } } : {}),
    },
  });
  return count === 0;
}

/**
 * Envia e-mail aos destinatários fixos (LSL/AG) quando o 1º roteiro do dia é disponibilizado.
 * Sem SMTP/Resend configurado: só registra no log (não quebra o fluxo).
 */
export async function notifyFirstRouteOfDay(payload: FirstRouteNotifyPayload): Promise<{
  sent: boolean;
  reason?: string;
  to?: string[];
}> {
  if (!mailConfigured()) {
    console.warn(
      '[notify] E-mail não configurado (RESEND_API_KEY ou SMTP_*). Pulei aviso do 1º roteiro.',
    );
    return { sent: false, reason: 'mail_not_configured' };
  }

  const to = firstRouteNotifyRecipients();
  if (to.length === 0) {
    console.warn('[notify] Nenhum e-mail de destino configurado.');
    return { sent: false, reason: 'no_recipients' };
  }

  const { subject, text, html } = buildMessage(payload);

  try {
    if (process.env.RESEND_API_KEY?.trim()) {
      await sendViaResend(to, subject, text, html);
    } else {
      await sendViaSmtp(to, subject, text, html);
    }
    console.log(`[notify] 1º roteiro do dia — e-mail enviado para ${to.join(', ')}`);
    return { sent: true, to };
  } catch (err) {
    console.error('[notify] Falha ao enviar e-mail do 1º roteiro:', (err as Error)?.message ?? err);
    return { sent: false, reason: 'send_failed', to };
  }
}
