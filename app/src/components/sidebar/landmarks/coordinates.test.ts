import { describe, expect, it } from 'vitest';
import { sanitizeCoordinates } from '@/components/sidebar/landmarks/coordinates.ts';

describe('sanitizeCoordinates', () => {

  it('parses a pair of integers correctly', () => {
    const result = sanitizeCoordinates('12, 34');

    expect(result).toEqual([12, 34]);
  });

  it('parses a pair of floats correctly', () => {
    const result = sanitizeCoordinates('12.34, 56.78');

    expect(result).toEqual([12.34, 56.78]);
  });

  it('parses a negative floats correctly', () => {
    const result = sanitizeCoordinates('-12.34, -56.78');

    expect(result).toEqual([-12.34, -56.78]);
  });

  it('does not parse a single number', () => {
    const result = sanitizeCoordinates('12.34');

    expect(result).toBeUndefined();
  });

  it('does not parse non number values', () => {
    const result = sanitizeCoordinates('12x34, 56.78');

    expect(result).toBeUndefined();
  });

  it('ignores odd whitespace', () => {
    const result = sanitizeCoordinates(' 12.34,56.78 ');

    expect(result).toEqual([12.34, 56.78]);
  });

  it('does not parse latitude < -90', () => {
    const result = sanitizeCoordinates('-90.1, 56.78');

    expect(result).toBeUndefined();
  });

  it('does not parse latitude > 90', () => {
    const result = sanitizeCoordinates('90.1, 56.78');

    expect(result).toBeUndefined();
  });

  it('does not parse longitude < 180', () => {
    const result = sanitizeCoordinates('12.34, -180.1');

    expect(result).toBeUndefined();
  });

  it('does not parse longitude > 180', () => {
    const result = sanitizeCoordinates('12.34, 180.1');

    expect(result).toBeUndefined();
  });
});
