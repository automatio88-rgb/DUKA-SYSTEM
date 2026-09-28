/** PIN hashing: SHA-256(shopId:pin) with a pepper. PINs are 4 digits so this is device-auth, not a vault; server adds rate limiting. */
export async function hashPin(shopId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`duka:v1:${shopId}:${pin}`);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyPin(shopId: string, pin: string, hash: string) { return (await hashPin(shopId, pin)) === hash; }
export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);
