// Property 33: Profile and slot name and PIN validation (Requirements 22.1, 22.3, 22.9).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sameDisplayName, validateDisplayName, validatePin, validateSlotName } from '../src/validation';

const anyText = fc.oneof(fc.string(), fc.constantFrom('', ' ', '   ', 'Jan', ' Julia ', 'é', '😀'));
const pinText = fc.oneof(fc.constant(''), fc.stringMatching(/^[0-9]{0,8}$/), fc.string());

describe('Profile and slot name and PIN validation', () => {
  // Feature: human-resource-mvp, Property 33: Profile and slot name and PIN validation
  it('Property 33: display names are accepted exactly when they are 1 to 20 characters after trimming', () => {
    fc.assert(
      fc.property(anyText, (name) => {
        const n = name.trim().length;
        const expected = n >= 1 && n <= 20 ? null : 'invalid_name';
        expect(validateDisplayName(name)).toBe(expected);
      }),
    );
  });

  it('Property 33: slot names are accepted exactly when they are 1 to 30 characters after trimming', () => {
    fc.assert(
      fc.property(anyText, (name) => {
        const n = name.trim().length;
        const expected = n >= 1 && n <= 30 ? null : 'invalid_name';
        expect(validateSlotName(name)).toBe(expected);
      }),
    );
  });

  it('Property 33: PIN is accepted exactly when it is empty (no PIN) or 4 to 6 ASCII digits', () => {
    fc.assert(
      fc.property(pinText, (pin) => {
        const expected = pin === '' || /^[0-9]{4,6}$/.test(pin) ? null : 'invalid_pin';
        expect(validatePin(pin)).toBe(expected);
      }),
    );
  });

  it('Property 33: display names that differ only by case and surrounding spaces are the same name', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z]{1,10}$/), (name) => {
        expect(sameDisplayName(name, ` ${name.toUpperCase()} `)).toBe(true);
        expect(sameDisplayName(name, `${name}x`)).toBe(false);
      }),
    );
  });

  it('boundary examples: 20 and 21 character names, 30 and 31 character slot names, PIN lengths', () => {
    expect(validateDisplayName('a'.repeat(20))).toBeNull();
    expect(validateDisplayName('a'.repeat(21))).toBe('invalid_name');
    expect(validateDisplayName('   ')).toBe('invalid_name');
    expect(validateSlotName('s'.repeat(30))).toBeNull();
    expect(validateSlotName('s'.repeat(31))).toBe('invalid_name');
    expect(validatePin('1234')).toBeNull();
    expect(validatePin('123456')).toBeNull();
    expect(validatePin('123')).toBe('invalid_pin');
    expect(validatePin('1234567')).toBe('invalid_pin');
    expect(validatePin(' 1234')).toBe('invalid_pin');
  });
});
