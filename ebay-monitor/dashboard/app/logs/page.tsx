'use client';

import { useMemo, useState } from 'react';
import { Circle, Terminal } from 'lucide-react';
import { useRealtime } from '@/components/RealtimeProvider';
import type { SystemLog } from '@/lib/types';

const levelStyles: Record<SystemLog['level'], string> = {
  info: 'text-emerald-400',
  success: 'text-sky-400',
  warning: 'text-amber-300',
  error: 'text-red-400'
};

const sourceStyles: Record<SystemLog['source'], string> = {
  websocket: 'text-purple-400',
  supabase: 'text-cyan-400'
};

const formatLogTime = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

export default function LogsPage() {
  const { systemLogs, wsStatus, supabaseStatus, supabaseError, preferences } = useRealtime();
  const [source, setSource] = useState<'all' | SystemLog['source']>('all');

  const filteredLogs = useMemo(
    () => (source === 'all' ? systemLogs : systemLogs.filter((log) => log.source === source)),
    [source, systemLogs]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Connection logs</h1>
          <p className="mt-1 text-sm text-muted">WebSocket and Supabase activity for diagnosing disconnects.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex min-w-[130px] items-center justify-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <Circle className={`h-2.5 w-2.5 shrink-0 fill-current ${wsStatus === 'connected' ? 'text-success' : wsStatus === 'connecting' ? 'text-yellow-400' : 'text-danger'}`} />
            WS {wsStatus}
          </span>
          <span className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <Circle
              className={`h-2.5 w-2.5 shrink-0 fill-current ${
                supabaseStatus === 'connected' ? 'text-success' : supabaseStatus === 'connecting' ? 'text-yellow-400' : 'text-danger'
              }`}
            />
            Supabase {supabaseStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-normal text-muted">WebSocket URL</div>
          <div className="mt-2 break-all font-mono text-sm text-foreground">{preferences.wsUrl}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-normal text-muted">WebSocket status</div>
          <div className={`mt-2 text-xl font-semibold ${wsStatus === 'connected' ? 'text-success' : wsStatus === 'connecting' ? 'text-yellow-400' : 'text-danger'}`}>
            {wsStatus}
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-normal text-muted">Supabase status</div>
          <div className={`mt-2 text-xl font-semibold ${supabaseStatus === 'connected' ? 'text-success' : supabaseStatus === 'connecting' ? 'text-yellow-400' : 'text-danger'}`}>
            {supabaseStatus.replace('_', ' ')}
          </div>
          {supabaseError && <div className="mt-2 line-clamp-2 text-xs text-danger">{supabaseError}</div>}
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Terminal className="h-4 w-4 text-accent" />
            Live system log
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 text-xs">
            {(['all', 'websocket', 'supabase'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSource(item)}
                className={`rounded px-2.5 py-1 capitalize transition ${
                  source === item ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[560px] overflow-auto bg-[#202020] p-3 font-mono text-[11px] leading-5 shadow-inner">
          {filteredLogs.length ? (
            filteredLogs.map((log) => (
              <div key={log.id} className="grid w-full grid-cols-[178px_84px_92px_12px_minmax(0,1fr)] gap-2 text-slate-300">
                <span className="text-slate-400">{formatLogTime(log.timestamp)}</span>
                <span className={`font-semibold uppercase ${levelStyles[log.level]}`}>{log.level}</span>
                <span className={`truncate ${sourceStyles[log.source]}`}>{log.source}</span>
                <span className="text-slate-500">:</span>
                <span className="min-w-0 break-words text-slate-200">{log.message}</span>
              </div>
            ))
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Terminal className="mx-auto h-8 w-8 text-slate-500" />
                <div className="mt-3 text-sm font-semibold text-slate-200">No logs yet</div>
                <p className="mt-1 text-xs text-slate-400">Connection activity will appear here.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
