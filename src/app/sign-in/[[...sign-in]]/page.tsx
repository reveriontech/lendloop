import { SignIn } from "@clerk/nextjs";
import { AuthScreen, authAppearance } from "@/components/auth-screen";

export default function SignInPage() {
  return (
    <AuthScreen>
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" appearance={authAppearance} />
    </AuthScreen>
  );
}
