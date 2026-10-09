document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Telegram WebApp
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        tg.expand();
        
        // Auto-switch theme based on TG
        if (tg.colorScheme === 'dark') {
            document.body.classList.add('tg-dark');
        }
    }

    const API_URL = window.AppConfig.ApiUrl;
    const authHeader = tg ? tg.initData : "fake_init_data_for_local_testing";

    // Format numbers like 50.000
    const formatMoney = (amount) => {
        return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    // Parse input (allow both 50000 and 50.000)
    const parseMoney = (val) => {
        if (!val) return 0;
        return parseInt(val.replace(/\./g, '').replace(/,/g, ''), 10);
    };

    const elements = {
        app: document.getElementById('app'),
        loader: document.getElementById('loader'),
        totalVal: document.getElementById('total-val'),
        expensesContainer: document.getElementById('expenses-container'),
        addBtn: document.getElementById('add-btn'),
        amountInput: document.getElementById('amount-input'),
        categoryInput: document.getElementById('category-input'),
        noteInput: document.getElementById('note-input')
    };

    // Auto-format input as user types
    elements.amountInput.addEventListener('input', (e) => {
        let val = parseMoney(e.target.value);
        if (isNaN(val) || val === 0) {
            e.target.value = '';
        } else {
            e.target.value = formatMoney(val);
        }
    });

    const fetchHeaders = {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': authHeader
    };

    // Render single expense item
    const createExpenseElement = (exp) => {
        const div = document.createElement('div');
        div.className = 'expense-item';
        div.id = `exp-${exp.id}`;
        
        // Match emoji by category prefix
        let emoji = exp.category.substring(0, 2).trim();
        if (!emoji || emoji.length === 0) emoji = "📌";

        div.innerHTML = `
            <div class="expense-info">
                <div class="expense-emoji">${emoji}</div>
                <div class="expense-details">
                    <span class="expense-note">${exp.note || exp.category}</span>
                    <span class="expense-cat">${exp.category}</span>
                </div>
            </div>
            <div class="expense-actions">
                <span class="expense-amount numbers">${formatMoney(exp.amount)}</span>
                <button class="delete-btn" data-id="${exp.id}">×</button>
            </div>
        `;

        // Handle delete
        div.querySelector('.delete-btn').addEventListener('click', async () => {
            if (confirm('Удалить этот расход?')) {
                await deleteExpense(exp.id, div, exp.amount);
            }
        });

        return div;
    };

    const loadData = async () => {
        try {
            const res = await fetch(`${API_URL}/api/expenses/today`, { headers: fetchHeaders });
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            
            elements.totalVal.textContent = formatMoney(data.total);
            elements.expensesContainer.innerHTML = '';
            
            if (data.expenses && data.expenses.length > 0) {
                data.expenses.forEach((exp, index) => {
                    const el = createExpenseElement(exp);
                    elements.expensesContainer.appendChild(el);
                    // Stagger animation
                    setTimeout(() => el.classList.add('show'), 50 * index);
                });
            } else {
                elements.expensesContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Пока нет расходов. Добавьте первый!</div>';
            }
        } catch (e) {
            console.error(e);
            if(tg) tg.showAlert("Ошибка подключения к серверу.");
        } finally {
            elements.loader.classList.add('hidden');
            elements.app.style.display = 'flex';
        }
    };

    const addExpense = async () => {
        const amount = parseMoney(elements.amountInput.value);
        if (!amount || amount <= 0) {
            if(tg) tg.showAlert("Введите корректную сумму");
            return;
        }

        const category = elements.categoryInput.value;
        const note = elements.noteInput.value;

        elements.addBtn.disabled = true;
        elements.addBtn.textContent = 'Добавляем...';

        try {
            const res = await fetch(`${API_URL}/api/expenses`, {
                method: 'POST',
                headers: fetchHeaders,
                body: JSON.stringify({ amount, category, note })
            });

            if (res.ok) {
                // Clear inputs
                elements.amountInput.value = '';
                elements.noteInput.value = '';
                
                // Reload data to reflect changes smoothly
                await loadData();
            } else {
                if(tg) tg.showAlert("Ошибка при добавлении");
            }
        } catch (e) {
            console.error(e);
            if(tg) tg.showAlert("Ошибка сети");
        } finally {
            elements.addBtn.disabled = false;
            elements.addBtn.textContent = 'Добавить расход';
        }
    };

    const deleteExpense = async (id, el, amount) => {
        el.classList.add('removing');
        try {
            const res = await fetch(`${API_URL}/api/expenses/${id}`, {
                method: 'DELETE',
                headers: fetchHeaders
            });
            if (res.ok) {
                setTimeout(() => el.remove(), 300);
                // Update total locally immediately
                const currentTotal = parseMoney(elements.totalVal.textContent);
                elements.totalVal.textContent = formatMoney(Math.max(0, currentTotal - amount));
            } else {
                el.classList.remove('removing');
                if(tg) tg.showAlert("Ошибка удаления");
            }
        } catch(e) {
            el.classList.remove('removing');
        }
    };

    elements.addBtn.addEventListener('click', addExpense);

    // Initial load
    loadData();
});
