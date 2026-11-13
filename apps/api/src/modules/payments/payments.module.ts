import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from '../booking/index';
import { MockGatewayAdapter } from './gateway/mock-gateway.adapter';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { PayForBooking } from './pay-for-booking';
import { PaymentEntity } from './payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';

@Module({
  imports: [BookingModule, TypeOrmModule.forFeature([PaymentEntity])],
  controllers: [PaymentsController],
  providers: [
    PayForBooking,
    PaymentsRepository,
    { provide: PAYMENT_GATEWAY, useClass: MockGatewayAdapter },
  ],
})
export class PaymentsModule {}
