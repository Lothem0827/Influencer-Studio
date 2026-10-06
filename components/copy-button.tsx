"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
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
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {done ? "Copied" : label}
    </Button>
  );
}
