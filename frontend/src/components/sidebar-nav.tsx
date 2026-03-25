"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileSearch,
  Layers,
  GraduationCap,
  LayoutDashboard,
  BarChart3,
  ClipboardCheck,
  BookOpen,
  MessageSquarePlus,
  Shield,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getCurrentUser } from "@/lib/auth";

const baseNavItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/extract", label: "Extraktion", icon: FileSearch },
  { href: "/batch", label: "Batch", icon: Layers },
  { href: "/examples", label: "Beispiele", icon: GraduationCap },
  { href: "/analytics", label: "Analytik", icon: BarChart3 },
  { href: "/review", label: "Review-Queue", icon: ClipboardCheck },
  { href: "/projects", label: "Projekte", icon: FolderKanban },
  { href: "/feedback", label: "Feedback", icon: MessageSquarePlus },
  { href: "/guide", label: "Anleitung", icon: BookOpen },
];

const adminNavItems = [
  { href: "/admin", label: "Verwaltung", icon: Shield },
];

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export function SidebarNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const user = mounted ? getCurrentUser() : null;
  const isAdmin = user?.role === "admin";
  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  };

  // Prevent hydration mismatch: render expanded on server, then correct on mount
  const isCollapsed = mounted ? collapsed : false;

  return (
    <aside
      className={`border-r bg-muted/30 flex flex-col transition-all duration-200 ease-in-out ${
        isCollapsed ? "w-14" : "w-56"
      }`}
    >
      <div className={`border-b flex items-center ${isCollapsed ? "p-2 justify-center" : "p-4"}`}>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg">PDF-Auszug</h1>
            <p className="text-xs text-muted-foreground truncate">Isometric Data Extractor</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={toggleCollapsed}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          const linkContent = (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg text-sm transition-colors
                ${isCollapsed ? "justify-center px-2 py-2" : "px-3 py-2"}
                ${
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger render={<div />}>
                  {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>
      <div
        className={`border-t text-xs text-muted-foreground ${
          isCollapsed ? "p-2 text-center" : "p-4"
        }`}
      >
        {isCollapsed ? "AI" : "Gemini 3.1 Pro Preview"}
      </div>
    </aside>
  );
}
