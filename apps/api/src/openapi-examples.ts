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
        id: '6432f78d-b1a5-4170-bb31-9ad0aa509795',
        actorId: '1d95955d-e964-4440-ac42-393f8a45529b',
        action: 'CancelFlight',
        target: '92df7417-15fa-4057-b8ef-22c81789dc12',
        flightId: '92df7417-15fa-4057-b8ef-22c81789dc12',
        before: {
          status: 'DELAYED',
          cancelReason: null,
        },
        after: {
          status: 'CANCELLED',
          cancelReason: 'Aircraft change',
          bookingsCancelled: 0,
        },
        createdAt: '2026-11-13T21:46:12.127Z',
      },
      {
        id: 'ba9aa971-e324-4ae8-af18-3cd72e4f4694',
        actorId: '1d95955d-e964-4440-ac42-393f8a45529b',
        action: 'UpdateFlightStatus',
        target: '92df7417-15fa-4057-b8ef-22c81789dc12',
        flightId: '92df7417-15fa-4057-b8ef-22c81789dc12',
        before: {
          status: 'SCHEDULED',
          estimatedDepartureUtc: null,
        },
        after: {
          status: 'DELAYED',
          estimatedDepartureUtc: '2026-11-23T10:00:00.000Z',
        },
        createdAt: '2026-11-13T21:46:12.093Z',
      },
    ],
  },
  'GET /admin/flights/{id}/load': {
    '200': [
      {
        flightId: 'de69e563-a5bf-49da-b886-0b967f542f24',
        cabin: 'ECONOMY',
        capacity: 160,
        committedSeats: 0,
        activeHeldSeats: 0,
        availableSeats: 160,
      },
      {
        flightId: 'de69e563-a5bf-49da-b886-0b967f542f24',
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
        passengerName: 'Demo Traveler',
        bookingReference: 'F4CSK4',
        ticketNumber: '9990000000001',
        status: 'VALID',
      },
    ],
  },
  'GET /bookings/{reference}': {
    '200': {
      reference: 'F4CSK4',
      flightId: 'de69e563-a5bf-49da-b886-0b967f542f24',
      cabin: 'ECONOMY',
      status: 'TICKETED',
      amount: {
        amountMinor: 1450000,
        currency: 'EGP',
      },
    },
  },
  'GET /bookings/{reference}/receipt': {
    '200': {
      id: '3479178e-0086-4d3e-8e59-1869d79cbcd3',
      status: 'SUCCEEDED',
      amount: {
        amountMinor: 1450000,
        currency: 'EGP',
      },
      card: {
        brand: 'VISA',
        last4: '4242',
      },
      bookingReference: 'F4CSK4',
      createdAt: '2026-11-13T21:46:11.553Z',
      resolvedAt: '2026-11-13T21:46:11.570Z',
      declineReason: null,
      refund: {
        status: 'SUCCEEDED',
        amount: {
          amountMinor: 1450000,
          currency: 'EGP',
        },
        resolvedAt: '2026-11-13T21:46:12.428Z',
      },
    },
  },
  'GET /bookings/{reference}/tickets': {
    '200': [
      {
        ticketNumber: '9990000000001',
        status: 'VALID',
        bookingReference: 'F4CSK4',
        passengerName: 'Demo Traveler',
        cabin: 'ECONOMY',
        flight: {
          flightNumber: 'MS8447',
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
          scheduledDepartureLocal: '2026-11-16T12:00+02:00',
          scheduledArrivalLocal: '2026-11-16T15:00+00:00',
          status: 'SCHEDULED',
        },
        issuedAt: '2026-11-13T21:46:11.579Z',
        voidedAt: null,
      },
    ],
  },
  'GET /flights': {
    '200': [
      {
        id: 'ee2698c8-25a1-4a22-8702-f2c36398152f',
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
        scheduledDepartureUtc: '2026-11-16T06:00:00.000Z',
        scheduledArrivalUtc: '2026-11-16T11:00:00.000Z',
        scheduledDepartureLocal: '2026-11-16T08:00+02:00',
        scheduledArrivalLocal: '2026-11-16T11:00+00:00',
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
      id: 'ee2698c8-25a1-4a22-8702-f2c36398152f',
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
      scheduledDepartureUtc: '2026-11-16T06:00:00.000Z',
      scheduledArrivalUtc: '2026-11-16T11:00:00.000Z',
      scheduledDepartureLocal: '2026-11-16T08:00+02:00',
      scheduledArrivalLocal: '2026-11-16T11:00+00:00',
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
          id: '72074299-b590-4163-985f-194237459c8c',
          type: 'BookingCancelled',
          title: 'Booking F4CSK4 cancelled',
          body: 'Your booking F4CSK4 has been cancelled.',
          link: '/bookings/F4CSK4',
          read: false,
          readAt: null,
          createdAt: '2026-11-13T21:46:12.419Z',
        },
        {
          id: 'b77dfa5f-6bee-4ecf-8359-dd37d5baeada',
          type: 'TicketsIssued',
          title: 'Tickets for F4CSK4 are ready',
          body: 'Your tickets for booking F4CSK4 have been issued.',
          link: '/bookings/F4CSK4',
          read: false,
          readAt: null,
          createdAt: '2026-11-13T21:46:11.583Z',
        },
      ],
      unread: 3,
      total: 3,
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
          flightId: 'de69e563-a5bf-49da-b886-0b967f542f24',
          flightNumber: 'MS8447',
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
          departureLocal: '2026-11-16T12:00+02:00',
          arrivalLocal: '2026-11-16T15:00+00:00',
          departureUtc: '2026-11-16T10:00:00.000Z',
          arrivalUtc: '2026-11-16T15:00:00.000Z',
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
      pageSize: 5,
      total: 1,
      hasNext: false,
      sort: 'DURATION',
      filters: {
        departureWindow: {
          from: '06:00',
          to: '23:00',
        },
        airlines: ['MS'],
      },
    },
    '400': {
      code: 'SAME_AIRPORT',
      message: 'Origin and destination must be different airports.',
      requestId: 'cc71ce79-1019-4e0d-addd-7befcf510306',
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
            flightId: 'de69e563-a5bf-49da-b886-0b967f542f24',
            flightNumber: 'MS8447',
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
            departureLocal: '2026-11-16T12:00+02:00',
            arrivalLocal: '2026-11-16T15:00+00:00',
            departureUtc: '2026-11-16T10:00:00.000Z',
            arrivalUtc: '2026-11-16T15:00:00.000Z',
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
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        hasNext: false,
        sort: 'PRICE',
        filters: {},
      },
    },
  },
  'GET /tickets/{number}': {
    '200': {
      ticketNumber: '9990000000001',
      status: 'VOID',
      bookingReference: 'F4CSK4',
      passengerName: 'Demo Traveler',
      cabin: 'ECONOMY',
      flight: {
        flightNumber: 'MS8447',
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
        scheduledDepartureLocal: '2026-11-16T12:00+02:00',
        scheduledArrivalLocal: '2026-11-16T15:00+00:00',
        status: 'SCHEDULED',
      },
      issuedAt: '2026-11-13T21:46:11.579Z',
      voidedAt: '2026-11-13T21:46:12.401Z',
    },
  },
  'GET /tickets/{number}/print': {
    '200': {
      ticketNumber: '9990000000001',
      status: 'VOID',
      voidMarking: 'VOID',
      passengerName: 'Demo Traveler',
      bookingReference: 'F4CSK4',
      airline: 'EgyptAir',
      flightNumber: 'MS8447',
      from: 'CAI',
      to: 'LHR',
      departureLocal: '2026-11-16T12:00+02:00',
      arrivalLocal: '2026-11-16T15:00+00:00',
      cabin: 'ECONOMY',
    },
  },
  'GET /users/me': {
    '200': {
      id: '1672531c-da30-4df1-a3aa-a742944460d7',
      email: 'traveler.1794606370514@example.com',
      name: 'Nour Hassan',
      role: 'TRAVELER',
    },
  },
  'GET /users/me/saved-travelers': {
    '200': [
      {
        id: '0ee1d433-9263-497d-b7e1-e81895dcf56a',
        ownerId: '1672531c-da30-4df1-a3aa-a742944460d7',
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
      id: '0ee1d433-9263-497d-b7e1-e81895dcf56a',
      ownerId: '1672531c-da30-4df1-a3aa-a742944460d7',
      name: 'Omar M. Hassan',
      dateOfBirth: '2015-06-01',
    },
  },
  'POST /admin/flights': {
    '201': {
      id: '92df7417-15fa-4057-b8ef-22c81789dc12',
    },
  },
  'POST /admin/flights/recurring': {
    '201': {
      flights: [
        {
          date: '2026-12-23',
          id: '2e1ba156-ad81-4d73-8591-ebaa75e04cf8',
        },
        {
          date: '2026-12-25',
          id: '7449ae73-1283-4231-9a72-e0790a920b74',
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
      reference: 'H9LW27',
      flightId: 'de69e563-a5bf-49da-b886-0b967f542f24',
      cabin: 'ECONOMY',
      status: 'PENDING_PAYMENT',
      amount: {
        amountMinor: 1450000,
        currency: 'EGP',
      },
    },
  },
  'POST /bookings/{reference}/cancel': {
    '200': {
      status: 'CANCELLED',
    },
  },
  'POST /bookings/{reference}/payments': {
    '201': {
      id: '3479178e-0086-4d3e-8e59-1869d79cbcd3',
      status: 'SUCCEEDED',
      amount: {
        amountMinor: 1450000,
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
      requestId: '1f5771b8-7f74-4ab0-b534-f7be08f7023c',
      fieldErrors: {
        reason: 'insufficient_funds',
      },
    },
  },
  'POST /notifications/read-all': {
    '200': {
      updated: 2,
    },
  },
  'POST /users/admins': {
    '201': {
      id: '6d5ad7af-f21a-4af6-a62a-174c0e18a4e3',
    },
  },
  'POST /users/me/saved-travelers': {
    '201': {
      ownerId: '1672531c-da30-4df1-a3aa-a742944460d7',
      name: 'Omar Hassan',
      dateOfBirth: '2015-06-01',
      id: '0ee1d433-9263-497d-b7e1-e81895dcf56a',
    },
  },
  'POST /users/register': {
    '201': {
      id: '1672531c-da30-4df1-a3aa-a742944460d7',
    },
  },
  'POST /users/sign-in': {
    '200': {
      id: '553ea74f-947f-4c2c-80a2-b6aa3499f865',
      email: 'traveler@example.com',
      name: 'Demo Traveler',
      role: 'TRAVELER',
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
