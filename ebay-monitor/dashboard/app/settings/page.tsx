'use client';

import { Bell, Monitor, Save, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRealtime } from '@/components/RealtimeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { Preferences } from '@/lib/types';

function backendHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
}

function Toggle({
  label,
  checked,
  icon: Icon,
  onChange
}: {
  label: string;
  checked: boolean;
  icon: typeof Bell;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-card border border-border bg-surface p-4">
      <span className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-accent" />
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-accent"
      />
    </label>
  );
}

export default function SettingsPage() {
  const { preferences, setPreferences, wsStatus, backendStatus, backendError, testSoundAlert } = useRealtime();
  const [draft, setDraft] = useState<Preferences>(preferences);
  const [soundTestStatus, setSoundTestStatus] = useState<'idle' | 'played' | 'blocked'>('idle');

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const update = (patch: Partial<Preferences>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    if (draft.desktopNotifications && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    setPreferences(draft);
  };

  const testSound = async () => {
    setSoundTestStatus('idle');
    const ok = await testSoundAlert();
    setSoundTestStatus(ok ? 'played' : 'blocked');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">Preferences are saved in this browser.</p>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Appearance</div>
          <p className="mt-1 text-xs text-muted">Choose the dashboard color theme.</p>
        </div>
        <ThemeToggle />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Toggle
          label="Desktop notifications"
          icon={Monitor}
          checked={draft.desktopNotifications}
          onChange={(desktopNotifications) => update({ desktopNotifications })}
        />
        <Toggle
          label="Web toast notifications"
          icon={Bell}
          checked={draft.toastNotifications}
          onChange={(toastNotifications) => update({ toastNotifications })}
        />
        <Toggle
          label="Sound alerts"
          icon={Volume2}
          checked={draft.soundAlerts}
          onChange={(soundAlerts) => update({ soundAlerts })}
        />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Notification sound</div>
          <p className="mt-1 text-xs text-muted">
            Click once after opening the dashboard to let the browser play future message sounds.
          </p>
          {soundTestStatus === 'played' && <p className="mt-2 text-xs text-success">Sound test played.</p>}
          {soundTestStatus === 'blocked' && (
            <p className="mt-2 text-xs text-danger">Browser blocked the sound. Check site sound permissions and try again.</p>
          )}
        </div>
        <button
          type="button"
          onClick={testSound}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
        >
          <Volume2 className="h-4 w-4" />
          Test sound
        </button>
      </section>

      <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">WebSocket server URL</span>
          <input
            value={draft.wsUrl}
            onChange={(event) => update({ wsUrl: event.target.value })}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-normal text-muted">Backend API URL</div>
            <div className="mt-2 break-all text-sm text-soft">{backendHttpUrl(draft.wsUrl)}</div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-normal text-muted">Persistence</div>
            <div className="mt-2 break-all text-sm text-soft">Live backend memory only</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            WebSocket: {wsStatus} · Backend: {backendStatus.replace('_', ' ')}
            {backendError ? <span className="block pt-1 text-danger">{backendError}</span> : null}
          </div>
          <button
            onClick={save}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Save className="h-4 w-4" />
            Save settings
          </button>
        </div>
      </section>
    </div>
  );
}
