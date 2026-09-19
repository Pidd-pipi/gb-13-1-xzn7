export interface User {
  id: string;
  email: string;
  studentId: string;
  name?: string;
  department?: string;
  contactInfo?: string;
  avatarUrl?: string;
  positiveRatingRate: number;
  totalReviews: number;
  createdAt: string;
}

export type BookCondition = 'new' | 'like_new' | 'good' | 'fair';
export type BookStatus = 'available' | 'reserved' | 'sold';
export type TradeMethod = 'meetup' | 'shipping';
export type SubjectCategory = 'science' | 'humanities' | 'business' | 'arts' | 'other';

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  originalPrice: number;
  price: number;
  condition: BookCondition;
  images: string[];
  tradeMethod: TradeMethod;
  campus: string;
  category: SubjectCategory;
  description?: string;
  status: BookStatus;
  saleOnly?: boolean;
  wantedBookTitle?: string | null;
  sellerId: string;
  seller?: User;
  createdAt: string;
  updatedAt: string;
}

export type ExchangeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface ExchangeRequest {
  id: string;
  targetBookId: string;
  offeredBookId: string;
  sellerId: string;
  buyerId: string;
  status: ExchangeStatus;
  buyer?: Pick<User, 'id' | 'name' | 'avatarUrl' | 'department' | 'contactInfo' | 'positiveRatingRate' | 'totalReviews'> | null;
  offeredBook?: Book | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookExchangeInfo {
  role: 'seller' | 'buyer';
  requests: ExchangeRequest[];
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  bookId?: string;
  content: string;
  imageUrls?: string[];
  isRead: boolean;
  createdAt: string;
}

export interface PurchaseRequest {
  id: string;
  bookTitle: string;
  author?: string;
  isbn?: string;
  expectedPrice?: number;
  conditions?: string[];
  description?: string;
  category: SubjectCategory;
  campus: string;
  status: 'active' | 'closed';
  requesterId: string;
  requester?: User;
  createdAt: string;
}

export type ReviewType = 'positive' | 'neutral' | 'negative';

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  bookId?: string;
  type: ReviewType;
  content?: string;
  reviewer?: User;
  createdAt: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export const conditionMap: Record<BookCondition, string> = {
  new: '全新',
  like_new: '九成新',
  good: '七成新',
  fair: '五成新',
};

export const statusMap: Record<BookStatus, string> = {
  available: '可购买',
  reserved: '已预约',
  sold: '已售出',
};

export const tradeMethodMap: Record<TradeMethod, string> = {
  meetup: '面交',
  shipping: '邮寄',
};

export const categoryMap: Record<SubjectCategory, string> = {
  science: '理工',
  humanities: '文史',
  business: '经管',
  arts: '艺术',
  other: '其他',
};

export const exchangeStatusMap: Record<ExchangeStatus, string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  cancelled: '已取消',
};
