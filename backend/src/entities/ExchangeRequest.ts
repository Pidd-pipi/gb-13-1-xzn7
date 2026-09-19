import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './User';
import { Book } from './Book';

export type ExchangeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

@Entity('exchange_requests')
@Index('idx_ex_pending_unique', ['buyerId', 'pendingTargetBookId'], { unique: true })
@Index('idx_exchange_target_book', ['targetBookId'])
@Index('idx_exchange_offered_book', ['offeredBookId'])
@Index('idx_exchange_buyer', ['buyerId'])
@Index('idx_exchange_seller', ['sellerId'])
export class ExchangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  targetBookId: string;

  @Column()
  offeredBookId: string;

  @Column()
  buyerId: string;

  @Column()
  sellerId: string;

  @Column({ type: 'enum', enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' })
  status: ExchangeStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  message: string | null;

  /**
   * 生成列：仅当申请处于待处理状态时等于目标书 ID，否则为 NULL。
   * 配合唯一索引，保证同一买家对同一目标书至多有一条待处理申请（并发安全）。
   */
  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    generatedType: 'VIRTUAL',
    asExpression: 'CASE WHEN status = "pending" THEN targetBookId ELSE NULL END',
  })
  pendingTargetBookId: string | null;

  @ManyToOne(() => Book)
  @JoinColumn({ name: 'targetBookId' })
  targetBook: Book;

  @ManyToOne(() => Book)
  @JoinColumn({ name: 'offeredBookId' })
  offeredBook: Book;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
