import { Response } from 'express';
import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Book } from '../entities/Book';
import { ExchangeRequest } from '../entities/ExchangeRequest';
import { User } from '../entities/User';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

// 业务校验失败（可向用户展示具体原因）
class ExchangeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isLockError = (error: any) => error?.errno === 1213 || error?.code === 'ER_LOCK_DEADLOCK';

// 按主键顺序加行锁，避免多事务交叉加锁导致死锁
const lockBooks = async (manager: EntityManager, ids: string[]): Promise<Book[]> => {
  const ordered = [...new Set(ids)].sort();
  return manager.getRepository(Book)
    .createQueryBuilder('book')
    .where('book.id IN (:...ids)', { ids: ordered })
    .orderBy('book.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
};

const lockExchange = async (manager: EntityManager, id: string): Promise<ExchangeRequest | null> => {
  return manager.getRepository(ExchangeRequest)
    .createQueryBuilder('exchange')
    .where('exchange.id = :id', { id })
    .setLock('pessimistic_write')
    .getOne();
};

// 买家提交换书申请
export const createExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const buyerId = req.userId!;
  const targetBookId = req.params.id;
  const { offeredBookId } = req.body;

  if (!offeredBookId || typeof offeredBookId !== 'string') {
    return res.status(400).json({ message: '请选择一本用来换的书' });
  }

  try {
    const result = await AppDataSource.transaction(async (manager) => {
      // 两本书一起按主键顺序加锁：
      // 1) 同一目标书的申请创建在此串行化，保证同买家待处理申请唯一；
      // 2) 与接受接口使用相同的加锁顺序，杜绝交叉等待死锁。
      const books = await lockBooks(manager, [targetBookId, offeredBookId]);
      const target = books.find((b) => b.id === targetBookId);
      const offered = books.find((b) => b.id === offeredBookId);

      if (!target) {
        throw new ExchangeError(404, '目标书籍不存在');
      }
      if (!offered || offered.id === target.id) {
        throw new ExchangeError(400, '请选择一本你发布的、与目标书不同的书');
      }
      if (target.sellerId === buyerId) {
        throw new ExchangeError(400, '不能对自己发布的书提交换书申请');
      }
      if (target.saleOnly) {
        throw new ExchangeError(400, '该书仅出售，不支持换书');
      }
      if (target.status !== 'available') {
        throw new ExchangeError(409, '该书已被预约或已售出，暂不可换');
      }
      if (offered.sellerId !== buyerId) {
        throw new ExchangeError(403, '只能使用自己发布的书换书');
      }
      if (offered.status !== 'available') {
        throw new ExchangeError(409, '所选的书当前不是可购买状态');
      }

      const existing = await manager.getRepository(ExchangeRequest).findOne({
        where: { targetBookId: target.id, buyerId, status: 'pending' },
      });
      if (existing) {
        throw new ExchangeError(409, '你对该书已有一条待处理的换书申请');
      }

      const exchange = manager.getRepository(ExchangeRequest).create({
        targetBookId: target.id,
        offeredBookId: offered.id,
        sellerId: target.sellerId,
        buyerId,
        status: 'pending',
      });
      await manager.getRepository(ExchangeRequest).save(exchange);
      return exchange;
    });

    res.status(201).json({ message: '换书申请已提交', exchange: result });
  } catch (error: any) {
    if (error instanceof ExchangeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (isLockError(error)) {
      return res.status(409).json({ message: '操作过于频繁，请稍后重试' });
    }
    console.error('createExchangeRequest error:', error);
    res.status(500).json({ message: '换书申请提交失败' });
  }
};

// 卖家接受换书申请：两本书必须仍可购买，并同时变为已预约，整步原子完成
export const acceptExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const exchange = await lockExchange(manager, id);
      if (!exchange) {
        throw new ExchangeError(404, '换书申请不存在');
      }
      if (exchange.sellerId !== userId) {
        throw new ExchangeError(403, '只有卖家可以接受换书申请');
      }
      if (exchange.status !== 'pending') {
        throw new ExchangeError(409, '该申请已被处理');
      }

      // 按主键顺序锁定两本书，防止并发接受/其他交易占用
      const books = await lockBooks(manager, [exchange.targetBookId, exchange.offeredBookId]);
      const target = books.find((b) => b.id === exchange.targetBookId);
      const offered = books.find((b) => b.id === exchange.offeredBookId);
      if (!target || !offered) {
        throw new ExchangeError(404, '关联的书籍不存在');
      }
      if (target.status !== 'available') {
        throw new ExchangeError(409, '你的书已被占用或下架，无法接受换书');
      }
      if (offered.status !== 'available') {
        throw new ExchangeError(409, '买家用来换的书已被占用或下架，无法接受换书');
      }

      target.status = 'reserved';
      offered.status = 'reserved';
      exchange.status = 'accepted';
      await manager.getRepository(Book).save([target, offered]);
      await manager.getRepository(ExchangeRequest).save(exchange);
      return exchange;
    });

    res.json({ message: '已接受换书申请，两本书均已预约', exchange: result });
  } catch (error: any) {
    if (error instanceof ExchangeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (isLockError(error)) {
      return res.status(409).json({ message: '操作冲突，请刷新后重试' });
    }
    console.error('acceptExchangeRequest error:', error);
    res.status(500).json({ message: '接受换书申请失败' });
  }
};

