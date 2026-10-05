// ../../packages/shared/src/money.ts
var toKsh = (n) => Math.round(n);
var sum = (xs) => xs.reduce((a, b) => a + b, 0);
function formatKsh(n, opts = {}) {
  const v = Math.round(n);
  const neg = v < 0;
  const abs = Math.abs(v);
  let body;
  if (opts.compact && abs >= 1e6) body = (abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  else if (opts.compact && abs >= 1e4) body = (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  else body = abs.toLocaleString("en-KE");
  const sign = neg ? "\u2212" : opts.sign && v > 0 ? "+" : "";
  return `${sign}KSh ${body}`;
}
var margin = (price, cost) => price <= 0 ? 0 : (price - cost) / price;
function costPerSellUnit(costPerBuyUnit, unitsPerBuyUnit, wastagePct = 0) {
  const yieldUnits = unitsPerBuyUnit * (1 - wastagePct / 100);
  if (yieldUnits <= 0) throw new Error("Invalid unit conversion");
  return Math.round(costPerBuyUnit / yieldUnits * 100) / 100;
}
function validateSplit(total, parts) {
  const s = toKsh(parts.cash) + toKsh(parts.mpesa) + toKsh(parts.credit);
  return { ok: s === toKsh(total), diff: toKsh(total) - s };
}

// ../../packages/shared/src/stock.ts
function deriveLevels(moves) {
  const levels = /* @__PURE__ */ new Map();
  const key = (p, l) => `${p}|${l}`;
  for (const m of moves) {
    if (m.deleted_at) continue;
    if (m.to_location) levels.set(key(m.product_id, m.to_location), (levels.get(key(m.product_id, m.to_location)) ?? 0) + m.qty);
    if (m.from_location) levels.set(key(m.product_id, m.from_location), (levels.get(key(m.product_id, m.from_location)) ?? 0) - m.qty);
  }
  return levels;
}
var levelOf = (levels, productId, locationId) => levels.get(`${productId}|${locationId}`) ?? 0;
function consumeFEFO(batches, qty) {
  const sorted = [...batches].filter((b) => b.qty > 0).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  let left = qty;
  const consumed = [];
  const next = sorted.map((b) => {
    if (left <= 0) return b;
    const take = Math.min(b.qty, left);
    left -= take;
    consumed.push({ id: b.id, qty: take });
    return { ...b, qty: b.qty - take };
  });
  return { batches: next, consumed, shortfall: Math.max(0, left) };
}
function daysUntil(dateIso, now = /* @__PURE__ */ new Date()) {
  const d = /* @__PURE__ */ new Date(dateIso + (dateIso.length === 10 ? "T00:00:00" : ""));
  return Math.ceil((d.getTime() - now.getTime()) / 864e5);
}
function expiryBand(days) {
  if (days <= 7) return 7;
  if (days <= 14) return 14;
  if (days <= 30) return 30;
  return null;
}
function expiryDiscount(days, price, cost) {
  const pct = days <= 7 ? 0.3 : days <= 14 ? 0.15 : 0.08;
  const suggested = Math.max(Math.ceil(cost), Math.round(price * (1 - pct)));
  return { pct: Math.round((price - suggested) / price * 100), price: suggested };
}

// ../../packages/shared/src/ledger.ts
function recomputeChain(entries) {
  const sorted = [...entries].filter((e) => !e.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  let bal = 0;
  return sorted.map((e) => {
    bal += e.type === "charge" ? e.amount : e.type === "payment" ? -e.amount : e.amount;
    return { ...e, balance_after: Math.round(bal) };
  });
}
function balances(entries) {
  const by = /* @__PURE__ */ new Map();
  for (const e of entries) {
    if (!by.has(e.customer_id)) by.set(e.customer_id, []);
    by.get(e.customer_id).push(e);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [c, es] of by) {
    const ch = recomputeChain(es);
    out.set(c, ch.length ? ch[ch.length - 1].balance_after : 0);
  }
  return out;
}
function creditCheck(balance, add, limit) {
  if (!limit) return { ok: true, over: 0 };
  const after = balance + add;
  return { ok: after <= limit, over: Math.max(0, after - limit) };
}
function escalationLevel(daysOutstanding) {
  return daysOutstanding >= 30 ? 2 : daysOutstanding >= 14 ? 1 : 0;
}

// ../../packages/shared/src/velocity.ts
function weekdayVelocity(sales, today = /* @__PURE__ */ new Date(), window = 28) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - window);
  const byDow = Array(7).fill(0);
  let total = 0;
  for (const s of sales) {
    const d = /* @__PURE__ */ new Date(s.date + "T12:00:00");
    if (d < start || d > today) continue;
    byDow[d.getDay()] += s.qty;
    total += s.qty;
  }
  const weeks = window / 7;
  const perDow = byDow.map((v) => v / weeks);
  const avg = total / window;
  return { avgPerDay: avg, perDow, total };
}
function forecast(perDow, days, from = /* @__PURE__ */ new Date()) {
  let s = 0;
  const d = new Date(from);
  for (let i = 0; i < days; i++) {
    d.setDate(d.getDate() + 1);
    s += perDow[d.getDay()];
  }
  return s;
}
function daysOfStock(onHand, avgPerDay) {
  if (avgPerDay <= 0) return onHand > 0 ? Infinity : 0;
  return onHand / avgPerDay;
}
function suggestOrder(p, from = /* @__PURE__ */ new Date()) {
  const lead = p.leadDays ?? 2, cover = p.coverDays ?? 7;
  const need = forecast(p.perDow, lead + cover, from) + p.reorderLevel;
  const gap = need - p.onHandTotal;
  if (gap <= 0) return 0;
  return Math.ceil(gap / p.unitsPerBuyUnit);
}
function stockSignal(shelf, store, reorderLevel, avgPerDay) {
  const shelfThreshold = Math.max(Math.ceil(avgPerDay * 1.5), Math.ceil(reorderLevel / 2));
  if (shelf + store <= reorderLevel) return "total_low";
  if (shelf <= shelfThreshold && store > 0) return "shelf_low";
  return "ok";
}

// ../../packages/shared/src/cash.ts
function expectedCash(i) {
  return Math.round(i.openingFloat + i.cashSales + i.cashDebtPayments - i.payouts);
}
function variance(expected, counted) {
  return Math.round(counted - expected);
}
function gapAlert(history, tolerance = 100) {
  const last = history[history.length - 1];
  if (!last) return null;
  if (last.variance < -tolerance) return { level: "critical", reason: "single_gap", amount: last.variance };
  const mine = history.filter((h) => h.user_id === last.user_id).slice(-5);
  const shorts = mine.filter((h) => h.variance < 0);
  if (shorts.length >= 3) return { level: "warn", reason: "pattern", amount: shorts.reduce((a, b) => a + b.variance, 0) };
  return null;
}

// ../../packages/shared/src/mpesa.ts
var CODE = /\b([A-Z0-9]{10})\b\s*Confirmed/i;
var AMOUNT = /(?:received|receive)\s+(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)|(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?received/i;
var DATE = /on\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
var BAL = /balance\s+is\s+(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)/i;
var PHONE = /(?:\+?254|0)(7\d{8}|1\d{8})/;
var MASKED = /(?:\+?254|0)\d{0,3}\s?\*{3,}\s?\d{3}/;
var num = (s) => Math.round(parseFloat(s.replace(/,/g, "")));
var title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
function parseMpesaSms(raw) {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };
  const code = text.match(CODE)?.[1]?.toUpperCase();
  if (!code) return { ok: false, reason: "no_code" };
  if (/\b(sent to|paid to|withdraw|You bought|airtime for)\b/i.test(text) && !/received/i.test(text)) return { ok: false, reason: "not_incoming" };
  const am = text.match(AMOUNT);
  if (!am) return { ok: false, reason: "no_amount" };
  const amount = num(am[1] ?? am[2]);
  const d = text.match(DATE);
  if (!d) return { ok: false, reason: "no_date" };
  let [, dd, mm, yy, hh, mi, ap] = d;
  let year = +yy;
  if (year < 100) year += 2e3;
  let hour = +hh % 12;
  if ((ap ?? "").toUpperCase() === "PM") hour += 12;
  if (!ap) hour = +hh;
  const txTime = new Date(year, +mm - 1, +dd, hour, +mi).toISOString();
  let payerName, payerPhone;
  const fromSeg = text.match(/from\s+(.+?)\s+on\s+\d/i)?.[1] ?? "";
  const ph = fromSeg.match(PHONE);
  if (ph) payerPhone = "0" + ph[1];
  else if (MASKED.test(fromSeg)) payerPhone = fromSeg.match(MASKED)[0].replace(/\s/g, "");
  payerName = title(fromSeg.replace(PHONE, "").replace(MASKED, "").replace(/[.,]/g, " ").replace(/\s+/g, " ")) || void 0;
  const kind = /via Pochi|business balance/i.test(text) ? "pochi" : /for account|account number|acc\.?\s/i.test(text) ? "paybill" : /Ksh[\d,.]+\s+received from|Account balance|Buy Goods|till/i.test(text) ? "till" : "send_money";
  const account = text.match(/for account\s+([A-Z0-9 -]+?)\s+on/i)?.[1]?.trim();
  const balM = text.match(BAL);
  return { ok: true, value: { code, amount, payerName, payerPhone, txTime, kind, account, balance: balM ? num(balM[1]) : void 0 } };
}
var phoneKey = (p) => (p ?? "").replace(/\D/g, "").slice(-9);
var nameTokens = (s) => s.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !["baba", "mama", "mzee", "shosh", "the"].includes(w));
function matchPayment(p, sales, customers, windowMin = 15) {
  const pk = phoneKey(p.payerPhone);
  if (pk.length === 9 && !p.payerPhone?.includes("*")) {
    const c = customers.find((c2) => phoneKey(c2.phone) === pk && c2.balance > 0);
    if (c) return { type: "customer", id: c.id, confidence: 0.95, why: "phone" };
  }
  const t = new Date(p.txTime).getTime();
  const sale = sales.filter((s) => s.mpesaPending && s.mpesa_amount === p.amount && Math.abs(new Date(s.created_at).getTime() - t) <= windowMin * 6e4).sort((a, b) => Math.abs(new Date(a.created_at).getTime() - t) - Math.abs(new Date(b.created_at).getTime() - t))[0];
  if (sale) return { type: "sale", id: sale.id, confidence: 0.85, why: "amount+time" };
  if (p.payerName) {
    const pt = nameTokens(p.payerName);
    const c = customers.filter((c2) => c2.balance > 0).find((c2) => nameTokens(c2.name).some((w) => pt.includes(w)) && p.amount <= c2.balance + 50);
    if (c) return { type: "customer", id: c.id, confidence: 0.7, why: "name+balance" };
  }
  return { type: "none" };
}
function suspiciousFlags(p, knownCodes, now = /* @__PURE__ */ new Date()) {
  const f = [];
  if (knownCodes.has(p.code)) f.push("duplicate_code");
  if (new Date(p.txTime).getTime() - now.getTime() > 10 * 6e4) f.push("future_time");
  if (!/^[A-Z]{2,3}[A-Z0-9]{7,8}$/.test(p.code) || /(\w)\1{5,}/.test(p.code)) f.push("odd_code");
  if (p.amount <= 0 || p.amount > 3e5) f.push("odd_amount");
  return f;
}

// ../../packages/shared/src/swnum.ts
var UNITS = { sifuri: 0, moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9 };
var TENS = { kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90 };
var MULT = { mia: 100, elfu: 1e3, laki: 1e5, milioni: 1e6 };
var SHENG = { mbao: 20, finje: 50, soo: 100, rwabe: 200, jiti: 1e3, ngiri: 1e3, thao: 1e3, kaa: 1e3, punch: 5e3 };
var EN = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1e3 };
var isNumWord = (w) => w in UNITS || w in TENS || w in MULT || w in SHENG || /^\d/.test(w) || w === "na";
function small(tokens, i) {
  const w = tokens[i];
  if (w in TENS) {
    if (tokens[i + 1] === "na" && tokens[i + 2] in UNITS) return [TENS[w] + UNITS[tokens[i + 2]], i + 3];
    return [TENS[w], i + 1];
  }
  if (w in UNITS) return [UNITS[w], i + 1];
  return [0, i];
}
function parseSwNumber(text) {
  const tokens = text.toLowerCase().replace(/[,?!.]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const m = w.match(/^(?:ksh|sh|kes)?(\d+(?:\.\d+)?)(k|bob|\/=)?$/);
    if (m) return { value: Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1e3 : 1)), start: i, end: i + 1 };
    if (w in SHENG) {
      let v = SHENG[w], j = i + 1;
      const [s, k] = small(tokens, j);
      if (s) {
        v *= s;
        j = k;
      }
      return { value: v, start: i, end: j };
    }
    if (w in EN) {
      let v = 0, cur = 0, j = i;
      while (j < tokens.length && (tokens[j] in EN || tokens[j] === "and")) {
        const t = tokens[j];
        if (t === "and") {
          j++;
          continue;
        }
        const n = EN[t];
        if (n === 100) cur = (cur || 1) * 100;
        else if (n === 1e3) {
          v += (cur || 1) * 1e3;
          cur = 0;
        } else cur += n;
        j++;
      }
      return { value: v + cur, start: i, end: j };
    }
    if (w in MULT || w in TENS || w in UNITS) {
      let total = 0, j = i;
      while (j < tokens.length) {
        const t = tokens[j];
        if (t in MULT) {
          const mult = MULT[t];
          j++;
          if (tokens[j] === "mia" && mult >= 1e3) {
            j++;
            const [s, k] = small(tokens, j);
            total += (s || 1) * 100 * mult;
            j = k;
          } else {
            const [s, k] = mult === 100 && tokens[j] in UNITS ? [UNITS[tokens[j]], j + 1] : small(tokens, j);
            total += (s || 1) * mult;
            j = k;
          }
        } else if (t in TENS || t in UNITS) {
          const [s, k] = small(tokens, j);
          total += s;
          j = k;
        } else if (t === "na") j++;
        else break;
      }
      return { value: total, start: i, end: j };
    }
  }
  return null;
}

