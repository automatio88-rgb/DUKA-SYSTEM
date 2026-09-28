import { z } from 'zod';
/** Wire schemas validated at the API boundary (edge function) and in the sync engine. */
export const OpSchema = z.object({ id: z.string().uuid(), shop_id: z.string().uuid(), device_id: z.string().min(1), entity: z.string().min(1), entity_id: z.string().uuid(), op: z.enum(['upsert', 'delete']), payload_json: z.record(z.any()), client_ts: z.string() });
export const PushSchema = z.object({ ops: z.array(OpSchema).max(500) });
export const PinLoginSchema = z.object({ shopCode: z.string().min(3), userId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) });
export const SaleLineSchema = z.object({ productId: z.string().uuid(), qty: z.number().positive(), tier: z.enum(['regular', 'loyal', 'wholesale']).optional(), unitPrice: z.number().nonnegative().optional() });
export const SaleSchema = z.object({ id: z.string().uuid(), lines: z.array(SaleLineSchema), payment: z.object({ method: z.enum(['cash', 'mpesa', 'credit', 'split']), cash: z.number().optional(), mpesa: z.number().optional(), credit: z.number().optional(), customerId: z.string().uuid().nullish() }), discount: z.number().nonnegative().optional(), busyLump: z.number().positive().optional(), offlineAt: z.string().optional() });
export const SmsWebhookSchema = z.object({ text: z.string().min(10), shopId: z.string().uuid().optional() });
export const AgentMessageSchema = z.object({ text: z.string().min(1).max(500) });
