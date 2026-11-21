import Link from 'next/link';
import { DestinationBook } from '@/components/destination-book/destination-book';
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  OVERLINE,
  OVERLINE_ON_DARK,
  SIZE_LG,
} from '@/components/ui';
import { TripSearch } from './trip-search';

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-5 md:px-10 xl:px-[72px]';

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
            <p className={OVERLINE}>Welcome aboard / a smarter way to go</p>
            <h1
              id="hero-title"
              className="mt-8 text-[clamp(2.25rem,9.6vw,70px)] leading-[1.03] font-extrabold whitespace-nowrap text-navy lg:mt-[39px]"
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
              <a href="#search" className={`${BUTTON_SECONDARY} ${SIZE_LG} w-full sm:w-auto`}>
                Find your flight <span aria-hidden="true">↗</span>
              </a>
              <a
                href="#why"
                className="text-[15px] font-bold text-navy underline-offset-4 hover:underline"
              >
                See how it works <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div
            id="destinations"
            className="mx-auto w-full max-w-[560px] scroll-mt-6 lg:mt-10 lg:max-w-[640px] lg:justify-self-end"
          >
            <DestinationBook />
          </div>
        </div>
      </section>

      <div className={`${CONTAINER} pb-16 xl:px-16 lg:pb-[76px]`}>
        <TripSearch />
      </div>

      <div className="bg-navy">
        <ul
          aria-label="The aeron promise"
          className="mx-auto flex max-w-[1440px] flex-wrap gap-x-[33px] gap-y-2 px-5 py-7 md:px-10 lg:min-h-[113px] lg:items-center lg:px-[69px] lg:py-0"
        >
          {['Compare less.', 'Fly more.', 'Go further.'].map((line) => (
            <li
              key={line}
              className="text-[clamp(1.6rem,2.45vw,35px)] leading-none font-extrabold text-teal lg:w-[355px]"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>

      <section id="why" aria-labelledby="why-title" className="scroll-mt-6 bg-navy">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pt-10 pb-16 md:px-10 lg:grid-cols-[minmax(0,1fr)_516px] lg:gap-10 lg:px-[68px] lg:pt-[52px] lg:pr-[91px] lg:pb-[64px]">
          <div>
            <p className={OVERLINE_ON_DARK}>02 / The aeron difference</p>
            <h2
              id="why-title"
              className="mt-8 text-[clamp(2.5rem,4.45vw,64px)] leading-[1.17] font-extrabold"
            >
              <span className="block text-white">Less clicking.</span>
              <span className="block text-mist">More living.</span>
            </h2>
            <p className="mt-10 text-lg leading-[1.6] text-teal md:text-xl">
              The journey is the story.
              <br />
              {"Booking it shouldn't be the plot."}
            </p>
          </div>
          <ol className="flex flex-col gap-4 lg:mt-2">
            {BENEFITS.map((benefit) => (
              <li
                key={benefit.n}
                className="flex items-center gap-5 rounded-inset bg-navy-soft p-[17px]"
              >
                <span
                  aria-hidden="true"
                  className="grid h-[70px] w-[50px] shrink-0 place-items-center rounded-inset bg-teal text-xl leading-none font-extrabold text-navy"
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
          className={`${CARD} mt-14 flex flex-col gap-6 lg:mt-[58px] lg:flex-row lg:items-end lg:justify-between lg:p-10`}
        >
          <div>
            <p className={OVERLINE}>Ready when you are</p>
            <h2
              id="promo-title"
              className="mt-5 text-[clamp(2.25rem,3.75vw,54px)] leading-[1.1] font-extrabold text-navy"
            >
              {"The world won't"}
              <br />
              book itself.
            </h2>
          </div>
          <Link href="/search" className={`${BUTTON_PRIMARY} ${SIZE_LG} w-full sm:w-auto`}>
            Search flights <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
