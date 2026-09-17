"use client";

import { useState } from "react";
import { Eye, EyeOff, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProviderConfig } from "@/lib/provider";

type Props = {
  enabled: boolean;
  value: ProviderConfig;
  disabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onChange: (value: ProviderConfig) => void;
  onReset: () => void;
};

const fieldClass = "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";

export function ProviderSettings({ enabled, value, disabled, onEnabledChange, onChange, onReset }: Props) {
  const [showKey, setShowKey] = useState(false);

  return (
    <fieldset disabled={disabled} className="min-w-0 border-t border-border pt-5">
      <legend className="flex items-center gap-2 pr-3 text-sm font-medium"><Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />API settings</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor="custom-api" className="flex cursor-pointer items-center gap-2 text-sm">
          <input id="custom-api" type="checkbox" checked={enabled} onChange={(event) => { setShowKey(false); onEnabledChange(event.target.checked); }} className="size-4 accent-primary" aria-controls="provider-fields" />
          Use custom API
        </label>
        {!enabled && <span className="text-xs text-muted-foreground">Server default</span>}
        {enabled && <Button type="button" variant="ghost" size="icon" title="Reset API settings" aria-label="Reset API settings" onClick={() => { setShowKey(false); onReset(); }}><RotateCcw aria-hidden="true" /></Button>}
      </div>
      {enabled && <div id="provider-fields" className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <label htmlFor="api-url" className="mb-2 block text-sm font-medium">API Base URL</label>
          <input id="api-url" type="url" value={value.baseURL} onChange={(event) => onChange({ ...value, baseURL: event.target.value })} maxLength={2048} autoComplete="off" spellCheck={false} className={fieldClass} placeholder="https://api.openai.com/v1" required />
        </div>
        <div className="min-w-0">
          <label htmlFor="api-key" className="mb-2 block text-sm font-medium">API key</label>
          <div className="flex min-w-0 items-center gap-2">
            <input id="api-key" type={showKey ? "text" : "password"} value={value.apiKey} onChange={(event) => onChange({ ...value, apiKey: event.target.value })} maxLength={4096} autoComplete="off" autoCapitalize="none" spellCheck={false} className={`${fieldClass} flex-1`} placeholder="API key" aria-describedby="key-handling" required />
            <Button type="button" variant="outline" size="icon" className="shrink-0" title={showKey ? "Hide API key" : "Show API key"} aria-label={showKey ? "Hide API key" : "Show API key"} aria-pressed={showKey} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor="api-model" className="mb-2 block text-sm font-medium">Model</label>
          <input id="api-model" value={value.model} onChange={(event) => onChange({ ...value, model: event.target.value })} maxLength={256} autoComplete="off" spellCheck={false} className={fieldClass} placeholder="gpt-5-mini" required />
        </div>
        <p id="key-handling" className="text-xs leading-5 text-muted-foreground sm:col-span-2">Your key is used for this request and is not saved in lecture history.</p>
      </div>}
    </fieldset>
  );
}