// ../../packages/shared/src/intent.ts
var SW_HINTS = /\b(ya|la|za|wa|na|kwa|leo|deni|bei|nani|weka|andika|nimehamisha|kutoka|ameuliza|mteja|tuna|ngapi|amelipa|ripoti|habari|mambo|sasa|niko|agiza|elfu|mia|zaidi|nimeuza|hamisha|katoni|bidhaa|mauzo|sukari|maziwa|unga|mkate)\b/i;
var detectLang = (t) => SW_HINTS.test(t) ? "sw" : "en";
var titleCase = (s) => s.replace(/\s+/g, " ").trim().split(" ").map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
var UNIT_WORDS = { katoni: "carton", carton: "carton", cartons: "carton", box: "carton", boxes: "carton", gunia: "bag", bag: "bag", bags: "bag", magunia: "bag", pakiti: "packet", packet: "packet", packets: "packet", dozen: "dozen", dazani: "dozen", bale: "bale", bales: "bale", crate: "crate", kreti: "crate", pieces: "piece", piece: "piece", vipande: "piece", kilo: "kg", kg: "kg" };
function nameBeforeNumber(text, lead) {
  const m = text.match(lead);
  if (!m) return;
  const after = text.slice((m.index ?? 0) + m[0].length).trim().split(/\s+/);
  const out = [];
  for (const w of after) {
    const lw = w.toLowerCase().replace(/[,?.!]/g, "");
    if (isNumWord(lw) || /^(ksh|sh|bob|amelipa|ameleta|paid|of|shilingi)$/.test(lw)) break;
    out.push(w.replace(/[,?.!]/g, ""));
    if (out.length >= 4) break;
  }
  return out.length ? titleCase(out.join(" ")) : void 0;
}
function parseIntent(input) {
  const text = input.trim();
  const t = text.toLowerCase();
  const lang = detectLang(t);
  const n = parseSwNumber(t);
  const call = (tool, args = {}, confidence = 0.9) => ({ tool, args, lang, confidence });
  if (/^(habari|mambo|sasa|niaje|hello|hi|hey|good (morning|evening))\b/.test(t) && t.split(" ").length <= 4) return call("greeting");
  if (/^(help|msaada|saidia|unaweza kufanya nini|what can you do)/.test(t)) return call("help");
  if (/(nani\s+ana(ni)?dai|wanaodaiwa|who owes|list debt|madeni yote|debtors)/.test(t)) {
    const thr = /(zaidi ya|more than|over|above|juu ya)/.test(t) && n ? n.value : 0;
    return call("debtQuery", { minBalance: thr });
  }
  if (/(amelipa|ame lipa|amelipia|ameleta pesa|\bpaid\b|payment from)/.test(t) && n) {
    const m = text.match(/^(.*?)\s+(amelipa|ame lipa|amelipia|ameleta|paid)/i);
    const name = m ? titleCase(m[1].replace(/^(record|andika)\s+/i, "")) : nameBeforeNumber(text, /payment from\s+/i);
    return call("recordPayment", { customer: name, amount: n.value });
  }
  if (/(deni|mkopo|\bcredit\b|\bdebt\b|kopesha|amekopa)/.test(t) && !/(ngapi|how much|anadaiwa)/.test(t) && n) {
    const name = nameBeforeNumber(text, /(deni\s+(ya|la|kwa)|mkopo\s+(ya|wa|kwa)|credit\s+(for|to)|debt\s+(for|to)|kopesha)\s+/i) ?? nameBeforeNumber(text, /(andika|weka|add)\s+/i);
    return call("addCredit", { customer: name, amount: n.value });
  }
  if (/(anadaiwa|deni la .* ni ngapi|how much does .* owe|balance ya)/.test(t)) {
    const m = text.match(/^(.*?)\s+anadaiwa/i) ?? text.match(/does\s+(.*?)\s+owe/i) ?? text.match(/balance ya\s+(.*)/i);
    return call("debtQuery", { customer: m ? titleCase(m[1]) : void 0, minBalance: 0 });
  }
  if (/(hamisha|nimehamisha|transfer|moved|nimetoa .* store|leta kutoka store|rudisha)/.test(t)) {
    const toStore = /(kwenda store|kwenda stoo|to (the )?store|rudisha|back to store)/.test(t);
    const unitW = t.split(/\s+/).find((w) => w in UNIT_WORDS);
    const productPhrase = t.replace(/.*?(za|ya|of)\s+/, "").replace(/\s+(kutoka|from|kwenda|to)\s+.*$/, "");
    return call("transferStock", { qty: n?.value ?? 1, unit: unitW ? UNIT_WORDS[unitW] : "carton", product: productPhrase, from: toStore ? "duka" : "store", to: toStore ? "store" : "duka", direction: toStore ? "duka\u2192store" : "store\u2192duka" });
  }
  if (/(weka bei|badilisha bei|bei mpya|set (the )?price|change price|price of)/.test(t) && n) {
    const product = t.replace(/(weka|badilisha)\s+bei\s+(ya|la|za)?\s*/, "").replace(/set (the )?price (of|for)?\s*|change price (of|for)?\s*|price of\s*/, "").replace(/\s+(to|iwe|kuwa)?\s*(ksh|sh)?\s*\d.*$/, "").replace(/\s+(mia|elfu|hamsini|sitini|sabini|themanini|tisini|arobaini|thelathini|ishirini|kumi).*/, "").trim();
    return call("priceUpdate", { product, price: n.value });
  }
  if (/(ameuliza|ameulizia|anauliza|wameuliza|asked for|customer wants|hatuna|tumeishiwa na|out of)/.test(t)) {
    const what = text.replace(/^.*?(ameuliza|ameulizia|anauliza|wameuliza|asked for|wants|hatuna|tumeishiwa na|out of)\s*/i, "").replace(/[?.!]$/, "");
    return call("addDemandLog", { text: what || text });
  }
  if (/(ripoti ya wiki|weekly|wiki hii)/.test(t)) return call("weeklyReport");
  if (/(ripoti ya leo|report ya leo|daily report|today'?s report|mauzo ya leo|leo tumeuza|tumeuza ngapi|how did we do today|sales today|ripoti)/.test(t)) return call("dailyReport");
  if (/(agiza|draft (an )?order|reorder|order ya|tuagize|nini kinaisha)/.test(t)) return call("draftOrder", { supplier: nameBeforeNumber(text, /(kwa|from)\s+/i) });
  if (/(nimeuza|\bsold\b|record sale|uza)/.test(t)) {
    const product = t.replace(/(nimeuza|sold|record sale|uza)\s*/, "").split(/\s+/).filter((w) => !isNumWord(w) && !(w in UNIT_WORDS)).join(" ");
    return call("recordSale", { product, qty: n?.value ?? 1 });
  }
  if (/(tuna .* ngapi|zimebaki|imebaki|ngapi|how many|stock (ya|of)|do we have|iko store)/.test(t)) {
    const product = t.replace(/(tuna|how many|stock (ya|of)|do we have|zimebaki|imebaki|ngapi|iko store|\?|left|in stock)/g, " ").trim();
    return call("stockQuery", { product });
  }
  return call("unknown", { text }, 0.2);
}

// ../../packages/shared/src/fuzzy.ts
var norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function score(query, target) {
  const q = norm(query), t = norm(target);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  const words = t.split(" ");
  if (words.some((w) => w.startsWith(q))) return 80;
  if (t.includes(q)) return 70;
  const qt = q.split(" ");
  const hits = qt.filter((w) => words.some((x) => x.startsWith(w) || w.length > 3 && x.includes(w))).length;
  if (hits === qt.length) return 60;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  if (i === q.length) return 30 + Math.min(20, q.length * 2);
  return hits ? 20 * (hits / qt.length) : 0;
}
function fuzzySearch(items, query, limit = 30) {
  const q = query.trim();
  if (!q) return items.slice(0, limit);
  if (/^\d{6,}$/.test(q)) {
    const b = items.filter((i) => i.barcode === q);
    if (b.length) return b;
  }
  return items.map((i) => ({ i, s: Math.max(score(q, i.name), i.name_sw ? score(q, i.name_sw) - 2 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.i);
}
var PRODUCT_ALIASES = {
  maziwa: "milk",
  sukari: "sugar",
  unga: "unga",
  mkate: "bread",
  mafuta: "oil",
  sabuni: "soap",
  chumvi: "salt",
  chai: "tea",
  majani: "tea",
  mchele: "rice",
  kiberiti: "matches",
  maji: "water",
  mayai: "eggs",
  yai: "eggs",
  dawa: "panadol",
  "dawa ya meno": "colgate",
  mswaki: "toothbrush",
  pedi: "always",
  diapers: "pampers",
  nepi: "pampers",
  soda: "soda",
  siagi: "blue band",
  samli: "ghee",
  "unga wa ngano": "wheat",
  ngano: "wheat",
  mandazi: "mandazi",
  "formula ya watoto": "formula",
  maharagwe: "beans",
  dengu: "green grams",
  kahawa: "coffee",
  biskuti: "biscuits",
  karatasi: "tissue",
  tishu: "tissue",
  mkaa: "charcoal",
  kandili: "paraffin",
  mafuta_taa: "paraffin",
  vocha: "airtime",
  credo: "airtime"
};
function resolveProduct(items, phrase) {
  let p = norm(phrase);
  const keys = Object.keys(PRODUCT_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) if (p.includes(k.replace("_", " "))) {
    p = p.replace(k.replace("_", " "), PRODUCT_ALIASES[k]);
    break;
  }
  const tokens = p.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  let best;
  for (const i of items) {
    const s = Math.max(...tokens.map((t) => Math.max(score(t, i.name), i.name_sw ? score(t, i.name_sw) : 0)), score(p, i.name));
    if (s > 0 && (!best || s > best.s)) best = { i, s };
  }
  return best && best.s >= 60 ? best.i : void 0;
}
var STOP = /* @__PURE__ */ new Set(["za", "ya", "wa", "la", "the", "of", "kutoka", "from", "store", "duka", "katoni", "carton", "cartons", "mbili", "moja", "tatu", "nne", "tano", "bei", "weka"]);

// ../../packages/shared/src/permissions.ts
var STAFF = ["sell", "credit", "payment", "transfer", "count", "demand", "cash", "agent"];
var can = (role, a) => role === "owner" || STAFF.includes(a);
var PermissionError = class extends Error {
  constructor(action) {
    super(`forbidden:${action}`);
    this.action = action;
  }
};
function assertCan(role, a) {
  if (!can(role, a)) throw new PermissionError(a);
}

// ../../packages/shared/src/dates.ts
var pad = (n) => String(n).padStart(2, "0");
var dayKey = (d) => {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
var monthKey = (d) => dayKey(d).slice(0, 7);
var addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
var startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
var daysBetween = (a, b) => Math.floor((startOfDay(new Date(b)).getTime() - startOfDay(new Date(a)).getTime()) / 864e5);

// ../../packages/shared/src/engine.ts
var TABLES = ["shops", "users", "locations", "categories", "products", "stock_moves", "stock_batches", "suppliers", "purchases", "purchase_items", "price_history", "customers", "sales", "sale_items", "credit_ledger", "reminders", "payments_inbox", "cash_sessions", "expenses", "stock_counts", "stock_count_items", "demand_log", "agent_messages", "alerts", "audit_log"];
var emptyDataSet = () => Object.fromEntries(TABLES.map((t) => [t, []]));
var DomainError = class extends Error {
  constructor(code, data) {
    super(code);
    this.code = code;
    this.data = data;
  }
};
var uuid = () => globalThis.crypto.randomUUID();
var DukaEngine = class {
  constructor(db, ctx, newId = uuid) {
    this.db = db;
    this.ctx = ctx;
    this.newId = newId;
  }
  changes = [];
  levelCache = null;
  velCache = null;
  // ─── infrastructure ──────────────────────────────────────────
  now() {
    return this.ctx.now ? this.ctx.now() : /* @__PURE__ */ new Date();
  }
  iso() {
    return this.now().toISOString();
  }
  can(a) {
    return can(this.ctx.role, a);
  }
  drain() {
    const c = this.changes;
    this.changes = [];
    return c;
  }
  get shop() {
    return this.db.shops.find((s) => s.id === this.ctx.shopId);
  }
  loc(type) {
    const l = this.db.locations.find((l2) => l2.type === type && !l2.deleted_at);
    if (!l) throw new DomainError("no_location");
    return l.id;
  }
  product(id) {
    const p = this.db.products.find((p2) => p2.id === id);
    if (!p) throw new DomainError("no_product", { id });
    return p;
  }
  customer(id) {
    const c = this.db.customers.find((c2) => c2.id === id);
    if (!c) throw new DomainError("no_customer", { id });
    return c;
  }
  put(table, row, audit) {
    const arr = this.db[table];
    const ts = this.iso();
    row = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== void 0));
    const idx = row.id ? arr.findIndex((r) => r.id === row.id) : -1;
    const before = idx >= 0 ? arr[idx] : void 0;
    const full = { ...before ?? { id: row.id ?? this.newId(), created_at: ts, deleted_at: null }, ...row, updated_at: ts, updated_by: this.ctx.userId };
    if ("shop_id" in full || ["products", "customers", "sales", "stock_moves", "credit_ledger", "suppliers", "purchases", "alerts", "expenses", "demand_log", "reminders", "payments_inbox", "cash_sessions", "stock_counts", "agent_messages", "audit_log", "categories", "locations", "users"].includes(table)) full.shop_id = full.shop_id ?? this.ctx.shopId;
    if (idx >= 0) arr[idx] = full;
    else arr.push(full);
    this.changes.push({ table, row: full });
    if (table === "stock_moves") this.levelCache = null;
    if (table === "sale_items" || table === "sales") this.velCache = null;
    if (audit && table !== "audit_log") {
      this.put("audit_log", { user_id: this.ctx.userId, action: audit, entity: table, entity_id: full.id, before_json: before ?? null, after_json: full });
    }
    return full;
  }
  // ─── stock ───────────────────────────────────────────────────
  levels() {
    return this.levelCache ??= deriveLevels(this.db.stock_moves);
  }
  qty(productId, type) {
    return levelOf(this.levels(), productId, this.loc(type));
  }
  move(productId, qty, reason, from, to, refId, note) {
    return this.put("stock_moves", { product_id: productId, qty, reason, from_location: from, to_location: to, ref_id: refId ?? null, note, user_id: this.ctx.userId }, `stock.${reason}`);
  }
  shiftBatches(productId, fromLoc, qty, toLoc) {
    const batches = this.db.stock_batches.filter((b) => b.product_id === productId && b.location_id === fromLoc && !b.deleted_at);
    if (!batches.length) return;
    const { consumed } = consumeFEFO(batches, qty);
    for (const c of consumed) {
      const b = batches.find((x) => x.id === c.id);
      this.put("stock_batches", { id: b.id, qty: b.qty - c.qty });
      if (toLoc) {
        const twin = this.db.stock_batches.find((x) => x.product_id === productId && x.location_id === toLoc && x.expiry_date === b.expiry_date && !x.deleted_at);
        if (twin) this.put("stock_batches", { id: twin.id, qty: twin.qty + c.qty });
        else this.put("stock_batches", { product_id: productId, location_id: toLoc, qty: c.qty, expiry_date: b.expiry_date, purchase_id: b.purchase_id });
      }
    }
  }
  transfer(productId, qty, from = "store", note) {
    assertCan(this.ctx.role, "transfer");
    if (qty <= 0) throw new DomainError("bad_qty");
    const f = this.loc(from), to = this.loc(from === "store" ? "shop" : "store");
    const available = levelOf(this.levels(), productId, f);
    if (available < qty) throw new DomainError("insufficient_stock", { available });
    this.shiftBatches(productId, f, qty, to);
    return this.move(productId, qty, "transfer", f, to, void 0, note);
  }
  adjust(productId, type, delta, reason = "adjustment", note) {
    assertCan(this.ctx.role, reason === "count_correction" ? "count" : "adjust");
    const l = this.loc(type);
    if (delta < 0) this.shiftBatches(productId, l, -delta);
    return delta >= 0 ? this.move(productId, delta, reason, null, l, void 0, note) : this.move(productId, -delta, reason, l, null, void 0, note);
  }
  timeline(productId) {
    return this.db.stock_moves.filter((m) => m.product_id === productId && !m.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  // ─── velocity ────────────────────────────────────────────────
  dailyQty() {
    if (this.velCache) return this.velCache;
    const saleDay = /* @__PURE__ */ new Map();
    for (const s of this.db.sales) if (s.status === "complete") saleDay.set(s.id, dayKey(s.offline_created_at || s.created_at));
    const m = /* @__PURE__ */ new Map();
    for (const it of this.db.sale_items) {
      const d = saleDay.get(it.sale_id);
      if (!d) continue;
      if (!m.has(it.product_id)) m.set(it.product_id, /* @__PURE__ */ new Map());
      const pm = m.get(it.product_id);
      pm.set(d, (pm.get(d) ?? 0) + it.qty);
    }
    return this.velCache = m;
  }
  velocity(productId) {
    const pm = this.dailyQty().get(productId);
    return weekdayVelocity(pm ? [...pm].map(([date, qty]) => ({ date, qty })) : [], this.now());
  }
  topMovers(n = 40) {
    return this.db.products.filter((p) => p.active && !p.deleted_at).map((p) => ({ p, v: this.velocity(p.id).total })).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
  }
  // ─── POS ─────────────────────────────────────────────────────
  priceFor(p, tier = "regular") {
    return tier === "wholesale" && p.wholesale_price ? p.wholesale_price : tier === "loyal" && p.loyal_price ? p.loyal_price : p.retail_price;
  }
  sell(lines, pay, opts = {}) {
    assertCan(this.ctx.role, "sell");
    if (opts.id && this.db.sales.some((s) => s.id === opts.id)) return { sale: this.db.sales.find((s) => s.id === opts.id), warnings: ["duplicate_ignored"] };
    const warnings = [];
    const busy = opts.busyLump != null;
    if (!busy && !lines.length) throw new DomainError("empty_cart");
    const customer = pay.customerId ? this.customer(pay.customerId) : void 0;
    const tier = customer?.tier ?? "regular";
    const priced = lines.map((l) => {
      const p = this.product(l.productId);
      return { l, p, price: l.unitPrice ?? this.priceFor(p, l.tier ?? tier) };
    });
    const gross = busy ? toKsh(opts.busyLump) : toKsh(priced.reduce((a, x) => a + x.price * x.l.qty, 0));
    const discount = toKsh(opts.discount ?? 0);
    const total = gross - discount;
    let cash = 0, mpesa = 0, credit = 0;
    if (pay.method === "cash") cash = total;
    else if (pay.method === "mpesa") mpesa = total;
    else if (pay.method === "credit") credit = total;
    else {
      cash = toKsh(pay.cash ?? 0);
      mpesa = toKsh(pay.mpesa ?? 0);
      credit = toKsh(pay.credit ?? 0);
      const v = validateSplit(total, { cash, mpesa, credit });
      if (!v.ok) throw new DomainError("split_mismatch", { diff: v.diff });
    }
    if (credit > 0 && !customer) throw new DomainError("credit_needs_customer");
    if (customer && credit > 0) {
      const chk = creditCheck(this.balanceOf(customer.id), credit, customer.credit_limit);
      if (!chk.ok) warnings.push(`over_limit:${chk.over}`);
    }
    const sale = this.put("sales", {
      id: opts.id,
      user_id: this.ctx.userId,
      customer_id: customer?.id ?? null,
      total,
      discount,
      status: "complete",
      payment_method: pay.method,
      cash_amount: cash,
      mpesa_amount: mpesa,
      credit_amount: credit,
      device_id: this.ctx.deviceId,
      offline_created_at: opts.offlineAt ?? this.iso(),
      busy_lump: busy,
      reconciled: !busy,
      mpesa_pending: mpesa > 0 && !pay.mpesaConfirmed
    }, "sale.create");
    const duka = this.loc("shop");
    for (const { l, p, price } of priced) {
      this.put("sale_items", { sale_id: sale.id, product_id: p.id, qty: l.qty, unit_price: price, unit_cost_snapshot: p.cost_price, price_tier: l.tier ?? tier });
      if (levelOf(this.levels(), p.id, duka) < l.qty) warnings.push(`negative_stock:${p.name}`);
      this.shiftBatches(p.id, duka, l.qty);
      this.move(p.id, l.qty, "sale", duka, null, sale.id);
    }
    if (credit > 0 && customer) this.ledger(customer.id, "charge", credit, { saleId: sale.id, note: busy ? "busy-mode" : void 0 });
    return { sale, warnings };
  }
  voidSale(saleId, note) {
    assertCan(this.ctx.role, "void");
    const s = this.db.sales.find((x) => x.id === saleId);
    if (!s || s.status === "void") throw new DomainError("not_voidable");
    this.put("sales", { id: s.id, status: "void" }, "sale.void");
    const duka = this.loc("shop");
    for (const it of this.db.sale_items.filter((i) => i.sale_id === s.id)) this.move(it.product_id, it.qty, "adjustment", null, duka, s.id, "void");
    if (s.credit_amount > 0 && s.customer_id) this.ledger(s.customer_id, "adjustment", -s.credit_amount, { saleId: s.id, note: note ?? "void" });
  }
  reconcileLump(saleId, lines) {
    const s = this.db.sales.find((x) => x.id === saleId);
    if (!s?.busy_lump) throw new DomainError("not_lump");
    const duka = this.loc("shop");
    for (const l of lines) {
      const p = this.product(l.productId);
      this.put("sale_items", { sale_id: s.id, product_id: p.id, qty: l.qty, unit_price: l.unitPrice ?? p.retail_price, unit_cost_snapshot: p.cost_price, price_tier: "regular" });
      this.shiftBatches(p.id, duka, l.qty);
      this.move(p.id, l.qty, "sale", duka, null, s.id, "reconciled");
    }
    this.put("sales", { id: s.id, reconciled: true }, "sale.reconcile");
  }
  // ─── Kitabu ──────────────────────────────────────────────────
  addCustomer(c) {
    assertCan(this.ctx.role, "credit");
    return this.put("customers", { tier: "regular", ...c }, "customer.create");
  }
  findCustomer(name) {
    if (!name) return void 0;
    const n = name.toLowerCase().trim();
    const list = this.db.customers.filter((c) => !c.deleted_at);
    return list.find((c) => c.name.toLowerCase() === n) ?? list.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())) ?? list.find((c) => n.split(" ").filter((w) => w.length > 2 && !["baba", "mama", "mzee"].includes(w)).some((w) => c.name.toLowerCase().includes(w)));
  }
  ledgerOf(customerId) {
    return recomputeChain(this.db.credit_ledger.filter((e) => e.customer_id === customerId));
  }
  balanceOf(customerId) {
    const l = this.ledgerOf(customerId);
    return l.length ? l[l.length - 1].balance_after : 0;
  }
  balances() {
    const m = /* @__PURE__ */ new Map();
    for (const c of this.db.customers) m.set(c.id, this.balanceOf(c.id));
    return m;
  }
  ledger(customerId, type, amount, o = {}) {
    assertCan(this.ctx.role, type === "payment" ? "payment" : "credit");
    if (type !== "adjustment" && amount <= 0) throw new DomainError("bad_amount");
    const bal = this.balanceOf(customerId);
    const delta = type === "charge" ? amount : type === "payment" ? -amount : amount;
    return this.put("credit_ledger", { customer_id: customerId, type, amount: toKsh(amount), balance_after: toKsh(bal + delta), sale_id: o.saleId ?? null, note: o.note, method: o.method, user_id: this.ctx.userId }, `credit.${type}`);
  }
  addCredit(customerId, amount, note) {
    const c = this.customer(customerId);
    const chk = creditCheck(this.balanceOf(customerId), amount, c.credit_limit);
    const entry = this.ledger(customerId, "charge", amount, { note });
    if (!chk.ok) this.alert("credit_limit", "warn", `${c.name}: over limit`, `KSh ${chk.over} above limit`, { customerId, key: `limit:${customerId}:${dayKey(this.now())}` });
    return { entry, overLimit: chk.ok ? 0 : chk.over };
  }
  recordPayment(customerId, amount, method = "cash", note) {
    return this.ledger(customerId, "payment", amount, { method, note });
  }
  lastPaymentDays(customerId) {
    const l = this.db.credit_ledger.filter((e) => e.customer_id === customerId && !e.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastPay = [...l].reverse().find((e) => e.type === "payment");
    const ref = lastPay ?? l[0];
    return ref ? daysBetween(ref.created_at, this.now()) : 0;
  }
  debtors(min = 0) {
    return this.db.customers.filter((c) => !c.deleted_at).map((c) => ({ c, balance: this.balanceOf(c.id), days: this.lastPaymentDays(c.id) })).filter((x) => x.balance > min).sort((a, b) => b.balance - a.balance);
  }
  // ─── M-Pesa ──────────────────────────────────────────────────
  ingestSms(raw, source = "sms") {
    const r = parseMpesaSms(raw);
    if (!r.ok) throw new DomainError("mpesa_unparseable", { reason: r.reason });
    const p = r.value;
    const known = new Set(this.db.payments_inbox.map((x) => x.mpesa_code).filter(Boolean));
    const flags = suspiciousFlags(p, known, this.now());
    const base = { source, raw_text: raw, mpesa_code: p.code, payer_name: p.payerName, payer_phone: p.payerPhone, amount: p.amount, tx_time: p.txTime };
    if (flags.includes("duplicate_code")) {
      const row2 = this.put("payments_inbox", { ...base, status: "suspicious", flag: flags.join(",") }, "payment.suspicious");
      this.alert("suspicious_payment", "critical", `Duplicate M-Pesa ${p.code}`, `KSh ${p.amount} from ${p.payerName ?? "unknown"} was already recorded`, { paymentId: row2.id, key: `susp:${row2.id}` });
      return { payment: row2, match: { type: "none" }, flags };
    }
    const sales = this.db.sales.filter((s) => s.mpesa_pending && s.status === "complete").map((s) => ({ id: s.id, mpesa_amount: s.mpesa_amount, created_at: s.offline_created_at, mpesaPending: true }));
    const customers = this.db.customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: this.balanceOf(c.id) }));
    const match = matchPayment(p, sales, customers);
    const status = flags.length ? "suspicious" : match.type === "none" ? "unmatched" : "matched";
    const row = this.put("payments_inbox", { ...base, status, flag: flags.join(",") || void 0, matched_sale_id: match.type === "sale" ? match.id : null, matched_customer_id: match.type === "customer" ? match.id : null }, "payment.ingest");
    if (status === "matched") this.applyPayment(row);
    else if (status === "unmatched") this.alert("unmatched_payment", "info", `KSh ${p.amount} from ${p.payerName ?? p.payerPhone ?? "M-Pesa"}`, "Tap to put it against a debt", { paymentId: row.id, key: `unm:${row.id}` });
    return { payment: row, match, flags };
  }
  applyPayment(p) {
    if (p.matched_customer_id) {
      const bal = this.balanceOf(p.matched_customer_id);
      this.recordPayment(p.matched_customer_id, Math.min(p.amount, Math.max(bal, p.amount)), "mpesa", `M-Pesa ${p.mpesa_code}`);
    }
    if (p.matched_sale_id) this.put("sales", { id: p.matched_sale_id, mpesa_pending: false }, "sale.mpesa_confirmed");
  }
  assignPayment(paymentId, target) {
    const p = this.db.payments_inbox.find((x) => x.id === paymentId);
    if (!p) throw new DomainError("no_payment");
    const row = this.put("payments_inbox", { id: p.id, status: "matched", matched_customer_id: target.customerId ?? null, matched_sale_id: target.saleId ?? null }, "payment.assign");
    this.applyPayment(row);
    for (const a of this.db.alerts.filter((a2) => a2.data_json?.paymentId === p.id && !a2.read_at)) this.put("alerts", { id: a.id, read_at: this.iso() });
    return row;
  }
  ignorePayment(paymentId) {
    return this.put("payments_inbox", { id: paymentId, status: "ignored" }, "payment.ignore");
  }
  // ─── Cash sessions ───────────────────────────────────────────
  openSession(float) {
    assertCan(this.ctx.role, "cash");
    if (this.currentSession()) throw new DomainError("session_open");
    return this.put("cash_sessions", { user_id: this.ctx.userId, opened_at: this.iso(), opening_float: toKsh(float), expected_cash: toKsh(float) }, "cash.open");
  }
  currentSession() {
    return this.db.cash_sessions.find((s) => !s.closed_at && !s.deleted_at);
  }
  sessionFigures(s, until = this.iso()) {
    const inWin = (iso) => iso >= s.opened_at && iso <= until;
    const cashSales = this.db.sales.filter((x) => x.status === "complete" && inWin(x.offline_created_at)).reduce((a, x) => a + x.cash_amount, 0);
    const mpesaSales = this.db.sales.filter((x) => x.status === "complete" && inWin(x.offline_created_at)).reduce((a, x) => a + x.mpesa_amount, 0);
    const cashDebtPayments = this.db.credit_ledger.filter((e) => e.type === "payment" && e.method === "cash" && inWin(e.created_at)).reduce((a, e) => a + e.amount, 0);
    const payouts = this.db.expenses.filter((e) => inWin(e.created_at) && !e.deleted_at).reduce((a, e) => a + e.amount, 0);
    return { cashSales, mpesaSales, cashDebtPayments, payouts, expected: expectedCash({ openingFloat: s.opening_float, cashSales, cashDebtPayments, payouts }) };
  }
  addExpense(amount, category, note) {
    assertCan(this.ctx.role, "cash");
    return this.put("expenses", { amount: toKsh(amount), category, note, user_id: this.ctx.userId, session_id: this.currentSession()?.id }, "expense.create");
  }
  closeSession(counted, note) {
    const s = this.currentSession();
    if (!s) throw new DomainError("no_session");
    const f = this.sessionFigures(s);
    const v = variance(f.expected, counted);
    const row = this.put("cash_sessions", { id: s.id, closed_at: this.iso(), expected_cash: f.expected, counted_cash: toKsh(counted), variance: v, note }, "cash.close");
    const hist = this.db.cash_sessions.filter((x) => x.closed_at && x.variance != null).sort((a, b) => a.closed_at.localeCompare(b.closed_at)).map((x) => ({ user_id: x.user_id, variance: x.variance }));
    const g = gapAlert(hist);
    if (g) this.alert("cash_gap", g.level, g.reason === "pattern" ? "Repeated drawer shortages" : `Drawer short KSh ${Math.abs(v)}`, g.reason === "pattern" ? `Same person short 3 of last 5 closes, total KSh ${Math.abs(g.amount)}` : `Expected KSh ${f.expected}, counted KSh ${counted}`, { sessionId: s.id, key: `gap:${s.id}` });
    return { session: row, figures: f, variance: v };
  }
  // ─── Purchases & suppliers ───────────────────────────────────
  addSupplier(s) {
    assertCan(this.ctx.role, "purchase");
    return this.put("suppliers", s, "supplier.create");
  }
  createPurchase(supplierId, items, o = {}) {
    assertCan(this.ctx.role, "purchase");
    const total = toKsh(items.reduce((a, i) => a + i.qtyBuy * i.costPerBuy, 0));
    const pur = this.put("purchases", { id: o.id, supplier_id: supplierId, invoice_no: o.invoiceNo, total_cost: total, status: "draft", paid_amount: toKsh(o.paid ?? 0), due_date: o.dueDate }, "purchase.create");
    for (const i of items) this.put("purchase_items", { purchase_id: pur.id, product_id: i.productId, qty_buy_units: i.qtyBuy, cost_per_buy_unit: i.costPerBuy, expiry_date: i.expiry });
    return pur;
  }
  receivePurchase(purchaseId) {
    assertCan(this.ctx.role, "purchase");
    const pur = this.db.purchases.find((p) => p.id === purchaseId);
    if (!pur || pur.status === "received") throw new DomainError("not_receivable");
    const store = this.loc("store");
    for (const it of this.db.purchase_items.filter((i) => i.purchase_id === pur.id)) {
      const p = this.product(it.product_id);
      const units = it.qty_buy_units * p.units_per_buy_unit;
      this.move(p.id, units, "purchase", null, store, pur.id);
      if (p.track_expiry && it.expiry_date) this.put("stock_batches", { product_id: p.id, location_id: store, qty: units, expiry_date: it.expiry_date, purchase_id: pur.id });
      const cps = Math.round(it.cost_per_buy_unit / (p.units_per_buy_unit * (1 - (p.wastage_pct || 0) / 100)) * 100) / 100;
      this.put("price_history", { product_id: p.id, supplier_id: pur.supplier_id, cost_price: cps, recorded_at: this.iso() });
      this.put("products", { id: p.id, cost_price: cps }, "product.cost");
    }
    return this.put("purchases", { id: pur.id, status: "received" }, "purchase.receive");
  }
  payPurchase(purchaseId, amount) {
    const p = this.db.purchases.find((x) => x.id === purchaseId);
    return this.put("purchases", { id: p.id, paid_amount: p.paid_amount + toKsh(amount) }, "purchase.pay");
  }
  bestPrice(productId, days = 90) {
    const since = addDays(this.now(), -days).toISOString();
    const rows = this.db.price_history.filter((h) => h.product_id === productId && h.recorded_at >= since && h.supplier_id);
    const latest = /* @__PURE__ */ new Map();
    for (const r of rows.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) latest.set(r.supplier_id, r);
    const best = [...latest.values()].sort((a, b) => a.cost_price - b.cost_price)[0];
    return best ? { supplierId: best.supplier_id, cost: best.cost_price, supplier: this.db.suppliers.find((s) => s.id === best.supplier_id)?.name } : void 0;
  }
  payables() {
    return this.db.purchases.filter((p) => p.status === "received" && p.total_cost > p.paid_amount && !p.deleted_at).map((p) => ({ p, owed: p.total_cost - p.paid_amount, supplier: this.db.suppliers.find((s) => s.id === p.supplier_id)?.name ?? "" }));
  }
  // ─── Intelligence ────────────────────────────────────────────
  reorderList() {
    return this.db.products.filter((p) => p.active && !p.deleted_at).map((p) => {
      const v = this.velocity(p.id);
      const shelf = this.qty(p.id, "shop"), store = this.qty(p.id, "store");
      const signal = stockSignal(shelf, store, p.reorder_level, v.avgPerDay);
      const suggestBuy = signal === "total_low" ? Math.max(1, suggestOrder({ onHandTotal: shelf + store, perDow: v.perDow, unitsPerBuyUnit: p.units_per_buy_unit, reorderLevel: p.reorder_level }, this.now())) : 0;
      return { p, shelf, store, signal, avgPerDay: v.avgPerDay, daysLeft: daysOfStock(shelf + store, v.avgPerDay), suggestBuy, best: this.bestPrice(p.id) };
    }).filter((x) => x.signal !== "ok");
  }
  draftOrder(supplierId) {
    const items = this.reorderList().filter((r) => r.signal === "total_low" && (!supplierId || (r.best?.supplierId ?? supplierId) === supplierId));
    if (!items.length) return null;
    const bySup = supplierId ?? items[0].best?.supplierId ?? this.db.suppliers[0]?.id;
    return this.createPurchase(bySup, items.map((r) => ({ productId: r.p.id, qtyBuy: r.suggestBuy, costPerBuy: Math.round((r.best?.cost ?? r.p.cost_price) * r.p.units_per_buy_unit) })));
  }
  expiring(days = 30) {
    return this.db.stock_batches.filter((b) => b.qty > 0 && !b.deleted_at).map((b) => ({ b, p: this.product(b.product_id), days: daysUntil(b.expiry_date, this.now()) })).filter((x) => x.days <= days).sort((a, b) => a.days - b.days).map((x) => ({ ...x, band: expiryBand(x.days), discount: expiryDiscount(Math.max(x.days, 0), x.p.retail_price, x.p.cost_price), location: this.db.locations.find((l) => l.id === x.b.location_id)?.type }));
  }
  deadStock(days = 45) {
    const since = dayKey(addDays(this.now(), -days));
    const lastSold = /* @__PURE__ */ new Map();
    for (const [pid, m] of this.dailyQty()) lastSold.set(pid, [...m.keys()].sort().pop());
    return this.db.products.filter((p) => p.active && !p.deleted_at).map((p) => ({ p, qty: this.qty(p.id, "shop") + this.qty(p.id, "store"), last: lastSold.get(p.id) })).filter((x) => x.qty > 0 && (!x.last || x.last < since)).map((x) => ({ ...x, frozen: Math.round(x.qty * x.p.cost_price) })).sort((a, b) => b.frozen - a.frozen);
  }
  // ─── Stock-take & demand ─────────────────────────────────────
  startCount(type, section, productIds) {
    assertCan(this.ctx.role, "count");
    const c = this.put("stock_counts", { location_id: this.loc(type), section_name: section, status: "open", user_id: this.ctx.userId }, "count.start");
    for (const pid of productIds) this.put("stock_count_items", { count_id: c.id, product_id: pid, expected_qty: this.qty(pid, type), counted_qty: 0, variance: 0 });
    return c;
  }
  postCount(countId, counted) {
    const c = this.db.stock_counts.find((x) => x.id === countId);
    if (!c || c.status !== "open") throw new DomainError("count_closed");
    const type = this.db.locations.find((l) => l.id === c.location_id).type;
    let lossValue = 0;
    const vars = [];
    for (const it of this.db.stock_count_items.filter((i) => i.count_id === c.id)) {
      const got = counted[it.product_id] ?? it.expected_qty;
      const v = got - it.expected_qty;
      this.put("stock_count_items", { id: it.id, counted_qty: got, variance: v });
      if (v !== 0) {
        this.adjust(it.product_id, type, v, "count_correction", `count:${c.section_name}`);
        const p = this.product(it.product_id);
        if (v < 0) lossValue += -v * p.cost_price;
        vars.push({ name: p.name, variance: v });
      }
    }
    this.put("stock_counts", { id: c.id, status: "posted" }, "count.post");
    if (vars.length) this.alert("count_variance", lossValue > 200 ? "critical" : "warn", `Count ${c.section_name}: ${vars.length} off`, vars.map((v) => `${v.name} ${v.variance > 0 ? "+" : ""}${v.variance}`).join(", "), { countId: c.id, lossValue: Math.round(lossValue), key: `count:${c.id}` });
    return { variances: vars, lossValue: Math.round(lossValue) };
  }
  addDemand(text, guess) {
    assertCan(this.ctx.role, "demand");
    return this.put("demand_log", { text, product_guess: guess, user_id: this.ctx.userId }, "demand.add");
  }
  updatePrice(productId, price, tier = "regular") {
    assertCan(this.ctx.role, "price");
    const field = tier === "wholesale" ? "wholesale_price" : tier === "loyal" ? "loyal_price" : "retail_price";
    return this.put("products", { id: productId, [field]: toKsh(price) }, "product.price");
  }
  upsertProduct(p) {
    assertCan(this.ctx.role, "product");
    return this.put("products", { active: true, wastage_pct: 0, track_expiry: false, ...p }, p.id ? "product.update" : "product.create");
  }
  // ─── Alerts & jobs ───────────────────────────────────────────
  alert(type, severity, title2, body, data = {}) {
    const key = data.key;
    if (key && this.db.alerts.some((a) => a.data_json?.key === key)) return;
    return this.put("alerts", { type, severity, title: title2, body, data_json: data, read_at: null });
  }
  /** Runs all due jobs lazily (called on app focus + GET /jobs/tick). Idempotent via alert keys. */
  tick(templates) {
    const now = this.now();
    const today = dayKey(now);
    const week = `${now.getFullYear()}-w${Math.ceil((daysBetween(`${now.getFullYear()}-01-01`, now) + 1) / 7)}`;
    for (const r of this.reorderList()) {
      if (r.signal === "shelf_low") this.alert("shelf_low", "warn", r.p.name, `Shelf ${r.shelf}, store ${r.store}`, { productId: r.p.id, key: `shelf:${r.p.id}:${today}` });
      else this.alert("total_low", "critical", r.p.name, `Only ${r.shelf + r.store} left, ~${Math.max(0, Math.floor(r.daysLeft))} days`, { productId: r.p.id, suggest: r.suggestBuy, key: `total:${r.p.id}:${week}` });
    }
    for (const x of this.expiring(30)) this.alert("expiry", x.days <= 7 ? "critical" : "warn", x.p.name, `${x.b.qty} expire in ${x.days}d. Sell at KSh ${x.discount.price}`, { productId: x.p.id, batchId: x.b.id, days: x.days, key: `exp:${x.b.id}:${x.band}` });
    const dead = this.deadStock();
    if (dead.length) this.alert("dead_stock", "info", `${dead.length} dead-stock lines`, `KSh ${dead.reduce((a, d) => a + d.frozen, 0)} frozen`, { count: dead.length, key: `dead:${today.slice(0, 7)}` });
    for (const pp of this.payables()) if (pp.p.due_date && daysUntil(pp.p.due_date, now) <= 3) this.alert("payable_due", "warn", `Pay ${pp.supplier}`, `KSh ${pp.owed} due ${pp.p.due_date}`, { purchaseId: pp.p.id, key: `due:${pp.p.id}` });
    const s = this.shop.settings_json;
    if (now.getDay() === s.reminderDay) {
      for (const d of this.debtors(s.reminderMinBalance)) {
        if (this.db.reminders.some((r) => r.customer_id === d.c.id && dayKey(r.scheduled_at) === today)) continue;
        const level = escalationLevel(d.days);
        this.put("reminders", { customer_id: d.c.id, channel: d.c.phone ? "whatsapp" : "inapp", message: templates.reminder(d.c.name, d.balance, level, this.shop.language), scheduled_at: this.iso(), status: "queued", escalation_level: level }, "reminder.queue");
      }
    }
    if (now.getHours() >= 6 && s.lastBriefing !== today && templates.briefing) {
      this.alert("briefing", "info", "Morning briefing", templates.briefing(this), { key: `brief:${today}` });
      this.put("shops", { id: this.shop.id, settings_json: { ...this.shop.settings_json, lastBriefing: today } });
    }
    if (now.getHours() >= 21 && s.lastEvening !== today && templates.evening) {
      this.alert("briefing", "info", "Evening report", templates.evening(this), { key: `eve:${today}` });
      this.put("shops", { id: this.shop.id, settings_json: { ...this.shop.settings_json, lastEvening: today } });
    }
    return this.drain();
  }
};

// ../../packages/shared/src/reports.ts
function dayFigures(e, date = dayKey(e.now())) {
  const sales = e.db.sales.filter((s) => s.status === "complete" && dayKey(s.offline_created_at) === date);
  const ids = new Set(sales.map((s) => s.id));
  const items = e.db.sale_items.filter((i) => ids.has(i.sale_id));
  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const itemCogs = items.reduce((a, i) => a + i.qty * i.unit_cost_snapshot, 0);
  const itemRev = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const lumpRev = sales.filter((s) => s.busy_lump && !s.reconciled).reduce((a, s) => a + s.total, 0);
  const ratio = itemRev > 0 ? itemCogs / itemRev : 0.8;
  const cogs = Math.round(itemCogs + lumpRev * ratio);
  const expenses = e.db.expenses.filter((x) => dayKey(x.created_at) === date && !x.deleted_at).reduce((a, x) => a + x.amount, 0);
  const agg = /* @__PURE__ */ new Map();
  for (const i of items) {
    const a = agg.get(i.product_id) ?? { qty: 0, revenue: 0 };
    a.qty += i.qty;
    a.revenue += i.qty * i.unit_price;
    agg.set(i.product_id, a);
  }
  const top = [...agg].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([id, v]) => ({ name: e.db.products.find((p) => p.id === id)?.name ?? "?", ...v }));
  const byHour = Array(24).fill(0);
  for (const s of sales) byHour[new Date(s.offline_created_at).getHours()] += s.total;
  const creditCollected = e.db.credit_ledger.filter((l) => l.type === "payment" && dayKey(l.created_at) === date).reduce((a, l) => a + l.amount, 0);
  return { date, sales: revenue, cogs, gross: revenue - cogs, expenses, net: revenue - cogs - expenses, txns: sales.length, cash: sales.reduce((a, s) => a + s.cash_amount, 0), mpesa: sales.reduce((a, s) => a + s.mpesa_amount, 0), credit: sales.reduce((a, s) => a + s.credit_amount, 0), avgBasket: sales.length ? Math.round(revenue / sales.length) : 0, creditCollected, top, byHour };
}
function series(e, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayFigures(e, dayKey(addDays(e.now(), -i))));
  return out;
}
function cashPosition(e) {
  const s = e.currentSession();
  const drawer = s ? e.sessionFigures(s).expected : 0;
  const today = dayFigures(e);
  const receivables = e.debtors().reduce((a, d) => a + d.balance, 0);
  const payables = e.payables().reduce((a, p) => a + p.owed, 0);
  const mpesa = today.mpesa + e.db.credit_ledger.filter((l) => l.type === "payment" && l.method === "mpesa" && dayKey(l.created_at) === today.date).reduce((a, l) => a + l.amount, 0);
  return { drawer, mpesa, receivables, payables, net: drawer + mpesa + receivables - payables };
}
function profitTruth(e, days = 30) {
  const since = dayKey(addDays(e.now(), -days));
  const ok = new Set(e.db.sales.filter((s) => s.status === "complete" && dayKey(s.offline_created_at) >= since).map((s) => s.id));
  const m = /* @__PURE__ */ new Map();
  for (const i of e.db.sale_items) if (ok.has(i.sale_id)) {
    const a = m.get(i.product_id) ?? { revenue: 0, cost: 0, qty: 0 };
    a.revenue += i.qty * i.unit_price;
    a.cost += i.qty * i.unit_cost_snapshot;
    a.qty += i.qty;
    m.set(i.product_id, a);
  }
  const rows = e.db.products.map((p) => {
    const a = m.get(p.id) ?? { revenue: 0, cost: 0, qty: 0 };
    const onHand = e.qty(p.id, "shop") + e.qty(p.id, "store");
    return { p, ...a, profit: Math.round(a.revenue - a.cost), margin: a.revenue ? (a.revenue - a.cost) / a.revenue : (p.retail_price - p.cost_price) / p.retail_price, capital: Math.round(onHand * p.cost_price) };
  });
  const byCat = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const c = e.db.categories.find((c2) => c2.id === r.p.category_id);
    const key = c?.id ?? "x";
    const a = byCat.get(key) ?? { name: c?.name ?? "Other", revenue: 0, profit: 0 };
    a.revenue += r.revenue;
    a.profit += r.profit;
    byCat.set(key, a);
  }
  const sold = rows.filter((r) => r.qty > 0);
  return {
    top: [...sold].sort((a, b) => b.profit - a.profit).slice(0, 10),
    wasters: [...rows].filter((r) => r.capital > 0).sort((a, b) => a.profit / (a.capital || 1) - b.profit / (b.capital || 1)).slice(0, 10),
    categories: [...byCat.values()].sort((a, b) => b.profit - a.profit),
    totals: { revenue: Math.round(sold.reduce((a, r) => a + r.revenue, 0)), profit: sold.reduce((a, r) => a + r.profit, 0) }
  };
}
function loanPack(e) {
  const hist = e.shop.settings_json.history ?? [];
  const live = /* @__PURE__ */ new Map();
  for (const s of e.db.sales.filter((s2) => s2.status === "complete")) {
    const m = monthKey(s.offline_created_at);
    const r = live.get(m) ?? { month: m, sales: 0, cogs: 0, expenses: 0, cashIn: 0, cashOut: 0 };
    r.sales += s.total;
    r.cashIn += s.cash_amount + s.mpesa_amount;
    live.set(m, r);
  }
  const saleMonth = new Map(e.db.sales.map((s) => [s.id, monthKey(s.offline_created_at)]));
  for (const i of e.db.sale_items) {
    const m = saleMonth.get(i.sale_id);
    const r = m && live.get(m);
    if (r) r.cogs += i.qty * i.unit_cost_snapshot;
  }
  for (const x of e.db.expenses) {
    const r = live.get(monthKey(x.created_at));
    if (r) {
      r.expenses += x.amount;
      r.cashOut += x.amount;
    }
  }
  for (const p of e.db.purchases.filter((p2) => p2.status === "received")) {
    const r = live.get(monthKey(p.created_at));
    if (r) r.cashOut += p.paid_amount;
  }
  for (const l of e.db.credit_ledger.filter((l2) => l2.type === "payment")) {
    const r = live.get(monthKey(l.created_at));
    if (r) r.cashIn += l.amount;
  }
  const merged = new Map(hist.map((h) => [h.month, h]));
  for (const [m, r] of live) {
    const h = merged.get(m);
    merged.set(m, h ? { month: m, sales: h.sales + r.sales, cogs: h.cogs + r.cogs, expenses: h.expenses + r.expenses, cashIn: h.cashIn + r.cashIn, cashOut: h.cashOut + r.cashOut } : r);
  }
  const months = [...merged.values()].map((r) => ({ ...r, sales: Math.round(r.sales), cogs: Math.round(r.cogs) })).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  const totals = months.reduce((a, r) => ({ month: "total", sales: a.sales + r.sales, cogs: a.cogs + r.cogs, expenses: a.expenses + r.expenses, cashIn: a.cashIn + r.cashIn, cashOut: a.cashOut + r.cashOut }), { month: "total", sales: 0, cogs: 0, expenses: 0, cashIn: 0, cashOut: 0 });
  return { months, totals };
}
function missedDemand(e, days = 7) {
  const since = addDays(e.now(), -days).toISOString();
  const m = /* @__PURE__ */ new Map();
  for (const d of e.db.demand_log.filter((d2) => d2.created_at >= since)) {
    const key = (d.product_guess ?? d.text).toLowerCase().trim();
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).map(([text, count]) => ({ text, count }));
}
function weeklyNarrative(e, lang) {
  const thisW = series(e, 7), prev = [];
  for (let i = 13; i >= 7; i--) prev.push(dayFigures(e, dayKey(addDays(e.now(), -i))));
  const sum2 = (xs, f) => xs.reduce((a, x) => a + x[f], 0);
  const s = sum2(thisW, "sales"), ps = sum2(prev, "sales"), g = sum2(thisW, "gross");
  const ch = ps ? Math.round((s - ps) / ps * 100) : 0;
  const best = [...thisW].sort((a, b) => b.sales - a.sales)[0];
  const bestDay = (/* @__PURE__ */ new Date(best.date + "T12:00:00")).getDay();
  const pt = profitTruth(e, 7);
  const debt = e.debtors();
  const owed = debt.reduce((a, d) => a + d.balance, 0);
  const slow = debt.filter((d) => d.days >= 21).slice(0, 2);
  const re = e.reorderList().filter((r) => r.signal === "total_low").slice(0, 3);
  const dead = e.deadStock();
  const frozen = dead.reduce((a, d) => a + d.frozen, 0);
  const miss = missedDemand(e).slice(0, 2);
  const daysSw = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];
  const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const topName = pt.top[0]?.p.name, topProfit = pt.top[0]?.profit ?? 0;
  if (lang === "sw") {
    const p2 = [];
    p2.push(`Wiki hii umeuza ${formatKsh(s)}, ${ch >= 0 ? `juu ${ch}%` : `chini ${Math.abs(ch)}%`} kuliko wiki iliyopita. Faida ghafi ni karibu ${formatKsh(g)}. Siku bora ilikuwa ${daysSw[bestDay]} (${formatKsh(best.sales)}), kwa hivyo hakikisha rafu zimejaa kabla ya siku kama hiyo.`);
    if (topName) p2.push(`${topName} ndiyo iliyokuletea faida kubwa zaidi, ${formatKsh(topProfit)}. Usikubali ikaishe.`);
    p2.push(`Wateja wanakudai ${formatKsh(owed)} kwa jumla.${slow.length ? ` ${slow.map((d) => d.c.name).join(" na ")} hawajalipa kwa zaidi ya wiki tatu. Ukumbusho wa uzito umeandaliwa.` : " Wengi wanalipa vizuri."}`);
    if (re.length) p2.push(`Agiza mapema: ${re.map((r) => `${r.p.name} (${r.suggestBuy} ${r.p.buy_unit})`).join(", ")}.`);
    if (frozen > 0) p2.push(`Kuna ${formatKsh(frozen)} imelala kwa mzigo usiotoka siku 45. Fikiria punguzo au rudisha kwa msambazaji.`);
    if (miss.length) p2.push(`Wateja waliuliza ${miss.map((m) => `"${m.text}" (mara ${m.count})`).join(" na ")} lakini hukuwa nayo. Hiyo ni pesa iliyopita mlangoni.`);
    return { headline: ch >= 0 ? `Wiki nzuri: mauzo yamepanda ${ch}%` : `Wiki ngumu kidogo: mauzo chini ${Math.abs(ch)}%`, paragraphs: p2 };
  }
  const p = [];
  p.push(`You sold ${formatKsh(s)} this week, ${ch >= 0 ? `up ${ch}%` : `down ${Math.abs(ch)}%`} on last week, with roughly ${formatKsh(g)} gross profit. ${daysEn[bestDay]} was your best day at ${formatKsh(best.sales)}, so stock the shelves the night before.`);
  if (topName) p.push(`${topName} made you the most money: ${formatKsh(topProfit)}. Never let it run out.`);
  p.push(`Customers owe you ${formatKsh(owed)} in total.${slow.length ? ` ${slow.map((d) => d.c.name).join(" and ")} haven't paid in over three weeks; firm reminders are queued.` : " Most are paying on time."}`);
  if (re.length) p.push(`Order soon: ${re.map((r) => `${r.p.name} (${r.suggestBuy} ${r.p.buy_unit})`).join(", ")}.`);
  if (frozen > 0) p.push(`${formatKsh(frozen)} is sitting in stock that hasn't moved for 45 days. Discount it or send it back.`);
  if (miss.length) p.push(`Customers asked for ${miss.map((m) => `"${m.text}" (${m.count}\xD7)`).join(" and ")} and walked out empty-handed. That's money at the door.`);
  return { headline: ch >= 0 ? `Good week: sales up ${ch}%` : `Tougher week: sales down ${Math.abs(ch)}%`, paragraphs: p };
}

