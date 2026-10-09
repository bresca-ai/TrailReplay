import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';
import { parseReplayArchive } from '@/utils/projectFile/parseReplayArchive';
import { hydrateProject } from '@/utils/projectFile/hydrateProject';
import { hasUnsavedProjectContent } from '@/utils/projectFile/hasUnsavedWork';
import { downloadReplayArchive, type SaveProjectSource } from '@/utils/projectFile/downloadReplayArchive';
import { ReplayArchiveError, type ReplayArchiveErrorCode } from '@/utils/projectFile/validation';
import { parseRouteFiles } from '@/utils/gpxParser';
import { resolveRecipe } from '@/utils/recipe/resolveRecipe';
import { applyRecipe } from '@/utils/recipe/applyRecipe';
import { RecipeError } from '@/utils/recipe/types';

export function isReplayFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.replay');
}

function errorCodeToTranslationKey(code: ReplayArchiveErrorCode): string {
  switch (code) {
    case 'corrupt': return 'projectFile.errors.corrupt';
    case 'unsupported-version': return 'projectFile.errors.unsupportedVersionUnknown';
    case 'missing-asset': return 'projectFile.errors.missingAsset';
    case 'too-large': return 'projectFile.errors.tooLarge';
  }
}

export function useProjectFile() {
  const { t } = useI18n();
  const setError = useAppStore((state) => state.setError);
  const [isSaving, setIsSaving] = useState(false);
  const fileImportStatus = useAppStore((state) => state.fileImportStatus);
  const setFileImportStatus = useAppStore((state) => state.setFileImportStatus);
  const isOpening = fileImportStatus?.kind === 'project';

  const saveProject = useCallback(async (source: SaveProjectSource) => {
    setIsSaving(true);
    try {
      await downloadReplayArchive(useAppStore.getState(), source);
    } catch (error) {
      console.error('Failed to save project:', error);
      setError(t('projectFile.errors.corrupt'));
    } finally {
      setIsSaving(false);
    }
  }, [setError, t]);

  const openProjectFile = useCallback(async (file: File) => {
    const currentState = useAppStore.getState();
    if (hasUnsavedProjectContent(currentState) && !window.confirm(t('projectFile.confirmReplace'))) {
      trackEvent('project_open_cancelled', { reason: 'confirm_replace_declined' });
      return;
    }

    setFileImportStatus({ kind: 'project', fileName: file.name, fileCount: 1 });
    trackEvent('project_open_started', {});
    try {
      const parsed = await parseReplayArchive(file);

      if (parsed.project) {
        hydrateProject({ ...parsed, project: parsed.project }, useAppStore.getState());
        useAppStore.getState().setSourceRecipe(parsed.recipe);
      } else if (parsed.recipe) {
        // A recipe and its routes, with nothing resolved: the same work as
        // dropping the folder, so it goes through the same resolver rather than
        // a second implementation of it.
        const parsedRoutes = await parseRouteFiles(parsed.routes.map((route) =>
          new File([route.gpxText], route.fileName, { type: 'application/gpx+xml' })
        ));
        if (parsedRoutes.length !== parsed.routes.length) {
          throw new ReplayArchiveError('corrupt', 'One or more archived routes could not be parsed');
        }
        const resolved = resolveRecipe(
          parsed.recipe,
          parsedRoutes.map((route) => route.track),
          parsedRoutes.map((route) => route.fileName),
        );
        applyRecipe(parsed.recipe, resolved, useAppStore.getState());
        useAppStore.getState().setRecipeReport(resolved.report);
      }

      trackEvent('project_open_completed', {
        format_version: parsed.manifest.formatVersion,
        track_count: parsed.tracks.length || parsed.routes.length,
        picture_count: parsed.project?.pictures?.length ?? 0,
        video_count: parsed.project?.videos?.length ?? 0,
        project_from_recipe: parsed.recipe !== null,
      });
      toast.success(t('projectFile.opened'));
    } catch (error) {
      console.error('Failed to open project:', error);
      if (error instanceof RecipeError) {
        setError(error.message);
        trackEvent('project_open_failed', { error_code: 'recipe' });
        return;
      }
      const key = error instanceof ReplayArchiveError
        ? errorCodeToTranslationKey(error.code)
        : 'projectFile.errors.corrupt';
      trackEvent('project_open_failed', {
        error_code: error instanceof ReplayArchiveError ? error.code : 'unknown',
      });
      setError(t(key));
    } finally {
      setFileImportStatus(null);
    }
  }, [setError, setFileImportStatus, t]);

  return { saveProject, openProjectFile, isSaving, isOpening };
}
