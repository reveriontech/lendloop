import { SignUp } from "@clerk/nextjs";
import { AuthScreen, authAppearance } from "@/components/auth-screen";

export default function SignUpPage() {
  return (
    <AuthScreen>
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" forceRedirectUrl="/dashboard" appearance={authAppearance} />
    </AuthScreen>
  );
}
