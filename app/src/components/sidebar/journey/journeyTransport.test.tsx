import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderJourneyTransportPreview } from './journeyTransport';

vi.mock('@/components/sidebar/Marker3DThumbnail', () => ({ Marker3DThumbnail: ({ value }: { value: string }) => <span data-testid="model-preview">{value}</span> }));
afterEach(cleanup);

it.each([['car', '3d-race-car'], ['bike', '3d-road-bike'], ['walk', '3d-hiker'], ['bus', '3d-bus'], ['train', '3d-train'], ['plane', '3d-plane'], ['ferry', '3d-sailboat']] as const)(
  'previews the same 3D marker used for %s transport', (mode, value) => {
    render(renderJourneyTransportPreview(mode, 54, '#c1652f', 'dot'));
    expect(screen.getByTestId('model-preview').textContent).toBe(value);
  },
);

it('shows a camera symbol for camera transitions', () => {
  const { container } = render(renderJourneyTransportPreview('camera', 54, '#c1652f', 'dot'));
  expect(container.querySelector('svg')).not.toBeNull();
});
