import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './User';
import { Book } from './Book';

// pending = 待处理；accepted = 卖家已接受（两本书已预约）；rejected = 卖家已拒绝；cancelled = 买家已取消
export type ExchangeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

@Entity('exchange_requests')
@Index('idx_exchange_target_buyer_status', ['targetBookId', 'buyerId', 'status'])
export class ExchangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 买家想要的、卖家发布的书
  @ManyToOne(() => Book)
  targetBook: Book;

  @Column()
  @Index('idx_exchange_target')
  targetBookId: string;

  // 买家用来换的、自己发布的书
  @ManyToOne(() => Book)
  offeredBook: Book;

  @Column()
  offeredBookId: string;

  @ManyToOne(() => User)
  seller: User;

  @Column()
  sellerId: string;

  @ManyToOne(() => User)
  buyer: User;

  @Column()
  @Index('idx_exchange_buyer')
  buyerId: string;

  @Column({ type: 'enum', enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' })
  @Index('idx_exchange_status')
  status: ExchangeStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
