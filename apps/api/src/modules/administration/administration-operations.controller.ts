import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiSession } from '../../shared/api-docs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../shared/errors';
import { money } from '../../shared/money';
import { BookingPassengers } from '../booking/index';
import { CATALOG_API, type CatalogApi, CABINS, isCabin } from '../flight-catalog/index';
import { INVENTORY_API, type CapacityError, type InventoryApi } from '../inventory/index';
import { FlightTickets } from '../ticketing/index';
import { Action, Ctx, type RequestContext, UserRole, WithRole } from '../users-access/index';
import { DeleteAirport, UpsertAirport } from './airport.commands';
import { AuditLog } from './audit-log';
import { CommandBus } from './command-bus';
import { ConfigureCapacity } from './configure-capacity.command';
import {
  AirportBody,
  AuditQuery,
  CapacityBody,
  FareBody,
  RecurringFlightBody,
} from './operations.dto';
import { ScheduleRecurring } from './schedule-recurring.command';
import { UpdateFare } from './update-fare.command';

const FLIGHT_ID = new ParseUUIDPipe();
const flightNotFound = () => AppError.notFound('FLIGHT_NOT_FOUND', 'Flight not found.');

function cabin(raw: string) {
  if (!isCabin(raw)) throw AppError.badRequest('INVALID_CABIN', 'Use ECONOMY or BUSINESS.');
  return raw;
}

function airportCode(code: string): string {
  if (!/^[A-Z]{3}$/.test(code))
    throw AppError.badRequest('INVALID_AIRPORT_CODE', 'Use three uppercase IATA letters.');
  return code;
}

function capacityError(error: CapacityError): AppError {
  if (typeof error !== 'string') {
    return AppError.conflict(
      error.code,
      `Capacity cannot be below ${error.committedSeats} committed plus ${error.activeHeldSeats} held seats.`,
      {
        committedSeats: String(error.committedSeats),
        activeHeldSeats: String(error.activeHeldSeats),
      },
    );
  }
  return error === 'FLIGHT_NOT_FOUND'
    ? flightNotFound()
    : AppError.badRequest(error, 'The cabin capacity is invalid.');
}

@Controller('admin')
@ApiTags('Administration')
@ApiSession(403)
export class AdministrationOperationsController {
  constructor(
    private readonly bus: CommandBus,
    private readonly audit: AuditLog,
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly passengers: BookingPassengers,
    private readonly tickets: FlightTickets,
  ) {}

  @Put('flights/:id/capacity/:cabin')
  @ApiOperation({ summary: 'Set the capacity of one cabin' })
  @ApiOkResponse({ description: 'The new capacity.' })
  @ApiErrors(400, 404, 409)
  async capacity(
    @Ctx() ctx: RequestContext,
    @Param('id', FLIGHT_ID) id: string,
    @Param('cabin') rawCabin: string,
    @Body() body: CapacityBody,
  ) {
    const result = await this.bus.dispatch(
      new ConfigureCapacity(this.inventory, id, cabin(rawCabin), body.capacity),
      ctx,
    );
    if (!result.ok) throw capacityError(result.error);
    return result.value;
  }

