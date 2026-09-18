/**
 * VAPID keys for Web Push. Override with VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * in production so subscriptions survive deploys.
 */
export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BNqkQq0mYkQh5c0mYkQh5c0mYkQh5c0mYkQh5c0mYkQh5c0mYkQh5c0mYkQh5c0mYkQh5c0mYkQ';
export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || '';
export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:schoolrun@localhost';

export function vapidConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