// ../../packages/shared/src/templates.ts
var REM = {
  sw: [
    (n, b, shop) => `Habari ${n}, ni ${shop} hapa. Tunakukumbusha kwa upole deni lako la ${formatKsh(b)}. Ukipata nafasi, unaweza kulipa kwa M-Pesa. Asante kwa kuwa mteja wetu!`,
    (n, b, shop) => `Habari ${n}. Deni lako kwa ${shop} ni ${formatKsh(b)} na limekaa muda. Tafadhali lipa wiki hii ili tuendelee kukuhudumia vizuri.`,
    (n, b, shop) => `${n}, deni lako la ${formatKsh(b)} kwa ${shop} limepita muda sana. Tafadhali lipa kufikia Jumamosi. Baada ya hapo hatutaweza kukupa bidhaa kwa deni.`
  ],
  en: [
    (n, b, shop) => `Hi ${n}, it's ${shop}. A gentle reminder that your balance is ${formatKsh(b)}. You can pay by M-Pesa whenever convenient. Thank you for shopping with us!`,
    (n, b, shop) => `Hello ${n}. Your balance at ${shop} is ${formatKsh(b)} and has been open a while. Please clear it this week so we can keep serving you.`,
    (n, b, shop) => `${n}, your balance of ${formatKsh(b)} at ${shop} is long overdue. Please pay by Saturday; after that we can't extend further credit.`
  ]
};
var reminderTemplate = (shop) => (name, bal, level, lang) => REM[lang][level](name, bal, shop);
function morningBriefing(e) {
  const lang = e.shop.language;
  const now = e.now();
  const y = dayFigures(e, dayKey(addDays(now, -1)));
  const lastWeekSame = dayFigures(e, dayKey(addDays(now, -7)));
  const low = e.reorderList();
  const shelf = low.filter((r) => r.signal === "shelf_low").length;
  const total = low.filter((r) => r.signal === "total_low").length;
  const cp = cashPosition(e);
  const exp = e.expiring(7).length;
  const cleared = e.db.credit_ledger.filter((l) => l.type === "payment" && l.balance_after === 0 && dayKey(l.created_at) === y.date).length;
  const owner = e.shop.owner_name.split(" ")[0];
  if (lang === "sw") return `Habari ya asubuhi ${owner}! Jana uliuza ${formatKsh(y.sales)} (faida ~${formatKsh(y.gross)}). Leo tarajia karibu ${formatKsh(lastWeekSame.sales)} kama wiki iliyopita. ${shelf ? `Bidhaa ${shelf} zinaisha rafuni lakini ziko stoo.` : ""} ${total ? `${total} zinahitaji kuagizwa.` : ""} ${exp ? `${exp} zinaharibika ndani ya siku 7.` : ""} ${cleared ? `Wateja ${cleared} walimaliza madeni jana.` : ""} Wateja wanakudai ${formatKsh(cp.receivables)}. Siku njema!`.replace(/\s+/g, " ").trim();
  return `Good morning ${owner}! Yesterday you sold ${formatKsh(y.sales)} (~${formatKsh(y.gross)} profit). Expect around ${formatKsh(lastWeekSame.sales)} today, like last week. ${shelf ? `${shelf} items are low on the shelf but in the store.` : ""} ${total ? `${total} need ordering.` : ""} ${exp ? `${exp} batches expire within 7 days.` : ""} ${cleared ? `${cleared} customers cleared their debts yesterday.` : ""} Customers owe you ${formatKsh(cp.receivables)}. Have a good day!`.replace(/\s+/g, " ").trim();
}
function eveningReport(e) {
  const lang = e.shop.language;
  const d = dayFigures(e);
  const top = d.top[0]?.name;
  if (lang === "sw") return `Ripoti ya Leo: mauzo ${formatKsh(d.sales)} kwa wateja ${d.txns}. Cash ${formatKsh(d.cash)}, M-Pesa ${formatKsh(d.mpesa)}, deni ${formatKsh(d.credit)}. Faida ghafi ~${formatKsh(d.gross)}. ${top ? `Iliyotoka sana: ${top}.` : ""} Madeni yaliyolipwa: ${formatKsh(d.creditCollected)}. Usisahau kuhesabu droo kabla ya kufunga.`;
  return `Today's report: ${formatKsh(d.sales)} across ${d.txns} sales. Cash ${formatKsh(d.cash)}, M-Pesa ${formatKsh(d.mpesa)}, credit ${formatKsh(d.credit)}. Gross profit ~${formatKsh(d.gross)}. ${top ? `Top seller: ${top}.` : ""} Debt collected: ${formatKsh(d.creditCollected)}. Count the drawer before you close.`;
}

