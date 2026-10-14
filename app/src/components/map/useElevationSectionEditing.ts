import type { AppSettings } from '@/types';
import { createId } from '@/utils/id';
import type { ElevationFocusSection, ElevationSectionPoint } from './elevationSections';
import {
  createCustomElevationSection,
  resizeElevationSection,
  upsertElevationSectionOverride,
} from './elevationSectionOverrides';

interface ElevationSectionEditingOptions {
  detectedSections: ElevationFocusSection[];
  elevationData: ElevationSectionPoint[];
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
}

export function useElevationSectionEditing({
  detectedSections,
  elevationData,
  settings,
  setSettings,
}: ElevationSectionEditingOptions) {
  const changeSectionBoundary = (
    adjustedSection: ElevationFocusSection,
    edge: 'start' | 'end',
    progress: number,
  ) => {
    const detected = detectedSections.find((section) => section.id === adjustedSection.id);
    const custom = settings.customElevationSections.find(
      (section) => section.id === adjustedSection.id,
    );
    if (!detected && !custom) return;

    const minimumSpan = 0.005;
    const requestedStart = edge === 'start'
      ? Math.min(progress, adjustedSection.endProgress - minimumSpan)
      : adjustedSection.startProgress;
    const requestedEnd = edge === 'end'
      ? Math.max(progress, adjustedSection.startProgress + minimumSpan)
      : adjustedSection.endProgress;
    const resized = resizeElevationSection(
      adjustedSection,
      elevationData,
      requestedStart,
      requestedEnd,
    );

    if (detected) {
      setSettings({
        elevationSectionOverrides: upsertElevationSectionOverride(
          settings.elevationSectionOverrides,
          detected,
          resized,
        ),
      });
      return;
    }

    setSettings({
      customElevationSections: settings.customElevationSections.map((section) => (
        section.id === adjustedSection.id
          ? {
              ...section,
              startProgress: resized.startProgress,
              endProgress: resized.endProgress,
            }
          : section
      )),
    });
  };

  const addSection = (progress: number) => {
    const section = createCustomElevationSection(
      elevationData,
      progress,
      createId('elevation-custom'),
    );
    if (!section) return;
    setSettings({
      customElevationSections: [
        ...settings.customElevationSections,
        {
          id: section.id,
          segmentIndex: section.segmentIndex,
          startProgress: section.startProgress,
          endProgress: section.endProgress,
        },
      ],
    });
  };

  const removeSection = (section: ElevationFocusSection) => {
    const isCustom = settings.customElevationSections.some((entry) => entry.id === section.id);
    if (isCustom) {
      setSettings({
        customElevationSections: settings.customElevationSections.filter(
          (entry) => entry.id !== section.id,
        ),
      });
      return;
    }
    setSettings({
      hiddenElevationSectionIds: [
        ...new Set([...settings.hiddenElevationSectionIds, section.id]),
      ],
      elevationSectionOverrides: settings.elevationSectionOverrides.filter(
        (entry) => entry.sectionId !== section.id,
      ),
    });
  };

  return {
    addSection,
    changeSectionBoundary,
    removeSection,
  };
}
