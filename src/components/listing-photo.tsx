import Image from "next/image";

export function ListingPhoto({ src, name, thumbnail = false }: { src: string; name: string; thumbnail?: boolean }) {
  return (
    <Image
      src={src}
      alt={name ? "Photo of " + name : "Listing photo"}
      width={thumbnail ? 56 : 640}
      height={thumbnail ? 56 : 360}
      unoptimized
      className={thumbnail
        ? "size-14 shrink-0 rounded-[10px] border bg-muted object-cover"
        : "aspect-video h-auto w-full rounded-[10px] border bg-muted object-contain"}
    />
  );
}
