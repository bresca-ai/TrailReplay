import { useAppStore } from '@/store/useAppStore';

/** Open a specific annotation without replacing the current project state. */
export function openAnnotationEditor(id: string): void {
  const state = useAppStore.getState();
  if (state.isExporting || !state.textAnnotations.some(annotation => annotation.id === id)) return;
  useAppStore.setState({ annotationEditorTarget: id, activePanel: 'pictures', isSidebarOpen: true });
}

export function clearAnnotationEditorTarget(): void {
  useAppStore.setState({ annotationEditorTarget: null });
}
