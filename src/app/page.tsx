'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5015';
const USD_RATE = 12800;
const SWIPE_THRESHOLD = 64;
const MAX_SWIPE = 96;

const CHART_COLORS = [
  '#17171a',
  '#4b5563',
  '#78716c',
  '#a16207',
  '#b45309',
  '#0f766e',
  '#4338ca',
  '#be123c',
  '#6d28d9',
  '#9ca3af',
];

const formatMoney = (amount: number) =>
  Math.round(amount).toLocaleString('ru-RU').replace(/\u00a0/g, '.');

const parseMoney = (val: string) =>
  parseInt(val.replace(/[.\s,]/g, ''), 10) || 0;

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

const getCategoryLabel = (raw?: string | number) => {
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
};

const getCategoryKey = (raw?: string | number): string => {
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
};

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

function resolveTelegramIdentity(): { initData: string; userId: string } {
  if (typeof window === 'undefined') {
    return { initData: '', userId: '111111111' };
  }

  // @ts-ignore
  const tg = window.Telegram?.WebApp;
  let initData: string = tg?.initData || '';
  let userId: string = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '';

  // Also check URL hash (#tgWebAppData=...) in case script initialized late
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
      }
    } catch {
      // ignore
    }
  }

  // If opened in a normal browser outside Telegram, assign a unique per-browser ID
  if (!userId) {
    let storedUid = localStorage.getItem('pulqatta_uid_v2');
    if (!storedUid) {
      storedUid = String(Math.floor(100000000 + Math.random() * 899999999));
      localStorage.setItem('pulqatta_uid_v2', storedUid);
    }
    userId = storedUid;
  }

  return { initData, userId };
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

