<template>
  <div class="detail-page">
    <van-nav-bar title="书籍详情" left-arrow @click-left="router.back" />

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="book">
      <van-swipe class="detail-images" :autoplay="3000" indicator-color="white">
        <van-swipe-item v-for="(image, index) in book.images" :key="index">
          <van-image :src="image" fit="cover" width="100%" height="300px" />
        </van-swipe-item>
      </van-swipe>

      <div class="detail-header">
        <div class="detail-title">{{ book.title }}</div>
        <div class="detail-price-section">
          <span class="detail-price">¥{{ book.price }}</span>
          <span class="detail-original-price">¥{{ book.originalPrice }}</span>
          <van-tag :class="`status-${book.status}`" type="success" v-if="book.status === 'available'">可购买</van-tag>
          <van-tag v-else-if="book.status === 'reserved'" type="warning">已预约</van-tag>
          <van-tag v-else type="default">已售出</van-tag>
          <van-tag v-if="book.saleOnly === false" plain type="primary">支持换书</van-tag>
        </div>

        <div class="detail-meta">
          <span class="detail-meta-item">作者：{{ book.author }}</span>
          <span class="detail-meta-item">新旧：{{ conditionMap[book.condition] }}</span>
          <span class="detail-meta-item">分类：{{ categoryMap[book.category] }}</span>
          <span class="detail-meta-item">交易：{{ tradeMethodMap[book.tradeMethod] }}</span>
          <span class="detail-meta-item">校区：{{ book.campus }}</span>
          <span v-if="book.isbn" class="detail-meta-item">ISBN：{{ book.isbn }}</span>
        </div>

        <div v-if="book.saleOnly === false" class="exchange-wanted">
          <van-icon name="exchange" />
          <span>卖家想换：{{ book.wantedBookTitle }}</span>
        </div>

        <div class="detail-desc" v-if="book.description">
          <h4>描述</h4>
          <p>{{ book.description }}</p>
        </div>
      </div>

      <div class="detail-seller" v-if="book.seller">
        <van-image
          round
          width="48"
          height="48"
          :src="book.seller.avatarUrl || 'https://img.yzcdn.cn/vant/user-inactive.png'"
        />
        <div class="seller-detail">
          <div class="seller-name">
            {{ book.seller.name || '匿名用户' }}
            <span v-if="book.seller.positiveRatingRate < 60" class="risk-badge">风险提示</span>
          </div>
          <div class="seller-department">
            {{ book.seller.department || '未填写院系' }}
            <span class="rating-badge" v-if="book.seller.totalReviews > 0">
              好评率 {{ book.seller.positiveRatingRate }}%
            </span>
          </div>
        </div>
        <van-button type="primary" size="small" round @click="viewReviews">评价({{ book.seller.totalReviews }})</van-button>
      </div>

      <!-- 卖家：收到的待处理换书申请 -->
      <div class="exchange-section" v-if="isOwner && exchangeInfo?.requests.length">
        <div class="exchange-section-title">
          <van-icon name="exchange" />
          <span>收到的换书申请（{{ exchangeInfo.requests.length }}）</span>
        </div>
        <van-card
          v-for="req in exchangeInfo.requests"
          :key="req.id"
          :title="req.offeredBook?.title || '已下架的书'"
          :desc="`用《${req.offeredBook?.title || '未知'}》换本书 · ¥${req.offeredBook?.price ?? '-'}`"
          :thumb="req.offeredBook?.images?.[0]"
          origin-price=""
          price=""
        >
          <template #footer>
            <div class="exchange-card-footer">
              <span class="exchange-buyer">
                {{ req.buyer?.name || req.buyer?.department || '匿名买家' }}
              </span>
              <van-button
                size="mini"
                type="danger"
                plain
                round
                :loading="actingId === req.id"
                @click="onReject(req)"
              >
                拒绝
              </van-button>
              <van-button
                size="mini"
                type="primary"
                round
                :loading="actingId === req.id"
                @click="onAccept(req)"
              >
                接受
              </van-button>
            </div>
          </template>
        </van-card>
      </div>

      <!-- 买家：我的换书申请 -->
      <div class="exchange-section" v-if="!isOwner && myExchange">
        <van-notice-bar
          wrapable
          :left-icon="myExchange.status === 'accepted' ? 'passed' : 'info-o'"
          :text="myExchangeStatusText"
        />
        <div class="my-exchange-book" v-if="myExchange.offeredBook">
          <van-image width="48" height="48" fit="cover" :src="myExchange.offeredBook.images?.[0]" />
          <div class="my-exchange-info">
            <div>我用来换：{{ myExchange.offeredBook.title }}</div>
            <van-tag
              :type="exchangeTagType(myExchange.status)"
              size="medium"
            >{{ exchangeStatusMap[myExchange.status] }}</van-tag>
          </div>
          <van-button
            v-if="myExchange.status === 'pending' || myExchange.status === 'accepted'"
            size="small"
            plain
            type="danger"
            round
            :loading="actingId === myExchange.id"
            @click="onCancel(myExchange)"
          >
            取消申请
          </van-button>
        </div>
        <div v-if="myExchange.status === 'accepted' && book.seller?.contactInfo" class="contact-line">
          卖家联系方式：{{ book.seller.contactInfo }}
        </div>
      </div>

      <div class="bottom-actions">
        <van-button icon="star-o" :type="isFavorite ? 'warning' : 'default'" @click="toggleFavorite">
          {{ isFavorite ? '已收藏' : '收藏' }}
        </van-button>
        <van-button
          type="primary"
          block
          :disabled="book.status !== 'available' || isOwner"
          @click="contactSeller"
        >
          {{ isOwner ? '这是我发布的' : '联系卖家' }}
        </van-button>
        <van-button
          v-if="!isOwner"
          type="success"
          block
          :disabled="!canSubmitExchange"
          :loading="submitting"
          @click="openExchangePicker"
        >
          {{ exchangeButtonText }}
        </van-button>
      </div>
    </div>

    <van-empty v-else description="书籍不存在" />

    <!-- 选择自己可购买的书发起换书 -->
    <van-action-sheet
      v-model:show="showPicker"
      title="选择一本你的书来换"
      closeable
    >
      <div class="picker-body">
        <van-loading v-if="myBooksLoading" class="loading-center" />
        <template v-else>
          <van-cell
            v-for="item in myAvailableBooks"
            :key="item.id"
            :title="item.title"
            :label="`¥${item.price} · ${conditionMap[item.condition]} · ${item.campus}`"
            is-link
            @click="onPickBook(item.id)"
          >
            <template #icon>
              <van-image width="40" height="40" fit="cover" radius="4" :src="item.images?.[0]" style="margin-right: 10px" />
            </template>
          </van-cell>
          <van-empty
            v-if="myAvailableBooks.length === 0"
            image-size="80"
            description="你还没有可用于换书的书，先去发布一本吧"
          />
        </template>
      </div>
    </van-action-sheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { getBookById, toggleFavorite as apiToggleFavorite, getMyBooks } from '@/api/book';
