import { CachedMetadata } from "obsidian";
import { PatchAction, PatchTargetType } from "./types";

export function handlePatchRequest(
  meta: CachedMetadata,
  existingDocument: string,
  content: string,
  patchAction: PatchAction,
  targetType: PatchTargetType,
  target: string
): string {
  return existingDocument;
}
