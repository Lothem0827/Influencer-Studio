"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "Copy",
  variant = "outline",
}: {
  text: string;
  label?: string;
  variant?: "outline" | "secondary" | "ghost" | "default";
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Could not copy. Check clipboard permission and try again.");
        }
      }}
    >
      {done ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {done ? "Copied" : label}
    </Button>
  );
}
