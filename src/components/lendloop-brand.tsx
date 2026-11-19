import Link from "next/link";
import { Drill, Flower2, CookingPot, Tent, SprayCan, Car, Hammer, Droplets, Zap, Wrench } from "lucide-react";

export function Brand({ href = "/", dark = false }: { href?: string; dark?: boolean }) {
  return (
    <Link href={href} className="inline-flex w-fit shrink-0 items-center gap-2.5 font-heading text-[19px] leading-none font-bold tracking-tight">
      <span aria-hidden="true" className="relative h-[22px] w-[30px] shrink-0">
        <span className="absolute inset-y-0 left-0 w-5 rounded-full border-[3px] border-current" />
        <span className={"absolute inset-y-0 right-0 w-5 rounded-full border-[3px] " + (dark ? "border-[#7fd1a8]" : "border-[#1e7a4e]")} />
      </span>
      LendLoop
    </Link>
  );
}

const icons = {
  power_tools: Drill, garden: Flower2, kitchen: CookingPot, camping: Tent,
  cleaning: SprayCan, automotive: Car, woodworking: Hammer, plumbing: Droplets,
  electrical: Zap,
};

export function ToolIcon({ category }: { category: string }) {
  const Icon = icons[category as keyof typeof icons] ?? Wrench;
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-[10px] border bg-background text-foreground">
      <Icon className="size-[22px]" strokeWidth={1.7} aria-hidden="true" />
    </span>
  );
}