// 卖家拒绝换书申请（仅待处理状态可拒绝，不涉及预约释放）
export const rejectExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const exchange = await lockExchange(manager, id);
      if (!exchange) {
        throw new ExchangeError(404, '换书申请不存在');
      }
      if (exchange.sellerId !== userId) {
        throw new ExchangeError(403, '只有卖家可以拒绝换书申请');
      }
      if (exchange.status !== 'pending') {
        throw new ExchangeError(409, '该申请已被处理');
      }
      exchange.status = 'rejected';
      await manager.getRepository(ExchangeRequest).save(exchange);
      return exchange;
    });

    res.json({ message: '已拒绝换书申请', exchange: result });
  } catch (error: any) {
    if (error instanceof ExchangeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (isLockError(error)) {
      return res.status(409).json({ message: '操作冲突，请刷新后重试' });
    }
    console.error('rejectExchangeRequest error:', error);
    res.status(500).json({ message: '拒绝换书申请失败' });
  }
};

// 买家取消换书申请；已接受的申请取消时释放两本书的预约
export const cancelExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const exchange = await lockExchange(manager, id);
      if (!exchange) {
        throw new ExchangeError(404, '换书申请不存在');
      }
      if (exchange.buyerId !== userId) {
        throw new ExchangeError(403, '只有申请人可以取消换书申请');
      }
      if (exchange.status === 'cancelled' || exchange.status === 'rejected') {
        throw new ExchangeError(409, '该申请已结束，无需取消');
      }

      if (exchange.status === 'accepted') {
        const books = await lockBooks(manager, [exchange.targetBookId, exchange.offeredBookId]);
        for (const book of books) {
          if (book.status === 'reserved') {
            book.status = 'available';
          }
        }
        await manager.getRepository(Book).save(books);
      }

      exchange.status = 'cancelled';
      await manager.getRepository(ExchangeRequest).save(exchange);
      return exchange;
    });

    res.json({ message: '已取消换书申请', exchange: result });
  } catch (error: any) {
    if (error instanceof ExchangeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (isLockError(error)) {
      return res.status(409).json({ message: '操作冲突，请刷新后重试' });
    }
    console.error('cancelExchangeRequest error:', error);
    res.status(500).json({ message: '取消换书申请失败' });
  }
};

// 详情页换书信息：
// - 卖家：收到的针对该书的待处理申请（含买家及其出价书）
// - 买家：自己针对该书的全部申请（含出价书）
export const getBookExchangeInfo = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  const bookRepository = AppDataSource.getRepository(Book);
  const book = await bookRepository.findOne({ where: { id } });
  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  const exchangeRepository = AppDataSource.getRepository(ExchangeRequest);

  if (book.sellerId === userId) {
    const requests = await exchangeRepository.find({
      where: { targetBookId: id, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    const buyerIds = [...new Set(requests.map((r) => r.buyerId))];
    const offeredIds = [...new Set(requests.map((r) => r.offeredBookId))];
    const [buyers, offeredBooks] = await Promise.all([
      buyerIds.length
        ? AppDataSource.getRepository(User).findBy({ id: In(buyerIds) })
        : Promise.resolve([]),
      offeredIds.length
        ? bookRepository.findBy({ id: In(offeredIds) })
        : Promise.resolve([]),
    ]);

    const buyerMap = new Map(buyers.map((u) => [u.id, u]));
    const offeredMap = new Map(offeredBooks.map((b) => [b.id, b]));

    return res.json({
      role: 'seller',
      requests: requests.map((r) => ({
        ...r,
        buyer: pickUser(buyerMap.get(r.buyerId)),
        offeredBook: offeredMap.get(r.offeredBookId) || null,
      })),
    });
  }

  const myRequests = await exchangeRepository.find({
    where: { targetBookId: id, buyerId: userId },
    order: { createdAt: 'DESC' },
  });
  const offeredIds = [...new Set(myRequests.map((r) => r.offeredBookId))];
  const offeredBooks = offeredIds.length ? await bookRepository.findBy({ id: In(offeredIds) }) : [];
  const offeredMap = new Map(offeredBooks.map((b) => [b.id, b]));

  res.json({
    role: 'buyer',
    requests: myRequests.map((r) => ({
      ...r,
      offeredBook: offeredMap.get(r.offeredBookId) || null,
    })),
  });
};

const pickUser = (user?: User) => {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    department: user.department,
    contactInfo: user.contactInfo,
    positiveRatingRate: user.positiveRatingRate,
    totalReviews: user.totalReviews,
  };
};