  @Put('flights/:id/fares/:cabin')
  @ApiOperation({ summary: 'Set a cabin fare for future bookings' })
  @ApiOkResponse({ description: 'The new fare; existing bookings keep theirs.' })
  @ApiErrors(400, 404)
  async fare(
    @Ctx() ctx: RequestContext,
    @Param('id', FLIGHT_ID) id: string,
    @Param('cabin') rawCabin: string,
    @Body() body: FareBody,
  ) {
    const result = await this.bus.dispatch(
      new UpdateFare(this.catalog, id, cabin(rawCabin), money(body.amountMinor, body.currency)),
      ctx,
    );
    if (result.ok) return result.value;
    if (result.error === 'FLIGHT_NOT_FOUND') throw flightNotFound();
    throw AppError.badRequest(
      result.error,
      'The fare must be positive and in the flight currency.',
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('flights/:id/load')
  @ApiOperation({ summary: 'Read capacity, sold, held and available seats for both cabins' })
  @ApiOkResponse({ description: 'One entry per cabin; the four numbers always add up.' })
  @ApiErrors(404)
  load(@Ctx() ctx: RequestContext, @Param('id', FLIGHT_ID) id: string) {
    return this.read(ctx, async () => {
      if (!(await this.catalog.getFlight(id))) throw flightNotFound();
      const result = await this.inventory.cabinLoad(id);
      if (!result.ok) throw flightNotFound();
      return CABINS.map(
        (cabin) =>
          result.value.find((load) => load.cabin === cabin) ?? {
            flightId: id,
            cabin,
            capacity: 0,
            committedSeats: 0,
            activeHeldSeats: 0,
            availableSeats: 0,
          },
      );
    });
  }

  @Header('Cache-Control', 'no-store')
  @Get('flights/:id/manifest')
  @ApiOperation({ summary: 'Read the confirmed passenger manifest' })
  @ApiOkResponse({
    description: 'Paid passengers with booking reference, ticket number and status.',
  })
  @ApiErrors(404)
  manifest(@Ctx() ctx: RequestContext, @Param('id', FLIGHT_ID) id: string) {
    return this.read(ctx, () =>
      this.db.transaction('REPEATABLE READ', async (tx) => {
        if (!(await this.catalog.getFlight(id, tx))) throw flightNotFound();
        const passengers = await this.passengers.confirmedFlight(tx, id);
        const tickets = await this.tickets.forFlight(tx, id);
        const numbers = new Map(tickets.map((ticket) => [ticket.bookingId, ticket]));
        return passengers
          .map((passenger) => ({
            passengerName: passenger.passengerName,
            bookingReference: passenger.reference,
            ticketNumber: numbers.get(passenger.id)?.number ?? null,
            status: numbers.get(passenger.id)?.status ?? passenger.status,
          }))
          .sort((a, b) => a.bookingReference.localeCompare(b.bookingReference));
      }),
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('airports/:code')
  @ApiOperation({ summary: 'Read the airport details' })
  @ApiOkResponse({ description: 'The airport, with its IANA time zone.' })
  @ApiErrors(400, 404)
  airport(@Ctx() ctx: RequestContext, @Param('code') code: string) {
    return this.read(ctx, async () => {
      const airport = await this.catalog.airport(airportCode(code));
      if (!airport) throw AppError.notFound('AIRPORT_NOT_FOUND', 'Airport not found.');
      return airport;
    });
  }

  @Put('airports/:code')
  @ApiOperation({ summary: 'Create or edit an airport by IATA code' })
  @ApiOkResponse({ description: 'Saved.' })
  @ApiErrors(400, 409)
  async upsertAirport(
    @Ctx() ctx: RequestContext,
    @Param('code') code: string,
    @Body() body: AirportBody,
  ) {
    const result = await this.bus.dispatch(
      new UpsertAirport(this.catalog, { ...body, code: airportCode(code) }),
      ctx,
    );
    if (result.ok) return result.value;
    if (result.error === 'TIMEZONE_IN_USE')
      throw AppError.conflict(
        result.error,
        'Flights depart from this airport in its current zone.',
      );
    throw AppError.badRequest(result.error, 'Use valid airport details and an IANA time zone.');
  }

  @Delete('airports/:code')
  @ApiOperation({ summary: 'Delete an airport that has no flights' })
  @ApiOkResponse({ description: 'Deleted.' })
  @ApiErrors(400, 404, 409)
  async deleteAirport(@Ctx() ctx: RequestContext, @Param('code') code: string) {
    const result = await this.bus.dispatch(new DeleteAirport(this.catalog, airportCode(code)), ctx);
    if (result.ok) return result.value;
    if (result.error === 'AIRPORT_IN_USE')
      throw AppError.conflict(result.error, 'Flights use this airport.');
    throw AppError.notFound(result.error, 'Airport not found.');
  }

  @Header('Cache-Control', 'no-store')
  @Get('audit')
  @ApiOperation({ summary: 'Read the append-only audit trail, optionally by flight ID' })
  @ApiOkResponse({
    description: 'Who changed what and when, newest first, with before and after values.',
  })
  @ApiErrors(400)
  auditTrail(@Ctx() ctx: RequestContext, @Query() query: AuditQuery) {
    return this.read(ctx, () => this.audit.list(query.flightId, query.page));
  }

  @Post('flights/recurring')
  @ApiOperation({ summary: 'Schedule a series of flights in the origin airport time zone' })
  @ApiCreatedResponse({
    description: 'Every flight in the series; none are created if one date fails.',
  })
  @ApiErrors(400)
  async recurring(@Ctx() ctx: RequestContext, @Body() body: RecurringFlightBody) {
    const result = await this.bus.dispatch(
      new ScheduleRecurring(this.catalog, this.inventory, body),
      ctx,
    );
    if (!result.ok)
      throw AppError.badRequest(
        result.error.code,
        'The flight series could not be scheduled.',
        result.error.dates,
      );
    return result.value;
  }

  private read<T>(ctx: RequestContext, read: () => Promise<T>): Promise<T> {
    return new WithRole(new Action(read), UserRole.Admin).execute(ctx, undefined);
  }
}
