import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../shared/errors';
import {
  Action,
  Ctx,
  type RequestContext,
  signedIn,
  UserRole,
  WithRole,
} from '../users-access/index';
import { printableTicket, TicketViews } from './ticket-views';

const notFound = () => AppError.notFound('NOT_FOUND', 'Not found.');

/** Ticket reads. Each is the owner's only: anyone else gets the same 404 as a missing ticket. */
@ApiTags('Ticketing')
@Controller()
export class TicketingController {
  constructor(private readonly views: TicketViews) {}

  @Get('bookings/:reference/tickets')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "List your booking's tickets, one per passenger per flight" })
  @ApiOkResponse({ description: 'The tickets, VALID or VOID, with each flight as it stands now.' })
  @ApiNotFoundResponse({ description: 'No such booking of yours.' })
  forBooking(@Ctx() ctx: RequestContext, @Param('reference') reference: string) {
    return this.asOwner(ctx, async () => {
      const tickets = await this.views.forBooking(reference.toUpperCase(), signedIn(ctx).id);
      if (!tickets) throw notFound();
      return tickets;
    });
  }

  @Get('tickets/:number')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read one of your tickets by its 13-digit number' })
  @ApiOkResponse({ description: 'The ticket and its flight, including any delay.' })
  @ApiNotFoundResponse({ description: 'No such ticket of yours.' })
  one(@Ctx() ctx: RequestContext, @Param('number') number: string) {
    return this.asOwner(ctx, async () => {
      const ticket = await this.views.one(number, signedIn(ctx).id);
      if (!ticket) throw notFound();
      return ticket;
    });
  }

  @Get('tickets/:number/print')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read the printable e-ticket for one passenger' })
  @ApiOkResponse({ description: 'The e-ticket fields; a void ticket has voidMarking "VOID".' })
  @ApiNotFoundResponse({ description: 'No such ticket of yours.' })
  print(@Ctx() ctx: RequestContext, @Param('number') number: string) {
    return this.asOwner(ctx, async () => {
      const ticket = await this.views.one(number, signedIn(ctx).id);
      if (!ticket) throw notFound();
      return printableTicket(ticket);
    });
  }

  private asOwner<T>(ctx: RequestContext, read: () => Promise<T>): Promise<T> {
    return new WithRole(new Action(read), UserRole.Traveler).execute(ctx, undefined);
  }
}
