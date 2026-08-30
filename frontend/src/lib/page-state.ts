const storagePrefix = "code-tutor:page-state:";
const storageVersion = 1;
const maximumSerializedLength = 256_000;

type StoredPageState<T> = {
  updatedAt: string;
  value: T;
  version: number;
};

export function pageStateKey(scope: string, userId?: string | null) {
  return `${storagePrefix}${userId ? `user:${userId}:` : "device:"}${scope}`;
}

export function loadPageState<T>(key: string, validate: (value: unknown) => value is T): T | null {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.localStorage.getItem(key);
    if (!serialized || serialized.length > maximumSerializedLength) return null;
    const stored = JSON.parse(serialized) as Partial<StoredPageState<unknown>>;
    if (stored.version !== storageVersion || !validate(stored.value)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return stored.value;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function savePageState<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify({
      updatedAt: new Date().toISOString(),
      value,
      version: storageVersion,
    } satisfies StoredPageState<T>);
    if (serialized.length <= maximumSerializedLength) window.localStorage.setItem(key, serialized);
  } catch {
    // A full or unavailable localStorage must never make the page unusable.
  }
}

export function clearPageState(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export function clearUserPageStates(userId: string) {
  if (typeof window === "undefined") return;
  const userPrefix = `${storagePrefix}user:${userId}:`;
  const matchingKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(userPrefix)) matchingKeys.push(key);
  }
  for (const key of matchingKeys) window.localStorage.removeItem(key);
}
