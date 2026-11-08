/**
 * Tiny i18n: `t('English text')` returns the Indonesian translation when the language is "id" (default),
 * otherwise the English text itself. The English text is the key, so unwrapped strings simply stay English.
 * Placeholders: t('Hello, {name}', { name }). Switching language reloads the page, so module-level constants are safe.
 */
import { idCore } from './id.core';
import { idManage } from './id.manage';
import { idReminders } from './id.reminders';

export type Lang = 'id' | 'en';

function readLang(): Lang {
  try {
    const v = localStorage.getItem('lang');
    if (v === 'id' || v === 'en') return v;
  } catch {
    /* storage unavailable: use the default */
  }
  return 'id';
}

let lang: Lang = readLang();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const dict: Record<string, string> = { ...idCore, ...idReminders, ...idManage };

export const getLang = (): Lang => lang;

export function setLang(next: Lang): void {
  try {
    localStorage.setItem('lang', next);
  } catch {
    /* ignore */
  }
  lang = next;
  location.reload();
}

export function t(source: string, vars?: Record<string, string | number>): string {
  let out = lang === 'id' ? (dict[source] ?? source) : source;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return out;
}

/** For tooling: every English source string that has an Indonesian translation. */
export const translatedKeys = (): string[] => Object.keys(dict);