// ../../packages/shared/src/agent.ts
var MockLLMProvider = class {
  name = "mock";
  async decide(text) {
    return parseIntent(text);
  }
};
var TOOL_SCHEMAS = [
  { name: "recordSale", description: "Record a cash sale of a product", parameters: { type: "object", properties: { product: { type: "string" }, qty: { type: "number" } }, required: ["product"] } },
  { name: "addCredit", description: "Add debt (kitabu) for a customer", parameters: { type: "object", properties: { customer: { type: "string" }, amount: { type: "number" } }, required: ["customer", "amount"] } },
  { name: "recordPayment", description: "Customer paid against their debt", parameters: { type: "object", properties: { customer: { type: "string" }, amount: { type: "number" } }, required: ["customer", "amount"] } },
  { name: "transferStock", description: "Move stock between store and duka", parameters: { type: "object", properties: { product: { type: "string" }, qty: { type: "number" }, unit: { type: "string", enum: ["carton", "bag", "packet", "dozen", "piece", "crate", "bale"] }, direction: { type: "string", enum: ["store\u2192duka", "duka\u2192store"] } }, required: ["product", "qty"] } },
  { name: "stockQuery", description: "How much of a product is left", parameters: { type: "object", properties: { product: { type: "string" } }, required: ["product"] } },
  { name: "debtQuery", description: "List debtors, optionally above a balance or one customer", parameters: { type: "object", properties: { minBalance: { type: "number" }, customer: { type: "string" } } } },
  { name: "priceUpdate", description: "Set retail price of a product", parameters: { type: "object", properties: { product: { type: "string" }, price: { type: "number" } }, required: ["product", "price"] } },
  { name: "dailyReport", description: "Today's sales report", parameters: { type: "object", properties: {} } },
  { name: "weeklyReport", description: "Weekly business review", parameters: { type: "object", properties: {} } },
  { name: "addDemandLog", description: "A customer asked for something we do not have", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "draftOrder", description: "Draft a purchase order for low stock", parameters: { type: "object", properties: { supplier: { type: "string" } } } }
];
var OpenAICompatProvider = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  name = "openai-compat";
  mock = new MockLLMProvider();
  async decide(text, ctx) {
    try {
      const r = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ model: this.cfg.model, temperature: 0, tools: TOOL_SCHEMAS.map((f) => ({ type: "function", function: f })), messages: [
          { role: "system", content: "You are Duka Brain, the business partner of a Kenyan duka owner. Understand Swahili, English and Sheng. Swahili number words: mia=100, elfu=1000. Always call exactly one tool." },
          { role: "user", content: text }
        ] })
      });
      const j = await r.json();
      const tc = j.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc) return this.mock.decide(text);
      return { tool: tc.function.name, args: JSON.parse(tc.function.arguments || "{}"), lang: parseIntent(text).lang ?? ctx.lang, confidence: 0.95 };
    } catch {
      return this.mock.decide(text);
    }
  }
};
var say = (lang, sw2, en2) => lang === "sw" ? sw2 : en2;
async function runAgent(e, text, llm = new MockLLMProvider()) {
  const call = await llm.decide(text, { lang: e.shop.language });
  const L = call.lang;
  const a = call.args;
  const prod = (q) => q ? resolveProduct(e.db.products.filter((p) => p.active && !p.deleted_at), q) : void 0;
  try {
    switch (call.tool) {
      case "greeting": {
        const d = dayFigures(e);
        return { call, ok: true, reply: say(L, `Poa sana! Leo umeuza ${formatKsh(d.sales)} kwa wateja ${d.txns}. Nikusaidie na nini?`, `Hey! You've sold ${formatKsh(d.sales)} across ${d.txns} sales today. What do you need?`) };
      }
      case "help":
        return { call, ok: true, reply: say(L, "Naweza: kuandika deni, kupokea malipo, kuhamisha mzigo kutoka stoo, kuweka bei, kukuambia nani anadaiwa, ripoti ya leo au ya wiki, na kuandika bidhaa wateja wanazoulizia.", "I can record debts and payments, move stock from the store, set prices, tell you who owes you, give today's or this week's report, and log what customers asked for.") };
      case "addCredit": {
        let c = e.findCustomer(a.customer);
        if (!c && a.customer) c = e.addCustomer({ name: a.customer });
        if (!c) return { call, ok: false, reply: say(L, "Deni la nani? Taja jina.", "Whose debt? Give me a name.") };
        const { entry, overLimit } = e.addCredit(c.id, a.amount, "via Duka Brain");
        return { call, ok: true, data: entry, reply: say(L, `Nimeandika deni la ${formatKsh(a.amount)} kwa ${c.name}. Sasa anadaiwa ${formatKsh(entry.balance_after)}.${overLimit ? ` Tahadhari: amezidi kikomo kwa ${formatKsh(overLimit)}.` : ""}`, `Added ${formatKsh(a.amount)} to ${c.name}'s tab. They now owe ${formatKsh(entry.balance_after)}.${overLimit ? ` Heads up: ${formatKsh(overLimit)} over their limit.` : ""}`) };
      }
      case "recordPayment": {
        const c = e.findCustomer(a.customer);
        if (!c) return { call, ok: false, reply: say(L, `Sijampata ${a.customer ?? "mteja huyo"} kwa kitabu.`, `Can't find ${a.customer ?? "that customer"} in the kitabu.`) };
        const entry = e.recordPayment(c.id, a.amount, "cash", "via Duka Brain");
        return { call, ok: true, data: entry, reply: entry.balance_after <= 0 ? say(L, `Safi! ${c.name} amemaliza deni lote.`, `Nice! ${c.name} has cleared their tab.`) : say(L, `Nimepokea ${formatKsh(a.amount)} kutoka kwa ${c.name}. Bado anadaiwa ${formatKsh(entry.balance_after)}.`, `Got ${formatKsh(a.amount)} from ${c.name}. ${formatKsh(entry.balance_after)} still owed.`) };
      }
      case "transferStock": {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, `Sijui bidhaa "${a.product}". Jaribu jina lingine.`, `I don't know "${a.product}". Try another name.`) };
        const units = a.unit && ["carton", "bag", "bale", "crate", "dozen"].includes(a.unit) ? a.qty * (a.unit === "dozen" ? 12 : p.units_per_buy_unit) : a.qty;
        const from = a.direction === "duka\u2192store" ? "shop" : "store";
        e.transfer(p.id, units, from, "via Duka Brain");
        return { call, ok: true, reply: say(L, `Sawa. ${a.qty} ${a.unit === "carton" ? "katoni" : a.unit ?? ""} za ${p.name_sw ?? p.name} (${units} ${p.sell_unit}) zimehamishwa ${from === "store" ? "kutoka stoo kwenda dukani" : "kwenda stoo"}. Rafuni sasa: ${e.qty(p.id, "shop")}, stoo: ${e.qty(p.id, "store")}.`, `Done. Moved ${a.qty} ${a.unit ?? ""} of ${p.name} (${units} ${p.sell_unit}) ${from === "store" ? "from the store to the shelf" : "back to the store"}. Shelf: ${e.qty(p.id, "shop")}, store: ${e.qty(p.id, "store")}.`) };
      }
      case "stockQuery": {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, "Bidhaa gani?", "Which product?") };
        const s = e.qty(p.id, "shop"), st = e.qty(p.id, "store");
        const v = e.velocity(p.id).avgPerDay;
        return { call, ok: true, data: { shelf: s, store: st }, reply: say(L, `${p.name}: ${s} rafuni, ${st} stoo. ${v > 0 ? `Inatosha kama siku ${Math.floor((s + st) / v)}.` : ""}`, `${p.name}: ${s} on the shelf, ${st} in the store. ${v > 0 ? `About ${Math.floor((s + st) / v)} days' worth.` : ""}`) };
      }
      case "debtQuery": {
        if (a.customer) {
          const c = e.findCustomer(a.customer);
          if (!c) return { call, ok: false, reply: say(L, "Sijampata.", "Not found.") };
          const b = e.balanceOf(c.id);
          return { call, ok: true, reply: say(L, `${c.name} anadaiwa ${formatKsh(b)}.`, `${c.name} owes ${formatKsh(b)}.`) };
        }
        const list = e.debtors(a.minBalance ?? 0);
        if (!list.length) return { call, ok: true, data: [], reply: say(L, "Hakuna anayedaiwa kiasi hicho. Safi!", "Nobody owes that much. Clean book!") };
        const lines = list.slice(0, 8).map((d) => `\u2022 ${d.c.name}: ${formatKsh(d.balance)}${d.days > 14 ? say(L, ` (siku ${d.days})`, ` (${d.days}d)`) : ""}`).join("\n");
        const tot = list.reduce((s, d) => s + d.balance, 0);
        return { call, ok: true, data: list.map((d) => ({ name: d.c.name, balance: d.balance })), reply: say(L, `Wateja ${list.length} wanadaiwa${a.minBalance ? ` zaidi ya ${formatKsh(a.minBalance)}` : ""}, jumla ${formatKsh(tot)}:
${lines}`, `${list.length} customers owe${a.minBalance ? ` over ${formatKsh(a.minBalance)}` : ""}, ${formatKsh(tot)} total:
${lines}`) };
      }
      case "priceUpdate": {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, `Sijui bidhaa "${a.product}".`, `Unknown product "${a.product}".`) };
        const old = p.retail_price;
        e.updatePrice(p.id, a.price);
        const m = Math.round((a.price - p.cost_price) / a.price * 100);
        return { call, ok: true, reply: say(L, `Bei ya ${p.name} sasa ni ${formatKsh(a.price)} (ilikuwa ${formatKsh(old)}). Faida kwa kila moja: ${m}%.`, `${p.name} is now ${formatKsh(a.price)} (was ${formatKsh(old)}). Margin: ${m}%.`) };
      }
      case "dailyReport": {
        const d = dayFigures(e);
        return { call, ok: true, data: d, reply: say(L, `Ripoti ya Leo
Mauzo: ${formatKsh(d.sales)} (wateja ${d.txns})
Cash ${formatKsh(d.cash)} \xB7 M-Pesa ${formatKsh(d.mpesa)} \xB7 Deni ${formatKsh(d.credit)}
Faida ghafi: ~${formatKsh(d.gross)}
${d.top[0] ? `Iliyotoka sana: ${d.top[0].name}` : ""}`, `Today's report
Sales: ${formatKsh(d.sales)} (${d.txns} sales)
Cash ${formatKsh(d.cash)} \xB7 M-Pesa ${formatKsh(d.mpesa)} \xB7 Credit ${formatKsh(d.credit)}
Gross profit: ~${formatKsh(d.gross)}
${d.top[0] ? `Top seller: ${d.top[0].name}` : ""}`).trim() };
      }
      case "weeklyReport": {
        const w = weeklyNarrative(e, L);
        return { call, ok: true, data: w, reply: `${w.headline}

${w.paragraphs.join("\n\n")}` };
      }
      case "addDemandLog": {
        const g = prod(a.text);
        e.addDemand(a.text, g?.name);
        return { call, ok: true, reply: say(L, `Nimeandika: "${a.text}". Nitakuonyesha kwa ripoti ya wiki kama wengi wanaiulizia.`, `Logged "${a.text}". I'll flag it in the weekly review if more people ask.`) };
      }
      case "draftOrder": {
        const po = e.draftOrder();
        if (!po) return { call, ok: true, reply: say(L, "Hakuna kinachohitaji kuagizwa sasa.", "Nothing needs ordering right now.") };
        const n = e.db.purchase_items.filter((i) => i.purchase_id === po.id).length;
        const sup = e.db.suppliers.find((s) => s.id === po.supplier_id)?.name;
        return { call, ok: true, data: po, reply: say(L, `Nimeandaa agizo la bidhaa ${n} kwa ${sup}, jumla ${formatKsh(po.total_cost)}. Liangalie kwa Mzigo.`, `Drafted an order of ${n} items for ${sup}, ${formatKsh(po.total_cost)} total. Review it under Deliveries.`) };
      }
      case "recordSale": {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, "Umeuza nini?", "Sold what?") };
        const { sale } = e.sell([{ productId: p.id, qty: a.qty ?? 1 }], { method: "cash" });
        return { call, ok: true, data: sale, reply: say(L, `Nimeweka mauzo: ${a.qty ?? 1} \xD7 ${p.name} = ${formatKsh(sale.total)} cash.`, `Recorded: ${a.qty ?? 1} \xD7 ${p.name} = ${formatKsh(sale.total)} cash.`) };
      }
      default:
        return { call, ok: false, reply: say(L, 'Sijaelewa vizuri. Jaribu: "Andika deni ya Mama Njeri 300" au "Ripoti ya leo".', `Didn't catch that. Try "Add credit for Mama Njeri 300" or "daily report".`) };
    }
  } catch (err) {
    if (err instanceof PermissionError) return { call, ok: false, reply: say(L, "Hii ni ya mwenye duka tu.", "Only the owner can do that.") };
    if (err instanceof DomainError && err.code === "insufficient_stock") return { call, ok: false, reply: say(L, `Stoo haina za kutosha (ziko ${err.data.available}).`, `Not enough in the store (${err.data.available} available).`) };
    return { call, ok: false, reply: say(L, "Kuna shida kidogo. Jaribu tena.", "Something went wrong. Try again.") };
  }
}

