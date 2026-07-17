type ClassValue = string | false | null | undefined

/** Concatène des classes conditionnelles : cx(s.btn, isPrimary && s.primary). */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ')
}
