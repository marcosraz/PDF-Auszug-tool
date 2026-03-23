"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  FileText,
  BarChart3,
  FolderOpen,
  BookOpen,
  ClipboardCheck,
  Moon,
  Sun,
  Upload,
  Download,
  Keyboard,
} from "lucide-react";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Suche nach Seiten, Aktionen..." />
      <CommandList>
        <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => navigate("/extract")}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Einzel-Extraktion</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/batch")}>
            <Upload className="mr-2 h-4 w-4" />
            <span>Batch-Verarbeitung</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/examples")}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Trainingsbeispiele</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/analytics")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Analytik</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/review")}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            <span>Review-Queue</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/guide")}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Anleitung</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Aktionen">
          <CommandItem onSelect={() => navigate("/extract")}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Neues PDF extrahieren</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/batch")}>
            <FolderOpen className="mr-2 h-4 w-4" />
            <span>Batch-Upload starten</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/extract")}>
            <Download className="mr-2 h-4 w-4" />
            <span>Ergebnisse exportieren (Excel)</span>
          </CommandItem>
          <CommandItem onSelect={toggleTheme}>
            <Sun className="mr-2 h-4 w-4 dark:hidden" />
            <Moon className="mr-2 h-4 w-4 hidden dark:inline" />
            <span>Design-Modus wechseln</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tastenkuerzel">
          <CommandItem disabled>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Extraktion starten</span>
            <Kbd>Ctrl+Enter</Kbd>
          </CommandItem>
          <CommandItem disabled>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Speichern / Excel-Export</span>
            <Kbd>Ctrl+S</Kbd>
          </CommandItem>
          <CommandItem disabled>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Befehlspalette oeffnen</span>
            <Kbd>Ctrl+K</Kbd>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
