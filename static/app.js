// ===== State =====
let currentDate = new Date();
let tasks = [];
let selectedCategory = 'other';
let editingTaskId = null;
let activeFilter = 'all';

// ===== DOM Elements =====
const elements = {
    currentDate: document.getElementById('currentDate'),
    prevDay: document.getElementById('prevDay'),
    nextDay: document.getElementById('nextDay'),
    todayBtn: document.getElementById('todayBtn'),
    timeSlots: document.getElementById('timeSlots'),
    scheduleGrid: document.getElementById('scheduleGrid'),
    taskList: document.getElementById('taskList'),
    currentTimeLine: document.getElementById('currentTimeLine'),
    completedCount: document.getElementById('completedCount'),
    remainingCount: document.getElementById('remainingCount'),
    modalOverlay: document.getElementById('modalOverlay'),
    taskModal: document.getElementById('taskModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalClose: document.getElementById('modalClose'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    taskForm: document.getElementById('taskForm'),
    taskId: document.getElementById('taskId'),
    taskTitleInput: document.getElementById('taskTitleInput'),
    taskDescription: document.getElementById('taskDescription'),
    taskDate: document.getElementById('taskDate'),
    taskTime: document.getElementById('taskTime'),
    taskDuration: document.getElementById('taskDuration'),
    taskPriority: document.getElementById('taskPriority'),
    categorySelector: document.getElementById('categorySelector'),
    categoryFilter: document.getElementById('categoryFilter'),
    deleteTaskBtn: document.getElementById('deleteTaskBtn'),
    smartInput: document.getElementById('smartInput'),
    smartInputBtn: document.getElementById('smartInputBtn'),
    aiToast: document.getElementById('aiToast')
};

// ===== Utilities =====
function formatDate(date) {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatDateISO(date) {
    return date.toISOString().split('T')[0];
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function showToast(message) {
    const toast = elements.aiToast;
    toast.querySelector('.ai-toast-text').textContent = message;
    toast.classList.add('active');
}

function hideToast() {
    elements.aiToast.classList.remove('active');
}

// ===== API Functions =====
async function fetchTasks() {
    try {
        const response = await fetch(`/api/tasks?date=${formatDateISO(currentDate)}`);
        tasks = await response.json();
        renderTasks();
        renderSchedule();
        updateStats();
    } catch (error) {
        console.error('Error fetching tasks:', error);
    }
}

async function parseTaskWithAI(input) {
    try {
        showToast('AI is parsing your task...');
        const response = await fetch('/api/tasks/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: input,
                reference_date: formatDateISO(currentDate)
            })
        });
        const parsed = await response.json();
        hideToast();
        return parsed;
    } catch (error) {
        console.error('Error parsing task:', error);
        hideToast();
        return null;
    }
}

async function createTask(taskData) {
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        const newTask = await response.json();
        
        // If task is for current date, refresh and scroll to the task
        if (newTask.date === formatDateISO(currentDate)) {
            // Refresh tasks from server to ensure consistency
            await fetchTasks();
            
            // Scroll to the task time if it has a time slot
            if (newTask.time_slot) {
                const minutes = parseTimeToMinutes(newTask.time_slot);
                const container = document.querySelector('.schedule-container');
                // Scroll to show the task with some padding above
                container.scrollTo({
                    top: Math.max(0, minutes - 100),
                    behavior: 'smooth'
                });
            }
        } else {
            // Show notification that task was added to different date
            const taskDate = new Date(newTask.date + 'T00:00:00');
            showToast(`✅ Task added to ${taskDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
            setTimeout(hideToast, 3000);
        }
        
        return newTask;
    } catch (error) {
        console.error('Error creating task:', error);
    }
}

async function updateTask(taskId, taskData) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        const updatedTask = await response.json();
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            tasks[index] = updatedTask;
        }
        renderTasks();
        renderSchedule();
        updateStats();
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

async function deleteTask(taskId) {
    try {
        await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        tasks = tasks.filter(t => t.id !== taskId);
        renderTasks();
        renderSchedule();
        updateStats();
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

async function toggleTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/toggle`, { method: 'POST' });
        const updatedTask = await response.json();
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            tasks[index] = updatedTask;
        }
        renderTasks();
        renderSchedule();
        updateStats();
    } catch (error) {
        console.error('Error toggling task:', error);
    }
}

// ===== Render Functions =====
function renderTimeSlots() {
    elements.timeSlots.innerHTML = '';
    for (let i = 0; i < 24; i++) {
        const hour = i % 12 || 12;
        const ampm = i < 12 ? 'AM' : 'PM';
        const slot = document.createElement('div');
        slot.className = 'time-slot';
        slot.textContent = `${hour} ${ampm}`;
        elements.timeSlots.appendChild(slot);
    }
}