import {
  getBookExchangeInfo,
  createExchangeRequest,
  acceptExchangeRequest,
  rejectExchangeRequest,
  cancelExchangeRequest,
} from '@/api/exchange';
import { useAuthStore } from '@/store/auth';
import type { Book, ExchangeRequest, ExchangeStatus, BookExchangeInfo } from '@/types';
import { conditionMap, categoryMap, tradeMethodMap, exchangeStatusMap } from '@/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const book = ref<Book | null>(null);
const isFavorite = ref(false);
const exchangeInfo = ref<BookExchangeInfo | null>(null);

const showPicker = ref(false);
const myBooksLoading = ref(false);
const myAvailableBooks = ref<Book[]>([]);

const submitting = ref(false);
const actingId = ref<string | null>(null);

const isOwner = computed(() => book.value?.sellerId === authStore.user?.id);

// 买家在该目标书上的最新一条申请（后端已按时间倒序返回）
const myExchange = computed<ExchangeRequest | null>(() => {
  if (isOwner.value || !exchangeInfo.value) return null;
  return exchangeInfo.value.requests[0] || null;
});

const canSubmitExchange = computed(() => {
  if (!book.value || isOwner.value) return false;
  if (book.value.saleOnly !== false) return false;
  if (book.value.status !== 'available') return false;
  // 已有待处理申请时不能重复提交
  if (myExchange.value?.status === 'pending') return false;
  return true;
});

