import { AppHeader } from "@/components/AppHeader";
import { DesktopTabs, MobileBottomNav } from "@/components/AppNav";
import { AssignmentNotifications } from "@/components/AssignmentNotifications";
import { RequireAuth } from "@/lib/auth/RequireAuth";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <div className="flex min-h-full flex-1 flex-col">
        <AppHeader />
        <DesktopTabs />
        <AssignmentNotifications />
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
        <MobileBottomNav />
      </div>
    </RequireAuth>
  );
}
