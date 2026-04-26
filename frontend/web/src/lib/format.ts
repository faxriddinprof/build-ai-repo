/**
 * Format seconds into "MM:SS" string.
 * e.g. 134 → "02:14"
 */
export function fmtTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Mask a phone number: "+998901234567" → "+998 90 ••• 23 45"
 * If the string already contains "•", returns it as-is.
 */
export function maskPhone(phone: string): string {
  if (phone.includes('•')) return phone
  // Strip non-digit chars for analysis
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 9) return phone
  // Uzbek format: +998 XX ••• YY ZZ
  // digits: 998 XXYYYYYY
  const countryAndCode = digits.slice(0, 5)  // 99890
  const lastFour = digits.slice(-4)
  const last2a = lastFour.slice(0, 2)
  const last2b = lastFour.slice(2)
  return `+${countryAndCode.slice(0, 3)} ${countryAndCode.slice(3)} ••• ${last2a} ${last2b}`
}
