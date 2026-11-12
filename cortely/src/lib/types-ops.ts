/** Módulos P1/P2 — caixa, estoque, financeiro, pacotes, marketing, etc. */

export type PaymentMethod =
  | "pix"
  | "cash"
  | "debit"
  | "credit"
  | "voucher"
  | "other";

export type Product = {
  id: string;
  barbershop_id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  brand?: string | null;
  category: string;
  price: number;
  cost: number;
  stock_qty: number;
  min_stock: number;
  max_stock?: number;
  supplier_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type Supplier = {
  id: string;
  barbershop_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type StockMovement = {
  id: string;
  barbershop_id: string;
  product_id: string;
  delta: number;
  reason: string;
  created_at: string;
};

export type PurchaseOrderItem = {
  product_id: string;
  quantity: number;
  unit_cost: number;
};

export type PurchaseOrder = {
  id: string;
  barbershop_id: string;
  supplier_id: string;
  status: "draft" | "ordered" | "received" | "canceled";
  items: PurchaseOrderItem[];
  notes: string | null;
  total_cost: number;
  created_at: string;
  received_at: string | null;
};

export type CashSession = {
  id: string;
  barbershop_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_cash?: number | null;
  difference?: number | null;
  counted_by_method?: Record<string, number> | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

export type CashMovement = {
  id: string;
  cash_session_id: string;
  barbershop_id: string;
  type: "sangria" | "suprimento";
  amount: number;
  reason: string;
  created_by: string;
  created_at: string;
};

export type Sale = {
  id: string;
  barbershop_id: string;
  cash_session_id: string | null;
  client_id: string | null;
  client_name: string | null;
  barber_id: string | null;
  appointment_id: string | null;
  subtotal: number;
  discount: number;
  tip?: number;
  total: number;
  status: "paid" | "canceled" | "refunded";
  created_by: string;
  created_at: string;
  canceled_at?: string | null;
  cancel_reason?: string | null;
};

export type InventoryCount = {
  id: string;
  barbershop_id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number;
  difference: number;
  counted_by: string;
  created_at: string;
};

export type FiscalDocument = {
  id: string;
  barbershop_id: string;
  sale_id: string | null;
  doc_type: "nfc_e" | "nf_e" | "recibo";
  status: "draft" | "issued" | "canceled";
  payload: Record<string, unknown>;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  kind: "service" | "product" | "package";
  ref_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type SalePayment = {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
};

export type CommissionRule = {
  id: string;
  barbershop_id: string;
  barber_id: string | null;
  service_id: string | null;
  product_percent: number;
  service_percent: number;
};

export type CommissionEntry = {
  id: string;
  barbershop_id: string;
  barber_id: string;
  sale_id: string;
  amount: number;
  basis: number;
  percent: number;
  status: "pending" | "paid";
  created_at: string;
  paid_at: string | null;
};

/** Vale / adiantamento do profissional (referência Salon Soft). */
export type StaffAdvance = {
  id: string;
  barbershop_id: string;
  barber_id: string;
  amount: number;
  reason: string;
  status: "open" | "deducted";
  created_at: string;
  deducted_at: string | null;
};

export type BarberGoal = {
  id: string;
  barbershop_id: string;
  barber_id: string;
  month: string; // YYYY-MM
  revenue_target: number;
  services_target: number;
};

export type ServicePackage = {
  id: string;
  barbershop_id: string;
  name: string;
  description: string | null;
  price: number;
  credits: number;
  valid_days: number;
  service_ids: string[];
  is_active: boolean;
};

export type ClientPackage = {
  id: string;
  barbershop_id: string;
  client_id: string;
  package_id: string;
  credits_total: number;
  credits_left: number;
  expires_at: string;
  /** `canceled` só no adapter PG (1.B.5); JSON não emite. */
  status: "active" | "expired" | "depleted" | "canceled";
  purchased_at: string;
};

export type SubscriptionPlan = {
  id: string;
  barbershop_id: string;
  name: string;
  price_monthly: number;
  credits_per_month: number;
  is_active: boolean;
};

export type ClientSubscription = {
  id: string;
  barbershop_id: string;
  client_id: string;
  plan_id: string;
  status: "active" | "canceled" | "past_due";
  started_at: string;
  next_billing_at: string;
};

export type WaitlistEntry = {
  id: string;
  barbershop_id: string;
  client_name: string;
  client_phone: string;
  service_id: string | null;
  barber_id: string | null;
  preferred_date: string | null;
  notes: string | null;
  status: "waiting" | "offered" | "booked" | "canceled";
  created_at: string;
};

export type Payable = {
  id: string;
  barbershop_id: string;
  description: string;
  amount: number;
  due_date: string;
  category: string;
  status: "open" | "paid";
  paid_at: string | null;
};

export type Receivable = {
  id: string;
  barbershop_id: string;
  client_id: string | null;
  client_name: string;
  description: string;
  amount: number;
  due_date: string;
  status: "open" | "paid" | "overdue";
  paid_at: string | null;
};

export type Campaign = {
  id: string;
  barbershop_id: string;
  name: string;
  channel: "whatsapp";
  segment: "inactive" | "birthday" | "all" | "frequent";
  message: string;
  status: "draft" | "sent";
  sent_at: string | null;
  created_at: string;
};

export type Coupon = {
  id: string;
  barbershop_id: string;
  code: string;
  percent_off: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
};

export type Review = {
  id: string;
  barbershop_id: string;
  client_name: string;
  client_phone: string;
  appointment_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type AppointmentDeposit = {
  id: string;
  appointment_id: string;
  amount: number;
  method: PaymentMethod;
  status: "pending" | "paid" | "refunded";
  created_at: string;
};

export type ShopUnit = {
  id: string;
  name: string;
  slug: string;
  city: string;
  is_hq: boolean;
};

export type AuditEntry = {
  id: string;
  barbershop_id: string;
  actor: string;
  action: string;
  detail: string;
  created_at: string;
};

export type OpsSnapshot = {
  products: Product[];
  suppliers: Supplier[];
  stockMovements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  inventoryCounts: InventoryCount[];
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
  sales: Sale[];
  saleItems: SaleItem[];
  salePayments: SalePayment[];
  commissionRules: CommissionRule[];
  commissionEntries: CommissionEntry[];
  staffAdvances: StaffAdvance[];
  goals: BarberGoal[];
  packages: ServicePackage[];
  clientPackages: ClientPackage[];
  subscriptionPlans: SubscriptionPlan[];
  clientSubscriptions: ClientSubscription[];
  waitlist: WaitlistEntry[];
  payables: Payable[];
  receivables: Receivable[];
  campaigns: Campaign[];
  coupons: Coupon[];
  reviews: Review[];
  deposits: AppointmentDeposit[];
  units: ShopUnit[];
  auditLog: AuditEntry[];
  fiscalDocuments: FiscalDocument[];
};
