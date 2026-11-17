import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { createEditHistory } from '@/store/editHistory';
import type { PictureAnnotation, TextAnnotation } from '@/types';
import { northbound } from '@/utils/story/storyTestFixtures';
import { StoryPanel } from './StoryPanel';
import { useStoryPreview } from './storyPreview';

const note: TextAnnotation = {
  id: 'note-1', progress: 0.5, routeDistance: 500, lat: 42.0045, lon: 1, title: 'Aid station', description: 'Water and oranges',
  color: '#f3b133', displayDuration: 4000,
};
const photo = (id: string, lat: number, fields: Partial<PictureAnnotation> = {}): PictureAnnotation => ({
  id, file: null, url: `blob:${id}`, isPlaceholder: false, originalFileName: `${id}.jpg`, lat, lon: 1, progress: 0, position: 0, displayDuration: 3000, ...fields,
});

const store = () => useAppStore.getState();
const sections = () => store().story.sections;
const addRoute = () => store().addTrack(northbound('Ridge', 42, 1)); // about 1.11 km due north
// A keyboard user's activation: focus moves to the control, then it is clicked.
const press = (control: HTMLElement) => { act(() => control.focus()); fireEvent.click(control); };

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView; // jsdom has none
  scrollIntoView.mockClear();
  store().reset();
  store().setSettings({ language: 'en' });
  useStoryPreview.setState({ isOpen: false, trigger: null });
});
afterEach(cleanup);

function addSectionFrom(source: 'Annotation' | 'Photo' | 'Clip' | 'Distance', choose: () => void) {
  fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Place it at' })).getByRole('button', { name: source }));
  choose();
  fireEvent.click(screen.getByRole('button', { name: 'Add section here' }));
}

