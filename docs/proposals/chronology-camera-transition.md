# Camera transition between routes

## Goal

Offer a camera transition alongside transport in chronology. It zooms out from the end of one route, moves to the next route's start, then zooms in. No vehicle, connecting trail, or travelled distance is implied. Its duration is editable like other chronology entries and survives save and restore.

## Implementation plan

1. Represent the transition explicitly in the persisted journey model, with endpoints and duration. Add it to the chronology picker and support reorder, removal, seeking, editing, and translations. Keep existing transport and project files compatible.
2. Give it a real interval on the playback timeline, including uniform timing. Currently uniform playback maps progress directly to distance in `useComputedJourney`; a zero-distance interval would otherwise disappear. Centralize the mapping so preview, seeking, stats, and export use the same segment and local progress.
3. Keep its endpoints for camera planning but exclude the gap from journey distance, route projections, elevation and route lines. Split all line styles at the discontinuity, including completed and transport overlays, instead of relying on a single flattened LineString.
4. Derive a deterministic camera pose from transition progress: ease out to a zoom that fits the endpoints, move between them at the wider scale, then ease in to the next route pose. Hide the playback marker and label during the transition. Apply the same pose in preview and frame-by-frame export; define overview and cinematic behavior explicitly, and reset smoothing across the discontinuity.
5. Verify both timing modes, all trail color modes, seeking and reverse seeking, duration edits, persistence, route distances and stats, all camera modes, dateline crossings, same-location endpoints, and preview/export parity. Add focused unit and integration tests and exercise a two-route example in the browser.
