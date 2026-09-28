/**
 * §12 Adapter pattern — every external dependency = interface + production-quality mock (default) + env-gated real.
 */
import { MockLLMProvider, OpenAICompatProvider, parseMpesaSms, type LLMProvider } from '../_shared/duka.js';

const env = (k: string) => Deno.env.get(k) ?? '';

// ─── LLM ──────────────────────────────────────────────────────
export function llm(): LLMProvider {
  if (env('LLM_BASE_URL') && env('LLM_API_KEY')) return new OpenAICompatProvider({ baseUrl: env('LLM_BASE_URL'), apiKey: env('LLM_API_KEY'), model: env('LLM_MODEL') || 'gpt-4o-mini' });
  return new MockLLMProvider();
}

// ─── Messaging ────────────────────────────────────────────────
export interface OutMessage { to?: string; body: string; shopId: string; kind: 'reminder' | 'briefing' | 'report' | 'agent' }
export interface MessageChannel { name: string; send(m: OutMessage): Promise<{ ok: boolean; id?: string; error?: string }> }

/** Default: writes to agent_messages + alerts so the owner sees exactly what would have gone out. */
export class InAppChannel implements MessageChannel {
  name = 'inapp';
  constructor(private sink: (m: OutMessage) => Promise<void>) {}
  async send(m: OutMessage) { await this.sink(m); return { ok: true, id: crypto.randomUUID() }; }
}
/** Tests / local debugging. */
export class ConsoleAdapter implements MessageChannel { name = 'console'; sent: OutMessage[] = []; async send(m: OutMessage) { this.sent.push(m); console.log(`[${m.kind}] → ${m.to ?? 'owner'}: ${m.body}`); return { ok: true }; } }
/** Meta WhatsApp Cloud API. Env: WA_TOKEN, WA_PHONE_NUMBER_ID. Reminders outside the 24h window need an approved template (WA_TEMPLATE_REMINDER). */
export class WhatsAppCloudAdapter implements MessageChannel {
  name = 'whatsapp';
  async send(m: OutMessage) {
    if (!m.to) return { ok: false, error: 'no_recipient' };
    const to = m.to.replace(/^0/, '254').replace(/\D/g, '');
    const tpl = env('WA_TEMPLATE_REMINDER');
    const body = m.kind === 'reminder' && tpl
      ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl, language: { code: 'sw' }, components: [{ type: 'body', parameters: [{ type: 'text', text: m.body }] }] } }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.body } };
    const r = await fetch(`https://graph.facebook.com/v20.0/${env('WA_PHONE_NUMBER_ID')}/messages`, { method: 'POST', headers: { authorization: `Bearer ${env('WA_TOKEN')}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.messages?.[0]?.id } : { ok: false, error: j.error?.message ?? String(r.status) };
  }
}
export function channel(sink: (m: OutMessage) => Promise<void>): MessageChannel {
  return env('WA_TOKEN') && env('WA_PHONE_NUMBER_ID') ? new WhatsAppCloudAdapter() : new InAppChannel(sink);
}

// ─── Payments ─────────────────────────────────────────────────
export interface PaymentIngestor { name: string; toSmsText(payload: unknown): string | null }
/** Default: raw M-Pesa SMS (forwarded by an SMS-forwarder app or pasted). */
export class MpesaSmsIngestor implements PaymentIngestor { name = 'sms'; toSmsText(p: any) { const t = typeof p === 'string' ? p : p?.text; return t && parseMpesaSms(t).ok ? t : null; } }
/** Daraja C2B confirmation → normalised into the same SMS-shaped text so one matcher serves both. Env: DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE. */
export class DarajaC2BAdapter implements PaymentIngestor {
  name = 'daraja';
  toSmsText(p: any) {
    if (!p?.TransID || !p?.TransAmount) return null;
    const t = String(p.TransTime ?? ''); // YYYYMMDDHHmmss
    const d = t.length >= 12 ? `${+t.slice(6, 8)}/${+t.slice(4, 6)}/${t.slice(2, 4)} at ${((+t.slice(8, 10) + 11) % 12) + 1}:${t.slice(10, 12)} ${+t.slice(8, 10) >= 12 ? 'PM' : 'AM'}` : '';
    const name = [p.FirstName, p.MiddleName, p.LastName].filter(Boolean).join(' ').toUpperCase();
    return `${p.TransID} Confirmed. Ksh${p.TransAmount} received from ${p.MSISDN ?? ''} ${name} on ${d}. New Account balance is Ksh${p.OrgAccountBalance ?? 0}.`;
  }
}
export const darajaEnabled = () => !!(env('DARAJA_CONSUMER_KEY') && env('DARAJA_CONSUMER_SECRET'));