function renderSchedule() {
    elements.scheduleGrid.innerHTML = '';
    
    // Add hour lines
    for (let i = 0; i < 24; i++) {
        const line = document.createElement('div');
        line.className = 'hour-line';
        line.style.top = `${i * 60}px`;
        elements.scheduleGrid.appendChild(line);
    }
    
    // Add task cards (filter by active category if not 'all')
    const filteredTasks = activeFilter === 'all' 
        ? tasks 
        : tasks.filter(t => t.category === activeFilter);
    
    filteredTasks.forEach(task => {
        if (task.time_slot) {
            const card = createTaskCard(task);
            elements.scheduleGrid.appendChild(card);
        }
    });
    
    updateCurrentTimeLine();
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.completed ? 'completed' : ''}`;
    card.style.setProperty('--task-color', task.color);
    
    const topPosition = parseTimeToMinutes(task.time_slot);
    const height = Math.max(task.duration, 30);
    
    card.style.top = `${topPosition}px`;
    card.style.height = `${height}px`;
    
    card.innerHTML = `
        <div class="task-card-header">
            <span class="task-card-category">${task.category_icon || '📌'}</span>
            <span class="task-card-time">${formatTime(task.time_slot)}</span>
        </div>
        <div class="task-card-title">${task.title}</div>
        ${task.description ? `<div class="task-card-desc">${task.description}</div>` : ''}
    `;
    
    card.addEventListener('click', () => openEditModal(task));
    
    return card;
}

function renderCategoryFilter() {
    // Get unique categories from tasks
    const usedCategories = [...new Set(tasks.map(t => t.category))];
    
    let html = '<button class="category-chip active" data-category="all">All</button>';
    
    usedCategories.forEach(cat => {
        const catInfo = CATEGORIES[cat] || CATEGORIES.other;
        html += `
            <button class="category-chip" data-category="${cat}">
                <span class="category-chip-icon">${catInfo.icon}</span>
                ${catInfo.label}
            </button>
        `;
    });
    
    elements.categoryFilter.innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeFilter = chip.dataset.category;
            renderTasks();
            renderSchedule();
        });
    });
}

function renderCategorySelector() {
    let html = '';
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
        html += `
            <button type="button" class="category-option ${selectedCategory === key ? 'selected' : ''}" 
                    data-category="${key}" style="--cat-color: ${cat.color}">
                <span class="category-option-icon">${cat.icon}</span>
                ${cat.label}
            </button>
        `;
    });
    elements.categorySelector.innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('.category-option').forEach(opt => {
        opt.addEventListener('click', () => {
            selectedCategory = opt.dataset.category;
            document.querySelectorAll('.category-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
}

function renderTasks() {
    // Filter tasks by active category
    const filteredTasks = activeFilter === 'all' 
        ? tasks 
        : tasks.filter(t => t.category === activeFilter);
    
    renderCategoryFilter();
    
    if (filteredTasks.length === 0) {
        elements.taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✨</div>
                <div class="empty-state-text">
                    ${tasks.length === 0 
                        ? 'No tasks for this day.<br>Use the AI input above to add one!' 
                        : 'No tasks in this category.'}
                </div>
            </div>
        `;
        return;
    }
    
    elements.taskList.innerHTML = filteredTasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
            <div class="task-color-bar" style="background: ${task.color}"></div>
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-id="${task.id}"></div>
            <div class="task-content" data-id="${task.id}">
                <div class="task-category-badge">
                    <span>${task.category_icon || '📌'}</span>
                    <span>${task.category_label || 'Other'}</span>
                </div>
                <div class="task-title">${task.title}</div>
                ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                <div class="task-meta">
                    ${task.time_slot ? `<span class="task-time-badge">⏰ ${formatTime(task.time_slot)}</span>` : ''}
                    <span class="priority-dot ${task.priority}"></span>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.task-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = parseInt(checkbox.dataset.id);
            toggleTask(taskId);
        });
    });
    
    document.querySelectorAll('.task-content').forEach(content => {
        content.addEventListener('click', () => {
            const taskId = parseInt(content.dataset.id);
            const task = tasks.find(t => t.id === taskId);
            if (task) openEditModal(task);
        });
    });
}

function updateStats() {
    const completed = tasks.filter(t => t.completed).length;
    const remaining = tasks.filter(t => !t.completed).length;
    elements.completedCount.textContent = completed;
    elements.remainingCount.textContent = remaining;
}

function updateCurrentTimeLine() {
    const now = new Date();
    const isToday = formatDateISO(currentDate) === formatDateISO(now);
    
    if (isToday) {
        const minutes = now.getHours() * 60 + now.getMinutes();
        elements.currentTimeLine.style.top = `${minutes}px`;
        elements.currentTimeLine.style.display = 'block';
        
        const container = document.querySelector('.schedule-container');
        if (container.scrollTop === 0) {
            container.scrollTop = Math.max(0, minutes - 200);
        }
    } else {
        elements.currentTimeLine.style.display = 'none';
    }
}

