import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway/payment-gateway';
import { PaymentsRepository } from './payments.repository';
import { RefundPayments } from './refund-payments';
import { SettleCharge } from './settle-charge';

@Injectable()
export class RecoverPayments {
  private readonly logger = new Logger(RecoverPayments.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly payments: PaymentsRepository,
    private readonly settle: SettleCharge,
    private readonly refunds: RefundPayments,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'recover-payments', waitForCompletion: true })
  async run(now = new Date()): Promise<void> {
    for (const payment of await this.payments.claimRecoveries(now)) {
      try {
        const charge = await this.gateway.lookup(payment.id);
        if (charge.status === 'SUCCEEDED') await this.settle.execute(payment.id, charge);
        if (charge.status === 'DECLINED') await this.payments.fail(payment.id, charge.reason);
      } catch {
        this.logger.warn({ paymentId: payment.id }, 'Payment recovery will retry');
      }
    }
    await this.refunds.sendDue(now);
  }
}
