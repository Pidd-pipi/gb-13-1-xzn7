import { Response } from 'express';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Book } from '../entities/Book';
import { ExchangeRequest } from '../entities/ExchangeRequest';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const isDuplicateEntry = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === 'ER_DUP_ENTRY';

class ExchangeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 买家提交换书申请：
 * - 目标书必须支持换书且可购买
 * - 用于交换的书必须是本人发布且可购买
 * - 同一买家对同一目标书只能存在一条待处理申请（数据库唯一索引兜底并发）
 */
export const createExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { bookId } = req.params;
  const { offeredBookId, message } = req.body as { offeredBookId?: unknown; message?: unknown };
  const buyerId = req.userId!;

  if (typeof offeredBookId !== 'string' || !offeredBookId) {
    return res.status(400).json({ message: '请选择用于交换的书' });
  }

  const bookRepository = AppDataSource.getRepository(Book);
  const targetBook = await bookRepository.findOne({ where: { id: bookId } });

  if (!targetBook) {
    return res.status(404).json({ message: '目标书籍不存在' });
  }
  if (targetBook.tradeType !== 'exchange') {
    return res.status(400).json({ message: '该书仅出售，不支持换书' });
  }
  if (targetBook.status !== 'available') {
    return res.status(400).json({ message: '目标书籍当前不可购买' });
  }
  if (targetBook.sellerId === buyerId) {
    return res.status(400).json({ message: '不能用自己的书与自己交换' });
  }

  const offeredBook = await bookRepository.findOne({ where: { id: offeredBookId } });
  if (!offeredBook) {
    return res.status(404).json({ message: '用于交换的书籍不存在' });
  }
  if (offeredBook.sellerId !== buyerId) {
    return res.status(403).json({ message: '只能选择自己发布的书提交换书申请' });
  }
  if (offeredBook.status !== 'available') {
    return res.status(400).json({ message: '用于交换的书当前不可购买' });
  }
  if (offeredBook.id === targetBook.id) {
    return res.status(400).json({ message: '不能用同一本书发起交换' });
  }

  const exchangeRepository = AppDataSource.getRepository(ExchangeRequest);

  // 应用层预判，给出更友好的提示；并发下仍由唯一索引保证一致性
  const existing = await exchangeRepository.findOne({
    where: { targetBookId: targetBook.id, buyerId, status: 'pending' },
  });
  if (existing) {
    return res.status(409).json({ message: '你对该书已有一条待处理的换书申请' });
  }

  const exchange = exchangeRepository.create({
    targetBookId: targetBook.id,
    offeredBookId: offeredBook.id,
    buyerId,
    sellerId: targetBook.sellerId,
    status: 'pending',
    message: typeof message === 'string' && message.trim() ? message.trim().slice(0, 255) : null,
  });

  try {
    await exchangeRepository.save(exchange);
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return res.status(409).json({ message: '你对该书已有一条待处理的换书申请' });
    }
    console.error(error);
    return res.status(500).json({ message: '提交换书申请失败' });
  }

  res.status(201).json({ message: '换书申请已提交', exchange });
};

/**
 * 在一个事务内锁定相关行后完成接受：
 * - 只有目标书卖家可操作，申请必须仍为待处理
 * - 两本书都必须仍可购买，随后同时变为已预约
 * - 任一步失败则整个事务回滚，不留任何中间状态（可抵御并发接受、并发占用、下架）
 */
export const acceptExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const result = await AppDataSource.transaction(
      'SERIALIZABLE',
      async (manager: EntityManager) => {
        const exchange = await manager.findOne(ExchangeRequest, { where: { id } });
        if (!exchange) {
          throw new ExchangeError(404, '换书申请不存在');
        }
        if (exchange.sellerId !== userId) {
          throw new ExchangeError(403, '只有卖家可以接受换书申请');
        }
        if (exchange.status !== 'pending') {
          throw new ExchangeError(400, `申请已${exchange.status === 'accepted' ? '被接受' : '结束'}，无法接受`);
        }

        // 按固定顺序锁定两本书，避免并发事务交叉加锁导致死锁
        const bookIds = [exchange.targetBookId, exchange.offeredBookId].sort();
        const lockedBooks = await manager
          .getRepository(Book)
          .createQueryBuilder('book')
          .where('book.id IN (:...bookIds)', { bookIds })
          .setLock('pessimistic_write')
          .getMany();

        const targetBook = lockedBooks.find((b) => b.id === exchange.targetBookId);
        const offeredBook = lockedBooks.find((b) => b.id === exchange.offeredBookId);

        if (!targetBook || !offeredBook) {
          throw new ExchangeError(400, '相关书籍已下架，无法接受换书申请');
        }
        if (targetBook.sellerId !== exchange.sellerId) {
          throw new ExchangeError(400, '目标书籍归属发生变化，无法接受换书申请');
        }
        if (offeredBook.sellerId !== exchange.buyerId) {
          throw new ExchangeError(400, '对方用于交换的书籍归属发生变化，无法接受换书申请');
        }
        if (targetBook.status !== 'available' || offeredBook.status !== 'available') {
          throw new ExchangeError(409, '相关书籍已被占用或下架，接受失败');
        }

        const updateResult = await manager
          .createQueryBuilder()
          .update(Book)
          .set({ status: 'reserved' })
          .where('id IN (:...bookIds) AND status = :available', {
            bookIds,
            available: 'available',
          })
          .execute();

        if (!updateResult.affected || updateResult.affected !== 2) {
          throw new ExchangeError(409, '相关书籍已被占用或下架，接受失败');
        }

        exchange.status = 'accepted';
        await manager.save(exchange);

        return manager.findOne(ExchangeRequest, {
          where: { id: exchange.id },
          relations: ['targetBook', 'offeredBook', 'buyer', 'seller'],
        });
      },
    );

    res.json({ message: '已接受换书申请，两本书均已预约', exchange: result });
  } catch (error) {
    if (error instanceof ExchangeError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: '接受换书申请失败' });
  }
};

