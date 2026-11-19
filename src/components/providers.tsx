"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useState } from "react";

function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  );

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      localization={{
        formFieldInputPlaceholder__emailAddress: "you@example.com",
        formFieldInputPlaceholder__emailAddress_username: "you@example.com",
        signIn: { start: { title: "Sign in", subtitle: "Sign in or create an account to lend and borrow tools.", actionText: "New to LendLoop?", actionLink: "Create an account" } },
      }}
      dynamic
    >
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}
