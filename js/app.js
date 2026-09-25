/* ============================================================
   Expense & Budget Visualizer — app.js
   All data persisted via localStorage. No frameworks used.
   ============================================================ */

'use strict';

// ── Storage keys ───────────────────────────────────────────
const STORAGE_KEY      = 'ebv_transactions';
const CATEGORIES_KEY   = 'ebv_categories';

// ── Built-in categories (always present, cannot be deleted) ─
const BUILTIN_CATEGORIES = [
  { name: 'Food',      color: '#f59e0b', emoji: '🍔' },
  { name: 'Transport', color: '#3b82f6', emoji: '🚌' },
  { name: 'Fun',       color: '#ec4899', emoji: '🎉' },
];

// ── State ──────────────────────────────────────────────────
let transactions      = loadTransactions();
let customCategories  = loadCustomCategories(); // [{name, color}]
let chartInstance        = null;
let historyChartInstance = null;
let monthOffset          = 0;

// ── DOM References ─────────────────────────────────────────
// Dashboard form
const form           = document.getElementById('expenseForm');
const inputName      = document.getElementById('itemName');
const inputAmount    = document.getElementById('itemAmount');
const inputCategory  = document.getElementById('itemCategory');
const nameError      = document.getElementById('nameError');
const amountError    = document.getElementById('amountError');
const categoryError  = document.getElementById('categoryError');

// Summary
const totalBalanceEl = document.getElementById('totalBalance');
const listEl         = document.getElementById('transactionList');
const emptyStateEl   = document.getElementById('emptyState');
const chartEmptyEl   = document.getElementById('chartEmpty');
const clearAllBtn    = document.getElementById('clearAll');
const categoryTotals = document.getElementById('categoryTotals');
const chartCanvas    = document.getElementById('spendingChart');
const limitInput     = document.getElementById('spendingLimit');

// Tabs
const tabDashboard   = document.getElementById('tabDashboard');
const tabMonthly     = document.getElementById('tabMonthly');
const viewDashboard  = document.getElementById('viewDashboard');
const viewMonthly    = document.getElementById('viewMonthly');

// Monthly summary
const monthPrevBtn     = document.getElementById('monthPrev');
const monthNextBtn     = document.getElementById('monthNext');
const monthNavLabel    = document.getElementById('monthNavLabel');
const monthlyKpiRow    = document.getElementById('monthlyKpiRow');
const monthlyBreakdown = document.getElementById('monthlyBreakdown');
const monthlyTxList    = document.getElementById('monthlyTxList');
const monthlyEmpty     = document.getElementById('monthlyEmpty');
const historyCanvas    = document.getElementById('historyChart');
const historyEmpty     = document.getElementById('historyEmpty');

// Category manager
const categoryForm  = document.getElementById('categoryForm');
const newCatColor   = document.getElementById('newCatColor');
const newCatName    = document.getElementById('newCatName');
const catNameError  = document.getElementById('catNameError');
const catChips      = document.getElementById('catChips');

// Theme
const themeToggleBtn = document.getElementById('themeToggle');

// ── LocalStorage Helpers ───────────────────────────────────
function loadTransactions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function loadCustomCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(CATEGORIES_KEY)) || [];
    // Strip any entries that duplicate a builtin name (case-insensitive).
    // This cleans up stale data from older versions of the app.
    const builtinNames = BUILTIN_CATEGORIES.map(b => b.name.toLowerCase());
    const cleaned = saved.filter(c => !builtinNames.includes(c.name.toLowerCase()));
    // If we removed anything, persist the cleaned list immediately.
    if (cleaned.length !== saved.length) {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch { return []; }
}
function saveCustomCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(customCategories));
}

// ── Category Registry ──────────────────────────────────────
// Returns the full list: builtins first, then custom ones.
function allCategories() {
  return [
    ...BUILTIN_CATEGORIES,
    ...customCategories.map(c => ({ name: c.name, color: c.color, emoji: '' })),
  ];
}

// Look up the color for any category name.
function getCategoryColor(name) {
  const found = allCategories().find(c => c.name === name);
  return found ? found.color : '#94a3b8';
}

// Look up the emoji for any category name.
function getCategoryEmoji(name) {
  const found = allCategories().find(c => c.name === name);
  return found ? (found.emoji || '') : '';
}

