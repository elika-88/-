export const AUTH_EVENT_KEY = 'lumina.auth.changed';
export function notifyAuthChanged() {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lumina-auth');
  channel?.postMessage('changed'); channel?.close();
  // Fallback for browsers without BroadcastChannel; contains no identity or credentials.
  try { localStorage.setItem(AUTH_EVENT_KEY, crypto.randomUUID()); } catch { /* Focus revalidation still applies. */ }
}
