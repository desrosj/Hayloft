import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

/**
 * On-disk storage for expense receipts, used when RECEIPTS_DIR is set.
 * Files live at <RECEIPTS_DIR>/<expense_id>/<file_name>; the database keeps
 * only the path relative to RECEIPTS_DIR so the directory can be moved.
 */

/** Strip anything that could escape the expense's folder or upset a filesystem. */
export function safeFileName(name: string | null | undefined, fallback: string): string {
  const base = basename((name ?? "").replace(/\\/g, "/")).trim();
  const cleaned = base
    // control chars and characters Windows/NTFS refuse
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/^\.+$/, "")
    .slice(0, 180);
  return cleaned || fallback;
}

/** Relative path for an expense's receipt: "<id>/<file>". */
export function receiptRelativePath(expenseId: number, fileName: string | null | undefined): string {
  return `${expenseId}/${safeFileName(fileName, `receipt-${expenseId}`)}`;
}

/**
 * Resolve a stored relative path inside the receipts directory, refusing
 * anything that would land outside it.
 */
export function resolveReceiptPath(dir: string, relative: string): string | null {
  const root = resolve(dir);
  const full = resolve(root, relative);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

export async function writeReceiptFile(
  dir: string,
  relative: string,
  data: Buffer,
): Promise<string> {
  const full = resolveReceiptPath(dir, relative);
  if (!full) throw new Error(`refusing to write outside receipts dir: ${relative}`);
  await mkdir(resolve(full, ".."), { recursive: true });
  // Write to a temp name then rename so a crash never leaves a half file.
  const tmp = `${full}.part`;
  await writeFile(tmp, data);
  await rename(tmp, full);
  return full;
}

export async function removeReceiptFile(dir: string, relative: string): Promise<void> {
  const full = resolveReceiptPath(dir, relative);
  if (!full) return;
  await rm(full, { force: true });
}

export async function readReceiptFile(dir: string, relative: string): Promise<Buffer | null> {
  const full = resolveReceiptPath(dir, relative);
  if (!full) return null;
  try {
    const info = await stat(full);
    if (!info.isFile()) return null;
    return await readFile(full);
  } catch {
    return null;
  }
}

export { join as joinPath };
