//VERSION=3
// Sentinel Hub TRUE_COLOR layer, synchronized with tile cache version 2.
// Bump the cache version whenever the configured visual rendering changes.
function setup() {
  return { input: ['B04', 'B03', 'B02', 'dataMask'], output: { bands: 4 } };
}
function evaluatePixel(sample) {
  const tone = value => 1 - Math.exp(-1.8 * Math.max(0, value));
  return [tone(sample.B04), tone(sample.B03), tone(sample.B02), sample.dataMask];
}
