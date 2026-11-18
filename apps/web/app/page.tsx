import Link from 'next/link';
import { HeroSculpture } from '@/components/hero/sculpture';
import { cn } from '@/lib/utils';
import { TripSearch } from './trip-search';

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-5 md:px-10 xl:px-[72px]';

// Routes the demo schedule flies from Cairo. The cards only fill in the search; fares come from it.
// All three share the navy card, so the section reads as one set.
const DESTINATIONS = [
  { kicker: '01 / CITY BREAKS', city: 'London', code: 'LHR' },
  { kicker: '02 / WINTER SUN', city: 'Dubai', code: 'DXB' },
  { kicker: '03 / QUICK ESCAPES', city: 'Hurghada', code: 'HRG' },
] as const;

const BENEFITS = [
  { n: '01', title: 'Fares without the fog.', body: 'Compare options with clarity.' },
  { n: '02', title: "A seat that's yours.", body: 'Held for you while you pay.' },
  { n: '03', title: 'Everything in one place.', body: 'Trip details, tickets, and updates.' },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section aria-labelledby="hero-title" className={CONTAINER}>
        <div className="grid items-start gap-10 pt-12 pb-14 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)] lg:gap-0 lg:pt-0 lg:pb-[76px]">
          <div className="relative z-10 lg:pt-[65px]">
            <p className="text-xs leading-none font-bold text-navy-soft">
              WELCOME ABOARD / A SMARTER WAY TO GO
            </p>
            <h1
              id="hero-title"
              className="mt-8 text-[clamp(2.25rem,10.4vw,81px)] leading-[1.025] font-extrabold whitespace-nowrap text-navy lg:mt-[39px]"
            >
              <span className="block">GO FURTHER.</span>
              <span className="block">PAY SMARTER.</span>
              <span className="mt-1 inline-block rounded-xl bg-pink pr-[0.3em] text-[0.9em] leading-[1.2]">
                FLY HAPPIER.
              </span>
            </h1>
            <p className="mt-5 max-w-[603px] text-lg leading-[1.45] font-medium text-navy md:text-xl">
              The flight you want. The fare that makes sense.
              <br />
              One beautiful place to make it happen.
            </p>
            <div className="mt-[30px] flex flex-wrap items-center gap-x-9 gap-y-4">
              <a
                href="#search"
                className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-navy px-4 text-base font-bold text-white transition-colors hover:bg-navy-soft sm:w-[258px]"
              >
                FIND YOUR FLIGHT <span aria-hidden="true">↗</span>
              </a>
              <a
                href="#why"
                className="text-[13px] font-bold text-navy underline-offset-4 hover:underline"
              >
                SEE HOW IT WORKS <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[560px] lg:mt-5 lg:-ml-6 lg:max-w-[680px] lg:justify-self-end">
            <HeroSculpture />
          </div>
        </div>
      </section>

      <div className={`${CONTAINER} xl:px-16`}>
        <TripSearch />
      </div>

      <section
        id="destinations"
        aria-labelledby="offers-title"
        className={`${CONTAINER} scroll-mt-6 pt-16 pb-16 lg:pt-[67px]`}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs leading-none font-bold text-navy-soft">02 / GO SOMEWHERE GOOD</p>
            <h2
              id="offers-title"
              className="mt-6 text-[clamp(2.5rem,4.45vw,64px)] leading-[1.18] font-extrabold text-navy lg:mt-[18px]"
            >
              GOOD ROUTES.
              <br />
              GREAT STORIES.
            </h2>
          </div>
          <p className="text-lg leading-[1.6] font-medium text-navy md:text-xl lg:mb-5 lg:w-[383px]">
            Your next favorite memory
            <br />
            might start with a flight.
          </p>
        </div>
        <ul className="mt-10 grid gap-7 md:grid-cols-2 lg:mt-9 lg:grid-cols-3">
          {DESTINATIONS.map(({ kicker, city, code }) => {
            return (
              <li key={code}>
                <Link
                  href={`/search?origin=CAI&destination=${code}`}
                  className={cn(
                    'group flex min-h-[344px] flex-col rounded-[22px] p-[25px] transition-transform duration-200 hover:-translate-y-1',
                    'bg-navy',
                  )}
                >
                  <span className={cn('text-xs leading-none font-bold', 'text-teal')}>
                    {kicker}
                  </span>
                  <span
                    className={cn(
                      'mt-[33px] text-[39px] leading-none font-extrabold uppercase',
                      'text-white',
                    )}
                  >
                    {city}
                  </span>
                  <span
                    className={cn('mt-[30px] text-[13px] leading-none font-semibold', 'text-teal')}
                  >
                    CAI <span aria-hidden="true">→</span>
                    <span className="sr-only">to</span> {code} / FROM CAIRO
                  </span>
                  <span aria-hidden="true" className={cn('mt-auto h-px w-full', 'bg-teal')} />
                  <span className="mt-[22px] flex items-center justify-between gap-4">
                    <span className={cn('text-[22px] leading-none font-extrabold', 'text-white')}>
                      See flights
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-[58px] shrink-0 place-items-center rounded-full text-[29px] leading-none font-bold transition-transform duration-200 group-hover:rotate-45',
                        'bg-pink text-navy',
                      )}
                    >
                      ↗
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="bg-navy">
        <ul
          aria-label="The aeron promise"
          className="mx-auto flex max-w-[1440px] flex-wrap gap-x-[33px] gap-y-2 px-5 py-7 md:px-10 lg:min-h-[113px] lg:items-center lg:px-[69px] lg:py-0"
        >
          <li className="text-[clamp(1.6rem,2.45vw,35px)] leading-none font-extrabold text-teal lg:w-[355px]">
            COMPARE LESS.
          </li>
          <li className="text-[clamp(1.6rem,2.45vw,35px)] leading-none font-extrabold text-pink lg:w-[355px]">
            FLY MORE.
          </li>
          <li className="text-[clamp(1.6rem,2.45vw,35px)] leading-none font-extrabold text-teal lg:w-[355px]">
            GO FURTHER.
          </li>
        </ul>
      </div>

      <section id="why" aria-labelledby="why-title" className="scroll-mt-6 bg-navy">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pt-10 pb-16 md:px-10 lg:grid-cols-[minmax(0,1fr)_516px] lg:gap-10 lg:px-[68px] lg:pt-[52px] lg:pr-[91px] lg:pb-[64px]">
          <div>
            <p className="text-xs leading-none font-bold text-mist">03 / THE AERON DIFFERENCE</p>
            <h2
              id="why-title"
              className="mt-8 text-[clamp(2.5rem,4.45vw,64px)] leading-[1.17] font-extrabold"
            >
              <span className="block text-white">LESS CLICKING.</span>
              <span className="block text-pink">MORE LIVING.</span>
            </h2>
            <p className="mt-10 text-lg leading-[1.6] text-teal md:text-xl">
              The journey is the story.
              <br />
              {"Booking it shouldn't be the plot."}
            </p>
          </div>
          <ol className="flex flex-col gap-4 lg:mt-2">
            {BENEFITS.map((benefit) => (
              <li key={benefit.n} className="flex items-center gap-5 bg-navy-soft p-[17px]">
                <span
                  aria-hidden="true"
                  className="grid h-[70px] w-[50px] shrink-0 place-items-center rounded-[15px] bg-pink text-xl leading-none font-extrabold text-navy"
                >
                  {benefit.n}
                </span>
                <div className="flex flex-col gap-3">
                  <h3 className="text-[19px] leading-tight font-bold text-white">
                    {benefit.title}
                  </h3>
                  <p className="text-[13px] leading-snug font-medium text-teal">{benefit.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className={`${CONTAINER} pb-11 xl:px-16`}>
        <section
          aria-labelledby="promo-title"
          className="relative mt-14 overflow-hidden rounded-[28px] bg-pink px-6 pt-7 pb-8 lg:mt-[58px] lg:min-h-[244px] lg:overflow-visible lg:px-[26px]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[-80px] right-[41px] hidden size-[280px] rounded-full bg-navy lg:block"
          >
            <span className="absolute top-[55px] left-[64px] size-[150px] rounded-full bg-pink" />
          </div>
          <p className="relative text-xs leading-none font-bold text-navy">READY WHEN YOU ARE</p>
          <h2
            id="promo-title"
            className="relative mt-6 text-[clamp(2.25rem,3.75vw,54px)] leading-[1.15] font-extrabold text-navy lg:mt-[14px]"
          >
            {"THE WORLD WON'T"}
            <br />
            BOOK ITSELF.
          </h2>
          <Link
            href="/search"
            className="relative mt-7 flex h-[62px] w-full items-center justify-center gap-3 rounded-full bg-navy px-4 text-[15px] font-bold text-white transition-colors hover:bg-navy-soft focus-visible:outline-navy sm:w-[295px] lg:absolute lg:right-[42px] lg:bottom-[22px] lg:mt-0"
          >
            SEARCH FLIGHTS <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