// ── Populate the <select> ──────────────────────────────────
function populateCategorySelect() {
  const prev = inputCategory.value;
  inputCategory.innerHTML = '<option value="">— Select category —</option>';
  allCategories().forEach(cat => {
    const opt = document.createElement('option');
    opt.value       = cat.name;
    opt.textContent = `${cat.emoji ? cat.emoji + ' ' : ''}${cat.name}`;
    inputCategory.appendChild(opt);
  });
  // Restore previous selection if it still exists
  if (prev && [...inputCategory.options].some(o => o.value === prev)) {
    inputCategory.value = prev;
  }
}

// ── Render Category Chips ──────────────────────────────────
function renderCatChips() {
  catChips.innerHTML = '';
  allCategories().forEach(cat => {
    const isBuiltin = BUILTIN_CATEGORIES.some(b => b.name === cat.name);
    const li = document.createElement('li');
    li.className = `cat-chip${isBuiltin ? ' builtin' : ''}`;
    li.style.background = cat.color;
    li.setAttribute('role', 'listitem');
    li.innerHTML = `
      <span class="cat-chip-dot"></span>
      <span class="cat-chip-label" title="${escapeHtml(cat.name)}">${escapeHtml(cat.emoji ? cat.emoji + ' ' : '')}${escapeHtml(cat.name)}</span>
      <button class="cat-chip-del" data-cat="${escapeHtml(cat.name)}" aria-label="Delete ${escapeHtml(cat.name)} category" title="Delete">✕</button>
    `;
    catChips.appendChild(li);
  });

  // Delete handlers (only fires for custom categories)
  catChips.querySelectorAll('.cat-chip-del').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.cat));
  });
}

// ── Add Custom Category ────────────────────────────────────
categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name  = newCatName.value.trim();
  const color = newCatColor.value;

  // Validate: non-empty and unique (case-insensitive across builtins + custom)
  const exists = allCategories().some(c => c.name.toLowerCase() === name.toLowerCase());
  if (!name || exists) {
    catNameError.textContent = !name
      ? 'Please enter a category name.'
      : `"${name}" already exists as a category.`;
    catNameError.classList.add('visible');
    newCatName.focus();
    return;
  }

  catNameError.classList.remove('visible');
  customCategories.push({ name, color });
  saveCustomCategories();

  populateCategorySelect();
  renderCatChips();

  // Reset form — keep color, clear name
  newCatName.value = '';
  newCatName.focus();
});

// Clear error on typing
newCatName.addEventListener('input', () => catNameError.classList.remove('visible'));

// ── Delete Custom Category ─────────────────────────────────
function deleteCategory(name) {
  // Prevent deleting builtins
  if (BUILTIN_CATEGORIES.some(b => b.name === name)) return;

  // Warn if transactions use this category
  const inUse = transactions.some(tx => tx.category === name);
  if (inUse) {
    if (!confirm(`"${name}" is used by existing transactions.\nThey will keep this category label but the category will be removed from the list.\nContinue?`)) return;
  }

  customCategories = customCategories.filter(c => c.name !== name);
  saveCustomCategories();
  populateCategorySelect();
  renderCatChips();
  render(); // refresh charts (removed category disappears from charts if no txs remain)
}

// ── Form Validation ────────────────────────────────────────
function validateForm() {
  let valid = true;

  const name = inputName.value.trim();
  if (!name) { setError(inputName, nameError, true);  valid = false; }
  else        { setError(inputName, nameError, false); }

  const amount = parseFloat(inputAmount.value);
  if (!inputAmount.value || isNaN(amount) || amount <= 0) {
    setError(inputAmount, amountError, true);  valid = false;
  } else {
    setError(inputAmount, amountError, false);
  }

  if (!inputCategory.value) {
    setError(inputCategory, categoryError, true);  valid = false;
  } else {
    setError(inputCategory, categoryError, false);
  }

  return valid;
}

function setError(field, msgEl, show) {
  field.classList.toggle('invalid', show);
  msgEl.classList.toggle('visible', show);
}

[inputName, inputAmount, inputCategory].forEach(el => {
  el.addEventListener('input', () => {
    const map = { itemName: 'nameError', itemAmount: 'amountError', itemCategory: 'categoryError' };
    setError(el, document.getElementById(map[el.id]), false);
  });
});

// ── Add Transaction ────────────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const tx = {
    id:       crypto.randomUUID(),
    name:     inputName.value.trim(),
    amount:   parseFloat(parseFloat(inputAmount.value).toFixed(2)),
    category: inputCategory.value,
    date:     new Date().toISOString(),
  };

  transactions.unshift(tx);
  saveTransactions();
  render();
  form.reset();
});

// ── Delete Transaction ─────────────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveTransactions();
  render();
}

