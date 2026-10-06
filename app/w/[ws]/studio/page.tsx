import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  addHouseRule,
  addPreset,
  addTemplate,
  deleteHouseRule,
  deletePreset,
  deleteTemplate,
  saveHouseRule,
  saveIdentity,
  savePreset,
  saveTemplate,
  saveWorkspaceBasics,
  setDefaultTemplate,
} from "@/app/actions/studio";
import { ConfirmDeleteForm } from "@/components/confirm-delete";
import { SubmitButton } from "@/components/submit-button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  getHouseRules,
  getIdentity,
  getPresets,
  getTemplates,
  getWorkspaceBySlug,
} from "@/lib/server/data";

export default async function StudioPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  const [identity, rules, presets, templates] = await Promise.all([
    getIdentity(workspace.id),
    getHouseRules(workspace.id),
    getPresets(workspace.id),
    getTemplates(workspace.id),
  ]);

  const hidden = (
    <>
      <input type="hidden" name="workspace_id" value={workspace.id} />
      <input type="hidden" name="slug" value={ws} />
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Studio: {workspace.name}</h1>
        <p className="text-sm text-muted-foreground">
          Everything here is injected automatically into every prompt for this influencer.
        </p>
      </div>

      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveWorkspaceBasics}>
            {hidden}
            <FieldGroup className="sm:grid sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="ws-name">Name</FieldLabel>
                <Input id="ws-name" name="name" defaultValue={workspace.name} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="ws-nickname">Nickname</FieldLabel>
                <Input id="ws-nickname" name="nickname" defaultValue={workspace.nickname ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ws-niche">Niche</FieldLabel>
                <Input id="ws-niche" name="niche" defaultValue={workspace.niche ?? ""} />
              </Field>
              <div className="sm:col-span-3">
                <SubmitButton size="sm">Save</SubmitButton>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {/* Identity pack */}
      <Card>
        <CardHeader>
          <CardTitle>Identity pack</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveIdentity}>
            {hidden}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="id-appearance">Appearance lock</FieldLabel>
                <Textarea
                  id="id-appearance"
                  name="appearance_lock"
                  rows={4}
                  defaultValue={identity?.appearance_lock ?? ""}
                />
                <FieldDescription>
                  Word-for-word. Prepended to the Subject line of every still prompt.
                </FieldDescription>
              </Field>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="id-wardrobe">Wardrobe DNA</FieldLabel>
                  <Textarea id="id-wardrobe" name="wardrobe_dna" defaultValue={identity?.wardrobe_dna ?? ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="id-palette">Palette</FieldLabel>
                  <Textarea id="id-palette" name="palette" defaultValue={identity?.palette ?? ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="id-voice">Voice / personality</FieldLabel>
                  <Textarea id="id-voice" name="voice" defaultValue={identity?.voice ?? ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="id-banned">Banned items</FieldLabel>
                  <Textarea id="id-banned" name="banned" defaultValue={identity?.banned ?? ""} />
                  <FieldDescription>
                    Comma separated. The shot checker warns when a prompt mentions them.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="id-pillars">Content pillars</FieldLabel>
                <Textarea
                  id="id-pillars"
                  name="pillars"
                  rows={4}
                  defaultValue={(identity?.pillars ?? []).map((p) => `${p.name} ${p.weight}`).join("\n")}
                />
                <FieldDescription>One per line: name and target percent, e.g. Ginhawa 70</FieldDescription>
              </Field>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="id-faces">Face reference URLs</FieldLabel>
                  <Textarea
                    id="id-faces"
                    name="face_ref_urls"
                    defaultValue={(identity?.face_ref_urls ?? []).join("\n")}
                  />
                  <FieldDescription>One per line (optional, for your own reference).</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="id-sheet">Character sheet URL</FieldLabel>
                  <Input
                    id="id-sheet"
                    name="character_sheet_url"
                    defaultValue={identity?.character_sheet_url ?? ""}
                  />
                  <FieldDescription>Used by the extension to attach the sheet in Flow.</FieldDescription>
                </Field>
              </FieldGroup>
              <div>
                <SubmitButton size="sm">Save identity pack</SubmitButton>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {/* House rules */}
      <Card>
        <CardHeader>
          <CardTitle>House rules</CardTitle>
          <CardDescription>Global rules apply to every workspace</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rules.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              <form action={saveHouseRule} className="flex flex-1 items-start gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="slug" value={ws} />
                <input type="hidden" name="sort" value={r.sort} />
                <Checkbox name="enabled" defaultChecked={r.enabled} aria-label="Enabled" className="mt-2.5" />
                <Textarea name="text" defaultValue={r.text} rows={2} aria-label="Rule text" className="flex-1" />
                {r.workspace_id === null ? (
                  <Badge variant="secondary" className="mt-1.5">
                    global
                  </Badge>
                ) : null}
                <SubmitButton size="sm" variant="secondary">
                  Save
                </SubmitButton>
              </form>
              <ConfirmDeleteForm
                action={deleteHouseRule}
                title="Delete this house rule?"
                description="Prompts generated after this will no longer include it."
                trigger={
                  <Button size="icon" variant="ghost" type="button" aria-label="Delete rule">
                    <Trash2 />
                  </Button>
                }
              >
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="slug" value={ws} />
              </ConfirmDeleteForm>
            </div>
          ))}
          <form action={addHouseRule} className="flex items-start gap-2 pt-2">
            {hidden}
            <Textarea
              name="text"
              rows={2}
              placeholder="Add a rule for this influencer..."
              aria-label="New rule"
              className="flex-1"
            />
            <SubmitButton size="sm">Add rule</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Location and wardrobe presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {presets.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <form action={savePreset} className="grid flex-1 gap-2 sm:grid-cols-[9rem_14rem_1fr_auto]">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="slug" value={ws} />
                <div className="flex items-center">
                  <Badge variant={p.kind === "location" ? "default" : "warning"}>{p.kind}</Badge>
                </div>
                <Input name="name" defaultValue={p.name} aria-label="Preset name" />
                <Textarea name="body" defaultValue={p.body} rows={2} aria-label="Preset text" />
                <SubmitButton size="sm" variant="secondary">
                  Save
                </SubmitButton>
              </form>
              <ConfirmDeleteForm
                action={deletePreset}
                title={`Delete “${p.name}”?`}
                description="Clips using this preset keep the text already in their prompts."
                trigger={
                  <Button size="icon" variant="ghost" type="button" aria-label="Delete preset">
                    <Trash2 />
                  </Button>
                }
              >
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="slug" value={ws} />
              </ConfirmDeleteForm>
            </div>
          ))}
          <form action={addPreset} className="grid gap-2 pt-2 sm:grid-cols-[9rem_14rem_1fr_auto]">
            {hidden}
            <NativeSelect name="kind" defaultValue="location" aria-label="Preset kind" className="w-full">
              <NativeSelectOption value="location">location</NativeSelectOption>
              <NativeSelectOption value="wardrobe">wardrobe</NativeSelectOption>
            </NativeSelect>
            <Input name="name" placeholder="Preset name" aria-label="Preset name" />
            <Textarea name="body" rows={2} placeholder="Text block injected into prompts" aria-label="Preset text" />
            <SubmitButton size="sm">Add</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt templates</CardTitle>
          <CardDescription>
            System prompt per step. Identity pack and house rules are appended automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Accordion type="multiple" className="rounded-lg border">
            {templates.map((t) => (
              <AccordionItem key={t.id} value={t.id}>
                <AccordionTrigger className="px-3">
                  <span className="flex items-center gap-2">
                    <Badge>{t.step}</Badge>
                    <span className="font-medium">{t.name}</span>
                    {t.workspace_id === null ? <Badge variant="secondary">global</Badge> : null}
                    {t.is_default ? <Badge variant="success">default</Badge> : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3 px-3">
                  <form action={saveTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="slug" value={ws} />
                    <FieldGroup className="gap-2">
                      <Input name="name" defaultValue={t.name} aria-label="Template name" />
                      <Textarea
                        name="system_prompt"
                        defaultValue={t.system_prompt}
                        rows={14}
                        aria-label="System prompt"
                        className="font-mono text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <SubmitButton size="sm">Save</SubmitButton>
                        {t.workspace_id === null ? (
                          <span className="text-xs text-muted-foreground">
                            Edits a global template (affects every workspace).
                          </span>
                        ) : null}
                      </div>
                    </FieldGroup>
                  </form>
                  <div className="flex gap-2">
                    {!t.is_default ? (
                      <form action={setDefaultTemplate}>
                        {hidden}
                        <input type="hidden" name="id" value={t.id} />
                        <Button size="sm" variant="outline" type="submit">
                          Use as default
                        </Button>
                      </form>
                    ) : null}
                    {t.workspace_id !== null ? (
                      <ConfirmDeleteForm
                        action={deleteTemplate}
                        title={`Delete template “${t.name}”?`}
                        description="This only removes the workspace copy. Global templates stay."
                        trigger={
                          <Button size="sm" variant="destructive" type="button">
                            Delete
                          </Button>
                        }
                      >
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="slug" value={ws} />
                      </ConfirmDeleteForm>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <form action={addTemplate} className="grid gap-2 pt-2 sm:grid-cols-[9rem_14rem_1fr_auto]">
            {hidden}
            <NativeSelect name="step" defaultValue="script" aria-label="Template step" className="w-full">
              <NativeSelectOption value="script">script</NativeSelectOption>
              <NativeSelectOption value="still">still</NativeSelectOption>
              <NativeSelectOption value="video">video</NativeSelectOption>
              <NativeSelectOption value="caption">caption</NativeSelectOption>
            </NativeSelect>
            <Input name="name" placeholder="Template name" aria-label="Template name" />
            <Textarea name="system_prompt" rows={2} placeholder="System prompt" aria-label="System prompt" />
            <SubmitButton size="sm">Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
