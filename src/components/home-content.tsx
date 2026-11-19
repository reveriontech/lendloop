"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Show } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/button";
import { BoardStatus } from "@/components/board-status";
import { Brand, ToolIcon } from "@/components/lendloop-brand";
import { Bell, CalendarDays, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { formatCategory } from "@/lib/format";

const steps = [
  { title: "List what you own", text: "Add a tool with its category, condition and a short note. You approve every request." },
  { title: "Request dates", text: "Pick a date range. The owner approves or declines, and you’re notified either way." },
  { title: "Return on time", text: "LendLoop tracks due dates and sends reminders when a loan runs late." },
];

function BoardLink({ short = false, light = false }: { short?: boolean; light?: boolean }) {
  const className = buttonVariants({ size: short ? "default" : "lg", variant: light ? "outline" : short ? "outline" : "default", className: short ? "min-h-9 px-3" : "min-h-12 px-5" });
  return (
    <>
      <Show when="signed-out">
        <Link className={className} href="/sign-in">{short ? "Sign in" : "Sign in to lend or borrow"}</Link>
      </Show>
      <Show when="signed-in">
        <Link className={className} href="/dashboard">Open the board</Link>
      </Show>
    </>
  );
}

export default function HomeContent() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur-md">
        <div className="site-wrap flex min-h-16 items-center justify-between gap-4">
          <Brand />
          <nav aria-label="On this page" className="hidden items-center gap-7 text-sm text-muted-foreground min-[761px]:flex">
            <a href="#available">Available tools</a><a href="#how">How it works</a><a href="#privacy">Privacy</a>
          </nav>
          <BoardLink short />
        </div>
      </header>
      <main>
        <section className="site-wrap grid items-center gap-10 pt-12 pb-14 min-[1000px]:grid-cols-2 min-[1000px]:gap-14 min-[1000px]:pt-[88px] min-[1000px]:pb-[104px]">
          <div>
            <div className="mb-6"><BoardStatus status="available" label="A lending board for your neighborhood" /></div>
            <h1 className="text-[clamp(42px,6vw,68px)] leading-[1.02] font-semibold tracking-[-0.035em]">
              Borrow what you need. <span className="text-[#1e7a4e]">Lend what you don&apos;t.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-[1.55] text-muted-foreground">List the tools sitting in your garage, borrow the ones you need for a weekend, and let automatic reminders handle the follow-ups.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <BoardLink />
              <a className={buttonVariants({ variant: "ghost", size: "lg", className: "min-h-12 px-5" })} href="#available">See what&apos;s available</a>
            </div>
          </div>
          <div className="pegboard flex flex-col justify-center gap-[18px] rounded-3xl border p-5 sm:min-h-[440px] sm:p-9" aria-hidden="true">
            <div className="flex w-[min(340px,100%)] items-center gap-3 rounded-[14px] border bg-white px-[18px] py-4 shadow-sm">
              <ToolIcon category="power_tools" /><div className="flex-1"><strong>Cordless drill</strong><p className="text-sm text-muted-foreground">Power tools · Good</p></div>
              <BoardStatus status="available" />
            </div>
            <div className="w-[min(340px,100%)] self-end rounded-[14px] border bg-white px-[18px] py-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">SP</span>
                <div className="text-sm"><strong>Sam P.</strong> wants to borrow your <strong>pressure washer</strong></div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground"><CalendarDays className="size-4" />Sat, Nov 21 – Sun, Nov 22</p>
              <div className="mt-3 flex justify-end gap-2 text-xs font-semibold"><span className="rounded-lg border px-3 py-2">Decline</span><span className="rounded-lg bg-primary px-3 py-2 text-white">Approve</span></div>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full border border-[#cae6d6] bg-secondary px-3 py-2 text-[13px] text-secondary-foreground"><Bell className="size-4" /> Return reminder sent automatically</div>
          </div>
        </section>

        <section id="available" className="scroll-mt-16 border-y bg-white py-14 min-[761px]:py-24">
          <div className="site-wrap">
            <h2 className="text-[clamp(30px,4vw,40px)] leading-[1.1] font-semibold">Available on the board right now</h2>
            <p className="mt-2 text-muted-foreground">A live list from your neighbors. Sign in to see condition, who&apos;s lending, and to request dates.</p>
            <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4" aria-live="polite">
              {tools === undefined ? <p className="text-muted-foreground">Loading tools…</p> : tools.length === 0 ? (
                <p className="rounded-xl border bg-background p-5 text-muted-foreground col-span-full">No tools listed yet. Sign in and be the first to share.</p>
              ) : tools.map((tool) => (
                <article key={tool._id} className="flex items-center gap-3.5 rounded-[14px] border bg-white p-4">
                  <ToolIcon category={tool.category} /><div><h3 className="font-semibold">{tool.name}</h3><p className="text-sm text-muted-foreground">{formatCategory(tool.category)}</p></div>
                </article>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4"><BoardLink /><p className="text-sm text-muted-foreground">Contact details stay private until a loan is approved.</p></div>
          </div>
        </section>

        <section id="how" className="site-wrap scroll-mt-16 py-14 min-[761px]:py-24">
          <h2 className="text-[clamp(30px,4vw,40px)] leading-[1.1] font-semibold">How it works</h2>
          <p className="mt-3 text-muted-foreground">Three steps. The reminders take care of themselves.</p>
          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
            {steps.map(({ title, text }, index) => (
              <article key={title} className="rounded-[14px] border bg-white p-7">
                <span className="mb-3 inline-block font-heading text-sm font-semibold text-[#1e7a4e]">0{index + 1}</span>
                <h3 className="text-xl font-semibold">{title}</h3><p className="mt-2 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="privacy" className="scroll-mt-16 border-y bg-white py-14 min-[761px]:py-24">
          <div className="site-wrap grid gap-6 md:grid-cols-2 md:gap-12">
            <div><h2 className="text-[clamp(30px,4vw,40px)] leading-[1.1] font-semibold">Your details stay between neighbors</h2><p className="mt-3 text-muted-foreground">LendLoop shares the least it can, with the fewest people it can.</p></div>
            <ul className="grid gap-3">
              {["Public listings show tool names and categories.", "Contact details are shared with the other person after approval.", "Your requests and their updates are visible in your account."].map((detail) => (
                <li key={detail} className="flex items-center gap-3 rounded-xl border bg-background p-4"><CheckCircle2 className="size-5 shrink-0 text-[#1e7a4e]" />{detail}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="site-wrap py-14 min-[761px]:py-[88px]">
          <div className="pegboard-dark flex flex-wrap items-center justify-between gap-7 rounded-[24px] p-7 text-white sm:p-14">
            <div><h2 className="text-3xl font-semibold">Got a ladder you use twice a year?</h2><p className="mt-2 text-white/75">List it and lend it to the street.</p></div>
            <BoardLink light />
          </div>
        </section>
      </main>
      <footer className="border-t bg-white">
        <div className="site-wrap flex flex-wrap items-center justify-between gap-4 py-7"><div><Brand /><p className="mt-2 text-sm text-muted-foreground">Borrow what you need. Lend what you don&apos;t.</p></div><nav aria-label="Footer" className="flex gap-5 text-sm text-muted-foreground"><a href="#available">Available tools</a><a href="#how">How it works</a></nav></div>
      </footer>
    </>
  );
}
