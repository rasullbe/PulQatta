'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Calendar,
  RotateCcw,
  RefreshCw,
  Wallet,
  PieChart,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

const USD_RATE = 12800;
const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pulqatta-api.onrender.com';

const BACKEND_CATEGORY_MAP: Record<number, string> = {
  0: 'Food',
  1: 'Transport',
  2: 'Utilities',
  3: 'Health',
  4: 'Subscriptions',
  5: 'Games',
  6: 'Clothes',
  7: 'Electronics',
  8: 'Food', // Cafe
  9: 'Credit',
  10: 'Investment',
  11: 'Other',
};

const CATEGORIES = [
  { key: 'Food', label: 'Еда', icon: '🍔', color: '#f59e0b' },
  { key: 'Transport', label: 'Транспорт', icon: '🚕', color: '#3b82f6' },
  { key: 'Credit', label: 'Кредит', icon: '💳', color: '#1c1917' },
  { key: 'Investment', label: 'Инвестиции', icon: '📈', color: '#10b981' },
  { key: 'Utilities', label: 'Коммуналка', icon: '💡', color: '#8b5cf6' },
  { key: 'Clothes', label: 'Одежда', icon: '👕', color: '#ec4899' },
  { key: 'Electronics', label: 'Техника', icon: '💻', color: '#06b6d4' },
  { key: 'Health', label: 'Здоровье', icon: '💊', color: '#ef4444' },
  { key: 'Games', label: 'Игры', icon: '🎮', color: '#84cc16' },
  { key: 'Subscriptions', label: 'Подписки', icon: '🔄', color: '#6366f1' },
  { key: 'Other', label: 'Прочее', icon: '📦', color: '#a8a29e' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

type Expense = {
  id: number;
  amount: number;
  category?: string | number;
  note?: string | null;
  createdAt?: string;
};

type CategorySummary = {
  category: string | number;
  totalAmount: number;
};

function formatMoney(amount: number): string {
  return Math.round(amount)
    .toLocaleString('ru-RU')
    .replace(/\u00a0/g, '.');
}

function parseMoney(val: string): number {
  return parseInt(val.replace(/[.\s,]/g, ''), 10) || 0;
}

function getCategoryKey(raw?: string | number): string {
  if (raw === undefined || raw === null) return 'Other';
  if (typeof raw === 'number' || (!Number.isNaN(Number(raw)) && /^\d+$/.test(String(raw).trim()))) {
    const idx = Number(raw);
    return BACKEND_CATEGORY_MAP[idx] || 'Other';
  }
  const str = String(raw).trim().toLowerCase();
  if (str === 'cafe' || str === 'кафе') return 'Food';
  const found = CATEGORIES.find(
    (c) =>
      c.key.toLowerCase() === str ||
      c.label.toLowerCase() === str
  );
  return found ? found.key : 'Other';
}

function getCategoryObj(raw?: string | number) {
  const key = getCategoryKey(raw);
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function getCategoryLabel(raw?: string | number): string {
  return getCategoryObj(raw).label;
}

function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr: string, todayStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayName = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
  const formatted = `${d.getDate()} ${months[d.getMonth()]}, ${dayName}`;

  if (todayStr && dateStr === todayStr) return `Сегодня (${formatted})`;
  return formatted;
}

function resolveTelegramIdentity(): { initData: string; userId: string; username: string } {
  if (typeof window === 'undefined') {
    return { initData: '', userId: '111111111', username: 'Тест' };
  }

  // @ts-ignore
  const tg = window.Telegram?.WebApp;
  let initData: string = tg?.initData || '';
  let userId: string = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '';
  let username: string = tg?.initDataUnsafe?.user?.first_name || tg?.initDataUnsafe?.user?.username || '';

  if (!initData) {
    if (window.location.hash.includes('tgWebAppData=')) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      initData = hashParams.get('tgWebAppData') || '';
    } else if (window.location.search.includes('tgWebAppData=')) {
      const searchParams = new URLSearchParams(window.location.search);
      initData = searchParams.get('tgWebAppData') || '';
    }
  }

  if (!userId && initData) {
    try {
      let raw = initData;
      if (raw.includes('%')) {
        try { raw = decodeURIComponent(raw); } catch {}
      }
      const params = new URLSearchParams(raw);
      let userJson = params.get('user');
      if (userJson) {
        if (userJson.includes('%')) {
          try { userJson = decodeURIComponent(userJson); } catch {}
        }
        const parsed = JSON.parse(userJson);
        if (parsed?.id) userId = String(parsed.id);
        if (parsed?.first_name) username = parsed.first_name;
      }
    } catch {
      // ignore
    }
  }

  if (!userId) {
    try {
      const search = new URLSearchParams(window.location.search);
      const qId = search.get('userId') || search.get('user_id');
      if (qId) userId = qId;
    } catch {}
  }

  // Persist real Telegram ID so reloads and subsequent visits keep the exact same account
  if (userId) {
    try {
      localStorage.setItem('pulqatta_telegram_uid', userId);
      if (username) localStorage.setItem('pulqatta_telegram_uname', username);
    } catch {}
  } else {
    try {
      const cachedUid = localStorage.getItem('pulqatta_telegram_uid');
      if (cachedUid) {
        userId = cachedUid;
        username = localStorage.getItem('pulqatta_telegram_uname') || 'Пользователь';
      }
    } catch {}
  }

  if (!userId) {
    let storedUid = localStorage.getItem('pulqatta_uid_v2');
    if (!storedUid) {
      storedUid = String(Math.floor(100000000 + Math.random() * 899999999));
      localStorage.setItem('pulqatta_uid_v2', storedUid);
    }
    userId = storedUid;
    username = 'Гость';
  }

  return { initData, userId, username };
}

function getLocalExpenses(userId: string): Expense[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`pulqatta_expenses_v2_${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalExpenses(userId: string, list: Expense[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`pulqatta_expenses_v2_${userId}`, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function triggerHaptic(
  type: 'impact' | 'selection' | 'notification' = 'selection',
  style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'error' | 'success' | 'warning' = 'light'
) {
  if (typeof window === 'undefined') return;
  try {
    const haptic = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: {
      selectionChanged?: () => void;
      impactOccurred?: (style: string) => void;
      notificationOccurred?: (type: string) => void;
    } } } }).Telegram?.WebApp?.HapticFeedback;
    if (!haptic) return;
    if (type === 'selection') haptic.selectionChanged?.();
    else if (type === 'impact') haptic.impactOccurred?.(style);
    else if (type === 'notification') haptic.notificationOccurred?.(style);
  } catch {
    // ignore
  }
}

// Swipeable transaction row with hardware-accelerated gesture
function SwipeableExpenseRow({
  expense,
  isBeingEdited,
  onEdit,
  onDelete,
  showDate,
}: {
  expense: Expense;
  isBeingEdited: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  showDate?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHorizontalSwipeRef = useRef(false);
  const [activeMode, setActiveMode] = useState<'none' | 'edit' | 'delete'>('none');

  const catObj = getCategoryObj(expense.category);
  const hasNote = Boolean(expense.note && expense.note.trim());
  const dateFormatted = showDate && expense.createdAt ? formatDateDisplay(expense.createdAt.slice(0, 10)) : '';
  const subText = [hasNote ? catObj.label : null, dateFormatted].filter(Boolean).join(' • ');

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    currentXRef.current = 0;
    isDraggingRef.current = true;
    isHorizontalSwipeRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || startXRef.current === null || startYRef.current === null || !rowRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    if (!isHorizontalSwipeRef.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 6) {
        isDraggingRef.current = false;
        startXRef.current = null;
        startYRef.current = null;
        return;
      }
      if (Math.abs(deltaX) > 8) {
        isHorizontalSwipeRef.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        if (rowRef.current) {
          rowRef.current.style.transition = 'none';
        }
      } else {
        return;
      }
    }

    let clamped = deltaX;
    if (clamped > 80) clamped = 80 + (clamped - 80) * 0.2;
    if (clamped < -80) clamped = -80 + (clamped + 80) * 0.2;

    currentXRef.current = clamped;
    rowRef.current.style.transform = `translate3d(${clamped}px, 0, 0)`;

    if (clamped <= -50) {
      if (activeMode !== 'delete') {
        setActiveMode('delete');
        triggerHaptic('impact', 'light');
      }
    } else if (clamped >= 50) {
      if (activeMode !== 'edit') {
        setActiveMode('edit');
        triggerHaptic('impact', 'light');
      }
    } else if (activeMode !== 'none') {
      setActiveMode('none');
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current || !rowRef.current) return;
    isDraggingRef.current = false;
    startXRef.current = null;
    startYRef.current = null;
    const finalX = currentXRef.current;

    rowRef.current.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
    rowRef.current.style.transform = 'translate3d(0, 0, 0)';
    setActiveMode('none');

    if (finalX <= -65) {
      triggerHaptic('notification', 'warning');
      onDelete(expense);
    } else if (finalX >= 65) {
      triggerHaptic('selection');
      onEdit(expense);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, scale: 0.95, transition: { duration: 0.16 } }}
      className={`swipe-item-wrap ${activeMode === 'delete' ? 'mode-delete' : activeMode === 'edit' ? 'mode-edit' : ''}`}
    >
      <div className="swipe-actions-bg">
        <div className={`swipe-action-indicator edit ${activeMode === 'edit' ? 'active' : ''}`}>
          <Pencil size={15} strokeWidth={2.4} />
          <span>Изменить</span>
        </div>
        <div className={`swipe-action-indicator delete ${activeMode === 'delete' ? 'active' : ''}`}>
          <span>Удалить</span>
          <Trash2 size={15} strokeWidth={2.4} />
        </div>
      </div>

      <div
        ref={rowRef}
        className={`history-item ${isBeingEdited ? 'editing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="history-main">
          <span className="history-badge" style={{ backgroundColor: `${catObj.color}22`, color: catObj.color }}>
            {catObj.icon}
          </span>
          <div className="history-text">
            <span className="history-name">{hasNote ? expense.note : catObj.label}</span>
            {subText ? <span className="history-sub">{subText}</span> : null}
          </div>
        </div>
        <div className="history-right">
          <div className="history-amount-pill">
            <span className="history-amount numbers">{formatMoney(expense.amount)}</span>
            <span className="history-currency">UZS</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Interactive SVG Donut Chart with center percent and category info
function DonutChart({
  items,
  selectedKey,
  onSelectKey,
}: {
  items: {
    key: string;
    label: string;
    icon: string;
    color: string;
    amount: number;
    pct: number;
  }[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}) {
  const total = items.reduce((acc, it) => acc + it.amount, 0);
  const size = 190;
  const strokeWidth = 24;
  const radius = 68;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const activeItem =
    items.find((it) => it.key === selectedKey) ||
    items[0] || {
      key: 'Food',
      label: 'Еда',
      icon: '🍔',
      color: '#f59e0b',
      amount: 0,
      pct: 0,
    };

  let accumulatedLength = 0;

  return (
    <div className="donut-chart-box">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="donut-svg"
        shapeRendering="geometricPrecision"
      >
        <g transform={`rotate(-90 ${center} ${center})`}>
          {total === 0 ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="rgba(24, 24, 27, 0.08)"
              strokeWidth={strokeWidth}
            />
          ) : (
            items.map((item) => {
              const fraction = item.amount / total;
              const sliceLength = fraction * circumference;
              const gap = items.length > 1 ? 3 : 0;
              const dash = Math.max(1, sliceLength - gap);
              const dashArray = `${dash} ${circumference - dash}`;
              const dashOffset = -accumulatedLength;
              accumulatedLength += sliceLength;

              const isSelected = selectedKey === item.key;

              return (
                <circle
                  key={item.key}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  className={`donut-slice ${isSelected ? 'active' : ''}`}
                  style={{
                    opacity: selectedKey && !isSelected ? 0.45 : 1,
                  }}
                  onClick={() => onSelectKey(item.key)}
                />
              );
            })
          )}
        </g>
      </svg>

      {/* Center hole overlay displaying percentage and category */}
      <div className="donut-center-info">
        <div className="donut-center-content">
          <span className="donut-center-pct numbers" style={{ color: activeItem.color }}>
            {activeItem.pct}%
          </span>
          <span className="donut-center-label">
            {activeItem.label}
          </span>
          {activeItem.amount > 0 && (
            <span className="donut-center-sub numbers">
              {formatMoney(activeItem.amount)} UZS
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [activePage, setActivePage] = useState<'home' | 'stats'>('home');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [todayDate, setTodayDate] = useState<string>('');
  const [dayTotal, setDayTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthSummary, setMonthSummary] = useState<CategorySummary[]>([]);
  const [, setAllMonthExpenses] = useState<Expense[]>([]);

  // Statistics active category filter
  const [selectedStatKey, setSelectedStatKey] = useState<string | null>(null);

  // Draft inputs
  const [draft, setDraft] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Food');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter by minAmount (user-entered minimum threshold)
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [showMinFilter, setShowMinFilter] = useState(false);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [isLoadingFiltered, setIsLoadingFiltered] = useState(false);

  // API state
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_URL);

  // Undo deletion notification
  const [undoItem, setUndoItem] = useState<Expense | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const identityRef = useRef<{ initData: string; userId: string; username: string }>(
    typeof window !== 'undefined'
      ? resolveTelegramIdentity()
      : { initData: '', userId: '111111111', username: 'Тест' }
  );

  const stripRef = useRef<HTMLDivElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // Initial load
  useEffect(() => {
    // @ts-ignore
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    if (tg) {
      tg.ready?.();
      tg.expand?.();
    }
    identityRef.current = resolveTelegramIdentity();

    const today = getLocalDateString(new Date());
    setTodayDate(today);
    setSelectedDate(today);

    const savedApi = localStorage.getItem('pulqatta_custom_api');
    if (savedApi && savedApi.trim().startsWith('http')) {
      setApiUrl(savedApi.trim());
    } else {
      setApiUrl(DEFAULT_API_URL);
    }
  }, []);

  const getHeaders = useCallback(() => {
    const { initData, userId } = identityRef.current;
    let safeInitData = 'mini_app_active';
    if (initData) {
      try {
        safeInitData = encodeURIComponent(initData);
      } catch {
        safeInitData = 'mini_app_active';
      }
    }
    return {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': safeInitData,
      'X-Telegram-User-Id': userId,
    };
  }, []);

  // Compute local metrics for offline fallback
  const applyLocalData = useCallback(
    (targetDate: string) => {
      const { userId } = identityRef.current;
      const all = getLocalExpenses(userId);

      const dayItems = all.filter((e) => {
        const itemDate = e.createdAt ? e.createdAt.slice(0, 10) : '';
        return itemDate === targetDate;
      });

      const targetMonthPrefix = targetDate ? targetDate.slice(0, 7) : '';
      const monthItems = all.filter((e) => {
        const itemDate = e.createdAt ? e.createdAt.slice(0, 10) : '';
        return itemDate.startsWith(targetMonthPrefix);
      });

      const sum = dayItems.reduce((acc, it) => acc + Number(it.amount || 0), 0);
      setDayTotal(sum);
      setExpenses(dayItems);
      setAllMonthExpenses(monthItems);

      const grouped = new Map<string, number>();
      for (const item of monthItems) {
        const key = getCategoryKey(item.category);
        grouped.set(key, (grouped.get(key) || 0) + Number(item.amount || 0));
      }
      const summary: CategorySummary[] = Array.from(grouped.entries())
        .map(([category, totalAmount]) => ({ category, totalAmount }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      setMonthSummary(summary);
    },
    []
  );

  // Load data from backend or fallback to local
  const loadData = useCallback(
    async (targetDate: string = selectedDate) => {
      if (!targetDate) return;
      setIsRefreshing(true);
      const headers = getHeaders();
      const { userId } = identityRef.current;

      try {
        const [dayRes, monthRes] = await Promise.all([
          fetch(`${apiUrl}/api/expenses/by-date?date=${targetDate}`, { headers }),
          fetch(`${apiUrl}/api/expenses/month`, { headers }),
        ]);

        let daySuccess = false;
        if (dayRes.ok) {
          const dayData = await dayRes.json();
          setDayTotal(dayData.total || 0);
          setExpenses(dayData.expenses || []);
          daySuccess = true;

          const currentLocal = getLocalExpenses(userId);
          const otherExpenses = currentLocal.filter((e) => {
            const itemDate = e.createdAt ? e.createdAt.slice(0, 10) : '';
            return itemDate !== targetDate;
          });
          const merged = [...(dayData.expenses || []), ...otherExpenses];
          saveLocalExpenses(userId, merged);
        }

        if (monthRes.ok) {
          const monthData = await monthRes.json();
          setMonthSummary(Array.isArray(monthData) ? monthData : []);
        }

        if (daySuccess) {
          setIsRefreshing(false);
          return;
        }
      } catch (err) {
        console.warn('Backend sync failed, falling back to local cache:', err);
      }

      applyLocalData(targetDate);
      setIsRefreshing(false);
    },
    [apiUrl, getHeaders, applyLocalData, selectedDate]
  );

  useEffect(() => {
    if (selectedDate) {
      loadData(selectedDate);
    }
  }, [loadData, selectedDate]);

  // Date navigation handlers
  const handleShiftDay = (direction: 'prev' | 'next') => {
    const parts = selectedDate.split('-');
    if (parts.length !== 3) return;
    const cur = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    cur.setDate(cur.getDate() + (direction === 'prev' ? -1 : 1));
    const nextDate = getLocalDateString(cur);
    setSelectedDate(nextDate);
  };

  const handleJumpToday = () => {
    setSelectedDate(todayDate || getLocalDateString(new Date()));
  };

  const handleStartEdit = (item: Expense) => {
    setEditingId(item.id);
    setDraft(formatMoney(item.amount));
    setSelectedCategory(getCategoryKey(item.category));
    setNote(item.note || '');
    amountInputRef.current?.focus({ preventScroll: true });

    // @ts-ignore
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDraft('');
    setNote('');
  };

  const handleQuickAdd = async () => {
    const amount = parseMoney(draft);
    if (!amount || isSubmitting) return;

    setIsSubmitting(true);
    const { userId } = identityRef.current;
    const isEditing = editingId !== null;
    const trimmedNote = note.trim() || null;

    const isToday = todayDate ? selectedDate === todayDate : false;
    const createdTimestamp = isToday
      ? new Date().toISOString()
      : `${selectedDate}T12:00:00.000Z`;

    try {
      const url = isEditing ? `${apiUrl}/api/expenses/${editingId}` : `${apiUrl}/api/expenses`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({
          amount,
          category: selectedCategory,
          note: trimmedNote,
          createdAt: isEditing ? undefined : createdTimestamp,
        }),
      });

      if (res.ok) {
        setDraft('');
        setNote('');
        setEditingId(null);
        await loadData(selectedDate);
        setIsSubmitting(false);
        triggerHaptic('notification', 'success');
        return;
      }
    } catch {
      // offline fallback
    }

    // Local state fallback
    const currentList = getLocalExpenses(userId);
    let updatedList: Expense[];
    if (isEditing && editingId !== null) {
      updatedList = currentList.map((item) =>
        item.id === editingId
          ? { ...item, amount, category: selectedCategory, note: trimmedNote }
          : item
      );
    } else {
      const newExpense: Expense = {
        id: Date.now(),
        amount,
        category: selectedCategory,
        note: trimmedNote,
        createdAt: createdTimestamp,
      };
      updatedList = [newExpense, ...currentList];
    }
    saveLocalExpenses(userId, updatedList);
    setDraft('');
    setNote('');
    setEditingId(null);
    setIsSubmitting(false);
    applyLocalData(selectedDate);
    // @ts-ignore
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
  };

  const handleDeleteExpense = (target: Expense) => {
    if (editingId === target.id) {
      handleCancelEdit();
    }
    const { userId } = identityRef.current;

    // Immediately remove from UI
    setExpenses((prev) => prev.filter((item) => item.id !== target.id));
    if (isFilterActive) {
      setFilteredExpenses((prev) => prev.filter((item) => item.id !== target.id));
    }
    setDayTotal((prev) => Math.max(0, prev - target.amount));

    // Save to local backup
    const updatedLocal = getLocalExpenses(userId).filter((item) => item.id !== target.id);
    saveLocalExpenses(userId, updatedLocal);

    // Show undo notification
    setUndoItem(target);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoItem(null);
      fetch(`${apiUrl}/api/expenses/${target.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      }).catch(() => {});
    }, 4500);

    triggerHaptic('notification', 'warning');
  };

  const handleRestoreUndo = () => {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    const item = undoItem;
    setUndoItem(null);

    setExpenses((prev) => [item, ...prev]);
    if (isFilterActive && item.amount >= parseMoney(minAmountFilter)) {
      setFilteredExpenses((prev) => [item, ...prev]);
    }
    setDayTotal((prev) => prev + item.amount);

    const { userId } = identityRef.current;
    const current = getLocalExpenses(userId);
    saveLocalExpenses(userId, [item, ...current]);

    triggerHaptic('notification', 'success');
  };

  const handleSearchMore = async () => {
    const amount = parseMoney(minAmountFilter);
    if (!amount) return;
    setIsLoadingFiltered(true);
    setIsFilterActive(true);
    triggerHaptic('impact', 'light');

    try {
      const res = await fetch(`${apiUrl}/api/expenses/more?minAmount=${amount}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFilteredExpenses(Array.isArray(data) ? data : []);
        setIsLoadingFiltered(false);
        return;
      }
    } catch (e) {
      console.warn('Failed to fetch filtered expenses, using local fallback:', e);
    }

    // Local fallback
    const { userId } = identityRef.current;
    const all = getLocalExpenses(userId);
    const matched = all
      .filter((item) => Number(item.amount || 0) >= amount)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    setFilteredExpenses(matched);
    setIsLoadingFiltered(false);
  };

  const handleClearFilter = () => {
    setIsFilterActive(false);
    setMinAmountFilter('');
    setFilteredExpenses([]);
    triggerHaptic('selection');
  };

  // Month Statistics Calculations
  const monthTotal = monthSummary.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const monthUsd = (monthTotal / USD_RATE).toFixed(2);

  // Group summary by unified categories (Cafe -> Food, etc.)
  const formattedStatItems = (() => {
    const map = new Map<string, number>();
    for (const item of monthSummary) {
      const key = getCategoryKey(item.category);
      map.set(key, (map.get(key) || 0) + Number(item.totalAmount || 0));
    }
    return Array.from(map.entries())
      .map(([key, amount]) => {
        const cat = getCategoryObj(key);
        const pct = monthTotal > 0 ? Math.round((amount / monthTotal) * 100) : 0;
        return {
          key,
          label: cat.label,
          icon: cat.icon,
          color: cat.color,
          amount,
          pct,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  })();

  const dayUsd = (dayTotal / USD_RATE).toFixed(2);
  const isToday = !selectedDate || selectedDate === todayDate;

  return (
    <div className="miniapp-root">
      <div className="miniapp-shell">
        <main className="app-screen">
          {/* Top Header */}
          <header className="miniapp-header">
            <div className="brand-wrap">
              <img src="/logo.png?v=3" alt="PulQatta" className="brand-logo" />
            </div>

            <div className="header-actions">
              <button
                type="button"
                className={`refresh-btn ${isRefreshing ? 'rotating' : ''}`}
                onClick={() => loadData(selectedDate)}
                aria-label="Обновить данные"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </header>

          {/* TAB VIEWS CONTAINER (Preserves DOM & scroll position, zero mobile stutter) */}
          <div className="tab-views-container">
            <div className={`page-tab-content ${activePage === 'home' ? 'active-tab' : 'hidden-tab'}`}>
                {/* Day Summary Balance Card */}
                <section className="summary-card">
                  <div className="summary-top">
                    <div className="summary-label">
                      {isToday
                        ? 'Итого за сегодня'
                        : `Итого за ${formatDateDisplay(selectedDate, todayDate)}`}
                    </div>
                    <div className="summary-usd numbers">≈ ${dayUsd}</div>
                  </div>
                  <div className="summary-row">
                    <span className="total-number numbers">{formatMoney(dayTotal || 0)}</span>
                    <span className="currency">UZS</span>
                  </div>
                </section>

                {/* Day Navigation Bar */}
                <div className="day-picker-bar">
                  <button
                    type="button"
                    className="day-arrow-btn"
                    onClick={() => handleShiftDay('prev')}
                    aria-label="Предыдущий день"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div
                    className="day-center-wrap"
                    onClick={() => dateInputRef.current?.showPicker?.()}
                  >
                    <Calendar size={13} className="cal-icon" />
                    <span className="day-label-text">{formatDateDisplay(selectedDate, todayDate)}</span>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        if (e.target.value) setSelectedDate(e.target.value);
                      }}
                      className="hidden-date-input"
                    />
                  </div>

                  {!isToday && (
                    <button type="button" className="today-jump-btn" onClick={handleJumpToday}>
                      Сегодня
                    </button>
                  )}

                  <button
                    type="button"
                    className="day-arrow-btn"
                    onClick={() => handleShiftDay('next')}
                    aria-label="Следующий день"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Quick Expense Input Card */}
                <section className="input-card">
                  <div className="input-card-head">
                    <div className="field-label-wrap">
                      <span className="field-label">
                        {editingId !== null ? 'Редактировать расход' : 'Новая трата'}
                      </span>
                      {editingId !== null && (
                        <button type="button" className="cancel-edit-btn" onClick={handleCancelEdit}>
                          Отмена
                        </button>
                      )}
                    </div>
                    <span className="quick-date-hint">
                      {isToday ? 'Сегодня' : selectedDate.slice(5).replace('-', '.')}
                    </span>
                  </div>

                  {/* Horizontal Category Strip with Icons */}
                  <div className="category-strip-wrap">
                    <div ref={stripRef} className="category-strip" role="radiogroup">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setSelectedCategory(cat.key)}
                          className={`category-chip ${selectedCategory === cat.key ? 'active' : ''}`}
                        >
                          <span className="chip-icon">{cat.icon}</span>
                          <span className="chip-label">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="input-box-group">
                    <div className="input-shell">
                      <input
                        ref={amountInputRef}
                        id="amount-input"
                        type="text"
                        inputMode="numeric"
                        value={draft}
                        onChange={(e) => {
                          const parsed = parseMoney(e.target.value);
                          setDraft(parsed ? formatMoney(parsed) : '');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickAdd();
                          } else if (e.key === 'Escape' && editingId !== null) {
                            handleCancelEdit();
                          }
                        }}
                        placeholder="Сумма в сумах"
                        className="quick-input numbers"
                      />
                      <button
                        type="button"
                        className="add-trigger"
                        onClick={handleQuickAdd}
                        disabled={!parseMoney(draft) || isSubmitting}
                        aria-label={editingId !== null ? 'Сохранить' : 'Добавить'}
                      >
                        {editingId !== null ? <Check size={16} /> : <ArrowRight size={16} />}
                      </button>
                    </div>

                    <div className="note-row">
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickAdd();
                          }
                        }}
                        placeholder="Комментарий к расходу..."
                        className="note-input"
                      />
                    </div>
                  </div>
                </section>

                {/* Day Expenses History */}
                <section className="history-box">
                  <div className="history-header">
                    <div className="history-title-wrap">
                      <span className="history-title">
                        {isFilterActive
                          ? `Траты от ${formatMoney(parseMoney(minAmountFilter))} UZS`
                          : isToday
                          ? 'Траты за сегодня'
                          : `Траты (${formatDateDisplay(selectedDate, todayDate)})`}
                      </span>
                      <span className="history-count-badge numbers">
                        {isFilterActive ? filteredExpenses.length : expenses.length}
                      </span>
                    </div>

                    <div className="history-header-actions">
                      <button
                        type="button"
                        className={`filter-toggle-pill ${showMinFilter || isFilterActive ? 'active' : ''}`}
                        onClick={() => {
                          setShowMinFilter((prev) => !prev);
                          triggerHaptic('selection');
                        }}
                        aria-label="Фильтр по сумме"
                      >
                        <SlidersHorizontal size={12} />
                        <span>{isFilterActive ? `≥ ${formatMoney(parseMoney(minAmountFilter))}` : 'По сумме'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter input container */}
                  {(showMinFilter || isFilterActive) && (
                    <div className="filter-amount-bar">
                      <div className="filter-input-wrap">
                        <Search size={14} className="filter-search-icon" />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={minAmountFilter}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            if (!raw) {
                              setMinAmountFilter('');
                            } else {
                              setMinAmountFilter(Number(raw).toLocaleString('ru-RU'));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSearchMore();
                            }
                          }}
                          placeholder="Сумма от (например, 50 000)..."
                          className="filter-amount-input numbers"
                        />
                        {minAmountFilter && (
                          <button
                            type="button"
                            className="filter-clear-icon-btn"
                            onClick={() => setMinAmountFilter('')}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="filter-submit-btn"
                        onClick={handleSearchMore}
                        disabled={!parseMoney(minAmountFilter) || isLoadingFiltered}
                      >
                        {isLoadingFiltered ? <RefreshCw size={13} className="rotating" /> : 'Найти'}
                      </button>
                      {isFilterActive && (
                        <button
                          type="button"
                          className="filter-reset-btn"
                          onClick={handleClearFilter}
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                  )}

                  <div className="history-list">
                    {(isFilterActive ? filteredExpenses : expenses).length > 0 ? (
                      <AnimatePresence initial={false}>
                        {(isFilterActive ? filteredExpenses : expenses).map((expense) => (
                          <SwipeableExpenseRow
                            key={expense.id}
                            expense={expense}
                            isBeingEdited={editingId === expense.id}
                            onEdit={handleStartEdit}
                            onDelete={handleDeleteExpense}
                            showDate={isFilterActive}
                          />
                        ))}
                      </AnimatePresence>
                    ) : (
                      <div className="empty-state">
                        <span className="empty-icon">{isFilterActive ? '🔍' : '☕'}</span>
                        <span>
                          {isFilterActive
                            ? `Нет трат от ${formatMoney(parseMoney(minAmountFilter))} UZS`
                            : 'Нет трат за этот день'}
                        </span>
                        {isFilterActive && (
                          <button
                            type="button"
                            className="empty-reset-filter-btn"
                            onClick={handleClearFilter}
                          >
                            Показать все траты
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
            </div>

            <div className={`page-tab-content stats-page-wrap ${activePage === 'stats' ? 'active-tab' : 'hidden-tab'}`}>
                {/* Statistics Hero matching image */}
                <section className="stats-hero-card">
                  <span className="stats-hero-label">Всего за этот месяц</span>
                  <div className="stats-hero-total numbers">
                    {formatMoney(monthTotal)} UZS
                  </div>
                  <div className="stats-hero-usd numbers">
                    ≈ ${monthUsd}
                  </div>
                </section>

                {/* Donut Chart with center percent & label */}
                <DonutChart
                  items={formattedStatItems}
                  selectedKey={selectedStatKey}
                  onSelectKey={(key) => {
                    setSelectedStatKey((prev) => (prev === key ? null : key));
                    triggerHaptic('selection');
                  }}
                />

                {/* Category Breakdown List */}
                <section className="stats-breakdown-card">
                  <div className="stats-breakdown-head">
                    <span className="stats-breakdown-title">Категории расходов</span>
                    <span className="stats-breakdown-count numbers">
                      {formattedStatItems.length}
                    </span>
                  </div>

                  <div className="stats-items-list">
                    {formattedStatItems.length > 0 ? (
                      formattedStatItems.map((item) => {
                        const isSelected = selectedStatKey === item.key;
                        return (
                          <div
                            key={item.key}
                            className={`stat-item-row ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedStatKey((prev) => (prev === item.key ? null : item.key));
                              triggerHaptic('selection');
                            }}
                          >
                            <div className="stat-item-main">
                              <div className="stat-item-left">
                                <span
                                  className="stat-item-badge"
                                  style={{ backgroundColor: `${item.color}1c` }}
                                >
                                  {item.icon}
                                </span>
                                <div className="stat-item-info">
                                  <span className="stat-item-name">{item.label}</span>
                                  <span className="stat-item-pct-pill">{item.pct}% от всех трат</span>
                                </div>
                              </div>
                              <div className="stat-item-right">
                                <span className="stat-item-amount numbers">
                                  {formatMoney(item.amount)} UZS
                                </span>
                                <span className="stat-item-usd numbers">
                                  ≈ ${(item.amount / USD_RATE).toFixed(2)}
                                </span>
                              </div>
                            </div>
                            <div className="stat-progress-track">
                              <div
                                className="stat-progress-fill"
                                style={{
                                  width: `${Math.max(4, item.pct)}%`,
                                  backgroundColor: item.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-state">
                        <span className="empty-icon">📊</span>
                        <span>В этом месяце трат пока нет</span>
                      </div>
                    )}
                  </div>
                </section>
            </div>
          </div>
        </main>

        {/* Undo Toast Notification */}
        <AnimatePresence>
          {undoItem && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="undo-toast"
            >
              <div className="undo-toast-text">
                <span>Трата {formatMoney(undoItem.amount)} UZS удалена</span>
              </div>
              <button type="button" className="undo-btn" onClick={handleRestoreUndo}>
                <RotateCcw size={13} />
                <span>Отменить</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modern Mobile Bottom Navigation Dock */}
        <nav className="bottom-nav-dock">
          <div className="bottom-nav-inner">
            <button
              type="button"
              className={`nav-tab-btn ${activePage === 'home' ? 'active' : ''}`}
              onClick={() => {
                setActivePage('home');
                triggerHaptic('selection');
              }}
            >
              <Wallet size={16} />
              <span>Главная</span>
              {activePage === 'home' && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="nav-tab-indicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${activePage === 'stats' ? 'active' : ''}`}
              onClick={() => {
                setActivePage('stats');
                triggerHaptic('selection');
              }}
            >
              <PieChart size={16} />
              <span>Статистика</span>
              {activePage === 'stats' && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="nav-tab-indicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
