import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { identify, reset, track } from "@/lib/mixpanel-browser";

/**
 * Identifies insurer users after auth and attaches org-level people properties.
 * Farmer journeys are tracked server-side (WhatsApp / voice) — never with PII here.
 */
export function MixpanelProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    if (user.userType !== "insurer") {
      return;
    }

    const organizationId = `org_${user.id}`;
    const role =
      user.id % 3 === 0 ? "admin" : user.id % 2 === 0 ? "claims_manager" : "underwriter";

    identify(`insurer_${user.id}`, {
      $name: user.fullName || `Insurer ${user.id}`,
      $email: `insurer_${user.id}@cropguard.demo`,
      organization_id: organizationId,
      role,
      districts_managed: ["Latur", "Barmer", "Ludhiana"],
      created_at: new Date().toISOString(),
    });

    track("insurer_signed_in", {
      organization_id: organizationId,
      role,
    });
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated) {
      reset();
    }
  }, [isAuthenticated]);

  return <>{children}</>;
}
