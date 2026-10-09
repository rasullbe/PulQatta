'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Replace with tunnel or production URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://d712ba2bd1ac25.lhr.life';

const formatMoney = (amount: number) => {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseMoney = (val: string) => {
  if (!val) return 0;
  return parseInt(val.replace(/\./g, '').replace(/,/g, ''), 10);
};

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [expenses, setExpenses] = useState<any[]>([]);
  
  const [amountInput, setAmountInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('Еда');
  const [noteInput, setNoteInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authHeader, setAuthHeader] = useState('fake_init_data_for_local_testing');

  useEffect(() => {
    const initApp = async () => {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        if (tg.colorScheme === 'dark') {
          document.body.classList.add('tg-dark');
        }
        if (tg.initData) setAuthHeader(tg.initData);
      }
      
      await loadData(tg ? tg.initData : 'fake_init_data_for_local_testing');
      setIsLoaded(true);
    };
    initApp();
  }, []);

  const fetchHeaders = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': authHeader
  };

  const loadData = async (authData = authHeader) => {
    try {
      const res = await fetch(`${API_URL}/api/expenses/today`, {
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': authData }
      });
      if (res.ok) {
        const data = await res.json();
        setTotal(data.total);
        setExpenses(data.expenses || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseMoney(e.target.value);
    if (isNaN(val) || val === 0) {
      setAmountInput('');
    } else {
      setAmountInput(formatMoney(val));
    }
  };

  const handleAddExpense = async () => {
    const amount = parseMoney(amountInput);
    if (!amount || amount <= 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/expenses`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ amount, category: categoryInput, note: noteInput })
      });

      if (res.ok) {
        setAmountInput('');
        setNoteInput('');
        await loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: number, amount: number) => {
    // Optimistic UI update
    setExpenses(prev => prev.filter(e => e.id !== id));
    setTotal(prev => Math.max(0, prev - amount));
    
    try {
      await fetch(`${API_URL}/api/expenses/${id}`, {
        method: 'DELETE',
        headers: fetchHeaders
      });
    } catch (e) {
      console.error(e);
      await loadData(); // rollback if error
    }
  };

  const getEmoji = (cat: string) => {
    const pre = cat.substring(0, 2).trim();
    return pre ? pre : "📌";
  };

  return (
    <>
      <AnimatePresence>
        {!isLoaded && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="loader-overlay"
          >
            <div className="spinner"></div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 10 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="max-w-[600px] mx-auto flex flex-col gap-6"
      >
        <div className="text-center py-5">
          <div className="text-[1rem] text-[var(--text-muted)] font-medium uppercase tracking-wide">
            Потрачено сегодня
          </div>
          <div className="text-[3.5rem] font-bold mt-1 numbers flex justify-center items-baseline gap-2">
            <span>{formatMoney(total)}</span>
            <span className="text-2xl font-medium text-[var(--text-muted)] font-['Outfit']">UZS</span>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-[var(--card-bg)] rounded-[var(--border-radius)] p-6 flex flex-col gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.85rem] text-[var(--text-muted)] font-semibold">Сумма</label>
            <input 
              type="text" 
              inputMode="numeric" 
              placeholder="Например: 50.000" 
              value={amountInput}
              onChange={handleAmountChange}
              className="w-full bg-[var(--bg-color)] border-none rounded-xl p-4 text-[1.25rem] font-semibold text-[var(--text-color)] outline-none focus:ring-2 focus:ring-[var(--accent)] transition-shadow numbers"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.85rem] text-[var(--text-muted)] font-semibold">Категория</label>
            <select 
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              className="w-full bg-[var(--bg-color)] border-none rounded-xl p-4 text-[1rem] text-[var(--text-color)] outline-none focus:ring-2 focus:ring-[var(--accent)] transition-shadow font-['Outfit'] appearance-none"
            >
              <option value="🍔 Еда">🍔 Еда</option>
              <option value="🚕 Транспорт">🚕 Транспорт</option>
              <option value="🛍 Покупки">🛍 Покупки</option>
              <option value="🍿 Развлечения">🍿 Развлечения</option>
              <option value="💊 Здоровье">💊 Здоровье</option>
              <option value="📌 Прочее">📌 Прочее</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.85rem] text-[var(--text-muted)] font-semibold">Заметка</label>
            <input 
              type="text" 
              placeholder="На что потратили?" 
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-[var(--bg-color)] border-none rounded-xl p-4 text-[1rem] text-[var(--text-color)] outline-none focus:ring-2 focus:ring-[var(--accent)] transition-shadow font-['Outfit']"
            />
          </div>
          <button 
            onClick={handleAddExpense}
            disabled={isSubmitting || !amountInput}
            className="mt-2 bg-[var(--accent)] text-[var(--bg-color)] border-none rounded-full p-[18px] text-[1.1rem] font-semibold flex justify-center items-center gap-2 active:scale-95 transition-transform disabled:opacity-60 disabled:active:scale-100"
          >
            {isSubmitting ? 'Добавляем...' : 'Добавить расход'}
          </button>
        </motion.div>

        <h2 className="text-[1.2rem] font-bold mt-2">Сегодняшние расходы</h2>
        
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {expenses.map((exp, i) => (
              <motion.div 
                key={exp.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="bg-[var(--card-bg)] rounded-[16px] p-4 flex justify-between items-center"
              >
                <div className="flex items-center gap-4">
                  <div className="text-[1.5rem] bg-[var(--bg-color)] w-11 h-11 flex items-center justify-center rounded-xl">
                    {getEmoji(exp.category)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-[1.05rem]">{exp.note || exp.category}</span>
                    <span className="text-[0.85rem] text-[var(--text-muted)]">{exp.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[1.15rem] numbers">{formatMoney(exp.amount)}</span>
                  <button 
                    onClick={() => handleDeleteExpense(exp.id, exp.amount)}
                    className="text-[var(--text-muted)] text-[1.5rem] leading-none p-1 rounded-full active:text-[var(--danger)] active:bg-red-500/10 transition-colors"
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {expenses.length === 0 && isLoaded && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="text-center text-[var(--text-muted)] py-5">
              Пока нет расходов. Добавьте первый!
            </motion.div>
          )}
        </div>
      </motion.div>
    </>
  );
}