const exchangeButtonText = computed(() => {
  if (book.value?.saleOnly !== false) return '该书仅出售';
  if (book.value?.status !== 'available') return '该书已不可换';
  if (myExchange.value?.status === 'pending') return '换书申请待处理';
  if (myExchange.value?.status === 'accepted') return '换书已达成';
  if (myExchange.value?.status === 'rejected') return '申请被拒绝，重新申请';
  if (myExchange.value?.status === 'cancelled') return '重新申请换书';
  return '我要换书';
});

const myExchangeStatusText = computed(() => {
  const req = myExchange.value;
  if (!req) return '';
  switch (req.status) {
    case 'pending':
      return '换书申请已提交，等待卖家处理';
    case 'accepted':
      return '卖家已接受换书，两本书均已预约，请与卖家联系完成交换';
    case 'rejected':
      return '卖家拒绝了本次换书申请，你可以换一本书重新申请';
    case 'cancelled':
      return '你已取消本次换书申请';
    default:
      return '';
  }
});

const exchangeTagType = (status: ExchangeStatus): 'primary' | 'success' | 'danger' | 'default' => {
  switch (status) {
    case 'pending': return 'primary';
    case 'accepted': return 'success';
    case 'rejected': return 'danger';
    default: return 'default';
  }
};

const fetchAll = async () => {
  loading.value = true;
  try {
    const id = route.params.id as string;
    book.value = await getBookById(id);
    if (authStore.isAuthenticated) {
      try {
        exchangeInfo.value = await getBookExchangeInfo(id);
      } catch {
        exchangeInfo.value = null;
      }
    }
  } finally {
    loading.value = false;
  }
};

const refreshExchange = async () => {
  try {
    exchangeInfo.value = await getBookExchangeInfo(route.params.id as string);
  } catch {}
  // 接受/取消会改变书的状态，重新拉取详情，保证刷新后一致
  book.value = await getBookById(route.params.id as string);
};

const toggleFavorite = async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  try {
    const result = await apiToggleFavorite(book.value!.id);
    isFavorite.value = result.isFavorite;
    showToast(result.isFavorite ? '收藏成功' : '已取消收藏');
  } catch {}
};

const contactSeller = () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  if (!book.value?.seller) return;
  router.push(`/chat/${book.value.seller.id}?bookId=${book.value.id}`);
};

const openExchangePicker = async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  showPicker.value = true;
  if (myAvailableBooks.value.length === 0) {
    myBooksLoading.value = true;
    try {
      const all = await getMyBooks();
      myAvailableBooks.value = all.filter((b) => b.status === 'available' && b.id !== book.value?.id);
    } catch {
      myAvailableBooks.value = [];
    } finally {
      myBooksLoading.value = false;
    }
  }
};

const onPickBook = async (offeredBookId: string) => {
  showPicker.value = false;
  submitting.value = true;
  try {
    await createExchangeRequest(book.value!.id, offeredBookId);
    showToast('换书申请已提交');
    await refreshExchange();
  } catch {
    // 错误提示已由请求拦截器统一弹出
  } finally {
    submitting.value = false;
  }
};

