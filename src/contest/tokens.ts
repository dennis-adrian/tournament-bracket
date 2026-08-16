const HOST_PREFIX = 'contest-host:';
const CLIENT_PREFIX = 'contest-client:';
const HOST_INDEX_KEY = 'contest-host-index';

export type HostIndexItem = {
  slug: string;
  name: string;
  createdAt: string;
};

export function getHostToken(slug: string): string | null {
  return localStorage.getItem(HOST_PREFIX + slug);
}

export function saveHostToken(slug: string, token: string, name: string): void {
  let stored = false;
  try {
    localStorage.setItem(HOST_PREFIX + slug, token);
    stored = true;
  } catch {
    // Quota or private mode: caller still has the token to show as a fallback.
  }
  try {
    // Only list contests whose token survived: an entry without its token
    // would link the host to a contest they can no longer control.
    const index = listHostedContests().filter((item) => item.slug !== slug);
    if (stored) {
      index.unshift({ slug, name, createdAt: new Date().toISOString() });
    }
    localStorage.setItem(HOST_INDEX_KEY, JSON.stringify(index.slice(0, 12)));
  } catch {
    // Same: keep going so the host link and token can still be displayed.
  }
}

export function listHostedContests(): HostIndexItem[] {
  try {
    const raw = localStorage.getItem(HOST_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HostIndexItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getOrCreateClientToken(slug: string): string {
  const existing = localStorage.getItem(CLIENT_PREFIX + slug);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(CLIENT_PREFIX + slug, token);
  return token;
}

export function peekClientToken(slug: string): string | null {
  return localStorage.getItem(CLIENT_PREFIX + slug);
}
