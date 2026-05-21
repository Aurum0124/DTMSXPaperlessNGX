/**
 * Primary UI label for an archive drawer: D code only.
 */
export function drawerDisplayLabel(d) {
  if (!d) return '';
  return `D${d.drawer_code ?? ''}`;
}

/**
 * Select/option line for drawers (D code only).
 */
export function drawerOptionLabel(d) {
  return drawerDisplayLabel(d);
}

/**
 * Folder chip / select label: F{n} · name when name is set.
 */
export function folderOptionLabel(f) {
  if (!f) return '';
  const n = f.folder_number != null ? String(f.folder_number) : '';
  const name = f.name != null && String(f.name).trim() !== '' ? String(f.name).trim() : '';
  return name ? `F${n} · ${name}` : `F${n}`;
}

/**
 * Full directory line for a folder: cabinet · drawer · folder (for search results and filters).
 */
export function archiveFolderFullPath(cabinet, drawer, folder) {
  if (!folder) return '';
  const c = cabinet?.code != null && String(cabinet.code).trim() !== '' ? `C${cabinet.code}` : '';
  const d = drawer?.drawer_code != null && String(drawer.drawer_code).trim() !== '' ? `D${drawer.drawer_code}` : drawerDisplayLabel(drawer);
  const f = folderOptionLabel(folder);
  return [c, d, f].filter(Boolean).join(' · ');
}
