import { AppSettings, Channel } from '@/types';

const STORAGE_KEY = 'yu-check-settings';


const defaultSettings: AppSettings = {
  channels: [],
  maxVideos: 30,
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
