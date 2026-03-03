import { AppSettings, Channel, DateRange } from '@/types';

const STORAGE_KEY = 'yu-check-settings';
const KEYWORDS_KEY = 'yu-check-saved-keywords';

const defaultSettings: AppSettings = {
  channels: [],
  maxVideos: 30,
  dateRange: '3months',
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function addChannel(channel: Channel): void {
  const settings = loadSettings();
  settings.channels = [...settings.channels, channel];
  saveSettings(settings);
}

export function removeChannel(id: string): void {
  const settings = loadSettings();
  settings.channels = settings.channels.filter((c) => c.id !== id);
  saveSettings(settings);
}

export function updateMaxVideos(maxVideos: number): void {
  const settings = loadSettings();
  settings.maxVideos = maxVideos;
  saveSettings(settings);
}

export function updateDateRange(dateRange: DateRange): void {
  const settings = loadSettings();
  settings.dateRange = dateRange;
  saveSettings(settings);
}

// ============================================================
// 保存キーワード管理
// ============================================================

export function loadSavedKeywords(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYWORDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function saveKeyword(keyword: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const current = loadSavedKeywords();
  if (current.includes(trimmed)) return; // 重複なし
  const next = [...current, trimmed].slice(-20); // 最大20件
  localStorage.setItem(KEYWORDS_KEY, JSON.stringify(next));
}

export function removeSavedKeyword(keyword: string): void {
  if (typeof window === 'undefined') return;
  const current = loadSavedKeywords();
  const next = current.filter((k) => k !== keyword);
  localStorage.setItem(KEYWORDS_KEY, JSON.stringify(next));
}
