/**
 * Normalizes cabinets → sorted drawer lists for selects and lists.
 * @param {Array<{ id?: unknown, code?: unknown, drawers?: unknown[] }>} archiveCabinets
 * @returns {{ cabinetDrawerSections: Array<{ cab: object, drawers: object[] }>, totalDrawerOptionCount: number }}
 */
export function getArchiveCabinetDrawerSections(archiveCabinets) {
  let total = 0;
  const sections = [];
  for (const cab of archiveCabinets || []) {
    const drawers = [...(cab.drawers ?? [])]
      .filter((d) => d?.id != null)
      .sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0)
      );
    total += drawers.length;
    sections.push({ cab, drawers });
  }
  return { cabinetDrawerSections: sections, totalDrawerOptionCount: total };
}
