export type UserProfile = {
  id: string;
  email: string;
  name: string;
};

const AUTH_STORAGE_KEY = "lumina.auth.user";

export function getStoredUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveUser(user: UserProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function clearUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
