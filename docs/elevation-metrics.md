# Elevation totals

Ascent and descent are estimates derived from the GPX, KML or FIT altitude samples.
They need not exactly match a provider that corrects altitude against a different
terrain model or uses another smoothing policy. They are not the difference
between a route's highest and lowest points. Elevation focus sections separately
show the net change between their actual endpoints.

For routes with cumulative distances, `utils/gpx/elevationGain.ts` resamples the
altitude profile every 10 metres and applies a median filter over a 200-metre
horizontal window. Uniform spacing prevents a dense cluster of noisy fixes from
receiving more weight than a sparsely recorded stretch. A 10-metre vertical
reversal confirms a change between ascent and descent; once a climb is confirmed,
its full height is counted through its summit rather than rounded to 10-metre
increments. The observed start and finish are retained. Very sparse routes retain
their observed climbs without smoothing; altitude-only callers use a five-point
median because a physical distance window is unavailable.

The original points and altitudes are unchanged. The filtered cumulative ascent
and descent profiles are cached per immutable point array. Playback reads that
same profile, rather than re-filtering each growing prefix, so the ascent cannot
decrease as the marker moves forward. Route cards, cover summaries and playback
therefore agree at the finish. Journey legs retain separate profiles so returning
to a shared start never introduces a fictitious climb between routes.

Saved replay projects reparse their bundled routes on opening, so reopening a
project applies the updated calculation without changing authored camera shots,
annotations or elevation-section endpoint labels. Previously exported videos
must be exported again.

## Reference check

The published organizer-owned Wikiloc tracks report [1,205 m for Cursa de l'Alba](https://es.wikiloc.com/rutas-carrera-por-montana/xterra-cursa-de-lalba-209154158)
and [692 m for MitjAlba](https://ca.wikiloc.com/rutes-cursa-de-muntanya/mitja-alba-209154085).
A local comparison against those GPXs changed the estimates from 1,411 / 843 m to
1,216 / 689 m, respectively. These are independent estimates, within about 1% of
the published totals, rather than route-specific constants or a claim to reproduce
Wikiloc's private calculation. [Wikiloc describes terrain-model correction](https://help.wikiloc.com/article/123-the-elevations-from-the-app-do-not-seem-correct)
as part of its elevation processing.

Regression tests use synthetic profiles, including sample-density invariance,
GPS jitter, sustained climbs, sparse tracks and monotonic playback accumulation.
Private replay/GPX fixtures are not committed.
