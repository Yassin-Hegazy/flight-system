/**
 * Real response bodies, recorded by running docs/postman against the demo data, shown as the
 * examples in /docs. Lists are cut to two items. Regenerate when a response shape changes.
 */
export const OPENAPI_EXAMPLES: Record<string, Record<string, unknown>> = {
  'DELETE /admin/airports/{code}': {
    '200': {
      code: 'QQQ',
    },
  },
  'GET /admin/airports/{code}': {
    '200': {
      code: 'QQQ',
      name: 'Demo Airport',
      city: 'Cairo',
      country: 'Egypt',
      timezone: 'Africa/Cairo',
    },
  },
  'GET /admin/audit': {
    '200': [
      {
        id: 'd83ed73e-bb8e-42fc-8e4c-7d8154e53efe',
        actorId: 'a125bf99-b622-45e3-b0a7-cdc30268be85',
        action: 'CancelFlight',
        target: 'acae291f-e6c1-4f29-983a-2b2f07965637',
        flightId: 'acae291f-e6c1-4f29-983a-2b2f07965637',
        before: {
          status: 'DELAYED',
          cancelReason: null,
        },
        after: {
          status: 'CANCELLED',
          cancelReason: 'Aircraft change',
          bookingsCancelled: 0,
        },
        createdAt: '2026-11-14T10:37:03.968Z',
      },
      {
        id: 'fbc45f16-e848-4a5f-87a0-849c57fb1142',
        actorId: 'a125bf99-b622-45e3-b0a7-cdc30268be85',
        action: 'UpdateFlightStatus',
        target: 'acae291f-e6c1-4f29-983a-2b2f07965637',
        flightId: 'acae291f-e6c1-4f29-983a-2b2f07965637',
        before: {
          status: 'SCHEDULED',
          estimatedDepartureUtc: null,
        },
        after: {
          status: 'DELAYED',
          estimatedDepartureUtc: '2026-11-24T10:00:00.000Z',
        },
        createdAt: '2026-11-14T10:37:03.938Z',
      },
    ],
  },
  'GET /admin/flights/{id}/load': {
    '200': [
      {
        flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
        cabin: 'ECONOMY',
        capacity: 160,
        committedSeats: 0,
        activeHeldSeats: 0,
        availableSeats: 160,
      },
      {
        flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
        cabin: 'BUSINESS',
        capacity: 20,
        committedSeats: 0,
        activeHeldSeats: 0,
        availableSeats: 20,
      },
    ],
  },
  'GET /admin/flights/{id}/manifest': {
    '200': [
      {
        passengerName: 'Sara Hassan',
        bookingReference: '9TG6GF',
        ticketNumber: '9990000000001',
        status: 'VALID',
      },
      {
        passengerName: 'Ahmed Hassan',
        bookingReference: '9TG6GF',
        ticketNumber: '9990000000002',
        status: 'VALID',
      },
    ],
  },
  'GET /bookings': {
    '200': {
      upcoming: [
        {
          reference: '9TG6GF',
          route: {
            origin: 'CAI',
            destination: 'LHR',
          },
          departureLocal: '2026-11-17T12:00+02:00',
          status: 'PENDING_PAYMENT',
          total: {
            amountMinor: 3987500,
            currency: 'EGP',
          },
        },
      ],
      past: [],
    },
  },
  'GET /bookings/{reference}': {
    '200': {
      reference: '9TG6GF',
      flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
      cabin: 'ECONOMY',
      status: 'PENDING_PAYMENT',
      amount: {
        amountMinor: 3987500,
        currency: 'EGP',
      },
      expiresAt: '2026-11-14T10:52:03.341Z',
      cancelReason: null,
      passengers: [
        {
          firstName: 'Sara',
          lastName: 'Hassan',
          birthDate: '1990-05-01',
          type: 'ADULT',
          fare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
        },
        {
          firstName: 'Ahmed',
          lastName: 'Hassan',
          birthDate: '1988-02-11',
          type: 'ADULT',
          fare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
        },
      ],
      segments: [
        {
          flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
          cabin: 'ECONOMY',
        },
      ],
      history: [
        {
          from: null,
          to: 'PENDING_PAYMENT',
          cause: 'CREATED',
          at: '2026-11-14T10:37:03.336Z',
        },
      ],
    },
  },
  'GET /bookings/{reference}/receipt': {
    '200': {
      id: 'f0134cbb-872c-4164-950d-5f6c9ea66f37',
      status: 'SUCCEEDED',
      amount: {
        amountMinor: 3987500,
        currency: 'EGP',
      },
      card: {
        brand: 'VISA',
        last4: '4242',
      },
      bookingReference: '9TG6GF',
      createdAt: '2026-11-14T10:37:03.452Z',
      resolvedAt: '2026-11-14T10:37:03.460Z',
      declineReason: null,
      refund: null,
    },
  },
  'GET /bookings/{reference}/tickets': {
    '200': [
      {
        ticketNumber: '9990000000001',
        status: 'VALID',
        bookingReference: '9TG6GF',
        passengerName: 'Sara Hassan',
        cabin: 'ECONOMY',
        flight: {
          flightNumber: 'MS4933',
          airline: {
            code: 'MS',
            name: 'EgyptAir',
          },
          origin: {
            code: 'CAI',
            name: 'Cairo International Airport',
            city: 'Cairo',
          },
          destination: {
            code: 'LHR',
            name: 'Heathrow Airport',
            city: 'London',
          },
          scheduledDepartureLocal: '2026-11-17T12:00+02:00',
          scheduledArrivalLocal: '2026-11-17T15:00+00:00',
          status: 'SCHEDULED',
        },
        issuedAt: '2026-11-14T10:37:03.472Z',
        voidedAt: null,
      },
      {
        ticketNumber: '9990000000002',
        status: 'VALID',
        bookingReference: '9TG6GF',
        passengerName: 'Ahmed Hassan',
        cabin: 'ECONOMY',
        flight: {
          flightNumber: 'MS4933',
          airline: {
            code: 'MS',
            name: 'EgyptAir',
          },
          origin: {
            code: 'CAI',
            name: 'Cairo International Airport',
            city: 'Cairo',
          },
          destination: {
            code: 'LHR',
            name: 'Heathrow Airport',
            city: 'London',
          },
          scheduledDepartureLocal: '2026-11-17T12:00+02:00',
          scheduledArrivalLocal: '2026-11-17T15:00+00:00',
          status: 'SCHEDULED',
        },
        issuedAt: '2026-11-14T10:37:03.472Z',
        voidedAt: null,
      },
    ],
  },
  'GET /flights': {
    '200': [
      {
        id: '5aa85c0f-2e67-4f9e-8ef6-0f06b5d68596',
        flightNumber: 'MS777',
        airline: {
          code: 'MS',
          name: 'EgyptAir',
        },
        origin: {
          code: 'CAI',
          name: 'Cairo International Airport',
          city: 'Cairo',
          timezone: 'Africa/Cairo',
        },
        destination: {
          code: 'LHR',
          name: 'Heathrow Airport',
          city: 'London',
          timezone: 'Europe/London',
        },
        scheduledDepartureUtc: '2026-11-17T06:00:00.000Z',
        scheduledArrivalUtc: '2026-11-17T11:00:00.000Z',
        scheduledDepartureLocal: '2026-11-17T08:00+02:00',
        scheduledArrivalLocal: '2026-11-17T11:00+00:00',
        durationMinutes: 300,
        status: 'SCHEDULED',
        fares: {
          ECONOMY: {
            amountMinor: 1500000,
            currency: 'EGP',
          },
          BUSINESS: {
            amountMinor: 6000000,
            currency: 'EGP',
          },
        },
      },
    ],
  },
  'GET /flights/airports/suggestions': {
    '200': [
      {
        code: 'CAI',
        name: 'Cairo International Airport',
        city: 'Cairo',
        country: 'Egypt',
      },
    ],
  },
  'GET /flights/{id}': {
    '200': {
      id: '5aa85c0f-2e67-4f9e-8ef6-0f06b5d68596',
      flightNumber: 'MS777',
      airline: {
        code: 'MS',
        name: 'EgyptAir',
      },
      origin: {
        code: 'CAI',
        name: 'Cairo International Airport',
        city: 'Cairo',
        timezone: 'Africa/Cairo',
      },
      destination: {
        code: 'LHR',
        name: 'Heathrow Airport',
        city: 'London',
        timezone: 'Europe/London',
      },
      scheduledDepartureUtc: '2026-11-17T06:00:00.000Z',
      scheduledArrivalUtc: '2026-11-17T11:00:00.000Z',
      scheduledDepartureLocal: '2026-11-17T08:00+02:00',
      scheduledArrivalLocal: '2026-11-17T11:00+00:00',
      durationMinutes: 300,
      status: 'SCHEDULED',
      fares: {
        ECONOMY: {
          amountMinor: 1500000,
          currency: 'EGP',
        },
        BUSINESS: {
          amountMinor: 6000000,
          currency: 'EGP',
        },
      },
    },
  },
  'GET /health': {
    '200': {
      status: 'ok',
      database: 'connected',
    },
  },
  'GET /notifications': {
    '200': {
      items: [
        {
          id: 'e345b914-a40a-4eba-b7d4-5d96bfe1f3e3',
          type: 'BookingCancelled',
          title: 'Booking 9TG6GF cancelled',
          body: 'Your booking 9TG6GF has been cancelled.',
          link: '/bookings/9TG6GF',
          read: false,
          readAt: null,
          createdAt: '2026-11-14T10:37:04.162Z',
        },
        {
          id: '1e694deb-648e-4e56-9c37-9dc59613d4c1',
          type: 'TicketsIssued',
          title: 'Tickets for QVY7TP are ready',
          body: 'Your tickets for booking QVY7TP have been issued.',
          link: '/bookings/QVY7TP',
          read: false,
          readAt: null,
          createdAt: '2026-11-14T10:37:03.650Z',
        },
      ],
      unread: 5,
      total: 5,
      page: 1,
      pageSize: 20,
    },
  },
  'GET /notifications/preferences': {
    '200': {
      preferences: [
        {
          type: 'BookingConfirmed',
          email: false,
        },
        {
          type: 'TicketsIssued',
          email: false,
        },
      ],
    },
  },
  'GET /search/flights': {
    '200': {
      items: [
        {
          flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
          flightNumber: 'MS4933',
          airline: {
            code: 'MS',
            name: 'EgyptAir',
          },
          origin: {
            code: 'CAI',
            name: 'Cairo International Airport',
            city: 'Cairo',
            timezone: 'Africa/Cairo',
          },
          destination: {
            code: 'LHR',
            name: 'Heathrow Airport',
            city: 'London',
            timezone: 'Europe/London',
          },
          departureLocal: '2026-11-17T12:00+02:00',
          arrivalLocal: '2026-11-17T15:00+00:00',
          departureUtc: '2026-11-17T10:00:00.000Z',
          arrivalUtc: '2026-11-17T15:00:00.000Z',
          status: 'SCHEDULED',
          durationMinutes: 300,
          stops: 0,
          cabin: 'ECONOMY',
          adultFare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
          total: {
            amountMinor: 3987500,
            currency: 'EGP',
          },
          breakdown: [
            {
              passengerType: 'ADULT',
              count: 2,
              unitPrice: {
                amountMinor: 1450000,
                currency: 'EGP',
              },
              amount: {
                amountMinor: 2900000,
                currency: 'EGP',
              },
            },
            {
              passengerType: 'CHILD',
              count: 1,
              unitPrice: {
                amountMinor: 1087500,
                currency: 'EGP',
              },
              amount: {
                amountMinor: 1087500,
                currency: 'EGP',
              },
            },
          ],
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      hasNext: false,
      sort: 'PRICE',
      filters: {},
    },
    '400': {
      code: 'SAME_AIRPORT',
      message: 'Origin and destination must be different airports.',
      requestId: '81f9bbeb-3274-40a0-ac35-66fe559717a2',
      fieldErrors: {
        destination: 'Origin and destination must be different airports.',
      },
    },
  },
  'GET /search/round-trip': {
    '200': {
      outbound: {
        items: [
          {
            flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
            flightNumber: 'MS4933',
            airline: {
              code: 'MS',
              name: 'EgyptAir',
            },
            origin: {
              code: 'CAI',
              name: 'Cairo International Airport',
              city: 'Cairo',
              timezone: 'Africa/Cairo',
            },
            destination: {
              code: 'LHR',
              name: 'Heathrow Airport',
              city: 'London',
              timezone: 'Europe/London',
            },
            departureLocal: '2026-11-17T12:00+02:00',
            arrivalLocal: '2026-11-17T15:00+00:00',
            departureUtc: '2026-11-17T10:00:00.000Z',
            arrivalUtc: '2026-11-17T15:00:00.000Z',
            status: 'SCHEDULED',
            durationMinutes: 300,
            stops: 0,
            cabin: 'ECONOMY',
            adultFare: {
              amountMinor: 1450000,
              currency: 'EGP',
            },
            total: {
              amountMinor: 1450000,
              currency: 'EGP',
            },
            breakdown: [
              {
                passengerType: 'ADULT',
                count: 1,
                unitPrice: {
                  amountMinor: 1450000,
                  currency: 'EGP',
                },
                amount: {
                  amountMinor: 1450000,
                  currency: 'EGP',
                },
              },
            ],
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasNext: false,
        sort: 'PRICE',
        filters: {},
      },
      inbound: {
        items: [
          {
            flightId: '1adea857-d49c-4019-8a6a-9f79a20212bb',
            flightNumber: 'MS2351',
            airline: {
              code: 'MS',
              name: 'EgyptAir',
            },
            origin: {
              code: 'LHR',
              name: 'Heathrow Airport',
              city: 'London',
              timezone: 'Europe/London',
            },
            destination: {
              code: 'CAI',
              name: 'Cairo International Airport',
              city: 'Cairo',
              timezone: 'Africa/Cairo',
            },
            departureLocal: '2026-11-20T09:00+00:00',
            arrivalLocal: '2026-11-20T16:00+02:00',
            departureUtc: '2026-11-20T09:00:00.000Z',
            arrivalUtc: '2026-11-20T14:00:00.000Z',
            status: 'SCHEDULED',
            durationMinutes: 300,
            stops: 0,
            cabin: 'ECONOMY',
            adultFare: {
              amountMinor: 1300000,
              currency: 'EGP',
            },
            total: {
              amountMinor: 1300000,
              currency: 'EGP',
            },
            breakdown: [
              {
                passengerType: 'ADULT',
                count: 1,
                unitPrice: {
                  amountMinor: 1300000,
                  currency: 'EGP',
                },
                amount: {
                  amountMinor: 1300000,
                  currency: 'EGP',
                },
              },
            ],
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasNext: false,
        sort: 'PRICE',
        filters: {},
      },
    },
  },
  'GET /tickets/{number}': {
    '200': {
      ticketNumber: '9990000000001',
      status: 'VALID',
      bookingReference: '9TG6GF',
      passengerName: 'Sara Hassan',
      cabin: 'ECONOMY',
      flight: {
        flightNumber: 'MS4933',
        airline: {
          code: 'MS',
          name: 'EgyptAir',
        },
        origin: {
          code: 'CAI',
          name: 'Cairo International Airport',
          city: 'Cairo',
        },
        destination: {
          code: 'LHR',
          name: 'Heathrow Airport',
          city: 'London',
        },
        scheduledDepartureLocal: '2026-11-17T12:00+02:00',
        scheduledArrivalLocal: '2026-11-17T15:00+00:00',
        status: 'SCHEDULED',
      },
      issuedAt: '2026-11-14T10:37:03.472Z',
      voidedAt: null,
    },
  },
  'GET /tickets/{number}/print': {
    '200': {
      ticketNumber: '9990000000001',
      status: 'VALID',
      voidMarking: null,
      passengerName: 'Sara Hassan',
      bookingReference: '9TG6GF',
      airline: 'EgyptAir',
      flightNumber: 'MS4933',
      from: 'CAI',
      to: 'LHR',
      departureLocal: '2026-11-17T12:00+02:00',
      arrivalLocal: '2026-11-17T15:00+00:00',
      cabin: 'ECONOMY',
    },
  },
  'GET /users/me': {
    '200': {
      id: '4fff8e42-350d-4e97-ba83-00e9370cb78c',
      email: 'traveler.1794652622665@example.com',
      name: 'Nour Hassan',
      role: 'TRAVELER',
    },
  },
  'GET /users/me/saved-travelers': {
    '200': [
      {
        id: 'd7bc312f-f25a-44ad-8ae4-ac168b152415',
        ownerId: '4fff8e42-350d-4e97-ba83-00e9370cb78c',
        name: 'Omar Hassan',
        dateOfBirth: '2015-06-01',
      },
    ],
  },
  'PATCH /admin/flights/{id}/status': {
    '200': {
      status: 'DELAYED',
      previousStatus: 'SCHEDULED',
    },
  },
  'PATCH /users/me/saved-travelers/{id}': {
    '200': {
      id: 'd7bc312f-f25a-44ad-8ae4-ac168b152415',
      ownerId: '4fff8e42-350d-4e97-ba83-00e9370cb78c',
      name: 'Omar M. Hassan',
      dateOfBirth: '2015-06-01',
    },
  },
  'POST /admin/flights': {
    '201': {
      id: '34013139-0210-42d8-b80a-387c7c1ff27b',
    },
  },
  'POST /admin/flights/recurring': {
    '201': {
      flights: [
        {
          date: '2026-12-25',
          id: '70e8613d-f9be-45cd-91e1-588ca49386e7',
        },
        {
          date: '2026-12-28',
          id: 'ac0a9dc8-5630-4d9e-ac30-2e316facd102',
        },
      ],
    },
  },
  'POST /admin/flights/{id}/cancel': {
    '200': {
      status: 'CANCELLED',
    },
  },
  'POST /bookings': {
    '201': {
      reference: '9TG6GF',
      flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
      cabin: 'ECONOMY',
      status: 'PENDING_PAYMENT',
      amount: {
        amountMinor: 3987500,
        currency: 'EGP',
      },
      expiresAt: '2026-11-14T10:52:03.341Z',
      cancelReason: null,
      passengers: [
        {
          firstName: 'Sara',
          lastName: 'Hassan',
          birthDate: '1990-05-01',
          type: 'ADULT',
          fare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
        },
        {
          firstName: 'Ahmed',
          lastName: 'Hassan',
          birthDate: '1988-02-11',
          type: 'ADULT',
          fare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
        },
      ],
      segments: [
        {
          flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
          cabin: 'ECONOMY',
        },
      ],
      history: [
        {
          from: null,
          to: 'PENDING_PAYMENT',
          cause: 'CREATED',
          at: '2026-11-14T10:37:03.336Z',
        },
      ],
    },
    '409': {
      code: 'PRICE_CHANGED',
      message: 'The fare changed since it was displayed.',
      requestId: 'e77588c1-8464-408c-a68a-065db00dc372',
      fieldErrors: {
        currentTotal: '1450000',
        currency: 'EGP',
      },
    },
  },
  'POST /bookings/{reference}/cancel': {
    '200': {
      reference: '9TG6GF',
      flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
      cabin: 'ECONOMY',
      status: 'CANCELLED',
      amount: {
        amountMinor: 3987500,
        currency: 'EGP',
      },
      expiresAt: null,
      cancelReason: 'TRAVELER',
      passengers: [
        {
          firstName: 'Sara',
          lastName: 'Hassan',
          birthDate: '1990-05-01',
          type: 'ADULT',
          fare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
        },
        {
          firstName: 'Ahmed',
          lastName: 'Hassan',
          birthDate: '1988-02-11',
          type: 'ADULT',
          fare: {
            amountMinor: 1450000,
            currency: 'EGP',
          },
        },
      ],
      segments: [
        {
          flightId: '34013139-0210-42d8-b80a-387c7c1ff27b',
          cabin: 'ECONOMY',
        },
      ],
      history: [
        {
          from: null,
          to: 'PENDING_PAYMENT',
          cause: 'CREATED',
          at: '2026-11-14T10:37:03.336Z',
        },
        {
          from: 'PENDING_PAYMENT',
          to: 'CONFIRMED',
          cause: 'PAYMENT',
          at: '2026-11-14T10:37:03.456Z',
        },
      ],
    },
  },
  'POST /bookings/{reference}/payments': {
    '201': {
      id: 'f0134cbb-872c-4164-950d-5f6c9ea66f37',
      status: 'SUCCEEDED',
      amount: {
        amountMinor: 3987500,
        currency: 'EGP',
      },
      card: {
        brand: 'VISA',
        last4: '4242',
      },
    },
    '400': {
      code: 'DECLINED',
      message: 'The gateway declined this payment.',
      requestId: '7f9b8488-faca-42c0-b13c-3ef9bb143339',
      fieldErrors: {
        reason: 'insufficient_funds',
      },
    },
  },
  'POST /notifications/read-all': {
    '200': {
      updated: 4,
    },
  },
  'POST /users/admins': {
    '201': {
      id: '2abf4400-e9e8-4cc3-bc47-51691f9dc938',
    },
  },
  'POST /users/me/saved-travelers': {
    '201': {
      ownerId: '4fff8e42-350d-4e97-ba83-00e9370cb78c',
      name: 'Omar Hassan',
      dateOfBirth: '2015-06-01',
      id: 'd7bc312f-f25a-44ad-8ae4-ac168b152415',
    },
  },
  'POST /users/register': {
    '201': {
      id: '4fff8e42-350d-4e97-ba83-00e9370cb78c',
    },
  },
  'POST /users/sign-in': {
    '200': {
      id: 'a125bf99-b622-45e3-b0a7-cdc30268be85',
      email: 'admin@example.com',
      name: 'Administrator',
      role: 'ADMIN',
    },
  },
  'PUT /admin/airports/{code}': {
    '200': {
      code: 'QQQ',
    },
  },
  'PUT /admin/flights/{id}/capacity/{cabin}': {
    '200': {
      capacity: 160,
    },
  },
  'PUT /admin/flights/{id}/fares/{cabin}': {
    '200': {
      amountMinor: 1450000,
      currency: 'EGP',
    },
  },
};
