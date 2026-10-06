# Influencer Studio extension (Chrome MV3)

Side panel for Google Flow. It fills prompts and attaches references, then you press Generate yourself.
"Use this" on a Flow result uploads it to the clip you picked in the panel.

## Build and install

```bash
cd extension
pnpm install
# Optional: allowed app origins (first one is the default app URL). Default: http://localhost:3000
# APP_ORIGINS=http://localhost:3000,https://studio.example.com pnpm build
pnpm build
```

1. Open `chrome://extensions`, enable Developer mode, **Load unpacked**, choose `extension/dist`.
2. Copy the extension ID into `NEXT_PUBLIC_EXTENSION_ID` in the app's `.env.local` (lets the app ping the panel).
3. Set `EXTENSION_API_TOKEN` in `.env.local` to any long random string, restart the app.
4. Click the toolbar icon, open **Settings > Connection**, enter the app URL and the same token.

## Flow selectors

Everything that depends on Flow's DOM lives in `src/flow-selectors.ts`. If Fill stops finding the prompt box,
aspect ratio or mode controls, fix that one file and rebuild.
