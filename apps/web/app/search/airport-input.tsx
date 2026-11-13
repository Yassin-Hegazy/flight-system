'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { suggestAirports } from '@/lib/search-api';
import { type ControlProps, INPUT_CLASS } from './field';

interface AirportInputProps extends ControlProps {
  name: string;
  defaultValue: string;
}

/**
 * A text field with airport suggestions from the Catalog (GET /api/flights/airports/suggestions).
 * Typing a city or code lists matches; choosing one fills in its 3-letter code.
 */
export function AirportInput({ name, defaultValue, ...control }: AirportInputProps) {
  const [text, setText] = useState(defaultValue);
  const query = text.trim();
  const suggestions = useQuery({
    queryKey: ['airport-suggestions', query.toLowerCase()],
    queryFn: () => suggestAirports(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
  const listId = `${control.id}-options`;

  return (
    <>
      <input
        {...control}
        name={name}
        type="text"
        list={listId}
        autoComplete="off"
        spellCheck={false}
        maxLength={60}
        placeholder="City or code, e.g. CAI"
        className={`${INPUT_CLASS} uppercase placeholder:normal-case`}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <datalist id={listId}>
        {(suggestions.data ?? []).map((airport) => (
          <option key={airport.code} value={airport.code}>
            {`${airport.city} – ${airport.name}`}
          </option>
        ))}
      </datalist>
    </>
  );
}
