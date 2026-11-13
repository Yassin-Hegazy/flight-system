import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity('mock_gateway_refunds')
@Unique('mock_gateway_refunds_charge_unique', ['chargeRef'])
export class MockRefundEntity {
  @PrimaryColumn('uuid') refundId!: string;
  @Column({ type: 'varchar', length: 100 }) chargeRef!: string;
}
