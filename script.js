/* =========================================================
   Ledger — Expense Tracker
   Vanilla JS application logic
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "ledger_transactions";

  /* ---------------- DOM references ---------------- */
  const el = {
    todayDate: document.getElementById("todayDate"),

    openAddBtn: document.getElementById("openAddBtn"),
    emptyAddBtn: document.getElementById("emptyAddBtn"),

    statBalance: document.getElementById("statBalance"),
    statIncome: document.getElementById("statIncome"),
    statExpense: document.getElementById("statExpense"),
    statCount: document.getElementById("statCount"),

    searchInput: document.getElementById("searchInput"),
    filterType: document.getElementById("filterType"),
    filterCategory: document.getElementById("filterCategory"),
    filterDate: document.getElementById("filterDate"),
    sortBy: document.getElementById("sortBy"),

    txList: document.getElementById("txList"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyBody: document.getElementById("emptyBody"),

    breakdownList: document.getElementById("breakdownList"),
    breakdownEmpty: document.getElementById("breakdownEmpty"),

    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),

    // Add/Edit modal
    txModalOverlay: document.getElementById("txModalOverlay"),
    txModalTitle: document.getElementById("txModalTitle"),
    txModalClose: document.getElementById("txModalClose"),
    txForm: document.getElementById("txForm"),
    editId: document.getElementById("editId"),
    description: document.getElementById("description"),
    amount: document.getElementById("amount"),
    date: document.getElementById("date"),
    category: document.getElementById("category"),
    note: document.getElementById("note"),
    typeToggle: document.getElementById("typeToggle"),
    submitBtn: document.getElementById("submitBtn"),
    cancelFormBtn: document.getElementById("cancelFormBtn"),

    // Confirm modal
    confirmModal: document.getElementById("confirmModal"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalConfirm: document.getElementById("modalConfirm"),
    modalCancel: document.getElementById("modalCancel"),

    clearAllBtn: document.getElementById("clearAllBtn"),
  };

  /* ---------------- State ---------------- */
  let transactions = [];
  let selectedType = "";
  let pendingDeleteId = null;
  let pendingClearAll = false;
  let toastTimer = null;
  let lastFocusedEl = null;

  /* ============================================================
     Storage
     ============================================================ */
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      transactions = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Failed to parse stored transactions:", error);
      transactions = [];
    }
  }

  function saveTransactions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch (error) {
      console.error("Failed to save transactions:", error);
      showMessage("Couldn't save your changes. Storage may be full.", true);
    }
  }

  /* ============================================================
     Calculations
     ============================================================ */
  function calculateIncome(list) {
    return list.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  }
  function calculateExpenses(list) {
    return list.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  }
  function calculateBalance(list) {
    return calculateIncome(list) - calculateExpenses(list);
  }
  function calculateCategoryExpenses(list) {
    const totals = {};
    list.filter(t => t.type === "expense").forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return totals;
  }
  function calculateSummary() {
    const income = calculateIncome(transactions);
    const expense = calculateExpenses(transactions);
    return { income, expense, balance: income - expense, count: transactions.length };
  }

  /* ============================================================
     Formatting
     ============================================================ */
  function formatCurrency(amount) {
    const rounded = Math.round(amount * 100) / 100;
    return "Rs. " + rounded.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function todayISO() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
  }
  function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  /* ============================================================
     Validation
     ============================================================ */
  const FIELDS = ["description", "amount", "date", "type", "category"];
  const DEFAULT_HELP = {
    description: "Enter a short description for this entry.",
    amount: "Enter an amount greater than 0.",
    date: "Select the date this occurred.",
    type: "Choose whether this is income or an expense.",
    category: "Pick the closest matching category.",
  };

  function clearErrors() {
    FIELDS.forEach(field => {
      const helpEl = document.getElementById("err-" + field);
      if (!helpEl) return;
      helpEl.textContent = DEFAULT_HELP[field];
      const wrap = helpEl.closest(".field");
      if (wrap) wrap.classList.remove("has-error");
    });
  }

  function setError(field, message) {
    const helpEl = document.getElementById("err-" + field);
    if (!helpEl) return;
    helpEl.textContent = message;
    const wrap = helpEl.closest(".field");
    if (wrap) wrap.classList.add("has-error");
  }

  function validateForm(data) {
    clearErrors();
    let valid = true;

    if (!data.description) {
      setError("description", "Description is required.");
      valid = false;
    }

    if (data.amountRaw === "" || data.amountRaw === null) {
      setError("amount", "Amount is required.");
      valid = false;
    } else if (isNaN(data.amount)) {
      setError("amount", "Please enter a valid amount.");
      valid = false;
    } else if (data.amount <= 0) {
      setError("amount", "Please enter an amount greater than 0.");
      valid = false;
    }

    if (!data.type) {
      setError("type", "Please select income or expense.");
      valid = false;
    }

    if (!data.category) {
      setError("category", "Please select a category.");
      valid = false;
    }

    if (!data.date || isNaN(new Date(data.date).getTime())) {
      setError("date", "Please select a valid date.");
      valid = false;
    }

    return valid;
  }

  /* ============================================================
     Form / modal helpers
     ============================================================ */
  function setType(type) {
    selectedType = type;
    Array.from(el.typeToggle.querySelectorAll(".type-btn")).forEach(btn => {
      const active = btn.dataset.type === type;
      btn.setAttribute("aria-checked", String(active));
    });
  }

  function resetForm() {
    el.txForm.reset();
    el.editId.value = "";
    setType("");
    el.date.value = todayISO();
    clearErrors();
    el.txModalTitle.textContent = "Add transaction";
    el.submitBtn.textContent = "Add transaction";
  }

  function openTxModal(tx) {
    lastFocusedEl = document.activeElement;
    resetForm();
    if (tx) {
      el.editId.value = tx.id;
      el.description.value = tx.description;
      el.amount.value = tx.amount;
      el.date.value = tx.date;
      el.category.value = tx.category;
      el.note.value = tx.note || "";
      setType(tx.type);
      el.txModalTitle.textContent = "Edit transaction";
      el.submitBtn.textContent = "Save changes";
    }
    el.txModalOverlay.hidden = false;
    el.description.focus();
    document.addEventListener("keydown", onModalKeydown);
  }

  function closeTxModal() {
    el.txModalOverlay.hidden = true;
    document.removeEventListener("keydown", onModalKeydown);
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") {
      if (!el.confirmModal.hidden) {
        closeConfirmModal();
      } else if (!el.txModalOverlay.hidden) {
        closeTxModal();
      }
    }
  }

  /* ============================================================
     CRUD
     ============================================================ */
  function addTransaction(tx) {
    transactions.push(tx);
    saveTransactions();
  }
  function updateTransaction(id, updates) {
    const idx = transactions.findIndex(t => t.id === id);
    if (idx === -1) return;
    transactions[idx] = Object.assign({}, transactions[idx], updates);
    saveTransactions();
  }
  function deleteTransaction(id) {
    transactions = transactions.filter(t => t.id !== id);
    saveTransactions();
  }
  function clearAllTransactions() {
    transactions = [];
    saveTransactions();
  }

  /* ============================================================
     Filtering / searching / sorting
     ============================================================ */
  function searchTransactions(list, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(t =>
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      (t.note && t.note.toLowerCase().includes(q))
    );
  }

  function isWithinRange(dateStr, range) {
    const d = new Date(dateStr + "T00:00:00");
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (range === "today") return d.getTime() === startOfToday.getTime();

    if (range === "week") {
      const day = startOfToday.getDay();
      const diffToMonday = (day === 0 ? 6 : day - 1);
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfToday.getDate() - diffToMonday);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return d >= startOfWeek && d <= endOfWeek;
    }
    if (range === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    return true;
  }

  function filterTransactions(list, filters) {
    return list.filter(t => {
      if (filters.type !== "all" && t.type !== filters.type) return false;
      if (filters.category !== "all" && t.category !== filters.category) return false;
      if (filters.date !== "all" && !isWithinRange(t.date, filters.date)) return false;
      return true;
    });
  }

  function sortTransactions(list, sortKey) {
    const sorted = [...list];
    switch (sortKey) {
      case "oldest": sorted.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id); break;
      case "highest": sorted.sort((a, b) => b.amount - a.amount); break;
      case "lowest": sorted.sort((a, b) => a.amount - b.amount); break;
      default: sorted.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id); break;
    }
    return sorted;
  }

  function getVisibleTransactions() {
    const filters = {
      type: el.filterType.value,
      category: el.filterCategory.value,
      date: el.filterDate.value,
    };
    let result = searchTransactions(transactions, el.searchInput.value);
    result = filterTransactions(result, filters);
    result = sortTransactions(result, el.sortBy.value);
    return result;
  }

  /* ============================================================
     Rendering
     ============================================================ */
  function renderStatistics() {
    const s = calculateSummary();
    el.statBalance.textContent = formatCurrency(s.balance);
    el.statIncome.textContent = formatCurrency(s.income);
    el.statExpense.textContent = formatCurrency(s.expense);
    el.statCount.textContent = String(s.count);
  }

  function buildTxRow(tx) {
    const tr = document.createElement("tr");
    tr.dataset.id = String(tx.id);

    const tdDesc = document.createElement("td");
    tdDesc.className = "cell-desc";
    const descMain = document.createElement("span");
    descMain.className = "tx-desc";
    descMain.textContent = tx.description;
    tdDesc.appendChild(descMain);
    if (tx.note) {
      const noteEl = document.createElement("span");
      noteEl.className = "tx-note";
      noteEl.textContent = tx.note;
      tdDesc.appendChild(noteEl);
    }

    const tdCategory = document.createElement("td");
    tdCategory.className = "tx-category cell-category";
    tdCategory.textContent = tx.category;

    const tdDate = document.createElement("td");
    tdDate.className = "tx-date cell-date";
    tdDate.textContent = formatDate(tx.date);

    const tdAmount = document.createElement("td");
    tdAmount.className = "col-amount tx-amount-cell";
    const amountSpan = document.createElement("span");
    amountSpan.className = "tx-amount " + tx.type;
    amountSpan.textContent = (tx.type === "income" ? "+ " : "- ") + formatCurrency(tx.amount);
    const tag = document.createElement("span");
    tag.className = "tx-type-tag " + tx.type;
    tag.textContent = tx.type;
    tdAmount.appendChild(amountSpan);
    tdAmount.appendChild(tag);

    const tdActions = document.createElement("td");
    tdActions.className = "col-actions";
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "tx-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.dataset.action = "edit";
    editBtn.setAttribute("aria-label", "Edit " + tx.description);
    editBtn.innerHTML = '<svg viewBox="0 0 16 16" class="icon" aria-hidden="true"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.5 12.3l-3 .8.8-3z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/></svg>';

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.dataset.action = "delete";
    delBtn.setAttribute("aria-label", "Delete " + tx.description);
    delBtn.innerHTML = '<svg viewBox="0 0 16 16" class="icon" aria-hidden="true"><path d="M3.5 4.5h9M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    actionsWrap.appendChild(editBtn);
    actionsWrap.appendChild(delBtn);
    tdActions.appendChild(actionsWrap);

    tr.appendChild(tdDesc);
    tr.appendChild(tdCategory);
    tr.appendChild(tdDate);
    tr.appendChild(tdAmount);
    tr.appendChild(tdActions);

    return tr;
  }

  function renderTransactions() {
    const visible = getVisibleTransactions();
    el.txList.innerHTML = "";

    if (transactions.length === 0) {
      el.emptyTitle.textContent = "No transactions yet";
      el.emptyBody.textContent = "Start tracking your income and expenses by adding your first transaction.";
      el.emptyAddBtn.hidden = false;
      el.emptyState.hidden = false;
      el.txList.closest(".table-wrap").hidden = true;
      return;
    }

    if (visible.length === 0) {
      el.emptyTitle.textContent = "No matching transactions";
      el.emptyBody.textContent = "Try adjusting your search or filters to find what you're looking for.";
      el.emptyAddBtn.hidden = true;
      el.emptyState.hidden = false;
      el.txList.closest(".table-wrap").hidden = true;
      return;
    }

    el.emptyState.hidden = true;
    el.txList.closest(".table-wrap").hidden = false;

    const fragment = document.createDocumentFragment();
    visible.forEach(tx => fragment.appendChild(buildTxRow(tx)));
    el.txList.appendChild(fragment);
  }

  function renderBreakdown() {
    const totals = calculateCategoryExpenses(transactions);
    const totalExpense = calculateExpenses(transactions);
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    el.breakdownList.innerHTML = "";

    if (entries.length === 0) {
      el.breakdownEmpty.hidden = false;
      return;
    }
    el.breakdownEmpty.hidden = true;

    entries.forEach(([category, amount]) => {
      const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;

      const row = document.createElement("div");
      row.className = "breakdown-row";

      const top = document.createElement("div");
      top.className = "breakdown-top";
      const name = document.createElement("span");
      name.className = "breakdown-name";
      name.textContent = category;
      const amt = document.createElement("span");
      amt.className = "breakdown-amt";
      amt.textContent = formatCurrency(amount);
      top.appendChild(name);
      top.appendChild(amt);

      const track = document.createElement("div");
      track.className = "breakdown-bar-track";
      const fill = document.createElement("div");
      fill.className = "breakdown-bar-fill";
      fill.style.width = pct.toFixed(1) + "%";
      track.appendChild(fill);

      const pctLabel = document.createElement("div");
      pctLabel.className = "breakdown-pct";
      pctLabel.textContent = pct.toFixed(1) + "% of total expenses";

      row.appendChild(top);
      row.appendChild(track);
      row.appendChild(pctLabel);
      el.breakdownList.appendChild(row);
    });
  }

  function renderAll() {
    renderTransactions();
    renderStatistics();
    renderBreakdown();
  }

  /* ============================================================
     Toast
     ============================================================ */
  function showMessage(message, isError) {
    clearTimeout(toastTimer);
    el.toastMessage.textContent = message;
    el.toast.classList.toggle("is-error", !!isError);
    el.toast.hidden = false;
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2800);
  }

  /* ============================================================
     Confirm modal
     ============================================================ */
  function openConfirmModal(title, body) {
    lastFocusedEl = document.activeElement;
    el.modalTitle.textContent = title;
    el.modalBody.textContent = body;
    el.confirmModal.hidden = false;
    el.modalCancel.focus();
    document.addEventListener("keydown", onModalKeydown);
  }
  function closeConfirmModal() {
    el.confirmModal.hidden = true;
    pendingDeleteId = null;
    pendingClearAll = false;
    document.removeEventListener("keydown", onModalKeydown);
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  /* ============================================================
     Event wiring
     ============================================================ */
  el.openAddBtn.addEventListener("click", () => openTxModal(null));
  el.emptyAddBtn.addEventListener("click", () => openTxModal(null));
  el.txModalClose.addEventListener("click", closeTxModal);
  el.cancelFormBtn.addEventListener("click", closeTxModal);
  el.txModalOverlay.addEventListener("click", (e) => {
    if (e.target === el.txModalOverlay) closeTxModal();
  });

  el.typeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if (!btn) return;
    setType(btn.dataset.type);
  });

  el.txForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const amountRaw = el.amount.value.trim();
    const data = {
      description: el.description.value.trim(),
      amountRaw: amountRaw,
      amount: parseFloat(amountRaw),
      type: selectedType,
      category: el.category.value,
      date: el.date.value,
      note: el.note.value.trim(),
    };

    if (!validateForm(data)) return;

    const editingId = el.editId.value ? Number(el.editId.value) : null;

    if (editingId) {
      updateTransaction(editingId, {
        description: data.description,
        amount: data.amount,
        type: data.type,
        category: data.category,
        date: data.date,
        note: data.note,
      });
      showMessage("Transaction updated successfully.");
    } else {
      addTransaction({
        id: generateId(),
        description: data.description,
        amount: data.amount,
        type: data.type,
        category: data.category,
        date: data.date,
        note: data.note,
      });
      showMessage("Transaction added successfully.");
    }

    closeTxModal();
    renderAll();
  });

  // Event delegation for edit / delete buttons
  el.txList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const id = Number(row.dataset.id);
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    if (btn.dataset.action === "edit") {
      openTxModal(tx);
    } else if (btn.dataset.action === "delete") {
      pendingDeleteId = id;
      openConfirmModal("Delete transaction?", "This will permanently remove \u201c" + tx.description + "\u201d. This action cannot be undone.");
    }
  });

  el.modalCancel.addEventListener("click", closeConfirmModal);
  el.confirmModal.addEventListener("click", (e) => {
    if (e.target === el.confirmModal) closeConfirmModal();
  });
  el.modalConfirm.addEventListener("click", () => {
    if (pendingDeleteId !== null) {
      deleteTransaction(pendingDeleteId);
      renderAll();
      showMessage("Transaction deleted.");
    } else if (pendingClearAll) {
      clearAllTransactions();
      renderAll();
      showMessage("All transactions cleared.");
    }
    closeConfirmModal();
  });

  el.clearAllBtn.addEventListener("click", () => {
    if (transactions.length === 0) {
      showMessage("There are no transactions to clear.");
      return;
    }
    pendingClearAll = true;
    openConfirmModal("Delete all transactions?", "This will permanently remove all " + transactions.length + " transactions. This action cannot be undone.");
  });

  [el.searchInput].forEach(input => input.addEventListener("input", renderTransactions));
  [el.filterType, el.filterCategory, el.filterDate, el.sortBy].forEach(sel =>
    sel.addEventListener("change", renderTransactions)
  );

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    el.todayDate.textContent = new Date().toLocaleDateString("en-GB", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    loadTransactions();
    renderAll();
  }

  init();
})();