// ../../packages/shared/src/auth.ts
async function hashPin(shopId, pin) {
  const data = new TextEncoder().encode(`duka:v1:${shopId}:${pin}`);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function verifyPin(shopId, pin, hash) {
  return await hashPin(shopId, pin) === hash;
}
var isValidPin = (pin) => /^\d{4}$/.test(pin);

// ../../packages/shared/src/catalog.ts
var CATALOG = {
  "Unga & Cereals": [
    ["Jogoo Maize Meal 2kg", "Unga Jogoo 2kg", "bale", "packet", 12, 158, 175, 12, 0, 14],
    ["Soko Maize Meal 2kg", "Unga Soko 2kg", "bale", "packet", 12, 152, 170, 12, 0, 9],
    ["Pembe Maize Meal 2kg", "Unga Pembe 2kg", "bale", "packet", 12, 150, 165, 6, 0, 4],
    ["Exe Wheat Flour 2kg", "Unga wa Ngano Exe 2kg", "bale", "packet", 12, 170, 190, 6, 0, 5],
    ["Ajab Home Baking Flour 2kg", "Ngano Ajab 2kg", "bale", "packet", 12, 168, 185, 6, 0, 3],
    ["Pishori Rice 1kg", "Mchele Pishori 1kg", "bag", "kg", 25, 175, 200, 10, 0, 6],
    ["Sindano Rice (loose)", "Mchele Sindano", "bag", "kg", 50, 118, 140, 15, 0, 7],
    ["Beans Rosecoco (loose)", "Maharagwe Rosecoco", "bag", "kg", 90, 145, 170, 10, 0, 4],
    ["Green Grams (loose)", "Dengu", "bag", "kg", 50, 160, 190, 5, 0, 2],
    ["Weetabix 450g", "Weetabix 450g", "carton", "packet", 12, 335, 380, 3, 0, 0.6],
    ["Spaghetti Santa Lucia 400g", "Tambi 400g", "carton", "packet", 20, 88, 105, 5, 0, 1.5]
  ],
  "Sugar & Salt": [
    ["Mumias Sugar (loose)", "Sukari Mumias", "bag", "kg", 50, 142, 165, 20, 0, 18],
    ["Kabras Sugar 1kg", "Sukari Kabras 1kg", "bale", "packet", 24, 150, 170, 12, 0, 6],
    ["Kensalt 500g", "Chumvi Kensalt 500g", "bale", "packet", 24, 22, 30, 12, 0, 5],
    ["Kensalt 1kg", "Chumvi Kensalt 1kg", "bale", "packet", 24, 40, 50, 6, 0, 2]
  ],
  "Cooking Oil & Fats": [
    ["Kasuku Cooking Fat 500g", "Kasuku 500g", "carton", "piece", 24, 158, 180, 8, 0, 5],
    ["Kasuku Cooking Fat 1kg", "Kasuku 1kg", "carton", "piece", 12, 305, 345, 4, 0, 2],
    ["Elianto Cooking Oil 1L", "Mafuta Elianto 1L", "carton", "bottle", 12, 330, 375, 4, 0, 2.5],
    ["Fresh Fri Oil 500ml", "Mafuta Fresh Fri 500ml", "carton", "bottle", 24, 165, 190, 6, 0, 3],
    ["Rina Oil 1L", "Mafuta Rina 1L", "carton", "bottle", 12, 290, 330, 4, 0, 2],
    ["Blue Band 250g", "Blue Band 250g", "carton", "piece", 24, 118, 140, 6, 180, 3],
    ["Blue Band 500g", "Blue Band 500g", "carton", "piece", 12, 225, 260, 3, 180, 1.2],
    ["KCC Gold Crown Ghee 500g", "Samli KCC 500g", "carton", "piece", 12, 520, 590, 2, 240, 0.5],
    ["Kimbo 500g", "Kimbo 500g", "carton", "piece", 24, 165, 190, 4, 0, 1.8]
  ],
  "Dairy & Bread": [
    ["Brookside Milk ESL 500ml", "Maziwa Brookside 500ml", "carton", "packet", 24, 55, 65, 24, 21, 22],
    ["KCC Milk 500ml", "Maziwa KCC 500ml", "carton", "packet", 24, 52, 62, 12, 5, 10],
    ["Tuzo Milk 500ml", "Maziwa Tuzo 500ml", "carton", "packet", 24, 53, 63, 12, 5, 7],
    ["Brookside Yoghurt 250ml", "Mtindi Brookside 250ml", "carton", "piece", 12, 58, 70, 6, 12, 3],
    ["Fresh Mala 500ml", "Mala 500ml", "carton", "packet", 12, 58, 70, 6, 7, 2.5],
    ["Supaloaf White Bread 400g", "Mkate Supaloaf 400g", "crate", "loaf", 12, 57, 65, 10, 3, 16],
    ["Festive Bread 400g", "Mkate Festive 400g", "crate", "loaf", 12, 56, 65, 8, 3, 9],
    ["Eggs (tray of 30)", "Mayai trei", "tray", "piece", 30, 14, 17, 30, 21, 20]
  ],
  "Beverages": [
    ["Coca-Cola 500ml", "Coke 500ml", "crate", "bottle", 24, 58, 70, 12, 180, 12],
    ["Fanta Orange 500ml", "Fanta 500ml", "crate", "bottle", 24, 58, 70, 12, 180, 8],
    ["Sprite 500ml", "Sprite 500ml", "crate", "bottle", 24, 58, 70, 6, 180, 5],
    ["Stoney Tangawizi 500ml", "Stoney 500ml", "crate", "bottle", 24, 58, 70, 6, 180, 4],
    ["Maltina Can 330ml", "Maltina 330ml", "carton", "can", 24, 82, 100, 6, 270, 3],
    ["Dasani Water 500ml", "Maji Dasani 500ml", "carton", "bottle", 24, 32, 50, 12, 365, 6],
    ["Keringet Water 1L", "Maji Keringet 1L", "carton", "bottle", 12, 58, 80, 6, 365, 2],
    ["Ketepa Pride Tea 100g", "Majani Ketepa 100g", "carton", "packet", 40, 62, 75, 10, 0, 6],
    ["Kericho Gold Tea 250g", "Majani Kericho Gold", "carton", "packet", 24, 190, 220, 3, 0, 1],
    ["Nescaf\xE9 Classic 50g", "Kahawa Nescafe 50g", "carton", "piece", 24, 245, 290, 2, 0, 0.5],
    ["Drinking Chocolate Cadbury 125g", "Cadbury 125g", "carton", "piece", 24, 215, 250, 2, 0, 0.4],
    ["Minute Maid Mango 400ml", "Juice Minute Maid", "carton", "bottle", 12, 70, 85, 4, 120, 1.8],
    ["Afia Juice 500ml", "Juice Afia 500ml", "carton", "bottle", 12, 72, 90, 4, 120, 1.5],
    ["Red Bull 250ml", "Red Bull 250ml", "carton", "can", 24, 170, 210, 2, 300, 0]
  ],
  "Soap & Detergents": [
    ["Sunlight 2in1 Powder 1kg", "Sunlight 1kg", "bale", "packet", 12, 265, 300, 4, 0, 2.5],
    ["Sunlight 2in1 Powder 500g", "Sunlight 500g", "bale", "packet", 24, 138, 160, 6, 0, 4],
    ["Omo Multi Active 500g", "Omo 500g", "bale", "packet", 24, 148, 170, 6, 0, 3],
    ["Ariel Powder 500g", "Ariel 500g", "bale", "packet", 24, 175, 200, 4, 0, 1.5],
    ["Toss Powder 500g", "Toss 500g", "bale", "packet", 24, 95, 115, 6, 0, 2.5],
    ["Menengai Bar Soap 800g", "Sabuni Menengai", "carton", "bar", 20, 175, 200, 5, 0, 3],
    ["Jamaa Bar Soap 800g", "Sabuni Jamaa", "carton", "bar", 20, 170, 195, 5, 0, 2],
    ["Kipande Bar Soap (quarter)", "Kipande cha sabuni", "bar", "piece", 4, 45, 55, 8, 0, 5],
    ["Harpic 500ml", "Harpic 500ml", "carton", "bottle", 12, 240, 280, 2, 0, 0.5],
    ["Jik Bleach 750ml", "Jik 750ml", "carton", "bottle", 12, 145, 170, 3, 0, 1],
    ["Sunlight Dishwash 400ml", "Sunlight ya vyombo", "carton", "bottle", 12, 95, 115, 3, 0, 1.2],
    ["Downy Fabric Softener 500ml", "Downy 500ml", "carton", "bottle", 12, 290, 340, 2, 0, 0]
  ],
  "Personal Care": [
    ["Colgate Toothpaste 70g", "Dawa ya meno Colgate", "carton", "piece", 48, 88, 110, 6, 0, 2.5],
    ["Close Up Toothpaste 70g", "Close Up 70g", "carton", "piece", 48, 85, 105, 4, 0, 1],
    ["Geisha Soap 125g", "Sabuni Geisha", "carton", "bar", 48, 58, 70, 8, 0, 3],
    ["Imperial Leather 175g", "Imperial Leather", "carton", "bar", 36, 110, 130, 4, 0, 1],
    ["Dettol Soap 90g", "Sabuni Dettol", "carton", "bar", 48, 95, 115, 4, 0, 1.5],
    ["Nivea Body Lotion 200ml", "Nivea 200ml", "carton", "bottle", 12, 360, 420, 2, 0, 0.4],
    ["Vaseline Petroleum Jelly 100ml", "Vaseline 100ml", "carton", "piece", 24, 145, 170, 3, 0, 1],
    ["Always Pads Maxi Thick", "Pedi Always", "carton", "packet", 24, 95, 115, 6, 0, 2],
    ["Softcare Pads", "Pedi Softcare", "carton", "packet", 24, 62, 80, 6, 0, 1.5],
    ["Gillette Blue II Razor", "Wembe Gillette", "box", "piece", 24, 38, 50, 5, 0, 1],
    ["Sure Deodorant 150ml", "Sure 150ml", "carton", "piece", 12, 285, 340, 2, 0, 0],
    ["Toothbrush Colgate Zigzag", "Mswaki Colgate", "box", "piece", 12, 55, 70, 4, 0, 0.8]
  ],
  "Health": [
    ["Panadol Extra (strip)", "Panadol", "box", "strip", 12, 38, 50, 10, 400, 4],
    ["Mara Moja (strip)", "Mara Moja", "box", "strip", 20, 18, 25, 10, 400, 3],
    ["Hedex (strip)", "Hedex", "box", "strip", 20, 28, 40, 6, 400, 1.5],
    ["Dawanol (strip)", "Dawanol", "box", "strip", 20, 22, 30, 5, 400, 0.8],
    ["Strepsils (pack of 2)", "Strepsils", "box", "pack", 24, 38, 50, 4, 400, 0.6],
    ["Durex Condoms 3s", "Durex", "box", "pack", 12, 150, 200, 2, 500, 0.5],
    ["ORS Sachet", "ORS", "box", "sachet", 50, 12, 20, 5, 400, 0.3]
  ],
  "Baby": [
    ["Pampers Size 4 (single)", "Nepi Pampers", "pack", "piece", 50, 21, 30, 20, 0, 6],
    ["Huggies Dry Size 3 (single)", "Nepi Huggies", "pack", "piece", 44, 20, 28, 15, 0, 3],
    ["Johnson Baby Jelly 100ml", "Johnson Jelly", "carton", "piece", 24, 150, 180, 2, 0, 0.4],
    ["Nan Formula 400g", "Nan 400g", "carton", "tin", 12, 1250, 1400, 1, 300, 0],
    ["Cerelac Maize 400g", "Cerelac 400g", "carton", "tin", 12, 520, 600, 1, 200, 0.3]
  ],
  "Snacks": [
    ["Tropical Heat Crisps 50g", "Crisps Tropical", "carton", "packet", 48, 38, 50, 12, 90, 5],
    ["Nuvita Biscuits 100g", "Biskuti Nuvita", "carton", "packet", 48, 22, 30, 12, 150, 6],
    ["Marie Biscuits 200g", "Biskuti Marie", "carton", "packet", 36, 48, 60, 6, 150, 2],
    ["Manji Digestive 200g", "Manji Digestive", "carton", "packet", 36, 62, 75, 4, 150, 1],
    ["Orbit Chewing Gum", "Big G Orbit", "box", "piece", 50, 18, 25, 10, 300, 3],
    ["Patco Sweets (per piece)", "Pipi Patco", "jar", "piece", 100, 3, 5, 50, 300, 15],
    ["Cadbury Dairy Milk 45g", "Chokoleti Cadbury", "box", "piece", 24, 110, 140, 3, 200, 0.8],
    ["Groundnuts 50g", "Njugu 50g", "pack", "packet", 50, 14, 20, 10, 60, 4],
    ["Mandazi (from supplier)", "Mandazi", "tray", "piece", 40, 8, 10, 20, 2, 25],
    ["Chevda Mixture 100g", "Chevda", "carton", "packet", 24, 42, 55, 5, 60, 0]
  ],
  "Household": [
    ["Rooster Matches (box)", "Kiberiti Rooster", "bale", "box", 100, 3, 5, 30, 0, 8],
    ["Paraffin (litre)", "Mafuta taa", "drum", "litre", 200, 165, 185, 20, 0, 4],
    ["Charcoal (tin)", "Mkaa", "bag", "tin", 12, 38, 50, 12, 0, 5],
    ["Rosy Toilet Paper (single)", "Tishu Rosy", "bale", "roll", 40, 22, 30, 10, 0, 6],
    ["Candles Kenpoly (piece)", "Mshumaa", "box", "piece", 48, 12, 20, 10, 0, 2],
    ["Eveready Battery AA (pair)", "Betri AA", "box", "pair", 24, 38, 50, 4, 0, 1],
    ["Doom Insect Killer 300ml", "Doom", "carton", "can", 12, 310, 360, 2, 0, 0.5],
    ["Mosquito Coils Tiger", "Dawa ya mbu", "carton", "pack", 60, 22, 30, 10, 0, 2],
    ["Plastic Bags (per piece)", "Mfuko", "bundle", "piece", 100, 1, 2, 50, 0, 0],
    ["Steel Wool Sponge", "Sufuria scrub", "box", "piece", 24, 18, 25, 5, 0, 0.8],
    ["Superglue", "Gundi", "box", "piece", 24, 25, 40, 2, 0, 0],
    ["Torch Bulb", "Balbu ya tochi", "box", "piece", 20, 15, 30, 2, 0, 0]
  ],
  "Airtime & Services": [
    ["Safaricom Airtime KSh 20", "Credo Saf 20", "bundle", "card", 100, 19, 20, 50, 0, 18],
    ["Safaricom Airtime KSh 50", "Credo Saf 50", "bundle", "card", 100, 47.5, 50, 30, 0, 9],
    ["Safaricom Airtime KSh 100", "Credo Saf 100", "bundle", "card", 50, 95, 100, 20, 0, 4],
    ["Airtel Airtime KSh 50", "Credo Airtel 50", "bundle", "card", 50, 47, 50, 10, 0, 2]
  ],
  "Tobacco & Misc": [
    ["Sportsman Cigarettes (stick)", "Sigara Sportsman", "carton", "stick", 200, 12, 15, 40, 0, 20],
    ["Embassy Kings (stick)", "Sigara Embassy", "carton", "stick", 200, 14, 20, 20, 0, 6],
    ["Omo Sachet 40g", "Omo kidogo", "bale", "sachet", 144, 9, 12, 30, 0, 10],
    ["Royco Mchuzi Mix 10g", "Royco", "box", "sachet", 100, 4, 5, 30, 0, 9],
    ["Tomato Paste Sachet 70g", "Nyanya ya kopo kidogo", "box", "sachet", 50, 22, 30, 10, 300, 3],
    ["Tea Masala Sachet", "Masala ya chai", "box", "sachet", 50, 8, 10, 10, 0, 1.5],
    ["Baking Powder Zesta 100g", "Baking powder", "carton", "piece", 24, 55, 70, 3, 0, 0.8],
    ["Blueband Sachet 25g", "Blue Band kidogo", "carton", "sachet", 96, 14, 20, 20, 60, 4],
    ["Salad Tomatoes (kg)", "Nyanya", "crate", "kg", 20, 70, 100, 5, 5, 4],
    ["Onions (kg)", "Vitunguu", "bag", "kg", 13, 85, 120, 5, 21, 4],
    ["Sukuma Wiki (bunch)", "Sukuma", "bundle", "bunch", 20, 10, 15, 10, 2, 12]
  ]
};

// ../../packages/shared/src/seed.ts
function rng(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var DOW_FACTOR = [0.85, 0.9, 0.88, 0.92, 1, 1.2, 1.45];
var DEMO_PINS = { owner: "1234", staff: "0000" };
async function buildDemo(now = /* @__PURE__ */ new Date(), opts = {}) {
  const r = rng(20240928);
  const db = emptyDataSet();
  const id = () => globalThis.crypto.randomUUID();
  const at = (d) => d.toISOString();
  const base = (d) => ({ id: id(), created_at: at(d), updated_at: at(d), deleted_at: null });
  const start = addDays(now, -31);
  start.setHours(7, 0, 0, 0);
  const shopId = id(), ownerId = id(), staffId = id();
  const history = [];
  for (let m = 5; m >= 1; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 15);
    const s = Math.round(31e4 + r() * 7e4 + (5 - m) * 9e3);
    const cogs = Math.round(s * (0.79 + r() * 0.02));
    const ex = Math.round(22e3 + r() * 6e3);
    history.push({ month: monthKey(d), sales: s, cogs, expenses: ex, cashIn: Math.round(s * 0.93), cashOut: cogs + ex });
  }
  db.shops.push({ ...base(start), id: shopId, name: "Juma General Stores", owner_name: "Juma Mwangi", phone: "0712345678", currency: "KES", language: opts.lang ?? "sw", mpesa_type: "till", settings_json: { reminderDay: 6, reminderMinBalance: 200, busyMode: false, theme: "dark", history } });
  db.users.push({ ...base(start), id: ownerId, shop_id: shopId, name: "Juma Mwangi", phone: "0712345678", role: "owner", pin_hash: await hashPin(shopId, DEMO_PINS.owner), active: true });
  db.users.push({ ...base(start), id: staffId, shop_id: shopId, name: "Brian Otieno", phone: "0798111222", role: "staff", pin_hash: await hashPin(shopId, DEMO_PINS.staff), active: true });
  const duka = { ...base(start), shop_id: shopId, name: "Duka", type: "shop" };
  const store = { ...base(start), shop_id: shopId, name: "Store", type: "store" };
  db.locations.push(duka, store);
  const vel = /* @__PURE__ */ new Map();
  const expDays = /* @__PURE__ */ new Map();
  let sort = 0;
  for (const [cat, rows] of Object.entries(CATALOG)) {
    const c = { ...base(start), shop_id: shopId, name: cat, sort: sort++ };
    db.categories.push(c);
    for (const [name, sw2, bu, su, upb, cost, retail, rl, exp, v] of rows) {
      const p = { ...base(start), shop_id: shopId, category_id: c.id, name, name_sw: sw2, barcode: String(61611e8 + db.products.length * 7919).slice(0, 13), buy_unit: bu, sell_unit: su, units_per_buy_unit: upb, wastage_pct: /loose|kg\)/i.test(name) ? 2 : 0, cost_price: cost, retail_price: retail, wholesale_price: Math.round(retail - (retail - cost) * 0.45), loyal_price: Math.round(retail - (retail - cost) * 0.2), reorder_level: rl, track_expiry: exp > 0, active: true };
      db.products.push(p);
      vel.set(p.id, v);
      if (exp) expDays.set(p.id, exp);
    }
  }
  const P = (n) => db.products.find((p) => p.name.startsWith(n));
  const custSpec = [["Baba Kevin", "0722334455", 3e3, "loyal"], ["Mama Njeri", "0711223344", 2e3, "loyal"], ["Mzee Kamau", "0733445566", 5e3, "regular"], ["Mama Akinyi", "0701556677", 1500, "regular"], ["Otieno Boda", "0799887766", 1e3, "regular"], ["Wanjiku Salon", "0745112233", 4e3, "wholesale"], ["Mama Mboga Rose", "0768990011", 3e3, "wholesale"], ["Kevin Fundi", "0712778899", 1500, "regular"], ["Shiro", "0723667788", 1e3, "regular"], ["Baba Brayo", "0790223344", 2e3, "regular"], ["Mwalimu Achieng", "0708112299", 3e3, "loyal"], ["Hassan Kibanda", "0727445500", 2500, "regular"], ["Nyambura", "0719003322", 1e3, "regular"], ["Mama Faith", "0741556688", 1500, "regular"], ["Mutua Watchman", "0736778800", 800, "regular"]];
  for (const [name, phone, lim, tier] of custSpec) db.customers.push({ ...base(start), shop_id: shopId, name, phone, credit_limit: lim, tier });
  const sups = [["Bidco & Unga Distributors", "0720100200"], ["Kamau Wholesalers Gikomba", "0721300400"], ["Mwangi & Sons Supplies", "0722500600"]].map(([name, phone]) => ({ ...base(start), shop_id: shopId, name, phone }));
  db.suppliers.push(...sups);
  const profile = /* @__PURE__ */ new Map();
  for (const n of ["Brookside Milk", "Coca-Cola", "Jogoo", "Supaloaf", "Kasuku Cooking Fat 500g", "Sunlight 2in1 Powder 500g"]) profile.set(P(n).id, "shelf_low");
  for (const n of ["Mumias Sugar", "Kensalt 500g", "Pampers", "Ketepa", "Colgate Toothpaste", "Eggs"]) profile.set(P(n).id, "total_low");
  for (const p of db.products) if (vel.get(p.id) === 0) profile.set(p.id, "dead");
  const sold = /* @__PURE__ */ new Map();
  const sellable = db.products.filter((p) => vel.get(p.id) > 0);
  const weights = sellable.map((p) => vel.get(p.id));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let x = r() * wsum;
    for (let i = 0; i < sellable.length; i++) {
      x -= weights[i];
      if (x <= 0) return sellable[i];
    }
    return sellable[0];
  };
  const creditors = db.customers.slice(0, 12);
  const openAt = new Date(now);
  openAt.setHours(6, 30, 0, 0);
  const moveRows = [];
  const pushMove = (d, product_id, qty, reason, from, to, ref, user = ownerId) => moveRows.push({ ...base(d), shop_id: shopId, product_id, qty, reason, from_location: from, to_location: to, ref_id: ref ?? null, user_id: user, updated_by: user });
  for (let day = 29; day >= 0; day--) {
    const d0 = addDays(now, -day);
    d0.setHours(6, 30, 0, 0);
    let close = new Date(d0);
    close.setHours(21, 30, 0, 0);
    if (day === 0) {
      if (now <= openAt) continue;
      close = now < close ? now : close;
    }
    const span = close.getTime() - d0.getTime();
    const fullSpan = 15 * 36e5;
    const n = Math.round(95 * DOW_FACTOR[d0.getDay()] * (0.9 + r() * 0.2) * (day === 0 ? span / fullSpan : 1));
    for (let t = 0; t < n; t++) {
      const u = r();
      const frac = u < 0.35 ? r() * 0.2 : u < 0.8 ? 0.65 + r() * 0.35 : r();
      const ts = new Date(d0.getTime() + Math.min(frac, 0.999) * span);
      const k = 1 + Math.floor(r() * r() * 4);
      const lines = /* @__PURE__ */ new Map();
      for (let j = 0; j < k; j++) {
        const p = pick();
        const q = ["kg", "piece", "stick", "card"].includes(p.sell_unit) && r() < 0.3 ? 2 : 1;
        lines.set(p.id, (lines.get(p.id) ?? 0) + q);
      }
      const roll = r();
      const method = roll < 0.52 ? "cash" : roll < 0.88 ? "mpesa" : roll < 0.97 ? "credit" : "split";
      const cust = method === "credit" || method === "split" ? creditors[Math.floor(r() * creditors.length)] : null;
      const tier = cust?.tier ?? "regular";
      let total = 0;
      const saleId = id();
      const user = r() < 0.35 ? staffId : ownerId;
      for (const [pid, q] of lines) {
        const p = db.products.find((x) => x.id === pid);
        const price = tier === "wholesale" ? p.wholesale_price : tier === "loyal" ? p.loyal_price : p.retail_price;
        total += price * q;
        sold.set(pid, (sold.get(pid) ?? 0) + q);
        db.sale_items.push({ ...base(ts), sale_id: saleId, product_id: pid, qty: q, unit_price: price, unit_cost_snapshot: p.cost_price, price_tier: tier });
        pushMove(ts, pid, q, "sale", duka.id, null, saleId, user);
      }
      total = Math.round(total);
      const credit = method === "credit" ? total : method === "split" ? Math.round(total / 2) : 0;
      const mpesa = method === "mpesa" ? total : method === "split" ? total - credit : 0;
      const cash = method === "cash" ? total : 0;
      db.sales.push({ ...base(ts), id: saleId, shop_id: shopId, user_id: user, customer_id: cust?.id ?? null, total, discount: 0, status: "complete", payment_method: method, cash_amount: cash, mpesa_amount: mpesa, credit_amount: credit, device_id: "demo", offline_created_at: at(ts), busy_lump: false, reconciled: true, mpesa_pending: false, updated_by: user });
      if (credit && cust) db.credit_ledger.push({ ...base(ts), shop_id: shopId, customer_id: cust.id, type: "charge", amount: credit, balance_after: 0, sale_id: saleId, user_id: user, updated_by: user });
    }
  }
  const quiet = /* @__PURE__ */ new Set([db.customers[2].id, db.customers[4].id]);
  for (const c of creditors) {
    if (quiet.has(c.id)) continue;
    for (let day = 26; day >= 1; day -= 6 + Math.floor(r() * 4)) {
      const charges = db.credit_ledger.filter((l) => l.customer_id === c.id && l.type === "charge" && new Date(l.created_at) < addDays(now, -day)).reduce((a, l) => a + l.amount, 0);
      const paid = db.credit_ledger.filter((l) => l.customer_id === c.id && l.type === "payment").reduce((a, l) => a + l.amount, 0);
      const bal = charges - paid;
      if (bal < 100) continue;
      const amt = Math.round(bal * (0.5 + r() * 0.4) / 50) * 50;
      const ts = addDays(now, -day);
      ts.setHours(18, Math.floor(r() * 59));
      db.credit_ledger.push({ ...base(ts), shop_id: shopId, customer_id: c.id, type: "payment", amount: amt, balance_after: 0, method: r() < 0.6 ? "mpesa" : "cash", user_id: ownerId, note: "Weekly payment" });
    }
  }
  const carry = [[0, 850], [2, 2400], [4, 1350], [5, 1800], [10, 600]];
  for (const [ci, amt] of carry) {
    const ts = addDays(now, -31);
    db.credit_ledger.push({ ...base(ts), shop_id: shopId, customer_id: db.customers[ci].id, type: "charge", amount: amt, balance_after: 0, note: "Kutoka kitabu cha zamani", user_id: ownerId });
  }
  const receivedQty = /* @__PURE__ */ new Map();
  const mkPurchase = (sup, dayAgo, items, paid, due) => {
    const ts = addDays(now, -dayAgo);
    ts.setHours(9, 15);
    const pid = id();
    let total = 0;
    for (const [n, qty, costPerBuy, expIn] of items) {
      const p = P(n);
      total += qty * costPerBuy;
      db.purchase_items.push({ ...base(ts), purchase_id: pid, product_id: p.id, qty_buy_units: qty, cost_per_buy_unit: costPerBuy, expiry_date: expIn != null ? dayKey(addDays(now, expIn)) : void 0 });
      db.price_history.push({ ...base(ts), product_id: p.id, supplier_id: sup.id, cost_price: Math.round(costPerBuy / p.units_per_buy_unit * 100) / 100, recorded_at: at(ts) });
      receivedQty.set(p.id, (receivedQty.get(p.id) ?? 0) + qty * p.units_per_buy_unit);
      pushMove(ts, p.id, qty * p.units_per_buy_unit, "purchase", null, store.id, pid);
    }
    db.purchases.push({ ...base(ts), id: pid, shop_id: shopId, supplier_id: sup.id, invoice_no: `INV-${Math.floor(1e3 + r() * 8999)}`, total_cost: total, status: "received", paid_amount: paid === "full" ? total : 0, due_date: due != null ? dayKey(addDays(now, due)) : void 0 });
  };
  mkPurchase(sups[0], 20, [["Jogoo", 4, 1920], ["Soko", 3, 1850], ["Kasuku Cooking Fat 500g", 2, 3850], ["Elianto", 2, 4e3], ["Blue Band 250g", 2, 2850, 60]], "full");
  mkPurchase(sups[1], 12, [["Jogoo", 3, 1860], ["Mumias", 1, 7200], ["Brookside Milk", 4, 1330, 16], ["Coca-Cola", 4, 1390, 150], ["Sunlight 2in1 Powder 500g", 2, 3300]], "full");
  mkPurchase(sups[2], 4, [["Soko", 2, 1790], ["Supaloaf", 3, 684, 1], ["Omo Multi", 2, 3550], ["KCC Milk", 2, 1250, 3], ["Fresh Mala", 2, 700, 9]], "none", 2);
  for (const p of db.products) {
    const h = db.price_history.filter((x) => x.product_id === p.id).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).pop();
    if (h) p.cost_price = h.cost_price;
  }
  for (const p of db.products) {
    const s = sold.get(p.id) ?? 0;
    const v = vel.get(p.id);
    const prof = profile.get(p.id) ?? "normal";
    const [F, S] = prof === "shelf_low" ? [1 + Math.floor(r() * 2), p.units_per_buy_unit * 2] : prof === "total_low" ? [Math.max(1, Math.floor(p.reorder_level / 3)), 0] : prof === "dead" ? [4 + Math.floor(r() * 6), p.units_per_buy_unit] : [Math.ceil(v * 3) + p.reorder_level, Math.max(p.units_per_buy_unit, Math.ceil(v * 7))];
    const rec = receivedQty.get(p.id) ?? 0;
    let opening = s + F + S - rec;
    const extraStoreToShop = s + F;
    if (opening < 0) opening = 0;
    const d = new Date(start);
    pushMove(d, p.id, opening, "purchase", null, store.id, void 0);
    const storeAvail = opening + rec;
    const toShop = Math.min(extraStoreToShop, storeAvail);
    pushMove(new Date(d.getTime() + 36e5), p.id, toShop, "transfer", store.id, duka.id);
    const exp = expDays.get(p.id);
    if (exp) {
      const shelfLeft = F, storeLeft = storeAvail - toShop;
      const near = ["Brookside Yoghurt", "KCC Milk", "Fresh Mala", "Supaloaf", "Mandazi", "Salad Tomatoes", "Tropical Heat"].some((n) => p.name.startsWith(n));
      const nearDays = p.name.startsWith("Brookside Yoghurt") ? 6 : p.name.startsWith("Fresh Mala") ? 12 : p.name.startsWith("Tropical") ? 25 : Math.min(exp, 5);
      if (shelfLeft > 0) db.stock_batches.push({ ...base(now), product_id: p.id, location_id: duka.id, qty: shelfLeft, expiry_date: dayKey(addDays(now, near ? nearDays : exp)) });
      if (storeLeft > 0) db.stock_batches.push({ ...base(now), product_id: p.id, location_id: store.id, qty: storeLeft, expiry_date: dayKey(addDays(now, near ? nearDays + 3 : exp + 10)) });
    }
  }
  db.stock_moves.push(...moveRows.sort((a, b) => a.created_at.localeCompare(b.created_at)));
  for (let day = 14; day >= 1; day--) {
    const o = addDays(now, -day);
    o.setHours(6, 30, 0, 0);
    const c = new Date(o);
    c.setHours(21, 35);
    const staffShift = day % 2 === 0;
    const user = staffShift ? staffId : ownerId;
    const cashSales = db.sales.filter((s) => s.offline_created_at >= at(o) && s.offline_created_at <= at(c)).reduce((a, s) => a + s.cash_amount, 0);
    const payouts = 300 + Math.round(r() * 400);
    db.expenses.push({ ...base(new Date(o.getTime() + 5 * 36e5)), shop_id: shopId, category: r() < 0.5 ? "Transport" : "Lunch & tea", amount: payouts, user_id: user, note: "" });
    const cashDebt = db.credit_ledger.filter((l) => l.type === "payment" && l.method === "cash" && l.created_at >= at(o) && l.created_at <= at(c)).reduce((a, l) => a + l.amount, 0);
    const expected = 2e3 + cashSales + cashDebt - payouts;
    const v = staffShift && day <= 8 ? -(150 + Math.round(r() * 250)) : Math.round((r() - 0.5) * 60);
    db.cash_sessions.push({ ...base(o), shop_id: shopId, user_id: user, opened_at: at(o), closed_at: at(c), opening_float: 2e3, expected_cash: expected, counted_cash: expected + v, variance: v });
  }
  if (now > openAt) db.cash_sessions.push({ ...base(openAt), shop_id: shopId, user_id: ownerId, opened_at: at(openAt), closed_at: null, opening_float: 2e3, expected_cash: 2e3 });
  const dem = [["formula ya watoto (Nan 1)", 1], ["gas refill 6kg", 2], ["formula ya watoto (Nan 1)", 3], ["Maziwa ya Lala 500ml", 3], ["gas refill 6kg", 5], ["formula ya watoto (Nan 1)", 6], ["Omena kilo", 4]];
  for (const [text, d] of dem) db.demand_log.push({ ...base(addDays(now, -d)), shop_id: shopId, text, product_guess: text.includes("formula") ? "Infant formula" : void 0, user_id: staffId });
  const tx = addDays(now, -1);
  tx.setHours(19, 42);
  const raw = `SJK3FGH7TY Confirmed. You have received Ksh350.00 from PETER OTIENO 0722000111 on ${tx.getDate()}/${tx.getMonth() + 1}/${String(tx.getFullYear()).slice(2)} at 7:42 PM New M-PESA balance is Ksh45,210.00.`;
  db.payments_inbox.push({ ...base(tx), shop_id: shopId, source: "sms", raw_text: raw, mpesa_code: "SJK3FGH7TY", payer_name: "Peter Otieno", payer_phone: "0722000111", amount: 350, tx_time: at(tx), matched_sale_id: null, matched_customer_id: null, status: "unmatched" });
  const e = new DukaEngine(db, { shopId, userId: ownerId, role: "owner", deviceId: "demo", now: () => now });
  const byC = /* @__PURE__ */ new Map();
  for (const l of db.credit_ledger) {
    if (!byC.has(l.customer_id)) byC.set(l.customer_id, []);
    byC.get(l.customer_id).push(l);
  }
  for (const [cid] of byC) for (const row of e.ledgerOf(cid)) {
    const l = db.credit_ledger.find((x) => x.id === row.id);
    l.balance_after = row.balance_after;
  }
  e.alert("unmatched_payment", "info", "KSh 350 from Peter Otieno", "Tap to put it against a debt", { paymentId: db.payments_inbox[0].id, key: `unm:${db.payments_inbox[0].id}` });
  e.alert("cash_gap", "warn", "Repeated drawer shortages", "Brian Otieno was short on 4 of his last 4 closes", { key: "gap:demo" });
  db.shops[0].settings_json.reminderDay = now.getDay();
  e.tick({ reminder: reminderTemplate(db.shops[0].name), briefing: morningBriefing, evening: eveningReport });
  db.agent_messages.push({ ...base(now), shop_id: shopId, channel: "inapp", direction: "out", body: db.shops[0].language === "sw" ? 'Karibu! Mimi ni Duka Brain. Niambie kama unavyomwambia store boy: "Andika deni ya Baba Kevin mia nne hamsini".' : `Karibu! I'm Duka Brain. Talk to me like you talk to your store boy: "Add credit for Baba Kevin 450".` });
  db.audit_log.length = 0;
  return { db, shopId, ownerId, staffId };
}