// ── Clear All ──────────────────────────────────────────────
clearAllBtn.addEventListener('click', () => {
  if (transactions.length === 0) return;
  if (!confirm('Delete all transactions? This cannot be undone.')) return;
  transactions = [];
  saveTransactions();
  render();
});

// ── Render Transaction List ────────────────────────────────
function renderList() {
  listEl.innerHTML = '';

  if (transactions.length === 0) {
    emptyStateEl.style.display = 'block';
    clearAllBtn.style.display  = 'none';
    return;
  }

  emptyStateEl.style.display = 'none';
  clearAllBtn.style.display  = 'inline-block';

  // 1. Fetch the user's limit configuration numerical value parameter
  const currentLimit = parseFloat(limitInput.value);
  
  transactions.forEach(tx => {
    const color = getCategoryColor(tx.category);
    const emoji = getCategoryEmoji(tx.category);

    // 2. Perform the limit configuration validation check rule logic
    const isOverLimit = !isNaN(currentLimit) && tx.amount > currentLimit;
    
    const li = document.createElement('li');
    li.className = `transaction-item ${isOverLimit ? 'over-limit' : ''}`;
    li.dataset.id = tx.id;
    li.setAttribute('role', 'listitem');
    li.innerHTML = `
      <span class="category-dot" style="--dot-color:${color}" aria-hidden="true"></span>
      <div class="item-details">
        <div class="item-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</div>
        <div class="item-category">${emoji ? emoji + ' ' : ''}${escapeHtml(tx.category)}</div>

        <!-- Add this new warning sentence line right here -->
        ${isOverLimit ? `<span class="over-limit-warning">⚠️ Over your limit parameter baseline threshold!</span>` : ''}
      
      </div>
      <span class="item-amount">$${tx.amount.toFixed(2)}</span>
      <button class="btn-delete" aria-label="Delete ${escapeHtml(tx.name)}" data-id="${tx.id}" title="Delete">✕</button>
    `;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

// ── Render Balance ─────────────────────────────────────────
function renderBalance() {
  const total = transactions.reduce((s, tx) => s + tx.amount, 0);
  totalBalanceEl.textContent = `$${total.toFixed(2)}`;
}

// ── Compute Category Totals ────────────────────────────────
function computeCategoryTotals(txList) {
  return (txList || transactions).reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});
}

// ── Render Doughnut Chart ──────────────────────────────────
function renderChart() {
  const totals = computeCategoryTotals();
  const cats   = Object.keys(totals).filter(k => totals[k] > 0);
  const total  = cats.reduce((s, k) => s + totals[k], 0);

  if (cats.length === 0) {
    chartEmptyEl.style.display = 'block';
    chartCanvas.style.display  = 'none';
    categoryTotals.innerHTML   = '';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  chartEmptyEl.style.display = 'none';
  chartCanvas.style.display  = 'block';

  const data   = cats.map(k => totals[k]);
  const colors = cats.map(k => getCategoryColor(k));
  const labels = cats.map(k => `${getCategoryEmoji(k) ? getCategoryEmoji(k) + ' ' : ''}${k}`);

  if (chartInstance) {
    chartInstance.data.labels                      = labels;
    chartInstance.data.datasets[0].data            = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
  } else {
    chartInstance = new Chart(chartCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: document.body.classList.contains('dark-theme') ? '#1e293b' : '#ffffff',
          borderWidth: 3,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` $${val.toFixed(2)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  renderCategoryTotalsLegend(totals, total, cats);
}

function renderCategoryTotalsLegend(totals, total, cats) {
  categoryTotals.innerHTML = '';
  cats.forEach(cat => {
    const amt   = totals[cat];
    const pct   = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
    const color = getCategoryColor(cat);
    const emoji = getCategoryEmoji(cat);
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="cat-swatch" style="--swatch-color:${color}" aria-hidden="true"></span>
      <span class="cat-name">${emoji ? emoji + ' ' : ''}${escapeHtml(cat)}</span>
      <span class="cat-amount">$${amt.toFixed(2)}</span>
      <span class="cat-pct">${pct}%</span>
    `;
    categoryTotals.appendChild(li);
  });
}

// ── Master Render ──────────────────────────────────────────
function render() {
  renderBalance();
  renderList();
  renderChart();
  if (!viewMonthly.hidden) renderMonthlySummary();
}

// ── Utility: Escape HTML ───────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Tab Navigation ─────────────────────────────────────────
function switchTab(active) {
  const isDash = active === 'dashboard';
  tabDashboard.classList.toggle('active',  isDash);
  tabMonthly.classList.toggle('active',   !isDash);
  tabDashboard.setAttribute('aria-selected', String(isDash));
  tabMonthly.setAttribute('aria-selected',   String(!isDash));
  viewDashboard.hidden = !isDash;
  viewMonthly.hidden   =  isDash;
  if (!isDash) renderMonthlySummary();
}

tabDashboard.addEventListener('click', () => switchTab('dashboard'));
tabMonthly.addEventListener('click',   () => switchTab('monthly'));

// ── Month Navigator ────────────────────────────────────────
monthPrevBtn.addEventListener('click', () => { monthOffset++; renderMonthlySummary(); });
monthNextBtn.addEventListener('click', () => { if (monthOffset > 0) { monthOffset--; renderMonthlySummary(); } });

// ── Date Helpers ───────────────────────────────────────────
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatMonthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function allMonthKeys() {
  const keys = [...new Set(transactions.map(tx => monthKey(tx.date)))];
  return keys.sort((a, b) => b.localeCompare(a));
}

// ── Render Monthly Summary ─────────────────────────────────
function renderMonthlySummary() {
  const months = allMonthKeys();
  renderHistoryChart(months);

  if (months.length === 0) {
    monthNavLabel.textContent  = '—';
    monthPrevBtn.disabled      = true;
    monthNextBtn.disabled      = true;
    monthlyKpiRow.innerHTML    = '';
    monthlyBreakdown.innerHTML = '';
    monthlyTxList.innerHTML    = '';
    monthlyEmpty.style.display = 'block';
    return;
  }

  if (monthOffset >= months.length) monthOffset = months.length - 1;

  const currentKey = months[monthOffset];
  monthNavLabel.textContent = formatMonthLabel(currentKey);
  monthPrevBtn.disabled = monthOffset >= months.length - 1;
  monthNextBtn.disabled = monthOffset <= 0;

  const monthTxs = transactions.filter(tx => monthKey(tx.date) === currentKey);
  const total    = monthTxs.reduce((s, t) => s + t.amount, 0);
  const catTotals = computeCategoryTotals(monthTxs);
  const topCat    = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const avgPerTx  = monthTxs.length > 0 ? total / monthTxs.length : 0;
  const maxSpend  = monthTxs.length ? Math.max(...monthTxs.map(t => t.amount)) : 0;

  // KPI cards
  monthlyKpiRow.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total Spent</div>
      <div class="kpi-value kpi-highlight">$${total.toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Transactions</div>
      <div class="kpi-value">${monthTxs.length}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Avg per Item</div>
      <div class="kpi-value">$${avgPerTx.toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Top Category</div>
      <div class="kpi-value">${topCat ? `${getCategoryEmoji(topCat[0]) ? getCategoryEmoji(topCat[0]) + ' ' : ''}${escapeHtml(topCat[0])}` : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Highest Spend</div>
      <div class="kpi-value">$${maxSpend.toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Categories Used</div>
      <div class="kpi-value">${Object.keys(catTotals).length}</div>
    </div>
  `;

  // Category breakdown bars — works for ALL categories dynamically
  const cats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  let breakdownHTML = `<h3 class="monthly-section-title">Category Breakdown</h3>`;
  cats.forEach(cat => {
    const amt   = catTotals[cat];
    const pct   = total > 0 ? (amt / total) * 100 : 0;
    const color = getCategoryColor(cat);
    const emoji = getCategoryEmoji(cat);
    breakdownHTML += `
      <div class="breakdown-row">
        <span class="breakdown-cat">${emoji ? emoji + ' ' : ''}${escapeHtml(cat)}</span>
        <div class="breakdown-bar-track">
          <div class="breakdown-bar-fill" style="--bar-color:${color}; width:${pct.toFixed(1)}%"></div>
        </div>
        <span class="breakdown-amt">$${amt.toFixed(2)}</span>
        <span class="breakdown-pct">${pct.toFixed(1)}%</span>
      </div>
    `;
  });
  monthlyBreakdown.innerHTML = breakdownHTML;

  // Transaction list
  monthlyTxList.innerHTML = '';
  if (monthTxs.length === 0) {
    monthlyEmpty.style.display = 'block';
  } else {
    monthlyEmpty.style.display = 'none';

    // 1. Fetch the absolute numerical rule parameter limit value configuration
    const currentLimit = parseFloat(limitInput.value);

    [...monthTxs]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(tx => {
        const color = getCategoryColor(tx.category);
        const emoji = getCategoryEmoji(tx.category);

        // 2. Run the logical verification test checks
        const isOverLimit = !isNaN(currentLimit) && tx.amount > currentLimit;
        
        const li = document.createElement('li');
        li.className = `monthly-tx-item ${isOverLimit ? 'over-limit' : ''}`;
        li.innerHTML = `
          <span class="monthly-tx-date">${formatShortDate(tx.date)}</span>
          <span class="category-dot" style="--dot-color:${color}" aria-hidden="true"></span>
          <span class="monthly-tx-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center;">  
              <span class="monthly-tx-cat">${emoji ? emoji + ' ' : ''}${escapeHtml(tx.category)}</span>
            </div>

            <!-- Add this new warning sentence line inside monthly container structure -->
            ${isOverLimit ? `<span class="over-limit-warning">⚠️ Over your limit parameter baseline threshold!</span>` : ''}

          </div>  
          <span class="monthly-tx-amt">$${tx.amount.toFixed(2)}</span>
        `;
        monthlyTxList.appendChild(li);
      });
  }
}

// ── History Bar Chart (dynamic categories) ─────────────────
function renderHistoryChart(months) {
  if (months.length === 0) {
    historyEmpty.style.display  = 'block';
    historyCanvas.style.display = 'none';
    if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null; }
    return;
  }

  historyEmpty.style.display  = 'none';
  historyCanvas.style.display = 'block';

  const displayMonths = [...months].reverse().slice(-12);
  const labels = displayMonths.map(k => {
    const [y, m] = k.split('-');
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  });

  // Use ALL categories that actually appear in the displayed months
  const activeCats = [...new Set(
    transactions
      .filter(tx => displayMonths.includes(monthKey(tx.date)))
      .map(tx => tx.category)
  )];

  const datasets = activeCats.map(cat => ({
    label: `${getCategoryEmoji(cat) ? getCategoryEmoji(cat) + ' ' : ''}${cat}`,
    data: displayMonths.map(key =>
      transactions
        .filter(tx => monthKey(tx.date) === key && tx.category === cat)
        .reduce((s, tx) => s + tx.amount, 0)
    ),
    backgroundColor: getCategoryColor(cat),
    borderRadius: 4,
    borderSkipped: false,
  }));

  const isDark    = document.body.classList.contains('dark-theme');
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#94a3b8' : '#6b7280';

  if (historyChartInstance) {
    historyChartInstance.data.labels                          = labels;
    historyChartInstance.data.datasets                        = datasets;
    historyChartInstance.options.scales.x.ticks.color        = tickColor;
    historyChartInstance.options.scales.y.ticks.color        = tickColor;
    historyChartInstance.options.scales.x.grid.color         = gridColor;
    historyChartInstance.options.scales.y.grid.color         = gridColor;
    historyChartInstance.options.plugins.legend.labels.color = tickColor;
    historyChartInstance.update();
    return;
  }

  historyChartInstance = new Chart(historyCanvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: tickColor, boxWidth: 12, padding: 16, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            footer: (items) => `Total: $${items.reduce((s, i) => s + i.parsed.y, 0).toFixed(2)}`,
            label:  (ctx)   => ` $${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid:  { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 } },
        },
        y: {
          stacked: true,
          grid:  { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 }, callback: (v) => `$${v}` },
        },
      },
    },
  });
}

// ── Theme Switcher ─────────────────────────────────────────
if (localStorage.getItem('ebv-theme') === 'dark') {
  document.body.classList.add('dark-theme');
  if (themeToggleBtn) themeToggleBtn.textContent = '☀️ Light Mode';
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('ebv-theme', isDark ? 'dark' : 'light');
    themeToggleBtn.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';

    if (chartInstance && chartInstance.data.datasets[0]) {
      chartInstance.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
      chartInstance.update();
    }
    if (!viewMonthly.hidden) renderMonthlySummary();
  });
}

// ── Bootstrap ──────────────────────────────────────────────
// [Part 1: The App Boot Process]
if (localStorage.getItem('ebv_spending_limit')) {
  limitInput.value = localStorage.getItem('ebv_spending_limit');
}

// [Part 2: The Live Activity Tracker]
limitInput.addEventListener('input', () => {
  const value = limitInput.value.trim();

  if (value === '' || parseFloat(value) < 0) {
    localStorage.removeItem('ebv_spending_limit');
  } else {
    localStorage.setItem('ebv_spending_limit', value);
  }
  render(); 
});

populateCategorySelect();
renderCatChips();
render();
