import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { createWorkspace } from "@/app/actions/studio";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isConfigured, listWorkspaces } from "@/lib/server/data";

export const dynamic = "force-dynamic";

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 font-mono text-xs">{children}</code>;
}

function SetupNeeded({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Influencer Studio setup</h1>
      <Alert variant={error ? "destructive" : "default"}>
        <AlertTitle>{error ? "Could not load workspaces" : "Supabase is not configured yet"}</AlertTitle>
        <AlertDescription>{error ?? "Follow the steps below to connect your database."}</AlertDescription>
      </Alert>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>Create a Supabase cloud project and copy its URL, anon key and service-role key.</li>
        <li>
          Copy <Code>.env.example</Code> to <Code>.env.local</Code> and fill it in (plus{" "}
          <Code>GEMINI_API_KEY</Code>).
        </li>
        <li>
          Run <Code>supabase link --project-ref &lt;ref&gt;</Code> then <Code>pnpm db:push</Code>.
        </li>
        <li>
          Run <Code>pnpm db:seed</Code> to add Lolo Isko, Iska and a demo project.
        </li>
        <li>
          Restart <Code>pnpm dev</Code>.
        </li>
      </ol>
    </main>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: formError } = await searchParams;
  if (!isConfigured()) return <SetupNeeded />;
  let workspaces;
  try {
    workspaces = await listWorkspaces();
  } catch (e) {
    return <SetupNeeded error={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold">Influencer Studio</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick an influencer workspace. All image and video generation happens in Google Flow.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t create that workspace</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {workspaces.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>No workspaces yet</EmptyTitle>
            <EmptyDescription>Create one below, then start a project from an idea.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/w/${w.slug}`} className="group">
              <Card className="transition-colors group-hover:ring-primary/60">
                <CardHeader>
                  <CardTitle className="text-base">{w.name}</CardTitle>
                  <CardDescription>{w.niche ?? "No niche set"}</CardDescription>
                  <CardAction>
                    <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
                  </CardAction>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWorkspace}>
            <FieldGroup className="sm:grid sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="ws-name">Name</FieldLabel>
                <Input id="ws-name" name="name" required placeholder="Lolo Isko" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ws-nickname">Nickname</FieldLabel>
                <Input id="ws-nickname" name="nickname" placeholder="Lolo" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ws-niche">Niche</FieldLabel>
                <Input id="ws-niche" name="niche" placeholder="Comfort and wisdom" />
              </Field>
              <div className="sm:col-span-3">
                <SubmitButton>Create workspace</SubmitButton>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