// ../../packages/shared/src/schemas.ts
import { z } from "zod";
var OpSchema = z.object({ id: z.string().uuid(), shop_id: z.string().uuid(), device_id: z.string().min(1), entity: z.string().min(1), entity_id: z.string().uuid(), op: z.enum(["upsert", "delete"]), payload_json: z.record(z.any()), client_ts: z.string() });
var PushSchema = z.object({ ops: z.array(OpSchema).max(500) });
var PinLoginSchema = z.object({ shopCode: z.string().min(3), userId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) });
var SaleLineSchema = z.object({ productId: z.string().uuid(), qty: z.number().positive(), tier: z.enum(["regular", "loyal", "wholesale"]).optional(), unitPrice: z.number().nonnegative().optional() });
var SaleSchema = z.object({ id: z.string().uuid(), lines: z.array(SaleLineSchema), payment: z.object({ method: z.enum(["cash", "mpesa", "credit", "split"]), cash: z.number().optional(), mpesa: z.number().optional(), credit: z.number().optional(), customerId: z.string().uuid().nullish() }), discount: z.number().nonnegative().optional(), busyLump: z.number().positive().optional(), offlineAt: z.string().optional() });
var SmsWebhookSchema = z.object({ text: z.string().min(10), shopId: z.string().uuid().optional() });
var AgentMessageSchema = z.object({ text: z.string().min(1).max(500) });

