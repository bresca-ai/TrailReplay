import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AnimatedInfoPanel } from './AnimatedInfoPanel';

const resize = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@/components/sidebar/useRailMapResize', () => ({ useRailMapResize: () => resize }));
vi.mock('./InfoPanel', () => ({ InfoPanel: () => <div>Info content</div> }));

it('animates the panel while keeping the map in step with its width', async () => {
  const view = render(<AnimatedInfoPanel open mounted onClose={() => {}} />);
  const content = await screen.findByText('Info content');
  const wrapper = content.parentElement!.parentElement!;
  expect(wrapper).toHaveClass('w-80');
  const start = new Event('transitionstart', { bubbles: true });
  Object.defineProperty(start, 'propertyName', { value: 'width' });
  const end = new Event('transitionend', { bubbles: true });
  Object.defineProperty(end, 'propertyName', { value: 'width' });
  fireEvent(wrapper, start);
  fireEvent(wrapper, end);
  expect(resize.start).toHaveBeenCalledOnce();
  expect(resize.stop).toHaveBeenCalledOnce();
  view.rerender(<AnimatedInfoPanel open={false} mounted onClose={() => {}} />);
  expect(wrapper).toHaveClass('w-0');
  expect(content.parentElement).toHaveAttribute('inert');
});
