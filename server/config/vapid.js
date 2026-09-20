/**
 * VAPID keys for Web Push. Override with VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * in production so subscriptions survive deploys.
 */
export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BDf5_1a72MMNKOv8e1NK7eA5nPvGqh7pPXvxtaPYlGTnpRGM4K95qr_PWdfR8Jn3LIqEHhODs16D8ZXNEjxx05c';
export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'rnEs7IW1cuzQnR7aZMnkyELd5H0KbxWS_C5KRtF1UHg';
export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:schoolrun@localhost';

export function vapidConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
