import { hex, hmac, importHmacKey, timingSafeEqual, type BinaryLike } from './crypto.ts';

/** Name of the request header Private Packagist puts the webhook signature in. */
export const WEBHOOK_SIGNATURE_HEADER = 'Packagist-Signature';

/**
 * Checks the Packagist-Signature header of incoming webhooks: "sha1=" plus the hex HMAC-SHA1 of
 * the raw request body, keyed with the webhook secret. Pass the body exactly as received, before
 * any JSON parsing.
 */
export class WebhookSignature {
  readonly #key: Promise<CryptoKey>;

  constructor(secret: string) {
    this.#key = importHmacKey(secret, 'SHA-1');
  }

  /** The signature Private Packagist sends for this payload. */
  async sign(payload: BinaryLike | null | undefined): Promise<string> {
    return `sha1=${hex(await hmac(await this.#key, payload ?? ''))}`;
  }

  /** True when `signature` matches the payload. The comparison takes the same time wherever the strings differ. */
  async validate(signature: string | null | undefined, payload: BinaryLike | null | undefined): Promise<boolean> {
    return timingSafeEqual(await this.sign(payload), String(signature ?? ''));
  }
}

/** One-off form of WebhookSignature#validate. */
export async function validateWebhookSignature(
  secret: string,
  signature: string | null | undefined,
  payload: BinaryLike | null | undefined,
): Promise<boolean> {
  return new WebhookSignature(secret).validate(signature, payload);
}