function updateDateDisplay() {
    elements.currentDate.textContent = formatDate(currentDate);
}

// ===== Modal Functions =====
function openModal() {
    elements.modalOverlay.classList.add('active');
    setTimeout(() => elements.taskTitleInput.focus(), 100);
}

function closeModal() {
    elements.modalOverlay.classList.remove('active');
    resetForm();
}

function resetForm() {
    elements.taskForm.reset();
    elements.taskId.value = '';
    editingTaskId = null;
    selectedCategory = 'other';
    elements.modalTitle.textContent = 'New Task';
    elements.deleteTaskBtn.style.display = 'none';
    elements.taskDate.value = formatDateISO(currentDate);
    renderCategorySelector();
}

function openEditModal(task) {
    editingTaskId = task.id;
    elements.modalTitle.textContent = 'Edit Task';
    elements.taskId.value = task.id;
    elements.taskTitleInput.value = task.title;
    elements.taskDescription.value = task.description || '';
    elements.taskDate.value = task.date;
    elements.taskTime.value = task.time_slot || '';
    elements.taskDuration.value = task.duration;
    elements.taskPriority.value = task.priority;
    selectedCategory = task.category || 'other';
    elements.deleteTaskBtn.style.display = 'block';
    
    renderCategorySelector();
    openModal();
}

// ===== Smart Input Handler =====
async function handleSmartInput() {
    const input = elements.smartInput.value.trim();
    if (!input) return;
    
    const btn = elements.smartInputBtn;
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    
    // Show loading state
    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    
    try {
        // Parse with AI
        const parsed = await parseTaskWithAI(input);
        
        if (parsed) {
            // Create task with parsed data
            await createTask({
                title: parsed.title,
                description: parsed.description || '',
                date: parsed.date,
                time_slot: parsed.time_slot,
                duration: parsed.duration || 60,
                priority: parsed.priority || 'medium',
                category: parsed.category || 'other',
                original_input: input
            });
            
            // Clear input
            elements.smartInput.value = '';
            
            // If task is for a different date, offer to navigate there
            if (parsed.date !== formatDateISO(currentDate)) {
                const taskDate = new Date(parsed.date + 'T00:00:00');
                const dateStr = taskDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                showToast(`✅ Task added to ${dateStr}`);
                setTimeout(hideToast, 3000);
            }
        }
    } catch (error) {
        console.error('Error processing smart input:', error);
        showToast('Error processing task. Please try again.');
        setTimeout(hideToast, 3000);
    } finally {
        // Reset button state
        btn.disabled = false;
        btnText.style.display = 'block';
        btnLoading.style.display = 'none';
    }
}

// ===== Event Handlers =====
function setupEventListeners() {
    // Navigation
    elements.prevDay.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        updateDateDisplay();
        fetchTasks();
    });
    
    elements.nextDay.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        updateDateDisplay();
        fetchTasks();
    });
    
    elements.todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        updateDateDisplay();
        fetchTasks();
    });
    
    // Smart Input
    elements.smartInputBtn.addEventListener('click', handleSmartInput);
    elements.smartInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSmartInput();
        }
    });
    
    // Modal
    elements.addTaskBtn.addEventListener('click', () => {
        resetForm();
        openModal();
    });
    
    elements.modalClose.addEventListener('click', closeModal);
    
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) closeModal();
    });
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
    
    // Form submission
    elements.taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const taskData = {
            title: elements.taskTitleInput.value.trim(),
            description: elements.taskDescription.value.trim(),
            date: elements.taskDate.value || formatDateISO(currentDate),
            time_slot: elements.taskTime.value || null,
            duration: parseInt(elements.taskDuration.value),
            priority: elements.taskPriority.value,
            category: selectedCategory
        };
        
        if (editingTaskId) {
            await updateTask(editingTaskId, taskData);
        } else {
            await createTask(taskData);
        }
        
        closeModal();
    });
    
    // Delete button
    elements.deleteTaskBtn.addEventListener('click', async () => {
        if (editingTaskId && confirm('Delete this task?')) {
            await deleteTask(editingTaskId);
            closeModal();
        }
    });
}

// ===== User Menu =====
function setupUserMenu() {
    const userBtn = document.getElementById('userBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    
    if (userBtn && dropdownMenu) {
        userBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('active');
        });
        
        document.addEventListener('click', () => {
            dropdownMenu.classList.remove('active');
        });
    }
}

// ===== Initialization =====
function init() {
    updateDateDisplay();
    renderTimeSlots();
    renderCategorySelector();
    setupEventListeners();
    setupUserMenu();
    fetchTasks();
    
    // Set default date in form
    elements.taskDate.value = formatDateISO(currentDate);
    
    // Update current time line every minute
    setInterval(updateCurrentTimeLine, 60000);
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
