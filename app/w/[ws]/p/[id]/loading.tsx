import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-72" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-36 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
