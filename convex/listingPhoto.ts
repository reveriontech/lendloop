export const LISTING_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const LISTING_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function listingPhotoType(photo: ArrayBuffer) {
  const bytes = new Uint8Array(photo);
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
