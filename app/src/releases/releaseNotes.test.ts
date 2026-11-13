import { describe, expect, it } from 'vitest';
import { parseReleaseNotes } from './releaseNotes';

describe('parseReleaseNotes', () => {
  it('reads dated releases and their sections without publishing an undated draft', () => {
    const notes = parseReleaseNotes(`# Changelog\n## [1.3.0]\n\n### Added\n- Not released\n## [1.2.0] - 2026-10-06\n\nA summary.\n\n### Added\n\n- **Camera:** New shots.\n\n### Fixed\n- Timing.\n\n[1.2.0]: https://example.com\n`);
    expect(notes).toEqual([{ version: '1.2.0', date: '2026-10-06', introduction: ['A summary.'], sections: [{ title: 'Added', items: ['**Camera:** New shots.'] }, { title: 'Fixed', items: ['Timing.'] }] }]);
  });
});
