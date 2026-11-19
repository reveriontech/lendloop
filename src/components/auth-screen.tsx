import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Brand } from "@/components/lendloop-brand";

const benefits = [
  "List a tool with a few details",
  "Request dates and hear back as soon as the owner answers",
  "Return reminders are sent for you",
];

export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white min-[880px]:grid-cols-2">
      <aside className="pegboard-dark hidden flex-col justify-between gap-10 p-12 text-white min-[880px]:flex">
        <Brand dark />
        <div className="grid max-w-[440px] gap-7">
          <p className="font-heading text-[44px] leading-[1.05] font-semibold tracking-tight">Borrow what you need. Lend what you don&apos;t.</p>
          <ul className="grid gap-3.5 text-[15px] text-[#d5d8dc]">
            {benefits.map((item) => (
              <li key={item} className="flex items-start gap-3"><Check className="mt-px size-5 shrink-0 text-[#7fd1a8]" aria-hidden="true" />{item}</li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-[#a9aeb6]">A neighborhood tool-lending board.</p>
      </aside>
      <main className="flex min-w-0 items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-[380px] gap-6">
          <div className="min-[880px]:hidden"><Brand /></div>
          <Link href="/" className="hidden w-fit items-center gap-1.5 text-sm font-semibold text-secondary-foreground min-[880px]:inline-flex">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
          </Link>
          {children}
          <p className="border-t pt-4 text-[13px] text-muted-foreground">Sign-in is handled by Clerk. LendLoop never sees your password.</p>
        </div>
      </main>
    </div>
  );
}

export const authAppearance = {
  layout: { socialButtonsPlacement: "top" as const, socialButtonsVariant: "blockButton" as const },
  variables: {
    colorPrimary: "#15171a",
    colorForeground: "#15171a",
    colorMutedForeground: "#5a606a",
    colorNeutral: "#15171a",
    colorInput: "#fff",
    colorInputForeground: "#15171a",
    borderRadius: "10px",
    fontFamily: "inherit",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "none", borderRadius: 0, boxShadow: "none" },
    card: { padding: 0, gap: "24px", width: "100%", boxShadow: "none", border: 0 },
    header: { textAlign: "left", alignItems: "flex-start", gap: "8px" },
    headerTitle: { fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: "32px", lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.02em" },
    headerSubtitle: { fontSize: "15px", lineHeight: 1.5, color: "#5a606a" },
    main: { gap: "24px" },
    socialButtonsBlockButton: { minHeight: "44px", border: "1px solid #d3d5d0", boxShadow: "none", fontWeight: 600, fontSize: "15px" },
    dividerLine: { background: "#e3e4e0" },
    dividerText: { color: "#5a606a", fontSize: "13px" },
    form: { gap: "16px" },
    formFieldLabel: { fontWeight: 600, fontSize: "14px", color: "#15171a" },
    formFieldInput: { minHeight: "44px", border: "1px solid #d3d5d0", boxShadow: "none", fontSize: "15px", paddingInline: "12px" },
    formButtonPrimary: { minHeight: "44px", fontWeight: 600, fontSize: "15px", boxShadow: "none", textTransform: "none" },
    footer: { background: "white", border: 0, boxShadow: "none", padding: 0 },
    footerAction: { justifyContent: "flex-start", padding: 0, gap: "4px" },
    footerActionText: { color: "#5a606a", fontSize: "14px" },
    footerActionLink: { color: "#14573a", fontSize: "14px", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" },
  },
};
