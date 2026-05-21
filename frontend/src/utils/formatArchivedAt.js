/** Formats ISO date from archive placement for display in the document viewer Status section. */
export function formatArchivedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Second line under "Archived at": C, D, F (if any), then folder name when set, else a drawer label if not redundant with D{code}.
 */
export function formatArchiveCabinetDrawerLine({
  cabinetCode,
  drawerName,
  drawerCode,
  folderNumber,
  folderName,
}) {
  const parts = [];
  if (cabinetCode != null && String(cabinetCode).trim() !== '') {
    parts.push(`C${cabinetCode}`);
  }
  const d = drawerCode != null && String(drawerCode).trim() !== '' ? `D${drawerCode}` : null;
  if (d) parts.push(d);
  if (folderNumber != null && Number(folderNumber) > 0) {
    parts.push(`F${folderNumber}`);
  }
  const folderTrim = folderName != null && String(folderName).trim() !== '' ? String(folderName).trim() : '';
  if (folderTrim) {
    parts.push(folderTrim);
  } else {
    const nameTrim = drawerName != null && String(drawerName).trim() !== '' ? String(drawerName).trim() : '';
    if (nameTrim && nameTrim !== d) {
      parts.push(nameTrim);
    }
  }
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  const fallback = drawerName != null && String(drawerName).trim() !== '' ? String(drawerName).trim() : '';
  return fallback || null;
}