// ../../packages/shared/src/i18n/en.ts
var en = {
  "app.name": "Duka System",
  "app.tagline": "Your shop, in your pocket.",
  // nav
  "nav.home": "Home",
  "nav.sell": "Sell",
  "nav.kitabu": "Kitabu",
  "nav.stock": "Stock",
  "nav.more": "More",
  "nav.brain": "Duka Brain",
  // auth
  "auth.pickUser": "Who is at the counter?",
  "auth.enterPin": "Enter your PIN",
  "auth.wrongPin": "Wrong PIN. Try again.",
  "auth.owner": "Owner",
  "auth.staff": "Staff",
  "auth.lock": "Lock",
  "auth.switchUser": "Switch user",
  // onboarding
  "onb.welcome": "Karibu. Let\u2019s set up your duka.",
  "onb.sub": "Two minutes. No paperwork. Works without internet.",
  "onb.shopName": "Shop name",
  "onb.ownerName": "Your name",
  "onb.phone": "Phone number",
  "onb.language": "Language",
  "onb.mpesa": "How do customers pay you on M-Pesa?",
  "onb.mpesa.till": "Till (Buy Goods)",
  "onb.mpesa.paybill": "Paybill",
  "onb.mpesa.pochi": "Pochi la Biashara",
  "onb.mpesa.personal": "Personal number",
  "onb.pin": "Create a 4-digit owner PIN",
  "onb.staff": "Add your store boy (optional)",
  "onb.staffName": "Staff name",
  "onb.staffPin": "Staff PIN",
  "onb.start": "Open my duka",
  "onb.demo": "Try with a demo duka",
  "onb.demoSub": "120 real products, 30 days of sales, debts, alerts. Everything lights up.",
  "onb.next": "Next",
  "onb.back": "Back",
  // home
  "home.greeting.morning": "Good morning",
  "home.greeting.afternoon": "Good afternoon",
  "home.greeting.evening": "Good evening",
  "home.todaySales": "Sold today",
  "home.profit": "Profit today (est.)",
  "home.cashPosition": "Cash position",
  "home.credit": "Owed to you",
  "home.payables": "You owe suppliers",
  "home.alerts": "Needs your eye",
  "home.noAlerts": "All quiet. Nothing needs you right now.",
  "home.vsLastWeek": "vs same day last week",
  "home.sales7": "Last 7 days",
  "home.quick": "Quick actions",
  "home.inDrawer": "in drawer",
  "home.onMpesa": "on M-Pesa",
  // pos
  "pos.search": "Search product, Swahili name or barcode",
  "pos.topMovers": "Top movers",
  "pos.all": "All",
  "pos.cart": "Cart",
  "pos.empty": "Tap a product to start a sale",
  "pos.total": "Total",
  "pos.charge": "Charge",
  "pos.cash": "Cash",
  "pos.mpesa": "M-Pesa",
  "pos.credit": "Credit",
  "pos.split": "Split",
  "pos.pickCustomer": "Who is taking on credit?",
  "pos.done": "Sale recorded",
  "pos.newSale": "New sale",
  "pos.change": "Change",
  "pos.received": "Received",
  "pos.busyMode": "Busy mode",
  "pos.busyOn": "Busy mode on: enter totals only, reconcile later",
  "pos.lump": "Lump sum",
  "pos.addLump": "Record lump sum",
  "pos.qty": "Quantity",
  "pos.clear": "Clear",
  "pos.outOfStock": "Shelf empty",
  "pos.left": "left",
  "pos.overLimit": "Over credit limit by",
  "pos.tier": "Price",
  "pos.discount": "Discount",
  "pos.noResults": "Nothing matches. Log it as missed demand?",
  "pos.logDemand": "Log missed demand",
  // kitabu
  "kb.title": "Kitabu",
  "kb.owed": "Total owed to you",
  "kb.debtors": "customers owe",
  "kb.search": "Search customer",
  "kb.addCustomer": "New customer",
  "kb.addCredit": "Add debt",
  "kb.recordPayment": "Record payment",
  "kb.statement": "Statement",
  "kb.limit": "Credit limit",
  "kb.balance": "Balance",
  "kb.charge": "Debt",
  "kb.payment": "Paid",
  "kb.adjustment": "Adjustment",
  "kb.remind": "Send reminder",
  "kb.reminderSent": "Reminder queued",
  "kb.lastPaid": "Last paid",
  "kb.never": "never",
  "kb.days": "days",
  "kb.cleared": "Cleared",
  "kb.name": "Name",
  "kb.phone": "Phone",
  "kb.amount": "Amount",
  "kb.note": "Note",
  "kb.save": "Save",
  "kb.tone.0": "Gentle",
  "kb.tone.1": "Firm",
  "kb.tone.2": "Final",
  // stock
  "st.title": "Stock",
  "st.duka": "Duka",
  "st.store": "Store",
  "st.total": "Total",
  "st.transfer": "Move from store",
  "st.adjust": "Adjust",
  "st.receive": "Receive delivery",
  "st.timeline": "Movement history",
  "st.addProduct": "New product",
  "st.low": "Low",
  "st.daysLeft": "days left",
  "st.search": "Search stock",
  "st.reason": "Reason",
  "st.buyUnit": "Buy unit",
  "st.sellUnit": "Sell unit",
  "st.perBuy": "per",
  "st.cost": "Cost",
  "st.price": "Price",
  "st.margin": "Margin",
  "st.expiring": "Expiring",
  "st.count": "Stock-take",
  "st.confirmTransfer": "Confirm move",
  "st.moved": "Moved",
  "st.category": "Category",
  "st.reorder": "Reorder at",
  "st.wholesale": "Wholesale",
  "st.loyal": "Loyal",
  "reason.purchase": "Delivery",
  "reason.sale": "Sale",
  "reason.transfer": "Transfer",
  "reason.adjustment": "Adjustment",
  "reason.expiry_writeoff": "Expired",
  "reason.count_correction": "Count fix",
  // payments
  "pay.title": "M-Pesa inbox",
  "pay.paste": "Paste M-Pesa message",
  "pay.pasteHint": "Long-press the SMS, copy, paste here.",
  "pay.process": "Read message",
  "pay.matched": "Matched",
  "pay.unmatched": "Needs a home",
  "pay.suspicious": "Suspicious",
  "pay.assign": "Assign",
  "pay.toCustomer": "Put against a debt",
  "pay.ignore": "Ignore",
  "pay.invalid": "That doesn\u2019t look like an M-Pesa message.",
  "pay.duplicate": "This M-Pesa code was already recorded.",
  // cash
  "cash.title": "Cash drawer",
  "cash.open": "Open the day",
  "cash.float": "Starting float",
  "cash.expected": "Expected in drawer",
  "cash.count": "Count the drawer",
  "cash.close": "Close the day",
  "cash.variance": "Difference",
  "cash.short": "Short",
  "cash.over": "Over",
  "cash.balanced": "Balanced",
  "cash.trend": "Drawer differences",
  "cash.expense": "Pay out cash",
  "cash.sessionOpen": "Day open since",
  // purchases
  "pur.title": "Deliveries & suppliers",
  "pur.new": "New delivery",
  "pur.supplier": "Supplier",
  "pur.invoice": "Invoice no.",
  "pur.items": "Items",
  "pur.receive": "Receive into store",
  "pur.draft": "Draft",
  "pur.received": "Received",
  "pur.payables": "You owe",
  "pur.due": "Due",
  "pur.bestPrice": "Cheapest recently",
  "pur.priceHistory": "Price memory",
  "pur.paid": "Paid",
  "pur.reorder": "Suggested order",
  // reports
  "rep.title": "Reports",
  "rep.daily": "Today\u2019s report",
  "rep.weekly": "Weekly review",
  "rep.profit": "Profit truth",
  "rep.dead": "Dead stock",
  "rep.expiry": "Expiry watch",
  "rep.loan": "Loan pack",
  "rep.demand": "Missed demand",
  "rep.sales": "Sales",
  "rep.cogs": "Cost of goods",
  "rep.gross": "Gross profit",
  "rep.expenses": "Expenses",
  "rep.net": "Net profit",
  "rep.txns": "Sales count",
  "rep.avgBasket": "Avg basket",
  "rep.topProfit": "Top profit makers",
  "rep.shelfWasters": "Shelf wasters",
  "rep.frozen": "Money frozen on shelves",
  "rep.print": "Print / Save PDF",
  "rep.month": "Month",
  "rep.cashIn": "Cash in",
  "rep.cashOut": "Cash out",
  // agent
  "ai.title": "Duka Brain",
  "ai.placeholder": "Type or say: \u201CAndika deni ya Baba Kevin 450\u201D",
  "ai.suggest": "Try",
  "ai.thinking": "Thinking",
  "ai.did": "Done",
  // stocktake / demand
  "cnt.title": "Stock-take",
  "cnt.pick": "Pick a shelf section",
  "cnt.counted": "Counted",
  "cnt.expected": "Expected",
  "cnt.post": "Post count",
  "cnt.hidden": "Expected is hidden until you count",
  "dem.title": "Missed demand",
  "dem.add": "Customer asked for\u2026",
  "dem.saved": "Logged. You\u2019ll see it in the weekly report.",
  // settings
  "set.title": "Settings",
  "set.language": "Language",
  "set.theme": "Theme",
  "set.dark": "Dark",
  "set.light": "Light",
  "set.shop": "Shop profile",
  "set.users": "People & PINs",
  "set.reminders": "Debt reminders",
  "set.reminderDay": "Send on",
  "set.reminderMin": "Only if balance above",
  "set.export": "Back up data",
  "set.exportJson": "Full backup (JSON)",
  "set.exportCsv": "Spreadsheets (CSV)",
  "set.etims": "eTIMS (coming soon)",
  "set.reset": "Reset device",
  "set.changePin": "Change PIN",
  "set.demo": "Load demo duka",
  "set.about": "About",
  // sync
  "sync.synced": "Synced",
  "sync.syncing": "Syncing",
  "sync.offline": "Offline",
  "sync.pending": "pending",
  // common
  "c.save": "Save",
  "c.cancel": "Cancel",
  "c.confirm": "Confirm",
  "c.close": "Close",
  "c.today": "Today",
  "c.yesterday": "Yesterday",
  "c.week": "This week",
  "c.all": "All",
  "c.seeAll": "See all",
  "c.search": "Search",
  "c.add": "Add",
  "c.done": "Done",
  "c.edit": "Edit",
  "c.back": "Back",
  "c.more": "More",
  "days.0": "Sunday",
  "days.1": "Monday",
  "days.2": "Tuesday",
  "days.3": "Wednesday",
  "days.4": "Thursday",
  "days.5": "Friday",
  "days.6": "Saturday",
  "dshort.0": "Sun",
  "dshort.1": "Mon",
  "dshort.2": "Tue",
  "dshort.3": "Wed",
  "dshort.4": "Thu",
  "dshort.5": "Fri",
  "dshort.6": "Sat"
};

