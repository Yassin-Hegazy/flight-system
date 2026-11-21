import type { ComponentType } from 'react';
import {
  BeijingScene,
  CairoScene,
  LosAngelesScene,
  ParisScene,
  RomeScene,
  TokyoScene,
} from './illustrations';

export interface Destination {
  city: string;
  country: string;
  /** The landmark the drawing shows. */
  landmark: string;
  /** The airport the search opens with. */
  code: string;
  /** Set when the demo schedule flies there directly from Cairo, so the search can start there. */
  fromCairo: boolean;
  Scene: ComponentType;
}

// Search is for direct flights; Tokyo and Los Angeles are reached from other hubs, so their cards
// fill in only where to.
export const DESTINATIONS: Destination[] = [
  {
    city: 'Tokyo',
    country: 'Japan',
    landmark: 'Red torii gates',
    code: 'HND',
    fromCairo: false,
    Scene: TokyoScene,
  },
  {
    city: 'Paris',
    country: 'France',
    landmark: 'The Eiffel Tower',
    code: 'CDG',
    fromCairo: true,
    Scene: ParisScene,
  },
  {
    city: 'Cairo',
    country: 'Egypt',
    landmark: 'The pyramids of Giza',
    code: 'CAI',
    fromCairo: false,
    Scene: CairoScene,
  },
  {
    city: 'Rome',
    country: 'Italy',
    landmark: 'The Colosseum',
    code: 'FCO',
    fromCairo: true,
    Scene: RomeScene,
  },
  {
    city: 'Beijing',
    country: 'China',
    landmark: 'The Great Wall',
    code: 'PEK',
    fromCairo: true,
    Scene: BeijingScene,
  },
  {
    city: 'Los Angeles',
    country: 'USA',
    landmark: 'Palms at sunset',
    code: 'LAX',
    fromCairo: false,
    Scene: LosAngelesScene,
  },
];

export function searchHref({ code, fromCairo }: Destination): string {
  return fromCairo ? `/search?origin=CAI&destination=${code}` : `/search?destination=${code}`;
}
