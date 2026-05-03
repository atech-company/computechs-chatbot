export function isValidEmail(value: string): boolean {
  const s = value.trim();
  if (!s || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