/**
 * 卖家拒绝申请；若申请此前已接受，则同时释放两本书的预约。
 */
export const rejectExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const exchange = await finishExchangeRequest(id, userId, 'rejected', 'seller');
    res.json({ message: '已拒绝换书申请', exchange });
  } catch (error) {
    respondWithExchangeError(res, error, '拒绝换书申请失败');
  }
};

/**
 * 买家取消申请；若申请此前已被接受，则同时释放两本书的预约。
 */
export const cancelExchangeRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const exchange = await finishExchangeRequest(id, userId, 'cancelled', 'buyer');
    res.json({ message: '已取消换书申请', exchange });
  } catch (error) {
    respondWithExchangeError(res, error, '取消换书申请失败');
  }
};

const finishExchangeRequest = async (
  id: string,
  userId: string,
  nextStatus: 'rejected' | 'cancelled',
  actor: 'seller' | 'buyer',
) => {
  // 同一事务内终结申请并释放预约，避免并发终结时出现状态不一致
  return AppDataSource.transaction(async (manager: EntityManager) => {
    const exchange = await manager.findOne(ExchangeRequest, { where: { id } });

    if (!exchange) {
      throw new ExchangeError(404, '换书申请不存在');
    }
    if (actor === 'seller' && exchange.sellerId !== userId) {
      throw new ExchangeError(403, '只有卖家可以拒绝该申请');
    }
    if (actor === 'buyer' && exchange.buyerId !== userId) {
      throw new ExchangeError(403, '只有申请人可以取消该申请');
    }
    if (exchange.status === 'rejected' || exchange.status === 'cancelled') {
      throw new ExchangeError(400, '该申请已结束');
    }

    const wasAccepted = exchange.status === 'accepted';

    // 条件更新：只有仍处于可终结状态的申请才会被更新，保证并发下只有一次终结生效
    const updateResult = await manager
      .createQueryBuilder()
      .update(ExchangeRequest)
      .set({ status: nextStatus })
      .where('id = :id AND status IN (:...statuses)', {
        id,
        statuses: ['pending', 'accepted'],
      })
      .execute();

    if (updateResult.affected !== 1) {
      throw new ExchangeError(400, '该申请已结束');
    }

    exchange.status = nextStatus;

    // 已接受的申请被拒绝/取消时释放预约：仅当书仍处于预约状态时恢复为可购买
    if (wasAccepted) {
      await manager
        .createQueryBuilder()
        .update(Book)
        .set({ status: 'available' })
        .where('id IN (:...bookIds) AND status = :reserved', {
          bookIds: [exchange.targetBookId, exchange.offeredBookId],
          reserved: 'reserved',
        })
        .execute();
    }

    return exchange;
  });
};

const respondWithExchangeError = (res: Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ExchangeError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ message: fallbackMessage });
};

/**
 * 查询某本书相关的换书申请：
 * - 卖家视角：收到的全部申请
 * - 买家视角：自己发出的申请
 * 其他人不返回任何数据
 */
export const getBookExchangeRequests = async (req: AuthenticatedRequest, res: Response) => {
  const { bookId } = req.params;
  const userId = req.userId!;

  const bookRepository = AppDataSource.getRepository(Book);
  const book = await bookRepository.findOne({ where: { id: bookId } });
  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  const exchangeRepository = AppDataSource.getRepository(ExchangeRequest);
  const where =
    book.sellerId === userId
      ? { targetBookId: bookId }
      : { targetBookId: bookId, buyerId: userId };

  const exchanges = await exchangeRepository.find({
    where,
    relations: ['targetBook', 'offeredBook', 'buyer', 'seller'],
    order: { createdAt: 'DESC' },
    select: {
      targetBook: { id: true, title: true, price: true, images: true, status: true, wantedBook: true },
      offeredBook: { id: true, title: true, price: true, images: true, status: true },
      buyer: { id: true, name: true, avatarUrl: true, department: true },
      seller: { id: true, name: true, avatarUrl: true, department: true },
    },
  });

  res.json({
    incoming: book.sellerId === userId ? exchanges : [],
    outgoing: book.sellerId === userId ? [] : exchanges,
  });
};
