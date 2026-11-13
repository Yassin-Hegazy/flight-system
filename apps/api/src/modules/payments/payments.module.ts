import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from '../booking/index';
import { MockChargeEntity } from './gateway/mock-charge.entity';
import { MockRefundEntity } from './gateway/mock-refund.entity';
import { RefundEntity } from './refund.entity';
import { RefundPayments } from './refund-payments';
import { SettleCharge } from './settle-charge';
import { RecoverPayments } from './recover-payments';
import { MockGatewayAdapter } from './gateway/mock-gateway.adapter';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { PayForBooking } from './pay-for-booking';
import { PaymentEntity } from './payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';

@Module({
  imports: [
    BookingModule,
    TypeOrmModule.forFeature([PaymentEntity, RefundEntity, MockChargeEntity, MockRefundEntity]),
  ],
  controllers: [PaymentsController],
  providers: [
    PayForBooking,
    RefundPayments,
    SettleCharge,
    RecoverPayments,
    PaymentsRepository,
    { provide: PAYMENT_GATEWAY, useClass: MockGatewayAdapter },
  ],
})
export class PaymentsModule {}
