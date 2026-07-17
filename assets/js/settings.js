// ==========================================================================
// SETTINGS — app-wide preferences
// ==========================================================================
import { getState, persist, resetApplication, replaceState, exportJSON } from './storage.js';
import { download } from './utilities.js';

export function getSettings() { return getState().settings; }

export function updateSettings(patch) {
  const s = getState();
  Object.assign(s.settings, patch);
  persist();
  window.__LEDGER_SETTINGS__ = s.settings;
  applyTheme(s.settings.theme);
  return s.settings;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

export function exportBackupJSON() {
  download('finance-backup.json', exportJSON(), 'application/json');
}

export function importBackupJSON(jsonText) {
  const parsed = JSON.parse(jsonText);
  return replaceState(parsed);
}

export function resetApp(withSample = true) {
  return resetApplication(withSample);
}