function computeSummariesFromList(list: Expense[]) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const todayList = list.filter((e) => {
    const t = e.createdAt ? new Date(e.createdAt).getTime() : Date.now();
    return t >= startOfDay;
  });

  const monthList = list.filter((e) => {
    const t = e.createdAt ? new Date(e.createdAt).getTime() : Date.now();
    return t >= startOfMonth;
  });

  const todaySum = todayList.reduce((acc, item) => acc + Number(item.amount || 0), 0);

  const grouped = new Map<string, number>();
  for (const item of monthList) {
    const key = getCategoryKey(item.category);
    grouped.set(key, (grouped.get(key) || 0) + Number(item.amount || 0));
  }

  const summary: CategorySummary[] = Array.from(grouped.entries())
    .map(([category, totalAmount]) => ({ category, totalAmount }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return { todayList, todaySum, summary };
}

function clampSwipe(rawDelta: number): number {
  const sign = Math.sign(rawDelta);
  const abs = Math.abs(rawDelta);
  if (abs <= SWIPE_THRESHOLD) {
    return rawDelta;
  }
  const extra = abs - SWIPE_THRESHOLD;
  const damped = SWIPE_THRESHOLD + (MAX_SWIPE - SWIPE_THRESHOLD) * Math.tanh(extra / 70);
  return sign * Math.min(MAX_SWIPE, damped);
}

function SwipeableExpenseRow({
  expense,
  isBeingEdited,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  isBeingEdited: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (id: number) => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);

  const catLabel = getCategoryLabel(expense.category);
  const hasNote = Boolean(expense.note && expense.note.trim());

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    startXRef.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || startXRef.current === null) return;
    const rawDelta = e.clientX - startXRef.current;
    setOffsetX(clampSwipe(rawDelta));
  };

  const finishSwipe = () => {
    if (!dragging) return;
    setDragging(false);
    startXRef.current = null;

    if (offsetX <= -SWIPE_THRESHOLD) {
      setOffsetX(0);
      onDelete(expense.id);
    } else if (offsetX >= SWIPE_THRESHOLD) {
      setOffsetX(0);
      onEdit(expense);
    } else {
      setOffsetX(0);
    }
  };

  const isSwiping = Math.abs(offsetX) > 3;
  const isDeleteMode = offsetX < 0;
  const isReady = Math.abs(offsetX) >= SWIPE_THRESHOLD;
  const glowClass = isSwiping ? (isDeleteMode ? 'glow-delete' : 'glow-edit') : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, x: -30, transition: { duration: 0.18 } }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`swipe-item-wrap ${glowClass}`}
    >
      <div
        className={`swipe-track ${isSwiping ? 'visible' : ''} ${
          isDeleteMode ? 'mode-delete' : 'mode-edit'
        } ${isReady ? 'ready' : ''}`}
        aria-hidden="true"
      >
        <div className="swipe-icon-badge">
          {isDeleteMode ? <Trash2 size={17} strokeWidth={2.2} /> : <Pencil size={17} strokeWidth={2.2} />}
        </div>
      </div>

      <div
        className={`history-item ${isBeingEdited ? 'editing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          transition: dragging
            ? 'none'
            : 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div className="history-main">
          <span className="history-badge">{catLabel.charAt(0)}</span>
          <div className="history-text">
            <span className="history-name">
              {hasNote ? expense.note : catLabel}
            </span>
            {hasNote && <span className="history-sub">{catLabel}</span>}
          </div>
        </div>
        <div className="history-right">
          <div className="history-amount-pill">
            <span className="history-amount numbers">
              {formatMoney(expense.amount)}
            </span>
            <span className="history-currency">UZS</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<'today' | 'month'>('today');
  const [todayTotal, setTodayTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthSummary, setMonthSummary] = useState<CategorySummary[]>([]);

  const [draft, setDraft] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Food');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const identityRef = useRef<{ initData: string; userId: string }>({
    initData: '',
    userId: '111111111',
  });

  // Category strip scroll & drag refs
  const stripRef = useRef<HTMLDivElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef(false);
  const didMoveRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const getHeaders = useCallback(() => {
    const { initData, userId } = identityRef.current;
    return {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData || 'fake_init_data_for_local_testing',
      'X-Telegram-User-Id': userId,
    };
  }, []);

  const applyLocalFallback = useCallback(() => {
    const { userId } = identityRef.current;
    const localList = getLocalExpenses(userId);
    const { todayList, todaySum, summary } = computeSummariesFromList(localList);
    setTodayTotal(todaySum);
    setExpenses(todayList);
    setMonthSummary(summary);
  }, []);

  const loadData = useCallback(async () => {
    const headers = getHeaders();
    const { userId } = identityRef.current;

    try {
      const [todayRes, monthRes] = await Promise.all([
        fetch(`${API_URL}/api/expenses/today`, { headers }),
        fetch(`${API_URL}/api/expenses/month`, { headers }),
      ]);

      if (todayRes.ok && monthRes.ok) {
        const data = await todayRes.json();
        const monthData = await monthRes.json();
        const serverExpenses: Expense[] = data.expenses || [];
        setTodayTotal(data.total || 0);
        setExpenses(serverExpenses);
        setMonthSummary(Array.isArray(monthData) ? monthData : []);
        saveLocalExpenses(userId, serverExpenses);
        return;
      }
    } catch {
      // Backend unreachable (e.g., mobile without tunnel) -> use per-user local storage
    }

    applyLocalFallback();
  }, [getHeaders, applyLocalFallback]);

  useEffect(() => {
    // @ts-ignore
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    if (tg) {
      tg.ready();
      tg.expand();
    }
    identityRef.current = resolveTelegramIdentity();
    loadData();
  }, [loadData]);

  // Native non-passive wheel listener for smooth horizontal scrolling with mouse wheel
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    didMoveRef.current = false;
    setIsDragging(true);
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftRef.current = el.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !stripRef.current) return;
    e.preventDefault();
    const x = e.pageX - stripRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.4;
    if (Math.abs(walk) > 5) {
      didMoveRef.current = true;
    }
    stripRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const stopDragging = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const scrollCategories = (dir: 'left' | 'right') => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir === 'left' ? -160 : 160,
      behavior: 'smooth',
    });
  };

  const handleStartEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setDraft(formatMoney(expense.amount));
    setSelectedCategory(getCategoryKey(expense.category));
    setNote(expense.note || '');
    amountInputRef.current?.focus();
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

    try {
      const url = isEditing
        ? `${API_URL}/api/expenses/${editingId}`
        : `${API_URL}/api/expenses`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({
          amount,
          category: selectedCategory,
          note: trimmedNote,
        }),
      });

      if (res.ok) {
        setDraft('');
        setNote('');
        setEditingId(null);
        await loadData();
        return;
      }
    } catch {
      // Fallback to local storage per Telegram user
    } finally {
      setIsSubmitting(false);
    }

    // Local per-user fallback save when offline/mobile
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
        createdAt: new Date().toISOString(),
      };
      updatedList = [newExpense, ...currentList];
    }
    saveLocalExpenses(userId, updatedList);
    setDraft('');
    setNote('');
    setEditingId(null);
    applyLocalFallback();
  };

  const handleDeleteExpense = async (id: number) => {
    if (editingId === id) {
      handleCancelEdit();
    }
    const { userId } = identityRef.current;

    // Update local backup immediately
    const updatedLocal = getLocalExpenses(userId).filter((item) => item.id !== id);
    saveLocalExpenses(userId, updatedLocal);

    const target = expenses.find((item) => item.id === id);
    setExpenses((prev) => prev.filter((item) => item.id !== id));
    if (target) {
      setTodayTotal((prev) => Math.max(0, prev - target.amount));
    }

    try {
      const res = await fetch(`${API_URL}/api/expenses/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        await loadData();
        return;
      }
    } catch {
      // Offline fallback
    }

    applyLocalFallback();
  };

  const handleDraftChange = (value: string) => {
    const amount = parseMoney(value);
    setDraft(amount ? formatMoney(amount) : '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickAdd();
    } else if (e.key === 'Escape' && editingId !== null) {
      handleCancelEdit();
    }
  };

  const monthTotal = monthSummary.reduce((sum, item) => sum + item.totalAmount, 0);
  const displayedTotal = activeView === 'today' ? todayTotal : monthTotal;
  const displayedUsd = (displayedTotal / USD_RATE).toFixed(2);

  return (
    <div className="miniapp-root">
      <div className="miniapp-shell">
        <main className="app-screen">
          <header className="miniapp-header">
            <div className="brand-wrap">
              <img src="/logo.png?v=2" alt="PulQatta?" className="brand-logo" />
            </div>
            <div className="status-tabs" role="tablist" aria-label="Период">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'today'}
                className={`status-tag ${activeView === 'today' ? 'active' : ''}`}
                onClick={() => setActiveView('today')}
              >
                Сегодня
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
          </header>

          <motion.section
            className="summary-card"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="summary-top">
              <div className="summary-label">
                {activeView === 'today' ? 'Итого за сегодня' : 'Итого за месяц'}
              </div>
              <div className="summary-usd numbers">≈ ${displayedUsd}</div>
            </div>
            <div className="summary-row">
              <motion.span
                key={`${activeView}-${displayedTotal}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="total-number numbers"
              >
                {formatMoney(displayedTotal || 0)}
              </motion.span>
              <span className="currency">UZS</span>
            </div>
          </motion.section>

          <section className="input-card">
            <div className="input-card-head">
              <div className="field-label-wrap">
                <label className="field-label" htmlFor="amount-input">
                  {editingId !== null ? 'Изменить трату' : 'Новая трата'}
                </label>
                {editingId !== null && (
                  <button
                    type="button"
                    className="cancel-edit-btn"
                    onClick={handleCancelEdit}
                  >
                    Отмена
                  </button>
                )}
              </div>
              <div className="cat-nav">
                <button
                  type="button"
                  className="cat-nav-btn"
                  onClick={() => scrollCategories('left')}
                  aria-label="Категории влево"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="cat-nav-btn"
                  onClick={() => scrollCategories('right')}
                  aria-label="Категории вправо"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="category-strip-wrap">
              <div
                ref={stripRef}
                className={`category-strip ${isDragging ? 'dragging' : ''}`}
                role="radiogroup"
                aria-label="Категория расхода"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopDragging}
                onMouseLeave={stopDragging}
              >
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={(e) => {
                      if (didMoveRef.current) return;
                      setSelectedCategory(cat.key);
                      e.currentTarget.scrollIntoView({
                        behavior: 'smooth',
                        inline: 'center',
                        block: 'nearest',
                      });
                    }}
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
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Сумма в UZS"
                  className="quick-input numbers"
                />
                <button
                  type="button"
                  className="add-trigger"
                  onClick={handleQuickAdd}
                  disabled={!parseMoney(draft) || isSubmitting}
                  aria-label={editingId !== null ? 'Сохранить изменения' : 'Добавить расход'}
                >
                  {editingId !== null ? <Check size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
              <div className="note-row">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Заметка (необязательно)"
                  className="note-input"
                />
              </div>
            </div>
          </section>

          <section className="history-box">
            <div className="history-header">
              <div className="history-title">
                {activeView === 'today' ? 'Траты за сегодня' : 'График по категориям'}
              </div>
              {activeView === 'today' && expenses.length > 0 && (
                <span className="swipe-hint">← удалить · изменить →</span>
              )}
            </div>

            {activeView === 'month' && monthSummary.length > 0 && monthTotal > 0 && (
              <div className="chart-bar-wrap" aria-label="Распределение расходов за месяц">
                {monthSummary.map((item, idx) => {
                  const pct = Math.max(4, Math.round((item.totalAmount / monthTotal) * 100));
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

            <div className="history-list">
              {activeView === 'today' ? (
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
                  <div className="empty-state">Первые траты за сегодня появятся здесь</div>
                )
              ) : monthSummary.length > 0 ? (
                <AnimatePresence initial={false}>
                  {monthSummary.map((item, idx) => {
                    const catLabel = getCategoryLabel(item.category);
                    const pct = monthTotal > 0 ? Math.round((item.totalAmount / monthTotal) * 100) : 0;
                    const barColor = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                      <motion.div
                        key={String(item.category) + idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="month-item-col"
                      >
                        <div className="month-item-top">
                          <div className="history-main">
                            <span
                              className="history-badge"
                              style={{ backgroundColor: barColor }}
                            >
                              {catLabel.charAt(0)}
                            </span>
                            <div className="history-text">
                              <span className="history-name">{catLabel}</span>
                              <span className="history-sub">{pct}% от месяца</span>
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
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <div className="empty-state">За этот месяц трат пока нет</div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
