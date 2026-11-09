// Profile and slot name / PIN validation shared by client and server (22.1, 22.3, 22.9).
export type FieldError = 'invalid_name' | 'invalid_pin';

export function validateDisplayName(name: string): FieldError | null {
  const n = name.trim();
  return n.length >= 1 && n.length <= 20 ? null : 'invalid_name';
}

/** PIN is optional: empty means "no PIN"; otherwise 4–6 digits. */
export function validatePin(pin: string): FieldError | null {
  return pin === '' || /^\d{4,6}$/.test(pin) ? null : 'invalid_pin';
}

export function validateSlotName(name: string): FieldError | null {
  const n = name.trim();
  return n.length >= 1 && n.length <= 30 ? null : 'invalid_name';
}

export const sameDisplayName = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
