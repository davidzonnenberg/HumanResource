// AMROBOT bank rules (pure): money formatting and the transfer form. The Simulation validates again;
// this only gives the player a friendly message before the Command is sent.
import { goldFromWhole } from '@hr/sim';

export type BankAccount = 'balance' | 'savings';

export const PIN_RE = /^\d{5}$/;

/** "1.130,00" pieces for Gold in hundredths: whole part with dots, cents shown small. */
export function splitGold(g: number): { neg: boolean; whole: string; cents: string } {
  const a = Math.abs(Math.trunc(g));
  return { neg: g < 0, whole: String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), cents: String(a % 100).padStart(2, '0') };
}

export type PinCheck = 'ok' | 'digits' | 'length';
export function checkPin(v: string): PinCheck {
  if (PIN_RE.test(v)) return 'ok';
  return /\D/.test(v) ? 'digits' : 'length';
}

export type TransferPlan =
  | { ok: true; direction: 'toSavings' | 'toBalance'; amount: number }
  | { ok: false; errorKey: 'app.bank.err.same' | 'app.bank.err.amount' | 'app.bank.err.funds' };

/** `wholeText` is whole Gold typed by the player; money is in hundredths. */
export function planTransfer(from: BankAccount, to: BankAccount, wholeText: string, gold: number, savings: number): TransferPlan {
  if (from === to) return { ok: false, errorKey: 'app.bank.err.same' };
  const whole = /^\d{1,12}$/.test(wholeText) ? Number(wholeText) : 0;
  if (whole <= 0) return { ok: false, errorKey: 'app.bank.err.amount' };
  const amount = goldFromWhole(whole);
  const available = from === 'balance' ? gold : savings;
  if (amount > available) return { ok: false, errorKey: 'app.bank.err.funds' };
  return { ok: true, direction: from === 'balance' ? 'toSavings' : 'toBalance', amount };
}

/** Largest whole-Gold amount that can leave this account (the "All" chip). */
export function maxWhole(account: BankAccount, gold: number, savings: number): number {
  return Math.max(0, Math.floor((account === 'balance' ? gold : savings) / 100));
}
