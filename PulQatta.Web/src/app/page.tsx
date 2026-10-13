'use client';

import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
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
} from 'lucide-react';

const USD_RATE = 12800;

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5015';

const CHART_COLORS = [
  '#18181b',
  '#3f3f46',
  '#71717a',
  '#a16207',
  '#d97706',
  '#0f766e',
  '#4338ca',
  '#be123c',
  '#7c3aed',
  '#a8a29e',
];

const CATEGORIES = [
  { key: 'Food', label: 'Еда' },
  { key: 'Cafe', label: 'Кафе' },
  { key: 'Transport', label: 'Транспорт' },
  { key: 'Utilities', label: 'Коммуналка' },
  { key: 'Clothes', label: 'Одежда' },
  { key: 'Electronics', label: 'Техника' },
  { key: 'Health', label: 'Здоровье' },
  { key: 'Games', label: 'Игры' },
  { key: 'Subscriptions', label: 'Подписки' },
  { key: 'Other', label: 'Прочее' },
] as const;

export type Expense = {
  id: number;
  amount: number;
  category?: string | number;
  note?: string | null;
  createdAt?: string;
};

export type CategorySummary = {
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

function getCategoryLabel(raw?: string | number): string {
  if (raw === undefined || raw === null) return 'Прочее';
  if (typeof raw === 'number' || !Number.isNaN(Number(raw))) {
    const idx = Number(raw);
    return CATEGORIES[idx]?.label || 'Прочее';
  }
  const found = CATEGORIES.find(
    (c) =>
      c.key.toLowerCase() === String(raw).toLowerCase() ||
      c.label.toLowerCase() === String(raw).toLowerCase()
  );
  return found ? found.label : String(raw);
}

function getCategoryKey(raw?: string | number): string {
  if (raw === undefined || raw === null) return 'Other';
  if (typeof raw === 'number' || !Number.isNaN(Number(raw))) {
    const idx = Number(raw);
    return CATEGORIES[idx]?.key || 'Other';
  }
  const found = CATEGORIES.find(
    (c) =>
      c.key.toLowerCase() === String(raw).toLowerCase() ||
      c.label.toLowerCase() === String(raw).toLowerCase()
  );
  return found ? found.key : 'Other';
}

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr: string): string {
  const today = getLocalDateString(new Date());
  const yesterday = getLocalDateString(new Date(Date.now() - 86400000));

  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayName = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
  const formatted = `${d.getDate()} ${months[d.getMonth()]}, ${dayName}`;

  if (dateStr === today) return `Сегодня (${formatted})`;
  if (dateStr === yesterday) return `Вчера (${formatted})`;
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

  if (!initData && window.location.hash.includes('tgWebAppData=')) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    initData = hashParams.get('tgWebAppData') || '';
  }

  if (!userId && initData) {
    try {
      const params = new URLSearchParams(initData);
      const userJson = params.get('user');
      if (userJson) {
        const parsed = JSON.parse(userJson);
        if (parsed?.id) userId = String(parsed.id);
        if (parsed?.first_name) username = parsed.first_name;
      }
    } catch {
      // ignore
    }
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

// Butter-smooth, zero-lag swipeable row with hardware accelerated transform
function SwipeableExpenseRow({
  expense,
  isBeingEdited,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  isBeingEdited: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const startXRef = useRef<number | null>(null);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [activeMode, setActiveMode] = useState<'none' | 'edit' | 'delete'>('none');

  const catLabel = getCategoryLabel(expense.category);
  const hasNote = Boolean(expense.note && expense.note.trim());

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    startXRef.current = e.clientX;
    currentXRef.current = 0;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (rowRef.current) {
      rowRef.current.style.transition = 'none';
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || startXRef.current === null || !rowRef.current) return;
    const delta = e.clientX - startXRef.current;

    // Apply damping curve directly without triggering React re-renders
    let clamped = delta;
    if (clamped > 80) clamped = 80 + (clamped - 80) * 0.2;
    if (clamped < -80) clamped = -80 + (clamped + 80) * 0.2;

    currentXRef.current = clamped;
    rowRef.current.style.transform = `translate3d(${clamped}px, 0, 0)`;

    if (clamped <= -50) {
      if (activeMode !== 'delete') setActiveMode('delete');
    } else if (clamped >= 50) {
      if (activeMode !== 'edit') setActiveMode('edit');
    } else if (activeMode !== 'none') {
      setActiveMode('none');
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current || !rowRef.current) return;
    isDraggingRef.current = false;
    startXRef.current = null;
    const finalX = currentXRef.current;

    rowRef.current.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
    rowRef.current.style.transform = 'translate3d(0, 0, 0)';
    setActiveMode('none');

    // Threshold trigger
    if (finalX <= -65) {
      onDelete(expense);
    } else if (finalX >= 65) {
      onEdit(expense);
    }
  };

  return (
    <motion.div
      layout
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
          <span className="history-badge">{catLabel.charAt(0)}</span>
          <div className="history-text">
            <span className="history-name">{hasNote ? expense.note : catLabel}</span>
            {hasNote && <span className="history-sub">{catLabel}</span>}
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

export default function Home() {
  const [activeView, setActiveView] = useState<'day' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateString());
  const [dayTotal, setDayTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthSummary, setMonthSummary] = useState<CategorySummary[]>([]);
  const [allMonthExpenses, setAllMonthExpenses] = useState<Expense[]>([]);

  // Draft inputs
  const [draft, setDraft] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Food');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // API state
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_URL);

  // Undo deletion notification
  const [undoItem, setUndoItem] = useState<Expense | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [, startTransition] = useTransition();

  const identityRef = useRef<{ initData: string; userId: string; username: string }>({
    initData: '',
    userId: '111111111',
    username: 'Тест',
  });

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

    const savedApi = localStorage.getItem('pulqatta_custom_api');
    if (savedApi) {
      setApiUrl(savedApi);
    }
  }, []);

  const getHeaders = useCallback(() => {
    const { initData, userId } = identityRef.current;
    return {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData || 'mini_app_active',
      'X-Telegram-User-Id': userId,
    };
  }, []);

  // Compute local metrics for offline mode
  const applyLocalData = useCallback(
    (targetDate: string) => {
      const { userId } = identityRef.current;
      const all = getLocalExpenses(userId);

      const dayItems = all.filter((e) => {
        const itemDate = e.createdAt ? e.createdAt.slice(0, 10) : getLocalDateString();
        return itemDate === targetDate;
      });

      const targetMonthPrefix = targetDate.slice(0, 7);
      const monthItems = all.filter((e) => {
        const itemDate = e.createdAt ? e.createdAt.slice(0, 10) : getLocalDateString();
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
      setIsRefreshing(true);
      const headers = getHeaders();
      const { userId } = identityRef.current;

      try {
        const [dayRes, monthRes] = await Promise.all([
          fetch(`${apiUrl}/api/expenses/by-date?date=${targetDate}`, { headers }),
          fetch(`${apiUrl}/api/expenses/month`, { headers }),
        ]);

        if (dayRes.ok && monthRes.ok) {
          const dayData = await dayRes.json();
          const monthData = await monthRes.json();

          setDayTotal(dayData.total || 0);
          setExpenses(dayData.expenses || []);
          setMonthSummary(Array.isArray(monthData) ? monthData : []);

          // Sync into local backup
          const currentLocal = getLocalExpenses(userId);
          const otherExpenses = currentLocal.filter((e) => {
            const itemDate = e.createdAt ? e.createdAt.slice(0, 10) : '';
            return itemDate !== targetDate;
          });
          const merged = [...(dayData.expenses || []), ...otherExpenses];
          saveLocalExpenses(userId, merged);
          setIsRefreshing(false);
          return;
        }
      } catch {
        // Backend unreachable -> local fallback
      }

      applyLocalData(targetDate);
      setIsRefreshing(false);
    },
    [apiUrl, getHeaders, applyLocalData, selectedDate]
  );

  useEffect(() => {
    loadData(selectedDate);
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
    setSelectedDate(getLocalDateString(new Date()));
  };

  const handleStartEdit = (item: Expense) => {
    setEditingId(item.id);
    setDraft(formatMoney(item.amount));
    setSelectedCategory(getCategoryKey(item.category));
    setNote(item.note || '');
    amountInputRef.current?.focus({ preventScroll: true });

    // Haptic feedback
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

    // Use current time if today, or selectedDate noon if past/future day
    const isToday = selectedDate === getLocalDateString();
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
        // @ts-ignore
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
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
    setDayTotal((prev) => Math.max(0, prev - target.amount));

    // Save to local backup
    const updatedLocal = getLocalExpenses(userId).filter((item) => item.id !== target.id);
    saveLocalExpenses(userId, updatedLocal);

    // Show undo snackbar
    setUndoItem(target);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoItem(null);
      // Finalize backend delete after undo window expires
      fetch(`${apiUrl}/api/expenses/${target.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      }).catch(() => {});
    }, 4500);

    // @ts-ignore
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('warning');
  };

  const handleRestoreUndo = () => {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    const item = undoItem;
    setUndoItem(null);

    // Re-add to UI
    setExpenses((prev) => [item, ...prev]);
    setDayTotal((prev) => prev + item.amount);

    // Re-add to local storage
    const { userId } = identityRef.current;
    const current = getLocalExpenses(userId);
    saveLocalExpenses(userId, [item, ...current]);

    // @ts-ignore
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
  };

  const monthTotal = monthSummary.reduce((sum, item) => sum + item.totalAmount, 0);
  const displayedTotal = activeView === 'day' ? dayTotal : monthTotal;
  const displayedUsd = (displayedTotal / USD_RATE).toFixed(2);
  const isToday = selectedDate === getLocalDateString();

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
                <RefreshCw size={13} />
              </button>

              <div className="status-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'day'}
                  className={`status-tag ${activeView === 'day' ? 'active' : ''}`}
                  onClick={() => setActiveView('day')}
                >
                  День
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'month'}
                  className={`status-tag ${activeView === 'month' ? 'active' : ''}`}
                  onClick={() => setActiveView('month')}
                >
                  Месяц
                </button>
              </div>
            </div>
          </header>

          {/* Compact Balance Card */}
          <motion.section
            className="summary-card"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="summary-top">
              <div className="summary-label">
                {activeView === 'day'
                  ? isToday
                    ? 'Итого за сегодня'
                    : `Итого за ${formatDateDisplay(selectedDate)}`
                  : 'Всего за этот месяц'}
              </div>
              <div className="summary-usd numbers">≈ ${displayedUsd}</div>
            </div>
            <div className="summary-row">
              <span className="total-number numbers">{formatMoney(displayedTotal || 0)}</span>
              <span className="currency">UZS</span>
            </div>
          </motion.section>

          {/* Day Navigation Bar (when in Day view) */}
          {activeView === 'day' && (
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
                <span className="day-label-text">{formatDateDisplay(selectedDate)}</span>
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
          )}

          {/* Compact Input Card */}
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

            <div className="category-strip-wrap">
              <div ref={stripRef} className="category-strip" role="radiogroup">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`category-chip ${selectedCategory === cat.key ? 'active' : ''}`}
                  >
                    {cat.label}
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

          {/* History / Monthly Analytics Section */}
          <section className="history-box">
            <div className="history-header">
              <div className="history-title">
                {activeView === 'day'
                  ? isToday
                    ? 'Траты за сегодня'
                    : `Траты (${formatDateDisplay(selectedDate)})`
                  : 'Структура расходов за месяц'}
              </div>
              {activeView === 'day' && expenses.length > 0 && (
                <span className="swipe-hint">← свайп для действий →</span>
              )}
            </div>

            {/* Monthly View Bars */}
            {activeView === 'month' && monthSummary.length > 0 && monthTotal > 0 && (
              <div className="chart-bar-wrap">
                {monthSummary.map((item, idx) => {
                  const pct = Math.max(3, Math.round((item.totalAmount / monthTotal) * 100));
                  return (
                    <div
                      key={String(item.category) + idx}
                      className="chart-bar-seg"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* Content List */}
            <div className="history-list">
              {activeView === 'day' ? (
                expenses.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {expenses.map((expense) => (
                      <SwipeableExpenseRow
                        key={expense.id}
                        expense={expense}
                        isBeingEdited={editingId === expense.id}
                        onEdit={handleStartEdit}
                        onDelete={handleDeleteExpense}
                      />
                    ))}
                  </AnimatePresence>
                ) : (
                  <div className="empty-state">
                    <span className="empty-icon">☕</span>
                    <span>Нет трат за этот день</span>
                  </div>
                )
              ) : monthSummary.length > 0 ? (
                <div className="month-cards-list">
                  {monthSummary.map((item, idx) => {
                    const catLabel = getCategoryLabel(item.category);
                    const pct = monthTotal > 0 ? Math.round((item.totalAmount / monthTotal) * 100) : 0;
                    const barColor = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                      <div key={String(item.category) + idx} className="month-item-col">
                        <div className="month-item-top">
                          <div className="history-main">
                            <span className="history-badge" style={{ backgroundColor: barColor }}>
                              {catLabel.charAt(0)}
                            </span>
                            <div className="history-text">
                              <span className="history-name">{catLabel}</span>
                              <span className="history-sub">{pct}% от общих трат</span>
                            </div>
                          </div>
                          <div className="history-right">
                            <div className="history-amount-pill">
                              <span className="history-amount numbers">
                                {formatMoney(item.totalAmount)}
                              </span>
                              <span className="history-currency">UZS</span>
                            </div>
                          </div>
                        </div>
                        <div className="month-progress-track">
                          <div
                            className="month-progress-fill"
                            style={{ width: `${pct}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">📊</span>
                  <span>В этом месяце трат пока нет</span>
                </div>
              )}
            </div>
          </section>
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

        </AnimatePresence>
      </div>
    </div>
  );
}
