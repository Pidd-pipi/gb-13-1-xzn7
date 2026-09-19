import request from './request';
import type { BookExchangeInfo } from '@/types';

// 买家针对某本书提交换书申请（offeredBookId 必须是自己可购买的书）
export const createExchangeRequest = (bookId: string, offeredBookId: string) => {
  return request.post<{ exchange: unknown }>(`/books/${bookId}/exchanges`, { offeredBookId });
};

// 详情页换书信息（卖家看待处理申请 / 买家看自己的申请）
export const getBookExchangeInfo = (bookId: string) => {
  return request.get<BookExchangeInfo>(`/books/${bookId}/exchanges`);
};

export const acceptExchangeRequest = (id: string) => {
  return request.put(`/exchanges/${id}/accept`);
};

export const rejectExchangeRequest = (id: string) => {
  return request.put(`/exchanges/${id}/reject`);
};

export const cancelExchangeRequest = (id: string) => {
  return request.put(`/exchanges/${id}/cancel`);
};
