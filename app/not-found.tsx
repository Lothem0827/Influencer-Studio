import Link from "next/link";
import { FolderSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center p-8">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderSearch />
          </EmptyMedia>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            That workspace or project is missing, or the link belongs to a different influencer.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">Back to workspaces</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
