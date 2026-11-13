import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { AppError } from '../../shared/errors';
import { money } from '../../shared/money';
import {
  BOOKING_OWNERS,
  type BookingOwners,
  FLIGHT_BOOKING_CANCELLATION,
  type FlightBookingCancellation,
} from '../booking/index';
import { CATALOG_API, type CatalogApi, FlightStatus } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import { Ctx, type RequestContext } from '../users-access/index';
import { CreateFlightBody, UpdateFlightStatusBody } from './administration.dto';
import { CancelFlight } from './cancel-flight.command';
import { CommandBus } from './command-bus';
import { CreateFlight, type CreateFlightFailure } from './create-flight.command';
import {
  type StatusChanged,
  UpdateFlightStatus,
  type UpdateFlightStatusFailure,
} from './update-flight-status.command';

class CancelFlightBody {
  @ApiProperty({ example: 'Aircraft maintenance' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 255)
  reason!: string;
}

type Failure = CreateFlightFailure | UpdateFlightStatusFailure;

/** How each expected command failure is reported; every other code is a 400. */
const NOT_FOUND: readonly Failure[] = ['FLIGHT_NOT_FOUND'];
const CONFLICT: readonly Failure[] = ['DUPLICATE_FLIGHT', 'INVALID_TRANSITION'];

const MESSAGES: Record<Failure, string> = {
  INVALID_FLIGHT_NUMBER: 'The flight number is not valid.',
  INVALID_AIRPORT_CODE: 'Airport codes are three letters.',
  AIRLINE_MISMATCH: 'The flight number does not belong to this airline.',
  UNKNOWN_AIRLINE: 'The airline is not known.',
  SAME_AIRPORT: 'Origin and destination must be different airports.',
  UNKNOWN_AIRPORT: 'The origin or destination airport is not known.',
  ARRIVAL_NOT_AFTER_DEPARTURE: 'Arrival must be after departure.',
  DEPARTURE_IN_PAST: 'Departure must be in the future.',
  MISSING_FARE: 'Both cabins need a fare.',
  FARE_NOT_POSITIVE: 'Fares must be above zero.',
  DUPLICATE_FLIGHT: 'This flight number already departs on that local date.',
  NO_SEATS: 'At least one cabin needs a capacity above zero.',
  FLIGHT_NOT_FOUND: 'Flight not found.',
  INVALID_TRANSITION: 'The flight cannot move to this status from its current one.',
  ESTIMATE_REQUIRED: 'A delay needs a new estimated departure time.',
  ESTIMATE_NOT_AFTER_SCHEDULED: 'The estimated departure must be later than the scheduled one.',
  ESTIMATE_NOT_ALLOWED: 'Only a delay carries an estimated departure time.',
  USE_CANCEL_FLIGHT: 'A flight is cancelled through the cancel-flight operation.',
};

function failed(code: Failure): AppError {
  if (NOT_FOUND.includes(code)) return AppError.notFound(code, MESSAGES[code]);
  if (CONFLICT.includes(code)) return AppError.conflict(code, MESSAGES[code]);
  return AppError.badRequest(code, MESSAGES[code]);
}

const FLIGHT_ID = new ParseUUIDPipe({
  exceptionFactory: () => AppError.notFound('FLIGHT_NOT_FOUND', MESSAGES.FLIGHT_NOT_FOUND),
});

/**
 * The client of the Command pattern: each route builds one command from the request and hands it
 * to the bus. Access control, the transaction and events are the bus's job, so a route cannot
 * skip them; the controller only shapes input and maps the result to HTTP.
 */
@Controller('admin')
@ApiUnauthorizedResponse({ description: 'Sign in with POST /users/sign-in first.' })
@ApiForbiddenResponse({ description: 'An administrator session is required.' })
export class AdministrationController {
  constructor(
    private readonly bus: CommandBus,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    @Inject(BOOKING_OWNERS) private readonly owners: BookingOwners,
    @Inject(FLIGHT_BOOKING_CANCELLATION) private readonly cancellations: FlightBookingCancellation,
  ) {}

  /** US-AD-01: a SCHEDULED flight with its fares and both cabins' capacity. */
  @Post('flights')
  @ApiOperation({ summary: 'Create a scheduled flight with fares and seats' })
  @ApiCreatedResponse({
    description: 'Flight and both cabins were saved.',
    schema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input, schedule, fare, or capacity.' })
  @ApiConflictResponse({
    description: 'Flight number already exists on that local departure date.',
  })
  async createFlight(
    @Ctx() ctx: RequestContext,
    @Body() body: CreateFlightBody,
  ): Promise<{ id: string }> {
    const command = new CreateFlight(this.catalog, this.inventory, {
      flight: {
        flightNumber: body.flightNumber,
        airlineCode: body.airlineCode,
        originCode: body.originCode,
        destinationCode: body.destinationCode,
        scheduledDepartureUtc: new Date(body.scheduledDepartureUtc),
        scheduledArrivalUtc: new Date(body.scheduledArrivalUtc),
        fares: {
          ECONOMY: money(body.fares.ECONOMY, body.currency),
          BUSINESS: money(body.fares.BUSINESS, body.currency),
        },
      },
      capacity: { ECONOMY: body.capacity.ECONOMY, BUSINESS: body.capacity.BUSINESS },
    });
    const result = await this.bus.dispatch(command, ctx);
    if (!result.ok) throw failed(result.error);
    return result.value;
  }

  /** US-AD-02: moves a flight along the Catalog's status table; a delay notifies travelers. */
  @Patch('flights/:id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a flight’s operational status' })
  @ApiParam({ name: 'id', description: 'Flight ID returned on creation', format: 'uuid' })
  @ApiOkResponse({
    description: 'The status was updated.',
    schema: {
      type: 'object',
      required: ['status', 'previousStatus'],
      properties: {
        status: { type: 'string', enum: Object.values(FlightStatus), example: 'DELAYED' },
        previousStatus: { type: 'string', enum: Object.values(FlightStatus), example: 'SCHEDULED' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid status or estimate, or cancellation requested.' })
  @ApiNotFoundResponse({ description: 'Flight ID is invalid or unknown.' })
  @ApiConflictResponse({ description: 'The requested status transition is not allowed.' })
  async updateFlightStatus(
    @Ctx() ctx: RequestContext,
    @Param('id', FLIGHT_ID) id: string,
    @Body() body: UpdateFlightStatusBody,
  ): Promise<StatusChanged> {
    const command = new UpdateFlightStatus(
      this.catalog,
      this.owners,
      {
        flightId: id,
        status: body.status,
        estimatedDepartureUtc: body.estimatedDepartureUtc
          ? new Date(body.estimatedDepartureUtc)
          : undefined,
      },
      randomUUID,
    );
    const result = await this.bus.dispatch(command, ctx);
    if (!result.ok) throw failed(result.error);
    return result.value;
  }
  @Post('flights/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a flight, release bookings and record refunds' })
  async cancelFlight(
    @Ctx() ctx: RequestContext,
    @Param('id', FLIGHT_ID) id: string,
    @Body() body: CancelFlightBody,
  ) {
    const result = await this.bus.dispatch(
      new CancelFlight(this.catalog, this.cancellations, this.owners, id, body.reason),
      ctx,
    );
    if (!result.ok) throw failed(result.error);
    return result.value;
  }
}
