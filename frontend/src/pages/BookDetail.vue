<template>
  <div class="detail-page">
    <van-nav-bar title="书籍详情" left-arrow @click-left="router.back" />

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="book" class="detail-content">
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
          <van-tag :type="book.tradeType === 'exchange' ? 'primary' : 'default'">
            {{ tradeTypeMap[book.tradeType] }}
          </van-tag>
        </div>

        <div class="detail-meta">
          <span class="detail-meta-item">作者：{{ book.author }}</span>
          <span class="detail-meta-item">新旧：{{ conditionMap[book.condition] }}</span>
          <span class="detail-meta-item">分类：{{ categoryMap[book.category] }}</span>
          <span class="detail-meta-item">交易：{{ tradeMethodMap[book.tradeMethod] }}</span>
          <span class="detail-meta-item">校区：{{ book.campus }}</span>
          <span v-if="book.isbn" class="detail-meta-item">ISBN：{{ book.isbn }}</span>
        </div>

        <div class="wanted-book" v-if="book.tradeType === 'exchange'">
          <van-icon name="exchange" />
          <span>卖家想换：{{ book.wantedBook }}</span>
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

      <!-- 卖家视角：收到的换书申请 -->
      <div class="exchange-section" v-if="isOwner">
        <h3 class="section-title">收到的换书申请（{{ incomingRequests.length }}）</h3>
        <van-empty v-if="incomingRequests.length === 0" description="暂无换书申请" image-size="80" />
        <div v-for="exchange in incomingRequests" :key="exchange.id" class="exchange-card">
          <div class="exchange-card-head">
            <van-image
              round
              width="32"
              height="32"
              :src="exchange.buyer?.avatarUrl || 'https://img.yzcdn.cn/vant/user-inactive.png'"
            />
            <span class="exchange-user">{{ exchange.buyer?.name || '匿名用户' }}</span>
            <van-tag :type="exchangeStatusTagType[exchange.status]">
              {{ exchangeStatusMap[exchange.status] }}
            </van-tag>
          </div>
          <div class="exchange-offered">
            <van-image
              :src="exchange.offeredBook?.images?.[0]"
              width="56"
              height="56"
              fit="cover"
              radius="6"
            />
            <div class="exchange-offered-info">
              <div class="exchange-offered-title">
                想用《{{ exchange.offeredBook?.title || '已下架的书' }}》交换本书
              </div>
              <div class="exchange-offered-meta">
                <span>{{ exchange.offeredBook ? '¥' + exchange.offeredBook.price : '' }}</span>
                <span v-if="exchange.offeredBook">
                  {{ exchange.offeredBook.status === 'available' ? '对方书籍可购买' : '对方书籍' + statusMap[exchange.offeredBook.status] }}
                </span>
              </div>
            </div>
          </div>
          <div class="exchange-message" v-if="exchange.message">留言：{{ exchange.message }}</div>
          <div class="exchange-time">{{ formatTime(exchange.createdAt) }}</div>
          <div class="exchange-actions" v-if="exchange.status === 'pending'">
            <van-button size="small" round plain type="danger" @click="onReject(exchange)">拒绝</van-button>
            <van-button size="small" round type="primary" @click="onAccept(exchange)">接受</van-button>
          </div>
        </div>
      </div>

      <!-- 买家视角：我的换书申请 -->
      <div class="exchange-section" v-else-if="authStore.isAuthenticated && book.tradeType === 'exchange'">
        <h3 class="section-title">我的换书申请</h3>
        <van-empty v-if="outgoingRequests.length === 0" description="还没有提交换书申请" image-size="80" />
        <div v-for="exchange in outgoingRequests" :key="exchange.id" class="exchange-card">
          <div class="exchange-card-head">
            <van-image
              round
              width="32"
              height="32"
              :src="exchange.seller?.avatarUrl || 'https://img.yzcdn.cn/vant/user-inactive.png'"
            />
            <span class="exchange-user">换给 {{ exchange.seller?.name || '匿名用户' }}</span>
            <van-tag :type="exchangeStatusTagType[exchange.status]">
              {{ exchangeStatusMap[exchange.status] }}
            </van-tag>
          </div>
          <div class="exchange-offered">
            <van-image
              :src="exchange.offeredBook?.images?.[0]"
              width="56"
              height="56"
              fit="cover"
              radius="6"
            />
            <div class="exchange-offered-info">
              <div class="exchange-offered-title">用《{{ exchange.offeredBook?.title || '未知' }}》交换</div>
              <div class="exchange-offered-meta">
                <span v-if="exchange.status === 'accepted'" class="accepted-tip">双方书籍均已预约</span>
              </div>
            </div>
          </div>
          <div class="exchange-message" v-if="exchange.message">留言：{{ exchange.message }}</div>
          <div class="exchange-time">{{ formatTime(exchange.createdAt) }}</div>
          <div class="exchange-actions" v-if="exchange.status === 'pending' || exchange.status === 'accepted'">
            <van-button size="small" round plain type="danger" @click="onCancel(exchange)">
              {{ exchange.status === 'accepted' ? '取消交换并释放预约' : '取消申请' }}
            </van-button>
          </div>
        </div>
      </div>
    </div>

    <van-empty v-else description="书籍不存在" />

    <!-- 提交换书申请弹层 -->
    <van-popup v-model:show="showExchangePopup" position="bottom" round>
      <div class="exchange-popup">
        <h3 class="popup-title">提交换书申请</h3>
        <p class="popup-subtitle" v-if="book">卖家想换：{{ book.wantedBook }}</p>
        <p class="popup-label">选择一本你发布的、可购买的书：</p>
        <van-radio-group v-model="selectedOfferedBookId">
          <div
            v-for="item in myAvailableBooks"
            :key="item.id"
            class="offered-option"
          >
            <van-radio :name="item.id">
              <div class="offered-option-body">
                <van-image :src="item.images[0]" width="48" height="48" fit="cover" radius="4" />
                <div class="offered-option-info">
                  <div class="offered-option-title">{{ item.title }}</div>
                  <div class="offered-option-meta">¥{{ item.price }} · {{ statusMap[item.status] }}</div>
                </div>
              </div>
            </van-radio>
          </div>
        </van-radio-group>
        <van-empty
          v-if="myAvailableBooks.length === 0"
          description="你没有可用于交换的书，先去发布一本吧"
          image-size="72"
        >
          <van-button size="small" type="primary" @click="goPublish">去发布</van-button>
        </van-empty>
        <van-field
          v-model="exchangeMessage"
          label="留言"
          type="textarea"
          placeholder="选填，给卖家捎句话"
          maxlength="255"
          rows="2"
        />
        <div class="popup-actions">
          <van-button block round @click="showExchangePopup = false">取消</van-button>
          <van-button
            block
            round
            type="primary"
            :loading="submitting"
            :disabled="!selectedOfferedBookId"
            @click="submitExchange"
          >
            提交申请
          </van-button>
        </div>
      </div>
    </van-popup>

    <div class="bottom-actions" v-if="book">
      <van-button icon="star-o" :type="isFavorite ? 'warning' : 'default'" @click="toggleFavorite">
        {{ isFavorite ? '已收藏' : '收藏' }}
      </van-button>
      <van-button
        v-if="!isOwner && book.tradeType === 'exchange'"
        type="warning"
        @click="openExchangePopup"
      >
        申请换书
      </van-button>
      <van-button
        type="primary"
        block
        :disabled="book.status !== 'available' || isOwner"
        @click="contactSeller"
      >
        {{ isOwner ? '这是我发布的' : '联系卖家' }}
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showDialog, showConfirmDialog } from 'vant';
import { getBookById, toggleFavorite as apiToggleFavorite, getMyBooks } from '@/api/book';
import {
  getBookExchangeRequests,
  createExchangeRequest,
  acceptExchangeRequest,
  rejectExchangeRequest,
  cancelExchangeRequest,
} from '@/api/exchange';
import { useAuthStore } from '@/store/auth';
import type { Book, ExchangeRequest, ExchangeStatus } from '@/types';
import {
  conditionMap,
  categoryMap,
  tradeMethodMap,
  tradeTypeMap,
  exchangeStatusMap,
  statusMap,
} from '@/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const book = ref<Book | null>(null);
const isFavorite = ref(false);

