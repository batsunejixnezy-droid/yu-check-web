/**
 * YouTube API キーのローテーション管理
 * 複数のAPIキーを登録して、クォータ切れ時に自動で切り替える
 */

const KEYS_STORAGE_KEY = 'yu-check-api-keys';
const EXHAUSTED_STORAGE_KEY = 'yu-check-quota-exhausted';

// クォータ消費量の目安 (1日10,000ユニット)
// search: 100, videos.list: 1, channels.list: 1
export const QUOTA_COSTS = {
  search: 100,
  videos: 1,
  channels: 1,
} as const;

interface ExhaustedState {
  [key: string]: number; // key -> 枯渇した日付 (YYYYMMDD の数値)
}

function todayNumber(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function loadApiKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveApiKeys(keys: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
}

export function addApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  const current = loadApiKeys();
  if (current.includes(trimmed)) return;
  saveApiKeys([...current, trimmed]);
}

export function removeApiKey(key: string): void {
  saveApiKeys(loadApiKeys().filter((k) => k !== key));
}

function loadExhaustedState(): ExhaustedState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(EXHAUSTED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExhaustedState(state: ExhaustedState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EXHAUSTED_STORAGE_KEY, JSON.stringify(state));
}

export function markKeyExhausted(key: string): void {
  const state = loadExhaustedState();
  state[key] = todayNumber();
  saveExhaustedState(state);
}

function isKeyExhausted(key: string): boolean {
  const state = loadExhaustedState();
  return state[key] === todayNumber();
}

/**
 * 使用可能な最初のAPIキーを返す。
 * ユーザーキーがある場合はそれを返す（クォータ切れキーはスキップ）。
 * ない場合は null（サーバー側の環境変数キーを使用）。
 */
export function getActiveApiKey(): string | null {
  const keys = loadApiKeys();
  for (const key of keys) {
    if (!isKeyExhausted(key)) return key;
  }
  return null; // サーバー環境変数にフォールバック
}

/**
 * 現在のキーをスキップして次の使用可能なキーを返す
 */
export function getNextApiKey(currentKey: string): string | null {
  const keys = loadApiKeys();
  const idx = keys.indexOf(currentKey);
  for (let i = idx + 1; i < keys.length; i++) {
    if (!isKeyExhausted(keys[i])) return keys[i];
  }
  return null;
}

/**
 * 今日枯渇したキーの数を返す
 */
export function getExhaustedCount(): number {
  const keys = loadApiKeys();
  return keys.filter((k) => isKeyExhausted(k)).length;
}

/**
 * ユーザーキーのステータス一覧
 */
export function getApiKeyStatus(): { key: string; masked: string; exhausted: boolean }[] {
  const keys = loadApiKeys();
  return keys.map((k) => ({
    key: k,
    masked: k.slice(0, 8) + '...' + k.slice(-4),
    exhausted: isKeyExhausted(k),
  }));
}
