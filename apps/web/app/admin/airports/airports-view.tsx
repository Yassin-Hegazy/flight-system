'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import { type AirportRecord, deleteAirport, listAirports } from '@/lib/admin-api';
import { errorMessage, formText } from '@/lib/api';
import { AdminTable, DANGER_BUTTON, NAVY_BUTTON, QUIET_BUTTON } from '../admin-parts';
import { AirportForm } from './airport-form';

/** Every airport by code, searchable, with one form to add or edit (US-AD-06). */
export function AirportsView() {
  const client = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AirportRecord | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const airports = useQuery({
    queryKey: ['admin-airports', q, page],
    queryFn: () => listAirports(q, page),
    placeholderData: keepPreviousData,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['admin-airports'] });
  const remove = useMutation({
    mutationFn: deleteAirport,
    onSuccess: refresh,
    onSettled: () => setDeleting(null),
  });

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQ(formText(new FormData(event.currentTarget), 'q').trim());
    setPage(1);
  };
  const failure = remove.error ?? airports.error;
  const data = airports.data;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Airport list" className="flex min-w-0 flex-col gap-4">
        <form onSubmit={search} role="search" className="flex flex-wrap items-end gap-3">
          <Field id="airport-q" label="Search airports" className="min-w-[200px] flex-1">
            {(control) => (
              <input
                {...control}
                name="q"
                placeholder="Code, city or name"
                maxLength={60}
                className={INPUT_CLASS}
              />
            )}
          </Field>
          <button type="submit" className={NAVY_BUTTON}>
            Search
          </button>
        </form>
        <FormAlert message={failure ? errorMessage(failure) : null} />
        {data && (
          <>
            <p className="text-sm font-bold">
              {data.total} {data.total === 1 ? 'airport' : 'airports'}
              {q && ` matching “${q}”`}
            </p>
            {data.items.length > 0 && (
              <AdminTable name="Airports" head={['Code', 'Airport', 'Country', 'Time zone', '']}>
                {data.items.map((airport) => (
                  <AirportRow
                    key={airport.code}
                    airport={airport}
                    confirming={deleting === airport.code}
                    onEdit={() => setEditing(airport)}
                    onDelete={() => {
                      remove.reset();
                      setDeleting(airport.code);
                    }}
                    onConfirm={() => remove.mutate(airport.code)}
                    onKeep={() => setDeleting(null)}
                  />
                ))}
              </AdminTable>
            )}
            <ListPager
              page={page}
              pages={Math.max(1, Math.ceil(data.total / data.pageSize))}
              onPage={setPage}
            />
          </>
        )}
      </section>
      <AirportForm editing={editing} onDone={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

interface RowProps {
  airport: AirportRecord;
  confirming: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onKeep: () => void;
}

function AirportRow({ airport, confirming, onEdit, onDelete, onConfirm, onKeep }: RowProps) {
  return (
    <tr>
      <td className="text-lg font-extrabold">{airport.code}</td>
      <td>
        <p className="font-bold">{airport.name}</p>
        <p className="text-xs text-navy-soft">{airport.city}</p>
      </td>
      <td>{airport.country}</td>
      <td className="whitespace-nowrap">{airport.timezone}</td>
      <td>
        <div className="flex justify-end gap-2">
          {confirming ? (
            <>
              <button type="button" onClick={onConfirm} className={DANGER_BUTTON}>
                Yes, delete {airport.code}
              </button>
              <button type="button" onClick={onKeep} className={QUIET_BUTTON}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label={`Edit ${airport.code}`}
                onClick={onEdit}
                className={NAVY_BUTTON}
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Delete ${airport.code}`}
                onClick={onDelete}
                className={QUIET_BUTTON}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ListPager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className={QUIET_BUTTON}
      >
        Previous page
      </button>
      <span className="text-sm font-medium text-navy-soft">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className={NAVY_BUTTON}
      >
        Next page
      </button>
    </nav>
  );
}
