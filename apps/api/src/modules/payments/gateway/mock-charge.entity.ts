import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('mock_gateway_charges')
export class MockChargeEntity {
  @PrimaryColumn('uuid') paymentId!: string;
  @Column({ type: 'varchar', length: 12 })
  outcome!: 'SUCCEEDED' | 'DECLINED' | 'UNKNOWN' | 'NOT_CHARGED';
}