const onAccept = async (req: ExchangeRequest) => {
  try {
    await showConfirmDialog({
      title: '接受换书',
      message: `接受后两本书将同时变为「已预约」，确定接受用《${req.offeredBook?.title || '该书'}》交换吗？`,
    });
  } catch {
    return;
  }
  actingId.value = req.id;
  try {
    await acceptExchangeRequest(req.id);
    showToast('已接受，两本书已预约');
    await refreshExchange();
  } catch {
    // 并发占用/下架等失败原因由后端返回并提示，状态保持不变
    await refreshExchange();
  } finally {
    actingId.value = null;
  }
};

const onReject = async (req: ExchangeRequest) => {
  try {
    await showConfirmDialog({ title: '拒绝换书', message: '确定拒绝该换书申请吗？' });
  } catch {
    return;
  }
  actingId.value = req.id;
  try {
    await rejectExchangeRequest(req.id);
    showToast('已拒绝');
    await refreshExchange();
  } catch {
    await refreshExchange();
  } finally {
    actingId.value = null;
  }
};

const onCancel = async (req: ExchangeRequest) => {
  try {
    await showConfirmDialog({
      title: '取消换书',
      message: req.status === 'accepted'
        ? '取消后两本书的预约将被释放，确定取消吗？'
        : '确定取消该换书申请吗？',
    });
  } catch {
    return;
  }
  actingId.value = req.id;
  try {
    await cancelExchangeRequest(req.id);
    showToast('已取消');
    await refreshExchange();
  } catch {
    await refreshExchange();
  } finally {
    actingId.value = null;
  }
};

const viewReviews = () => {
  if (!book.value?.seller) return;
  showToast('请在个人中心查看卖家评价');
};

onMounted(fetchAll);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.detail-images {
  width: 100%;
  height: 300px;
}
.detail-header {
  padding: 16px;
}
.detail-title {
  font-size: 18px;
  font-weight: 500;
  color: #1a1a1a;
}
.detail-price-section {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-price {
  font-size: 24px;
  font-weight: bold;
  color: #ff4d4f;
}
.detail-original-price {
  font-size: 14px;
  color: #999;
  text-decoration: line-through;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.detail-meta-item {
  font-size: 13px;
  color: #666;
  background: #f7f8fa;
  padding: 4px 8px;
  border-radius: 4px;
}
.exchange-wanted {
  margin-top: 12px;
  padding: 8px 12px;
  background: #ecf9ff;
  color: #1989fa;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.detail-desc {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.detail-desc h4 {
  font-size: 14px;
  color: #1a1a1a;
  margin-bottom: 8px;
}
.detail-desc p {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
.detail-seller {
  display: flex;
  align-items: center;
  padding: 16px;
  border-top: 8px solid #f7f8fa;
}
.seller-detail {
  flex: 1;
  margin-left: 12px;
}
.seller-name {
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}
.risk-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: #fff1f0;
  color: #f5222d;
  border-radius: 4px;
}
.seller-department {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rating-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: #fff7e6;
  color: #fa8c16;
}
.status-available {
  background: #52c41a !important;
}
.status-reserved {
  background: #faad14 !important;
}
.status-sold {
  background: #d9d9d9 !important;
}
.exchange-section {
  border-top: 8px solid #f7f8fa;
  padding-bottom: 8px;
}
.exchange-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px 4px;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}
.exchange-card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  justify-content: flex-end;
}
.exchange-buyer {
  margin-right: auto;
  font-size: 12px;
  color: #666;
}
.my-exchange-book {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.my-exchange-info {
  flex: 1;
  font-size: 13px;
  color: #333;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.contact-line {
  padding: 0 16px 12px;
  font-size: 13px;
  color: #1989fa;
}
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: white;
  display: flex;
  gap: 8px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}
.bottom-actions .van-button[type='primary'],
.bottom-actions .van-button[type='success'] {
  flex: 1;
}
.picker-body {
  max-height: 50vh;
  overflow-y: auto;
  padding-bottom: 16px;
}
</style>
