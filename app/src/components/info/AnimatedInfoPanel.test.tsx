import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AnimatedInfoPanel } from './AnimatedInfoPanel';

vi.mock('./InfoPanel', () => ({ InfoPanel: () => <div>Info content</div> }));

it('keeps the closed panel inert while animating its width', async () => {
  const view = render(<AnimatedInfoPanel open mounted onClose={() => {}} />);
  const content = await screen.findByText('Info content');
  const wrapper = content.parentElement!.parentElement!;
  expect(wrapper).toHaveClass('w-80');
  view.rerender(<AnimatedInfoPanel open={false} mounted onClose={() => {}} />);
  expect(wrapper).toHaveClass('w-0');
  expect(content.parentElement).toHaveAttribute('inert');
});
