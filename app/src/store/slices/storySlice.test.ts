import { describe, expect, it } from 'vitest';
import { createAppStore } from '@/store/createAppStore';
import { createEditHistory } from '@/store/editHistory';
import { createDefaultStory } from '@/utils/story/storyDocument';

const atKm = (km: number) => ({ ref: null, place: { routeMeters: km * 1000 } });

describe('story in the app store', () => {
  it('starts empty and writes each edit', () => {
    const store = createAppStore();
    expect(store.getState().story).toEqual(createDefaultStory());

    store.getState().updateStory({ type: 'setCover', title: 'Three days on the GR11' });
    store.getState().updateStory({ type: 'addSection', id: 'camp', anchor: atKm(6.5), prefill: { heading: 'Camp', text: 'We slept here.' } });

    expect(store.getState().story).toMatchObject({
      title: 'Three days on the GR11',
      sections: [{ id: 'camp', heading: 'Camp', anchor: atKm(6.5), blocks: [{ kind: 'text', text: 'We slept here.' }] }],
    });
  });

  it('neither notifies subscribers nor records an undo step for an edit that changes nothing', () => {
    const store = createAppStore();
    const history = createEditHistory(store);
    store.getState().updateStory({ type: 'setCover', title: 'Cover' });
    const written = store.getState().story;

    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified += 1; });
    store.getState().updateStory({ type: 'setCover', title: 'Cover' });
    store.getState().updateStory({ type: 'removeSection', id: 'missing' });
    store.getState().updateStory({ type: 'setLayout', layout: { view: 'sideways' as never } });
    unsubscribe();

    expect(notified).toBe(0);
    expect(store.getState().story).toBe(written);
    expect(history.undo()).toBe(true);
    expect(store.getState().story).toEqual(createDefaultStory());
    expect(history.undo()).toBe(false);
    history.dispose();
  });

  it('undoes and redoes story edits one step at a time', () => {
    const store = createAppStore();
    const history = createEditHistory(store);
    store.getState().updateStory({ type: 'setLayout', layout: { view: '3d' } });
    store.getState().updateStory({ type: 'addSection', id: 'pass', anchor: atKm(12) });
    store.getState().updateStory({ type: 'addBlock', sectionId: 'pass', block: { id: 'b1', kind: 'text', text: 'Wind.' } });
    const edited = store.getState().story;

    expect(history.undo()).toBe(true);
    expect(store.getState().story.sections[0].blocks).toEqual([]);
    expect(history.undo()).toBe(true);
    expect(store.getState().story.sections).toEqual([]);
    expect(store.getState().story.layout.view).toBe('3d');
    expect(history.undo()).toBe(true);
    expect(store.getState().story).toEqual(createDefaultStory());

    while (history.redo());
    expect(store.getState().story).toEqual(edited);
    history.dispose();
  });

  it('reset restores the default story', () => {
    const store = createAppStore();
    store.getState().updateStory({ type: 'setCover', title: 'Cover', intro: 'Intro' });
    store.getState().updateStory({ type: 'addSection', id: 'camp', anchor: atKm(1) });
    store.getState().reset();
    expect(store.getState().story).toEqual(createDefaultStory());
  });
});