const incomingRequests = ref<ExchangeRequest[]>([]);
const outgoingRequests = ref<ExchangeRequest[]>([]);

const showExchangePopup = ref(false);
const myAvailableBooks = ref<Book[]>([]);
const selectedOfferedBookId = ref('');
const exchangeMessage = ref('');
const submitting = ref(false);

const exchangeStatusTagType: Record<ExchangeStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'default',
};

const isOwner = computed(() => {
  return book.value?.sellerId === authStore.user?.id;
});

const formatTime = (time: string) => {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { hour12: false });
};

const fetchBook = async () => {
  loading.value = true;
  try {
    book.value = await getBookById(route.params.id as string);
    if (authStore.isAuthenticated) {
      await fetchExchangeRequests();
    }
  } finally {
    loading.value = false;
  }
};

const fetchExchangeRequests = async () => {
  if (!book.value) return;
  try {
    const result = await getBookExchangeRequests(book.value.id);
    incomingRequests.value = result.incoming;
    outgoingRequests.value = result.outgoing;
  } catch {
    // 未登录或网络异常时静默，书籍详情仍可浏览
  }
};

const refreshAll = async () => {
  const [bookResult] = await Promise.all([
    getBookById(route.params.id as string),
    authStore.isAuthenticated ? fetchExchangeRequests() : Promise.resolve(),
  ]);
  book.value = bookResult;
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

const viewReviews = () => {
  if (!book.value?.seller) return;
  showDialog({
    title: '卖家评价',
    message: '请在个人中心查看更多评价功能',
  });
};

const goPublish = () => {
  router.push('/publish');
};

const openExchangePopup = async () => {
  if (!authStore.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  if (!book.value) return;
  if (book.value.status !== 'available') {
    showToast('该书当前不可购买');
    return;
  }
  if (outgoingRequests.value.some((item) => item.status === 'pending')) {
    showToast('你对该书已有一条待处理的换书申请');
    return;
  }

  try {
    const myBooks = await getMyBooks();
    myAvailableBooks.value = myBooks.filter(
      (item) => item.status === 'available' && item.id !== book.value!.id,
    );
    selectedOfferedBookId.value = '';
    exchangeMessage.value = '';
    showExchangePopup.value = true;
  } catch {}
};

const submitExchange = async () => {
  if (!book.value || !selectedOfferedBookId.value) return;
  submitting.value = true;
  try {
    await createExchangeRequest(book.value.id, {
      offeredBookId: selectedOfferedBookId.value,
      message: exchangeMessage.value.trim() || undefined,
    });
    showToast('换书申请已提交');
    showExchangePopup.value = false;
    await refreshAll();
  } catch {
    // 错误提示由请求拦截器统一处理
  } finally {
    submitting.value = false;
  }
};

const onAccept = async (exchange: ExchangeRequest) => {
  try {
    await showConfirmDialog({
      title: '接受换书申请',
      message: '接受后两本书将同时变为“已预约”，确定接受吗？',
    });
  } catch {
    return;
  }
  try {
    await acceptExchangeRequest(exchange.id);
    showToast('已接受，双方书籍已预约');
    await refreshAll();
  } catch {}
};

const onReject = async (exchange: ExchangeRequest) => {
  try {
    await showConfirmDialog({
      title: '拒绝换书申请',
      message: '确定拒绝该换书申请吗？',
    });
  } catch {
    return;
  }
  try {
    await rejectExchangeRequest(exchange.id);
    showToast('已拒绝');
    await refreshAll();
  } catch {}
};

const onCancel = async (exchange: ExchangeRequest) => {
  const accepted = exchange.status === 'accepted';
  try {
    await showConfirmDialog({
      title: accepted ? '取消交换' : '取消换书申请',
      message: accepted
        ? '取消后双方书籍将恢复为可购买，确定吗？'
        : '确定取消该换书申请吗？',
    });
  } catch {
    return;
  }
  try {
    await cancelExchangeRequest(exchange.id);
    showToast('已取消');
    await refreshAll();
  } catch {}
};

onMounted(fetchBook);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.detail-content {
  padding-bottom: 80px;
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
.wanted-book {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fff7e6;
  border-radius: 6px;
  font-size: 13px;
  color: #d46b08;
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
  padding: 16px;
  border-top: 8px solid #f7f8fa;
}
.section-title {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
  margin-bottom: 12px;
}
.exchange-card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.exchange-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.exchange-user {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}
.exchange-offered {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.exchange-offered-info {
  flex: 1;
}
.exchange-offered-title {
  font-size: 14px;
  color: #1a1a1a;
}
.exchange-offered-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #999;
  display: flex;
  gap: 8px;
}
.accepted-tip {
  color: #52c41a;
}
.exchange-message {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}
.exchange-time {
  margin-top: 8px;
  font-size: 12px;
  color: #bbb;
}
.exchange-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.exchange-popup {
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  max-height: 75vh;
  overflow-y: auto;
}
.popup-title {
  font-size: 16px;
  font-weight: 500;
  text-align: center;
}
.popup-subtitle {
  margin-top: 8px;
  font-size: 13px;
  color: #d46b08;
  background: #fff7e6;
  padding: 6px 10px;
  border-radius: 6px;
}
.popup-label {
  margin: 12px 0 8px;
  font-size: 13px;
  color: #666;
}
.offered-option {
  padding: 10px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  margin-bottom: 8px;
}
.offered-option-body {
  display: flex;
  gap: 10px;
  align-items: center;
}
.offered-option-info {
  flex: 1;
}
.offered-option-title {
  font-size: 14px;
  color: #1a1a1a;
}
.offered-option-meta {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.popup-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: white;
  display: flex;
  gap: 12px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}
</style>
