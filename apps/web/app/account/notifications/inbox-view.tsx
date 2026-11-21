'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { FormAlert } from '@/components/auth-card';
import {
  type EmailPreference,
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
  setPreference,
  typeLabel,
} from '@/lib/account-api';
import { errorMessage } from '@/lib/api';
import { formatInstant } from '@/lib/format';
import { cn } from '@/lib/utils';

const QUIET =
  'h-11 cursor-pointer rounded-full border border-navy/25 px-5 text-xs font-bold hover:border-navy ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** The inbox: what happened, which of it is unread, mark one or all read (US-NT-03..05). */
export function InboxView() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const inbox = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => listNotifications(page),
    retry: false,
  });
  // The header's badge reads the same list, so one refresh updates both.
  const refresh = () => client.invalidateQueries({ queryKey: ['notifications'] });
  const one = useMutation({ mutationFn: markRead, onSuccess: refresh });
  const all = useMutation({ mutationFn: markAllRead, onSuccess: refresh });

  if (inbox.isPending) return <p role="status">Loading your notifications…</p>;
  if (inbox.isError) return <FormAlert message={errorMessage(inbox.error)} />;
  const { items, unread, total, pageSize } = inbox.data;
  const failure = one.error ?? all.error;

  return (
    <section
      aria-label="Inbox"
      className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-testid="unread-count" role="status" className="text-xl font-extrabold">
          {unread} unread
        </p>
        <button
          type="button"
          onClick={() => all.mutate()}
          disabled={unread === 0 || all.isPending}
          className={QUIET}
        >
          Mark all as read
        </button>
      </div>
      <FormAlert message={failure ? errorMessage(failure) : null} />
      {items.length === 0 ? (
        <p className="text-base font-bold">Nothing here yet.</p>
      ) : (
        <ul aria-label="Notifications" className="flex flex-col gap-3">
          {items.map((item) => (
            <Item
              key={item.id}
              item={item}
              onRead={() => one.mutate(item.id)}
              busy={one.isPending}
            />
          ))}
        </ul>
      )}
      {total > pageSize && (
        <nav aria-label="Notification pages" className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={QUIET}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="text-sm font-medium text-navy-soft">Page {page}</span>
          <button
            type="button"
            className={QUIET}
            disabled={page * pageSize >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

interface ItemProps {
  item: Notification;
  onRead: () => void;
  busy: boolean;
}

/** Unread is said in words and drawn with a filled marker and a border; colour is only extra. */
function Item({ item, onRead, busy }: ItemProps) {
  const title = <span className="text-base font-extrabold">{item.title}</span>;
  return (
    <li
      className={cn(
        'grid gap-3 rounded-inset border bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center',
        item.read ? 'border-line' : 'border-2 border-navy',
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-xs font-bold text-navy-soft">
          <span aria-hidden="true">{item.read ? '○' : '●'}</span>
          {item.read ? 'Read' : 'Unread'} · {typeLabel(item.type)} ·{' '}
          <time dateTime={item.createdAt}>{formatInstant(item.createdAt)}</time>
        </p>
        {item.link?.startsWith('/') ? (
          <Link href={item.link} className="self-start underline underline-offset-4">
            {title}
          </Link>
        ) : (
          title
        )}
        <p className="text-sm font-medium">{item.body}</p>
      </div>
      {!item.read && (
        <button
          type="button"
          onClick={onRead}
          disabled={busy}
          aria-label={`Mark as read: ${item.title}`}
          className={QUIET}
        >
          Mark as read
        </button>
      )}
    </li>
  );
}

/** Which notification types are also sent by email (US-NT-07). Each change is saved by itself. */
export function EmailPreferences() {
  const client = useQueryClient();
  const key = ['notification-preferences'];
  const preferences = useQuery({ queryKey: key, queryFn: getPreferences, retry: false });
  // What the traveler just ticked, shown at once; dropped again if the API refuses it.
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const save = useMutation({
    mutationFn: ({ type, email }: EmailPreference) => setPreference(type, email),
    onError: (_error, { type }) =>
      setChosen((current) =>
        Object.fromEntries(Object.entries(current).filter(([name]) => name !== type)),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  if (!preferences.data) return null;
  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 sm:p-7">
      <legend className="float-left w-full text-xl font-extrabold">Also send by email</legend>
      <p className="text-sm font-medium text-navy-soft">
        Every notification appears in this inbox. Tick a type to get it by email too.
      </p>
      <FormAlert message={save.isError ? errorMessage(save.error) : null} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {preferences.data.preferences.map(({ type, email }) => (
          <li key={type}>
            <label className="flex items-center gap-3 rounded-field border border-input bg-white p-4 text-sm font-semibold">
              <input
                type="checkbox"
                checked={chosen[type] ?? email}
                onChange={(event) => {
                  const next = event.target.checked;
                  setChosen((current) => ({ ...current, [type]: next }));
                  save.mutate({ type, email: next });
                }}
                className="size-4 accent-navy"
              />
              {typeLabel(type)}
            </label>
          </li>
        ))}
      </ul>
      {save.isSuccess && (
        <p role="status" className="text-sm font-bold">
          Email preference saved.
        </p>
      )}
    </fieldset>
  );
}
