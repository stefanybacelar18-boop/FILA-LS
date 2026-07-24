import nodemailer from 'nodemailer';
import { startOfDay } from 'date-fns';
import { prisma } from '../lib/prisma';

export type FirstRouteNotifyPayload = {
  routeId: string;
  routeName: string;
  routeDate: string;
  createdByName: string;
};

export type NotifyResult = {
  sent: boolean;
  reason?: string;
  to?: string[];
  sentTo?: string[];
  failed?: { email: string; error: string }[];
  hint?: string;
};

/** Destinatário do aviso do 1º roteiro do dia (somente AG). */
export const DEFAULT_FIRST_ROUTE_NOTIFY_EMAILS = [
  'agtransportes2020@outlook.com',
] as const;

/** Último resultado (para diagnóstico em /api/notify/status). */
let lastNotifyResult: (NotifyResult & { at?: string; subject?: string }) | null = null;

export function getLastNotifyResult() {
  return lastNotifyResult;
}

function smtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS?.trim()
  );
}

function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() || smtpConfigured();
}

/**
 * Remetente ≠ destinatário.
 * Destinatário fixo: AG. Remetente: Resend (onboarding@resend.dev) ou SMTP dedicado.
 * Preferir Resend quando houver chave — não usar a caixa da AG para enviar.
 */
function preferResend(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export function mailStatus() {
  const from = fromAddress();
  const usingResend = preferResend();
  const usingSmtp = !usingResend && smtpConfigured();
  const fromIsTestDomain = /resend\.dev/i.test(from);
  return {
    configured: mailConfigured(),
    provider: usingResend ? 'resend' : usingSmtp ? 'smtp' : 'none',
    from,
    fromIsTestDomain: usingResend && fromIsTestDomain,
    recipients: firstRouteNotifyRecipients(),
    lastNotify: lastNotifyResult,
    hint: usingResend && fromIsTestDomain
      ? 'Remetente = Resend (onboarding@resend.dev). Destinatário = só AG. A conta Resend precisa estar cadastrada com agtransportes2020@outlook.com, senão o Resend bloqueia o envio.'
      : usingResend
        ? undefined
        : usingSmtp
          ? 'SMTP ativo como remetente. Destinatário continua só AG.'
          : 'Configure RESEND_API_KEY + MAIL_FROM=FrotaTMS <onboarding@resend.dev> (conta Resend = e-mail AG).',
  };
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

async function sendViaResendOne(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<void> {
  const key = process.env.RESEND_API_KEY!.trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 400)}`);
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

/** Lista final: e-mail AG fixo + NOTIFY_EXTRA_EMAILS (se houver). */
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

function resendHintFromError(message: string): string | undefined {
  const from = fromAddress();
  if (/resend\.dev/i.test(from) || /only send testing emails/i.test(message)) {
    return (
      'Resend (teste): o remetente é onboarding@resend.dev (não é Lucas/Rodrigo/AG). ' +
      'Só entrega no e-mail da conta Resend. Cadastre/use a conta Resend com ' +
      'agtransportes2020@outlook.com para a AG receber. Lucas/Rodrigo não são notificados.'
    );
  }
  if (/domain .* is not verified/i.test(message) || /not verified/i.test(message)) {
    return 'O domínio do MAIL_FROM ainda não está verificado no Resend (Domains).';
  }
  return undefined;
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
export async function notifyFirstRouteOfDay(payload: FirstRouteNotifyPayload): Promise<NotifyResult> {
  if (!mailConfigured()) {
    const result: NotifyResult = {
      sent: false,
      reason: 'mail_not_configured',
      hint:
        'Remetente: Resend (onboarding@resend.dev). Destinatário: só AG. Conta Resend deve ser agtransportes2020@outlook.com.',
    };
    lastNotifyResult = { ...result, at: new Date().toISOString() };
    console.warn('[notify] E-mail não configurado (RESEND_API_KEY ou SMTP_*).');
    return result;
  }

  const to = firstRouteNotifyRecipients();
  if (to.length === 0) {
    const result: NotifyResult = { sent: false, reason: 'no_recipients' };
    lastNotifyResult = { ...result, at: new Date().toISOString() };
    return result;
  }

  const { subject, text, html } = buildMessage(payload);
  const sentTo: string[] = [];
  const failed: { email: string; error: string }[] = [];

  try {
    if (preferResend()) {
      // Um destinatário por vez — falha de um não impede o log dos outros
      for (const email of to) {
        try {
          await sendViaResendOne(email, subject, text, html);
          sentTo.push(email);
        } catch (err) {
          const msg = (err as Error)?.message ?? String(err);
          failed.push({ email, error: msg });
          console.error(`[notify] Falha Resend → ${email}:`, msg);
        }
      }
    } else if (smtpConfigured()) {
      await sendViaSmtp(to, subject, text, html);
      sentTo.push(...to);
    }
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const result: NotifyResult = {
      sent: false,
      reason: 'send_failed',
      to,
      failed: to.map((email) => ({ email, error: msg })),
      hint:
        resendHintFromError(msg) ||
        'Remetente Resend / destinatário AG: a conta Resend precisa ser agtransportes2020@outlook.com (teste) ou domínio verificado.',
    };
    lastNotifyResult = { ...result, at: new Date().toISOString(), subject };
    console.error('[notify] Falha ao enviar e-mail do 1º roteiro:', msg);
    return result;
  }

  const result: NotifyResult = {
    sent: sentTo.length > 0,
    reason: sentTo.length === 0 ? 'send_failed' : failed.length ? 'partial' : undefined,
    to,
    sentTo,
    failed: failed.length ? failed : undefined,
    hint:
      failed.length > 0
        ? resendHintFromError(failed[0].error) || mailStatus().hint
        : undefined,
  };
  lastNotifyResult = { ...result, at: new Date().toISOString(), subject };
  if (sentTo.length) {
    console.log(`[notify] 1º roteiro — enviado para: ${sentTo.join(', ')}`);
  }
  if (failed.length) {
    console.error(
      `[notify] 1º roteiro — falhou para: ${failed.map((f) => f.email).join(', ')}`,
    );
  }
  return result;
}
