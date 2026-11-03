import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LocationChapterLabel } from './LocationChapterLabel';

afterEach(cleanup);
it('uses the chosen overlay font and preserves flag and name independently', () => {
  const { rerender } = render(<LocationChapterLabel label="🇪🇸 Catalunya" accent="#ff0000" font="editorial" />);
  const label = screen.getByRole('status', { name: '🇪🇸 Catalunya' });
  expect(label.style.fontFamily).toContain('Source Serif 4');
  expect(label.style.borderLeft).toBe('');
  expect(label).toHaveAttribute('data-location-flag', '🇪🇸');
  expect(label).toHaveAttribute('data-location-name', 'Catalunya');
  expect(label).toHaveAttribute('data-location-accent', '#ff0000');
  rerender(<LocationChapterLabel label="Catalunya" accent="#123456" font="modern" />);
  expect(screen.getByRole('status', { name: 'Catalunya' }).style.fontFamily).toContain('Inter');
  expect(label).toHaveAttribute('data-location-flag', '');
  rerender(<LocationChapterLabel label="🇫🇷" accent="#123456" font="modern" />);
  expect(screen.getByRole('status', { name: '🇫🇷' })).toHaveAttribute('data-location-name', '');
});
