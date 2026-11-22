/** Position the last incomplete row around the center of the grid. */
export function getStatGridPlacement(index: number, count: number, columns: number) {
  const remainder = count % columns;
  const firstIncompleteIndex = count - remainder;
  if (!remainder || index < firstIncompleteIndex) return {};
  const emptyColumns = columns - remainder;
  return {
    gridColumnStart: index === firstIncompleteIndex ? Math.ceil(emptyColumns / 2) + 1 : undefined,
    offsetHalfColumn: emptyColumns % 2 === 1,
  };
}