describe('Story tab', () => {
  it('starts a section at an annotation with its text and leaves the annotation unchanged', () => {
    addRoute();
    store().addTextAnnotation(note);
    const annotations = store().textAnnotations;
    render(<StoryPanel />);

    addSectionFrom('Annotation', () => fireEvent.change(screen.getByRole('combobox', { name: 'Annotation' }), { target: { value: 'note-1' } }));

    expect(sections()).toMatchObject([{
      heading: 'Aid station',
      anchor: { ref: { kind: 'annotation', id: 'note-1' } },
      blocks: [{ kind: 'text', text: 'Water and oranges' }],
    }]);
    expect(sections()[0].anchor.place.routeMeters).toBeCloseTo(500, 0);
    expect(store().textAnnotations).toBe(annotations);
    expect(screen.getByText('Annotation · Aid station · 0.50 km')).toBeInTheDocument();
  });

  it('starts a section at a photo and disables a photo that is off the route', () => {
    addRoute();
    useAppStore.setState({ pictures: [photo('summit', 42.002), photo('elsewhere', 42.5)] });
    render(<StoryPanel />);

    addSectionFrom('Photo', () => {
      expect(screen.getByRole('option', { name: 'elsewhere.jpg (not on the route)' })).toBeDisabled();
      fireEvent.change(screen.getByRole('combobox', { name: 'Photo' }), { target: { value: 'summit' } });
    });

    expect(sections()).toMatchObject([{ anchor: { ref: { kind: 'picture', id: 'summit' } }, heading: '', blocks: [] }]);
    expect(sections()[0].anchor.place.routeMeters).toBeCloseTo(222, -1);
  });

  it.each([
    ['metric', 'km', '0.8', 800],
    ['imperial', 'mi', '0,5', 804.672],
  ] as const)('starts a section at a distance typed in %s units and can move it', (unitSystem, unit, typed, meters) => {
    addRoute();
    store().setUnitSystem(unitSystem);
    render(<StoryPanel />);

    addSectionFrom('Distance', () => fireEvent.change(screen.getByRole('textbox', { name: `Distance in ${unit}` }), { target: { value: typed } }));
    expect(sections()).toMatchObject([{ anchor: { ref: null } }]);
    expect(sections()[0].anchor.place.routeMeters).toBeCloseTo(meters, 3);

    fireEvent.click(screen.getByRole('button', { name: 'Change place' }));
    fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
    fireEvent.change(screen.getByRole('textbox', { name: `Distance in ${unit}` }), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move section here' }));
    expect(sections()[0].anchor.place.routeMeters).toBeCloseTo(0.25 * (unit === 'km' ? 1000 : 1609.344), 3);
  });

  it('refuses a typed distance beyond the route', () => {
    addRoute();
    render(<StoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Distance in km' }), { target: { value: '5' } });
    expect(screen.getByText('Between 0 and 1.11 km.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add section here' })).toBeDisabled();
  });

  it('keeps keyboard focus on the button that opened a picker, and moves it to a section just added', () => {
    addRoute();
    useAppStore.setState({ pictures: [photo('summit', 42.002)] });
    store().updateStory({ type: 'addSection', id: 'later', anchor: { ref: null, place: { routeMeters: 800 } } });
    render(<StoryPanel />);
    const add = screen.getByRole('button', { name: 'Add section' });

    press(add);
    expect(add).toHaveAttribute('aria-expanded', 'true');
    press(screen.getByRole('button', { name: 'Cancel' }));
    expect(add).toHaveFocus();

    // Route order puts the new section above the one at 0.8 km, far from the Add section button.
    press(add);
    press(screen.getByRole('button', { name: 'Distance' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Distance in km' }), { target: { value: '0.3' } });
    press(screen.getByRole('button', { name: 'Add section here' }));
    const added = screen.getByRole('region', { name: 'Section 1' });
    expect(within(added).getByRole('textbox', { name: 'Heading' })).toHaveFocus();
    expect(scrollIntoView.mock.contexts).toEqual([added.closest('li')]);

    const section = screen.getByRole('region', { name: 'Section 1' });
    const changePlace = within(section).getByRole('button', { name: 'Change place' });
    press(changePlace);
    press(within(section).getByRole('button', { name: 'Cancel' }));
    expect(changePlace).toHaveFocus();

    const addPhoto = within(section).getByRole('button', { name: 'Add photo' });
    press(addPhoto);
    press(within(section).getByRole('button', { name: 'summit.jpg' }));
    expect(addPhoto).toHaveFocus();
  });

  it('writes heading and text edits to the store, one undo step per field', () => {
    addRoute();
    store().updateStory({ type: 'addSection', id: 's1', anchor: { ref: null, place: { routeMeters: 300 } } });
    const history = createEditHistory(useAppStore, () => true);
    render(<StoryPanel />);
    const section = screen.getByRole('region', { name: 'Section 1' });

    fireEvent.change(within(section).getByRole('textbox', { name: 'Heading' }), { target: { value: 'Into the woods' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Add text' }));
    const text = within(section).getByRole('textbox', { name: 'Text' });
    act(() => text.focus());
    fireEvent.change(text, { target: { value: 'We' } });
    fireEvent.change(text, { target: { value: 'We left at dawn.' } });

    expect(sections()[0]).toMatchObject({ heading: 'Into the woods', blocks: [{ kind: 'text', text: 'We left at dawn.' }] });
    act(() => { history.undo(); });
    expect(sections()[0].blocks).toMatchObject([{ kind: 'text', text: '' }]);
    history.dispose();
  });

  it('adds, moves and removes photos and clips inside a section', () => {
    addRoute();
    useAppStore.setState({ pictures: [photo('summit', 42.002)] });
    store().updateStory({ type: 'addSection', id: 's1', anchor: { ref: null, place: { routeMeters: 300 } } });
    render(<StoryPanel />);
    const section = screen.getByRole('region', { name: 'Section 1' });

    fireEvent.click(within(section).getByRole('button', { name: 'Add clip' }));
    expect(within(section).getByText('This project has no clips yet.')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Add text' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }));
    fireEvent.click(within(section).getByRole('button', { name: 'summit.jpg' }));
    expect(sections()[0].blocks.map((block) => block.kind)).toEqual(['text', 'media']);
    expect(sections()[0].blocks[1]).toMatchObject({ media: { kind: 'picture', id: 'summit' } });

    fireEvent.click(within(section).getAllByRole('button', { name: 'Move up' })[1]);
    expect(sections()[0].blocks.map((block) => block.kind)).toEqual(['media', 'text']);
    fireEvent.click(within(section).getAllByRole('button', { name: 'Remove' })[0]);
    expect(sections()[0].blocks.map((block) => block.kind)).toEqual(['text']);
  });

  it('moves and removes sections', () => {
    addRoute();
    store().updateStory({ type: 'addSection', id: 'a', anchor: { ref: null, place: { routeMeters: 100 } } });
    store().updateStory({ type: 'addSection', id: 'b', anchor: { ref: null, place: { routeMeters: 200 } } });
    render(<StoryPanel />);

    fireEvent.click(within(screen.getByRole('region', { name: 'Section 2' })).getByRole('button', { name: 'Move section up' }));
    expect(sections().map((section) => section.id)).toEqual(['b', 'a']);
    expect(screen.getByText('This section comes before the one above it on the route. The map waits here instead of going back.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('region', { name: 'Section 1' })).getByRole('button', { name: 'Remove section' }));
    expect(sections().map((section) => section.id)).toEqual(['a']);
  });

  it('hands focus from a removed block or section to the same control on the next item, the previous one, then Add', () => {
    addRoute();
    for (const [id, routeMeters] of [['a', 100], ['b', 200], ['c', 300]] as const) {
      store().updateStory({ type: 'addSection', id, anchor: { ref: null, place: { routeMeters } } });
    }
    for (const id of ['one', 'two']) store().updateStory({ type: 'addBlock', sectionId: 'a', block: { id, kind: 'text', text: id } });
    render(<StoryPanel />);
    const removeSection = (index: number) => within(screen.getByRole('region', { name: `Section ${index}` })).getByRole('button', { name: 'Remove section' });
    const first = () => screen.getByRole('region', { name: 'Section 1' });

    press(within(first()).getAllByRole('button', { name: 'Remove' })[0]);
    expect(within(first()).getByRole('button', { name: 'Remove' })).toHaveFocus();
    press(within(first()).getByRole('button', { name: 'Remove' }));
    expect(within(first()).getByRole('button', { name: 'Add text' })).toHaveFocus();

    press(removeSection(2));
    expect(sections().map((section) => section.id)).toEqual(['a', 'c']);
    expect(removeSection(2)).toHaveFocus();
    press(removeSection(2));
    expect(removeSection(1)).toHaveFocus();
    press(removeSection(1));
    expect(screen.getByRole('button', { name: 'Add section' })).toHaveFocus();
  });

  it('announces new compile issues, with their section, in one polite region that stays mounted', () => {
    addRoute();
    useAppStore.setState({ pictures: [photo('unlinked', 42.002, { url: '', isPlaceholder: true })] });
    store().updateStory({ type: 'addSection', id: 'a', anchor: { ref: null, place: { routeMeters: 100 } } });
    store().updateStory({ type: 'addSection', id: 'b', anchor: { ref: null, place: { routeMeters: 200 } } });
    render(<StoryPanel />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^$/);

    fireEvent.click(within(screen.getByRole('region', { name: 'Section 2' })).getByRole('button', { name: 'Move section up' }));
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Section 2: This section comes before the one above it on the route.');

    const first = screen.getByRole('region', { name: 'Section 1' });
    fireEvent.click(within(first).getByRole('button', { name: 'Add photo' }));
    fireEvent.click(within(first).getByRole('button', { name: 'unlinked.jpg' }));
    expect(status).toHaveTextContent(/^Section 1: This file is not loaded/);
    expect(status).not.toHaveTextContent('comes before');
  });

  it('draws focus outlines inside the buttons of a clipped segmented group, so the whole ring shows', () => {
    addRoute();
    render(<StoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    const groups = screen.getAllByRole('group').filter((group) => group.classList.contains('overflow-hidden'));
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['View', 'Zoom', 'Text side', 'Map on phones', 'Place it at']);
    for (const button of groups.flatMap((group) => within(group).getAllByRole('button'))) {
      expect(button.className.split(' ')).toContain('focus-visible:-outline-offset-2');
    }
  });

  it('binds the four layout controls', () => {
    render(<StoryPanel />);
    for (const [group, option] of [['View', '3D'], ['Zoom', 'Far'], ['Text side', 'Right'], ['Map on phones', 'Bottom']]) {
      const button = within(screen.getByRole('group', { name: group })).getByRole('button', { name: option });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
    }
    expect(store().story.layout).toEqual({ view: '3d', zoom: 'far', textSide: 'right', mobileMap: 'bottom' });
  });

  it('explains compile issues next to the section or block they concern', () => {
    addRoute();
    useAppStore.setState({ pictures: [photo('unlinked', 42.002, { url: '', isPlaceholder: true })] });
    store().updateStory({ type: 'addSection', id: 's1', anchor: { ref: { kind: 'annotation', id: 'deleted' }, place: { routeMeters: 300 } } });
    for (const id of ['unlinked', 'deleted-photo']) {
      store().updateStory({ type: 'addBlock', sectionId: 's1', block: { id, kind: 'media', media: { kind: 'picture', id } } });
    }
    render(<StoryPanel />);
    const section = screen.getByRole('region', { name: 'Section 1' });

    expect(within(section).getByText('Annotation · Removed item · 0.30 km')).toBeInTheDocument();
    expect(within(section).getByText(/The annotation, photo or clip this section was placed at is gone/)).toBeInTheDocument();
    const [unlinked, deleted] = within(section).getAllByRole('listitem');
    expect(within(unlinked).getByText(/This file is not loaded/)).toBeInTheDocument();
    expect(within(deleted).getByText('Removed item')).toBeInTheDocument();
    expect(within(deleted).getByText(/This photo or clip was removed from the project/)).toBeInTheDocument();
  });

  it('disables Preview with a reason until there is a route, then opens it from the button', () => {
    const { unmount } = render(<StoryPanel />);
    expect(screen.getByRole('button', { name: 'Preview story' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview story' })).toHaveAccessibleDescription('Add a route to preview the story.');
    unmount();

    addRoute();
    render(<StoryPanel />);
    const preview = screen.getByRole('button', { name: 'Preview story' });
    fireEvent.click(preview);
    expect(useStoryPreview.getState()).toMatchObject({ isOpen: true, trigger: preview });
  });
});
