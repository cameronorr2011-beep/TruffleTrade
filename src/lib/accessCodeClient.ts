"use client";

/**
 * Client-side access-code storage. Subscribers paste the code they bought once;
 * it rides along as x-access-code on AI-burning requests (research runs, cycles).
 * Stored in localStorage only — never sent anywhere except this site's own API.
 */
const KEY = "tt-access-code";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string): void {
  try {
    localStorage.setItem(KEY, code.trim().toUpperCase());
  } catch {
    // storage blocked
  }
}

export function authHeaders(): Record<string, string> {
  const code = getAccessCode();
  return code ? { "x-access-code": code } : {};
}
