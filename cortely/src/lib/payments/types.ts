/**
 * Cortely 1.B.3-G — interface agnóstica de provedor (D7 / D12 / P5).
 * Nenhum provedor real nesta etapa.
 */

export type PaymentMethod = "pix" | "credit" | "debit";

export type PaymentIntentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled";

export type PaymentEventStatus = PaymentIntentStatus;

export type PaymentIntentRecord = {
  id: string;
  barbershop_id: string;
  provider: string;
  provider_ref: string;
  amount: number;
  method: PaymentMethod;
  currency: "BRL";
  status: PaymentIntentStatus;
  purpose: "sale" | "deposit" | "appointment" | "other";
};

export type ProviderAccount = {
  barbershop_id: string;
  provider: string;
  external_account_id: string;
  status: string;
};

export type CreateChargeResult = {
  provider_ref: string;
  checkout_url: string | null;
  qr_code: string | null;
  status: PaymentIntentStatus;
};

export type ParsedWebhookEvent = {
  provider_event_id: string;
  provider_ref: string;
  status: PaymentEventStatus;
  amount: number;
  /** Ignorado para tenant — tenant sempre vem da intent. */
  claimed_barbershop_id?: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  createCharge(
    intent: Pick<PaymentIntentRecord, "id" | "amount" | "method" | "purpose">,
    account: ProviderAccount,
  ): Promise<CreateChargeResult>;
  /** Comparação em tempo constante sobre o corpo BRUTO (antes do JSON.parse). */
  verifyWebhook(
    headers: Headers | Record<string, string>,
    rawBody: string | Buffer,
  ): boolean;
  parseEvent(rawBody: string | Buffer): ParsedWebhookEvent;
}