// ../../packages/shared/src/i18n/sw.ts
var sw = {
  "app.name": "Duka System",
  "app.tagline": "Duka lako, mfukoni mwako.",
  "nav.home": "Nyumbani",
  "nav.sell": "Uza",
  "nav.kitabu": "Kitabu",
  "nav.stock": "Bidhaa",
  "nav.more": "Zaidi",
  "nav.brain": "Duka Brain",
  "auth.pickUser": "Nani yuko kaunta?",
  "auth.enterPin": "Weka PIN yako",
  "auth.wrongPin": "PIN si sahihi. Jaribu tena.",
  "auth.owner": "Mwenye duka",
  "auth.staff": "Mfanyakazi",
  "auth.lock": "Funga",
  "auth.switchUser": "Badilisha mtu",
  "onb.welcome": "Karibu. Tuweke duka lako.",
  "onb.sub": "Dakika mbili tu. Hakuna makaratasi. Inafanya kazi bila mtandao.",
  "onb.shopName": "Jina la duka",
  "onb.ownerName": "Jina lako",
  "onb.phone": "Namba ya simu",
  "onb.language": "Lugha",
  "onb.mpesa": "Wateja hukulipa aje kwa M-Pesa?",
  "onb.mpesa.till": "Till (Lipa na M-Pesa)",
  "onb.mpesa.paybill": "Paybill",
  "onb.mpesa.pochi": "Pochi la Biashara",
  "onb.mpesa.personal": "Namba ya kawaida",
  "onb.pin": "Tengeneza PIN ya tarakimu 4",
  "onb.staff": "Ongeza store boy (si lazima)",
  "onb.staffName": "Jina la mfanyakazi",
  "onb.staffPin": "PIN ya mfanyakazi",
  "onb.start": "Fungua duka langu",
  "onb.demo": "Jaribu na duka la mfano",
  "onb.demoSub": "Bidhaa 120 halisi, siku 30 za mauzo, madeni, arifa. Kila kitu kinawaka.",
  "onb.next": "Endelea",
  "onb.back": "Rudi",
  "home.greeting.morning": "Habari ya asubuhi",
  "home.greeting.afternoon": "Habari ya mchana",
  "home.greeting.evening": "Habari ya jioni",
  "home.todaySales": "Mauzo ya leo",
  "home.profit": "Faida ya leo (kadirio)",
  "home.cashPosition": "Pesa uliyo nayo",
  "home.credit": "Unadai wateja",
  "home.payables": "Unadaiwa na wasambazaji",
  "home.alerts": "Mambo ya kuangalia",
  "home.noAlerts": "Kimya. Hakuna kinachokuhitaji sasa hivi.",
  "home.vsLastWeek": "ukilinganisha na wiki iliyopita",
  "home.sales7": "Siku 7 zilizopita",
  "home.quick": "Haraka",
  "home.inDrawer": "kwa droo",
  "home.onMpesa": "kwa M-Pesa",
  "pos.search": "Tafuta bidhaa, jina la Kiswahili au barcode",
  "pos.topMovers": "Zinazotoka sana",
  "pos.all": "Zote",
  "pos.cart": "Kikapu",
  "pos.empty": "Gusa bidhaa kuanza mauzo",
  "pos.total": "Jumla",
  "pos.charge": "Lipisha",
  "pos.cash": "Cash",
  "pos.mpesa": "M-Pesa",
  "pos.credit": "Deni",
  "pos.split": "Changanya",
  "pos.pickCustomer": "Nani anachukua kwa deni?",
  "pos.done": "Mauzo yamewekwa",
  "pos.newSale": "Mauzo mapya",
  "pos.change": "Chenji",
  "pos.received": "Umepokea",
  "pos.busyMode": "Shughuli nyingi",
  "pos.busyOn": "Shughuli nyingi: weka jumla tu, tutapatanisha baadaye",
  "pos.lump": "Jumla",
  "pos.addLump": "Weka jumla ya mauzo",
  "pos.qty": "Idadi",
  "pos.clear": "Futa",
  "pos.outOfStock": "Rafu tupu",
  "pos.left": "zimebaki",
  "pos.overLimit": "Amezidi kikomo cha deni kwa",
  "pos.tier": "Bei",
  "pos.discount": "Punguzo",
  "pos.noResults": "Hakuna. Iandike kama mteja aliuliza?",
  "pos.logDemand": "Andika mahitaji",
  "kb.title": "Kitabu",
  "kb.owed": "Jumla unayodai",
  "kb.debtors": "wateja wanadaiwa",
  "kb.search": "Tafuta mteja",
  "kb.addCustomer": "Mteja mpya",
  "kb.addCredit": "Andika deni",
  "kb.recordPayment": "Pokea malipo",
  "kb.statement": "Taarifa",
  "kb.limit": "Kikomo cha deni",
  "kb.balance": "Deni",
  "kb.charge": "Deni",
  "kb.payment": "Amelipa",
  "kb.adjustment": "Marekebisho",
  "kb.remind": "Mkumbushe",
  "kb.reminderSent": "Ukumbusho umepangwa",
  "kb.lastPaid": "Alilipa mwisho",
  "kb.never": "hajawahi",
  "kb.days": "siku",
  "kb.cleared": "Amemaliza",
  "kb.name": "Jina",
  "kb.phone": "Simu",
  "kb.amount": "Kiasi",
  "kb.note": "Maelezo",
  "kb.save": "Hifadhi",
  "kb.tone.0": "Kwa upole",
  "kb.tone.1": "Kwa uzito",
  "kb.tone.2": "Mwisho",
  "st.title": "Bidhaa",
  "st.duka": "Duka",
  "st.store": "Stoo",
  "st.total": "Jumla",
  "st.transfer": "Toa stoo",
  "st.adjust": "Rekebisha",
  "st.receive": "Pokea mzigo",
  "st.timeline": "Historia ya mzigo",
  "st.addProduct": "Bidhaa mpya",
  "st.low": "Chache",
  "st.daysLeft": "siku zimebaki",
  "st.search": "Tafuta bidhaa",
  "st.reason": "Sababu",
  "st.buyUnit": "Unanunua kwa",
  "st.sellUnit": "Unauza kwa",
  "st.perBuy": "kwa",
  "st.cost": "Bei ya kununua",
  "st.price": "Bei ya kuuza",
  "st.margin": "Faida",
  "st.expiring": "Zinaharibika",
  "st.count": "Hesabu mzigo",
  "st.confirmTransfer": "Thibitisha",
  "st.moved": "Imehamishwa",
  "st.category": "Aina",
  "st.reorder": "Agiza ikifika",
  "st.wholesale": "Jumla",
  "st.loyal": "Mteja wa kudumu",
  "reason.purchase": "Mzigo mpya",
  "reason.sale": "Mauzo",
  "reason.transfer": "Uhamisho",
  "reason.adjustment": "Marekebisho",
  "reason.expiry_writeoff": "Imeharibika",
  "reason.count_correction": "Hesabu",
  "pay.title": "M-Pesa",
  "pay.paste": "Bandika ujumbe wa M-Pesa",
  "pay.pasteHint": "Bonyeza SMS kwa muda, nakili, bandika hapa.",
  "pay.process": "Soma ujumbe",
  "pay.matched": "Imeunganishwa",
  "pay.unmatched": "Haijulikani ni ya nani",
  "pay.suspicious": "Ya kutiliwa shaka",
  "pay.assign": "Weka",
  "pay.toCustomer": "Lipia deni la",
  "pay.ignore": "Puuza",
  "pay.invalid": "Huu hauonekani kama ujumbe wa M-Pesa.",
  "pay.duplicate": "Code hii ya M-Pesa imeshawekwa.",
  "cash.title": "Droo ya pesa",
  "cash.open": "Fungua siku",
  "cash.float": "Pesa ya kuanzia",
  "cash.expected": "Inapaswa kuwa kwa droo",
  "cash.count": "Hesabu droo",
  "cash.close": "Funga siku",
  "cash.variance": "Tofauti",
  "cash.short": "Imepungua",
  "cash.over": "Imezidi",
  "cash.balanced": "Iko sawa",
  "cash.trend": "Tofauti za droo",
  "cash.expense": "Toa pesa",
  "cash.sessionOpen": "Siku imefunguliwa",
  "pur.title": "Mzigo na wasambazaji",
  "pur.new": "Mzigo mpya",
  "pur.supplier": "Msambazaji",
  "pur.invoice": "Namba ya risiti",
  "pur.items": "Bidhaa",
  "pur.receive": "Weka stoo",
  "pur.draft": "Rasimu",
  "pur.received": "Umepokelewa",
  "pur.payables": "Unadaiwa",
  "pur.due": "Tarehe ya kulipa",
  "pur.bestPrice": "Bei nafuu karibuni",
  "pur.priceHistory": "Kumbukumbu ya bei",
  "pur.paid": "Umelipa",
  "pur.reorder": "Agizo linalopendekezwa",
  "rep.title": "Ripoti",
  "rep.daily": "Ripoti ya Leo",
  "rep.weekly": "Tathmini ya wiki",
  "rep.profit": "Ukweli wa faida",
  "rep.dead": "Mzigo uliolala",
  "rep.expiry": "Zinazoharibika",
  "rep.loan": "Faili ya mkopo",
  "rep.demand": "Wateja waliokosa",
  "rep.sales": "Mauzo",
  "rep.cogs": "Gharama ya bidhaa",
  "rep.gross": "Faida ghafi",
  "rep.expenses": "Matumizi",
  "rep.net": "Faida halisi",
  "rep.txns": "Idadi ya mauzo",
  "rep.avgBasket": "Wastani wa mteja",
  "rep.topProfit": "Zinazoleta faida",
  "rep.shelfWasters": "Zinazokaa rafu bure",
  "rep.frozen": "Pesa iliyolala rafuni",
  "rep.print": "Chapisha / PDF",
  "rep.month": "Mwezi",
  "rep.cashIn": "Pesa iliyoingia",
  "rep.cashOut": "Pesa iliyotoka",
  "ai.title": "Duka Brain",
  "ai.placeholder": "Andika: \u201CAndika deni ya Baba Kevin 450\u201D",
  "ai.suggest": "Jaribu",
  "ai.thinking": "Nafikiria",
  "ai.did": "Imefanyika",
  "cnt.title": "Hesabu mzigo",
  "cnt.pick": "Chagua sehemu ya rafu",
  "cnt.counted": "Umehesabu",
  "cnt.expected": "Inatarajiwa",
  "cnt.post": "Maliza hesabu",
  "cnt.hidden": "Idadi inayotarajiwa imefichwa hadi uhesabu",
  "dem.title": "Wateja waliokosa",
  "dem.add": "Mteja ameuliza\u2026",
  "dem.saved": "Imeandikwa. Utaiona kwa ripoti ya wiki.",
  "set.title": "Mipangilio",
  "set.language": "Lugha",
  "set.theme": "Mwonekano",
  "set.dark": "Giza",
  "set.light": "Mwanga",
  "set.shop": "Maelezo ya duka",
  "set.users": "Watu na PIN",
  "set.reminders": "Ukumbusho wa madeni",
  "set.reminderDay": "Tuma siku ya",
  "set.reminderMin": "Kama deni ni zaidi ya",
  "set.export": "Hifadhi data",
  "set.exportJson": "Backup kamili (JSON)",
  "set.exportCsv": "Majedwali (CSV)",
  "set.etims": "eTIMS (inakuja)",
  "set.reset": "Futa kifaa",
  "set.changePin": "Badilisha PIN",
  "set.demo": "Weka duka la mfano",
  "set.about": "Kuhusu",
  "sync.synced": "Imesawazishwa",
  "sync.syncing": "Inasawazisha",
  "sync.offline": "Nje ya mtandao",
  "sync.pending": "zinasubiri",
  "c.save": "Hifadhi",
  "c.cancel": "Ghairi",
  "c.confirm": "Thibitisha",
  "c.close": "Funga",
  "c.today": "Leo",
  "c.yesterday": "Jana",
  "c.week": "Wiki hii",
  "c.all": "Zote",
  "c.seeAll": "Ona zote",
  "c.search": "Tafuta",
  "c.add": "Ongeza",
  "c.done": "Tayari",
  "c.edit": "Hariri",
  "c.back": "Rudi",
  "c.more": "Zaidi",
  "days.0": "Jumapili",
  "days.1": "Jumatatu",
  "days.2": "Jumanne",
  "days.3": "Jumatano",
  "days.4": "Alhamisi",
  "days.5": "Ijumaa",
  "days.6": "Jumamosi",
  "dshort.0": "Jpl",
  "dshort.1": "Jtt",
  "dshort.2": "Jnn",
  "dshort.3": "Jtn",
  "dshort.4": "Alh",
  "dshort.5": "Ijm",
  "dshort.6": "Jms"
};

// ../../packages/shared/src/i18n/index.ts
var dicts = { en, sw };
function translate(lang, key, vars) {
  let s = dicts[lang][key] ?? en[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
  return s;
}

// ../../packages/shared/src/sync.ts
var APPEND_ONLY = /* @__PURE__ */ new Set(["stock_moves", "sale_items", "credit_ledger", "audit_log", "price_history", "agent_messages"]);
var newServerState = () => ({ seenOps: /* @__PURE__ */ new Set(), tables: /* @__PURE__ */ new Map(), cursor: 0, log: [] });
function applyOps(state, ops, serverNow = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let applied = 0, skipped = 0;
  for (const op of ops) {
    if (state.seenOps.has(op.id)) {
      skipped++;
      continue;
    }
    state.seenOps.add(op.id);
    const t = state.tables.get(op.entity) ?? /* @__PURE__ */ new Map();
    state.tables.set(op.entity, t);
    const existing = t.get(op.entity_id);
    if (APPEND_ONLY.has(op.entity) && existing && op.op !== "delete") {
      skipped++;
      continue;
    }
    if (op.op === "delete") t.set(op.entity_id, { ...existing ?? {}, id: op.entity_id, deleted_at: serverNow() });
    else t.set(op.entity_id, { ...existing ?? {}, ...op.payload_json, id: op.entity_id });
    state.log.push({ ...op, server_ts: serverNow(), seq: ++state.cursor });
    applied++;
  }
  return { applied, skipped, cursor: state.cursor };
}
function pullSince(state, since, excludeDevice) {
  return { ops: state.log.filter((o) => o.seq > since && o.device_id !== excludeDevice), cursor: state.cursor };
}
export {
  APPEND_ONLY,
  AgentMessageSchema,
  CATALOG,
  DEMO_PINS,
  DomainError,
  DukaEngine,
  MockLLMProvider,
  OpSchema,
  OpenAICompatProvider,
  PRODUCT_ALIASES,
  PermissionError,
  PinLoginSchema,
  PushSchema,
  SaleLineSchema,
  SaleSchema,
  SmsWebhookSchema,
  TABLES,
  TOOL_SCHEMAS,
  addDays,
  applyOps,
  assertCan,
  balances,
  buildDemo,
  can,
  cashPosition,
  consumeFEFO,
  costPerSellUnit,
  creditCheck,
  dayFigures,
  dayKey,
  daysBetween,
  daysOfStock,
  daysUntil,
  deriveLevels,
  detectLang,
  dicts,
  emptyDataSet,
  escalationLevel,
  eveningReport,
  expectedCash,
  expiryBand,
  expiryDiscount,
  forecast,
  formatKsh,
  fuzzySearch,
  gapAlert,
  hashPin,
  isNumWord,
  isValidPin,
  levelOf,
  loanPack,
  margin,
  matchPayment,
  missedDemand,
  monthKey,
  morningBriefing,
  newServerState,
  pad,
  parseIntent,
  parseMpesaSms,
  parseSwNumber,
  profitTruth,
  pullSince,
  recomputeChain,
  reminderTemplate,
  resolveProduct,
  runAgent,
  score,
  series,
  startOfDay,
  stockSignal,
  suggestOrder,
  sum,
  suspiciousFlags,
  toKsh,
  translate,
  validateSplit,
  variance,
  verifyPin,
  weekdayVelocity,
  weeklyNarrative
};
