import { renderHook, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { useEditHistory } from './useEditHistory';

it('uses browser text history while allowing Ctrl+R to redo text without reloading', () => {
  renderHook(() => useEditHistory());
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  const exec = vi.fn();
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
  const undo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(undo);
  expect(undo.defaultPrevented).toBe(false);
  const redo = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(redo);
  expect(redo.defaultPrevented).toBe(true);
  expect(exec).toHaveBeenCalledWith('redo');
  input.remove();
  delete (document as unknown as { execCommand?: unknown }).execCommand;
});

it('undoes and redoes editor changes when focus is outside a text field', () => {
  const before = useAppStore.getState().settings.elevationProfileHeight;
  renderHook(() => useEditHistory());
  useAppStore.getState().setSettings({ elevationProfileHeight: 2 });
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(useAppStore.getState().settings.elevationProfileHeight).toBe(before);
  fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
  expect(useAppStore.getState().settings.elevationProfileHeight).toBe(2);
});
afterEach(() => { cleanup(); useAppStore.getState().reset(); });
