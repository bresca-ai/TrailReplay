import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { Sidebar } from './Sidebar';

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
});
afterEach(cleanup);

describe('Story tab', () => {
  it('opens the Story panel without the video steps guide', async () => {
    render(<Sidebar />);
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(useAppStore.getState().activePanel).toBe('story');
    expect(await screen.findByRole('heading', { name: 'Story', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText(/Step \d of 6/)).toBeNull();
  });
});
