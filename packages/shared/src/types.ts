// Domain types shared by web (offline engine), edge API and tests.
export type UUID = string;
export type Role = 'owner' | 'staff';
export type LocationType = 'shop' | 'store';
export type MoveReason = 'purchase' | 'sale' | 'transfer' | 'adjustment' | 'expiry_writeoff' | 'count_correction';
export type PaymentMethod = 'cash' | 'mpesa' | 'credit' | 'split';
export type Tier = 'regular' | 'loyal' | 'wholesale';
export type Lang = 'en' | 'sw';

export interface Base { id: UUID; created_at: string; updated_at: string; deleted_at?: string | null; updated_by?: UUID | null }
export interface Shop extends Base { name: string; owner_name: string; phone: string; currency: 'KES'; language: Lang; mpesa_type: 'till' | 'paybill' | 'pochi' | 'personal'; settings_json: ShopSettings }
export interface MonthSummary { month: string; sales: number; cogs: number; expenses: number; cashIn: number; cashOut: number }
export interface ShopSettings { reminderDay: number; reminderMinBalance: number; busyMode: boolean; theme: 'dark' | 'light'; etimsPin?: string; history?: MonthSummary[]; lastBriefing?: string; lastEvening?: string }
export interface User extends Base { shop_id: UUID; name: string; phone?: string; role: Role; pin_hash: string; active: boolean }
export interface Location extends Base { shop_id: UUID; name: string; type: LocationType }
export interface Category extends Base { shop_id: UUID; name: string; sort: number }
export interface Product extends Base {
  shop_id: UUID; category_id: UUID; name: string; name_sw?: string; barcode?: string; image_url?: string;
  buy_unit: string; sell_unit: string; units_per_buy_unit: number; wastage_pct: number;
  cost_price: number; retail_price: number; wholesale_price?: number; loyal_price?: number;
  reorder_level: number; track_expiry: boolean; active: boolean;
}
export interface StockMove extends Base { shop_id: UUID; product_id: UUID; from_location?: UUID | null; to_location?: UUID | null; qty: number; reason: MoveReason; ref_id?: UUID | null; note?: string; user_id: UUID }
export interface StockBatch extends Base { product_id: UUID; location_id: UUID; qty: number; expiry_date: string; purchase_id?: UUID }
export interface Supplier extends Base { shop_id: UUID; name: string; phone?: string; notes?: string }
export interface Purchase extends Base { shop_id: UUID; supplier_id: UUID; invoice_no?: string; invoice_image_url?: string; total_cost: number; status: 'draft' | 'received'; paid_amount: number; due_date?: string }
export interface PurchaseItem extends Base { purchase_id: UUID; product_id: UUID; qty_buy_units: number; cost_per_buy_unit: number; expiry_date?: string }
export interface PriceHistory extends Base { product_id: UUID; supplier_id?: UUID; cost_price: number; recorded_at: string }
export interface Customer extends Base { shop_id: UUID; name: string; phone?: string; credit_limit?: number; notes?: string; tier: Tier }
export interface Sale extends Base {
  shop_id: UUID; user_id: UUID; customer_id?: UUID | null; total: number; discount: number; status: 'complete' | 'void';
  payment_method: PaymentMethod; mpesa_amount: number; cash_amount: number; credit_amount: number;
  device_id: string; offline_created_at: string; busy_lump?: boolean; reconciled?: boolean; mpesa_pending?: boolean; void_of?: UUID | null;
}
export interface SaleItem extends Base { sale_id: UUID; product_id: UUID; qty: number; unit_price: number; unit_cost_snapshot: number; price_tier: Tier }
export interface LedgerEntry extends Base { shop_id: UUID; customer_id: UUID; type: 'charge' | 'payment' | 'adjustment'; amount: number; balance_after: number; sale_id?: UUID | null; note?: string; user_id: UUID; method?: 'cash' | 'mpesa' }
export interface Reminder extends Base { shop_id: UUID; customer_id: UUID; channel: string; message: string; scheduled_at: string; sent_at?: string; status: 'queued' | 'sent'; escalation_level: 0 | 1 | 2 }
export interface PaymentInbox extends Base { shop_id: UUID; source: 'sms' | 'daraja' | 'manual'; raw_text?: string; mpesa_code?: string; payer_name?: string; payer_phone?: string; amount: number; tx_time: string; matched_sale_id?: UUID | null; matched_customer_id?: UUID | null; status: 'unmatched' | 'matched' | 'suspicious' | 'ignored'; flag?: string }
export interface CashSession extends Base { shop_id: UUID; user_id: UUID; opened_at: string; closed_at?: string | null; opening_float: number; expected_cash: number; counted_cash?: number | null; variance?: number | null; note?: string }
export interface Expense extends Base { shop_id: UUID; category: string; amount: number; note?: string; user_id: UUID; session_id?: UUID }
export interface StockCount extends Base { shop_id: UUID; location_id: UUID; section_name: string; status: 'open' | 'posted'; user_id: UUID }
export interface StockCountItem extends Base { count_id: UUID; product_id: UUID; expected_qty: number; counted_qty: number; variance: number }
export interface DemandLog extends Base { shop_id: UUID; text: string; product_guess?: string; user_id: UUID }
export interface AgentMessage extends Base { shop_id: UUID; channel: string; direction: 'in' | 'out'; body: string; intent?: string; tool_calls_json?: unknown; user_id?: UUID }
export interface Alert extends Base { shop_id: UUID; type: AlertType; severity: 'info' | 'warn' | 'critical'; title: string; body: string; data_json?: Record<string, unknown>; read_at?: string | null }
export type AlertType = 'shelf_low' | 'total_low' | 'expiry' | 'dead_stock' | 'credit_limit' | 'cash_gap' | 'payable_due' | 'unmatched_payment' | 'suspicious_payment' | 'count_variance' | 'reminder' | 'briefing';
export interface AuditLog extends Base { shop_id: UUID; user_id: UUID; action: string; entity: string; entity_id: UUID; before_json?: unknown; after_json?: unknown }
export interface OpLog { id: UUID; shop_id: UUID; device_id: string; entity: string; entity_id: UUID; op: 'upsert' | 'delete'; payload_json: unknown; client_ts: string; server_ts?: string }
