"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { isAuthenticated, getCurrentUser, logout } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import { CommandPalette } from "@/components/command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip auth check on login page
    if (pathname === "/login") {
      setChecked(true);
      return;
    }

    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    setUser(getCurrentUser());
    setChecked(true);
  }, [pathname, router]);

  // On login page, render children directly without the shell
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Still checking auth
  if (!checked) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-screen">
      <CommandPalette />
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 border-b flex items-center justify-end px-4 gap-2">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className="hidden sm:flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors mr-auto ml-2"
          >
            <span>Suche...</span>
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">Ctrl+K</kbd>
          </button>
          {user && (
            <div className="flex items-center gap-2 mr-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{user.username}</span>
              {user.role === "admin" && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                  Admin
                </span>
              )}
            </div>
          )}
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Abmelden">
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Abmelden</span>
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
