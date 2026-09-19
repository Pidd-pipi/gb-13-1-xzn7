import request from './request';
import type { BookExchangeRequests, ExchangeRequest } from '@/types';

export const getBookExchangeRequests = (bookId: string) => {
  return request.get<BookExchangeRequests>(`/books/${bookId}/exchange-requests`);
};

export const createExchangeRequest = (
  bookId: string,
  data: { offeredBookId: string; message?: string },
) => {
  return request.post<{ exchange: ExchangeRequest }>(`/books/${bookId}/exchange-requests`, data);
};

export const acceptExchangeRequest = (id: string) => {
  return request.post<{ exchange: ExchangeRequest }>(`/exchange-requests/${id}/accept`);
};

export const rejectExchangeRequest = (id: string) => {
  return request.post<{ exchange: ExchangeRequest }>(`/exchange-requests/${id}/reject`);
};

export const cancelExchangeRequest = (id: string) => {
  return request.post<{ exchange: ExchangeRequest }>(`/exchange-requests/${id}/cancel`);
};
