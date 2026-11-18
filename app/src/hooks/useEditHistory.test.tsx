import { renderHook, fireEvent, cleanup, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { enterCoverHistory, notifyCoverHistory, useEditHistory } from './useEditHistory';

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
it('exposes actionable history and disables it while the cover editor is active', () => {
  const { result } = renderHook(() => useEditHistory());
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(false);
  act(() => useAppStore.getState().setSettings({ elevationProfileHeight: 3 }));
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(true);
  let leave = () => {};
  act(() => { leave = enterCoverHistory(); });
  expect(result.current.canRedo).toBe(false);
  act(() => leave());
  expect(result.current.canRedo).toBe(true);
  act(() => result.current.redo());
  expect(useAppStore.getState().settings.elevationProfileHeight).toBe(3);
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
it('connects header actions to the active cover editor history', () => {
  const { result } = renderHook(() => useEditHistory());
  let undoAvailable = false;
  let redoAvailable = false;
  const undo = vi.fn(() => { undoAvailable = false; redoAvailable = true; notifyCoverHistory(); });
  const redo = vi.fn(() => { undoAvailable = true; redoAvailable = false; notifyCoverHistory(); });
  let leave = () => {};
  act(() => { leave = enterCoverHistory({ canUndo: () => undoAvailable, canRedo: () => redoAvailable, undo, redo }); });
  expect(result.current.canUndo).toBe(false);
  act(() => { undoAvailable = true; notifyCoverHistory(); });
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(undo).toHaveBeenCalledOnce();
  expect(result.current.canRedo).toBe(true);
  act(() => result.current.redo());
  expect(redo).toHaveBeenCalledOnce();
  act(() => leave());
});
afterEach(() => { cleanup(); useAppStore.getState().reset(); });
