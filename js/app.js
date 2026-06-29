/**
 * app.js
 * HealthFlow 메인 애플리케이션 로직
 * window.HealthFlowApp 네임스페이스로 노출한다.
 * storage.js / planner.js / charts.js 가 먼저 로드되어 있어야 한다.
 */

(function (global) {
  'use strict';

  const Storage = global.HealthFlowStorage || global.Storage;
  const Planner = global.HealthFlowPlanner || global.Planner;
  const Charts = global.HealthFlowCharts;

  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const PAGES = ['onboarding', 'dashboard', 'exercise', 'diet', 'calendar', 'tracker'];
  const TOTAL_STEPS = 6;

  // ---------------------------------------------------------------------
  // 내부 상태
  // ---------------------------------------------------------------------
  const state = {
    currentStep: 1,
    currentPage: 'onboarding',
    selectedGoals: [],
    conditionTags: [],
    allergyTags: [],
    selectedTimes: [],
    selectedExercises: [],
    selectedEnv: null,
    exerciseDay: '월',
    dietDay: '월',
    starRating: 0
  };

  // ---------------------------------------------------------------------
  // 유틸
  // ---------------------------------------------------------------------

  function todayDayLabel() {
    // JS getDay(): 0=일 ... 6=토 → DAYS 배열(월~일) 인덱스로 변환
    const jsDay = new Date().getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    return DAYS[idx];
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  // ---------------------------------------------------------------------
  // 토스트 알림
  // ---------------------------------------------------------------------

  /**
   * 토스트 메시지를 화면 하단에 표시한다.
   * @param {string} message
   * @param {string} type - 'success' | 'error' | 'info'
   */
  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type || 'info'}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast--hide');
      setTimeout(() => toast.remove(), 300);
    }, 2400);
  }

  // ---------------------------------------------------------------------
  // 다크모드
  // ---------------------------------------------------------------------

  function initTheme() {
    const settings = Storage.getSettings ? Storage.getSettings() : {};
    const saved = settings.theme;
    const prefersDark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (Storage.saveSettings) Storage.saveSettings({ theme });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // ---------------------------------------------------------------------
  // 라우터
  // ---------------------------------------------------------------------

  function getRouteFromHash() {
    const hash = global.location.hash.replace('#', '').trim();
    return PAGES.includes(hash) ? hash : null;
  }

  function resolveInitialRoute() {
    const hasProfile = Storage.hasProfile ? Storage.hasProfile() : !!Storage.getProfile();
    const route = getRouteFromHash();

    if (!hasProfile) {
      navigateTo('onboarding');
      return;
    }
    navigateTo(route || 'dashboard');
  }

  /**
   * 지정한 페이지로 전환한다. 페이지 표시/숨김, 네비 활성화, 콘텐츠 렌더를 모두 처리한다.
   * @param {string} page
   */
  function navigateTo(page) {
    if (!PAGES.includes(page)) page = 'dashboard';

    // 프로필 없이 다른 페이지 접근 시 온보딩으로 강제
    const hasProfile = Storage.hasProfile ? Storage.hasProfile() : !!Storage.getProfile();
    if (!hasProfile && page !== 'onboarding') {
      page = 'onboarding';
    }

    state.currentPage = page;
    if (global.location.hash.replace('#', '') !== page) {
      global.location.hash = page;
    }

    qsa('.page').forEach((el) => {
      el.hidden = el.dataset.page !== page;
    });

    qsa('[data-nav]').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === page);
    });

    renderPage(page);
    global.scrollTo(0, 0);
  }

  function renderPage(page) {
    switch (page) {
      case 'onboarding':
        renderOnboardingEntry();
        break;
      case 'dashboard':
        renderDashboard();
        break;
      case 'exercise':
        renderExercisePage();
        break;
      case 'diet':
        renderDietPage();
        break;
      case 'calendar':
        renderCalendarPage();
        break;
      case 'tracker':
        renderTrackerPage();
        break;
      default:
        break;
    }
  }

  function renderOnboardingEntry() {
    const hasProfile = Storage.hasProfile ? Storage.hasProfile() : !!Storage.getProfile();
    const welcome = document.getElementById('onboarding-welcome');
    const form = document.getElementById('onboarding-form');
    if (!welcome || !form) return;

    if (hasProfile) {
      // 이미 프로파일이 있는데 온보딩으로 진입한 경우 (설정에서 "다시 입력" 등) → 바로 폼부터
      welcome.hidden = true;
      form.hidden = false;
    } else {
      welcome.hidden = false;
      form.hidden = true;
    }
  }

  // ---------------------------------------------------------------------
  // 온보딩 스텝퍼 로직
  // ---------------------------------------------------------------------

  function showStep(n) {
    state.currentStep = n;

    qsa('.onboarding-step').forEach((panel) => {
      panel.classList.toggle('active', Number(panel.dataset.stepPanel) === n);
    });

    qsa('.stepper__step').forEach((stepEl) => {
      const stepNum = Number(stepEl.dataset.step);
      stepEl.classList.remove('active', 'completed');
      if (stepNum < n) stepEl.classList.add('completed');
      if (stepNum === n) stepEl.classList.add('active');
    });

    const progressPct = Math.round((n / TOTAL_STEPS) * 100);
    const progressFill = document.getElementById('onboarding-progress');
    if (progressFill) progressFill.style.width = `${progressPct}%`;

    const prevBtn = document.getElementById('btn-prev-step');
    const nextBtn = document.getElementById('btn-next-step');
    const generateBtn = document.getElementById('btn-generate-plan');

    if (prevBtn) prevBtn.disabled = n === 1;
    if (n === TOTAL_STEPS) {
      if (nextBtn) nextBtn.hidden = true;
      if (generateBtn) generateBtn.hidden = false;
    } else {
      if (nextBtn) nextBtn.hidden = false;
      if (generateBtn) generateBtn.hidden = true;
    }
  }

  /**
   * 현재 단계의 필수 입력값을 검증한다.
   * @param {number} step
   * @returns {boolean}
   */
  function validateStep(step) {
    clearStepErrors(step);

    if (step === 1) {
      const age = qs('#input-age').value;
      const gender = qs('#input-gender').value;
      const height = qs('#input-height').value;
      const weight = qs('#input-weight').value;

      let valid = true;
      if (!age || Number(age) <= 0) {
        setError('error-age', '나이를 입력해주세요.');
        valid = false;
      }
      if (!gender) {
        setError('error-gender', '성별을 선택해주세요.');
        valid = false;
      }
      if (!height || Number(height) <= 0) {
        setError('error-height', '키를 입력해주세요.');
        valid = false;
      }
      if (!weight || Number(weight) <= 0) {
        setError('error-weight', '몸무게를 입력해주세요.');
        valid = false;
      }
      return valid;
    }

    if (step === 2) {
      if (state.selectedGoals.length === 0) {
        setError('error-goals', '하나 이상의 건강 목표를 선택해주세요.');
        return false;
      }
      return true;
    }

    // Step 3~6은 선택 입력이 많아 필수 검증 생략 (자유 입력 허용)
    return true;
  }

  function setError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
  }

  function clearStepErrors(step) {
    if (step === 1) {
      ['error-age', 'error-gender', 'error-height', 'error-weight'].forEach((id) => setError(id, ''));
    }
    if (step === 2) {
      setError('error-goals', '');
    }
  }

  function nextStep() {
    if (!validateStep(state.currentStep)) {
      showToast('필수 항목을 확인해주세요.', 'error');
      return;
    }
    if (state.currentStep < TOTAL_STEPS) {
      showStep(state.currentStep + 1);
    }
  }

  function prevStep() {
    if (state.currentStep > 1) {
      showStep(state.currentStep - 1);
    }
  }

  // ---------------------------------------------------------------------
  // 온보딩 입력 위젯 (목표카드, 태그, 칩, 환경카드)
  // ---------------------------------------------------------------------

  function bindGoalCards() {
    qsa('.goal-card').forEach((card) => {
      card.addEventListener('click', () => {
        const goal = card.dataset.goal;
        const idx = state.selectedGoals.indexOf(goal);
        if (idx >= 0) {
          state.selectedGoals.splice(idx, 1);
          card.classList.remove('selected');
        } else {
          state.selectedGoals.push(goal);
          card.classList.add('selected');
        }
      });
    });
  }

  function bindEnvCards() {
    qsa('.env-card').forEach((card) => {
      card.addEventListener('click', () => {
        qsa('.env-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        state.selectedEnv = card.dataset.env;
      });
    });
  }

  function bindChipGroup(groupId, targetArray) {
    const group = document.getElementById(groupId);
    if (!group) return;
    qsa('.chip', group).forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.chip;
        const idx = targetArray.indexOf(val);
        if (idx >= 0) {
          targetArray.splice(idx, 1);
          chip.classList.remove('chip--selected');
        } else {
          targetArray.push(val);
          chip.classList.add('chip--selected');
        }
      });
    });
  }

  function bindTagInput(inputId, tagsContainerId, targetArray) {
    const input = document.getElementById(inputId);
    const tagsContainer = document.getElementById(tagsContainerId);
    if (!input || !tagsContainer) return;

    function renderTags() {
      tagsContainer.innerHTML = '';
      targetArray.forEach((tag, idx) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.appendChild(document.createTextNode(tag));

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'tag-pill__remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          targetArray.splice(idx, 1);
          renderTags();
        });

        pill.appendChild(removeBtn);
        tagsContainer.appendChild(pill);
      });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val && !targetArray.includes(val)) {
          targetArray.push(val);
          renderTags();
        }
        input.value = '';
      }
    });
  }

  // ---------------------------------------------------------------------
  // 플랜 생성 (온보딩 마지막 단계)
  // ---------------------------------------------------------------------

  function collectProfile() {
    const restrictions = qsa('input[name="restrictions"]:checked').map((el) => el.value);

    return {
      basic: {
        age: Number(qs('#input-age').value) || 30,
        gender: qs('#input-gender').value || 'male',
        height: Number(qs('#input-height').value) || 170,
        weight: Number(qs('#input-weight').value) || 65
      },
      goals: state.selectedGoals.length > 0 ? state.selectedGoals.slice() : ['컨디션유지'],
      health: {
        conditions: state.conditionTags.slice(),
        medications: qs('#input-medications').value || '',
        allergies: state.allergyTags.slice(),
        injuries: qs('#input-injuries').value || ''
      },
      schedule: {
        wakeUp: qs('#input-wakeup').value || '07:00',
        sleep: qs('#input-sleep').value || '23:00',
        workPattern: qs('#input-workpattern').value || '주간근무',
        availableTimes: state.selectedTimes.length > 0 ? state.selectedTimes.slice() : ['저녁']
      },
      diet: {
        mealPattern: qs('#input-mealpattern').value || '3끼',
        preferred: qs('#input-preferred-food').value || '',
        avoided: qs('#input-avoided-food').value || '',
        restrictions
      },
      exercise: {
        currentLevel: qs('#input-current-level').value || '초급',
        preferred: state.selectedExercises.length > 0 ? state.selectedExercises.slice() : ['걷기', '스트레칭'],
        environment: state.selectedEnv || '홈'
      }
    };
  }

  function generatePlanAndGo() {
    if (!validateStep(state.currentStep)) {
      showToast('필수 항목을 확인해주세요.', 'error');
      return;
    }

    const profile = collectProfile();
    const saved = Storage.saveProfile(profile);

    if (!saved) {
      showToast('프로필 저장에 실패했습니다. 다시 시도해주세요.', 'error');
      return;
    }

    let plan;
    try {
      plan = Planner.generatePlan(profile);
    } catch (err) {
      console.error('[HealthFlowApp] 플랜 생성 실패', err);
      showToast('플랜 생성 중 오류가 발생했습니다.', 'error');
      return;
    }

    Storage.savePlan(plan);
    showToast('나만의 플랜이 생성되었습니다!', 'success');
    navigateTo('dashboard');
  }

  // ---------------------------------------------------------------------
  // 대시보드 렌더
  // ---------------------------------------------------------------------

  function renderDashboard() {
    const profile = Storage.getProfile();
    const plan = Storage.getPlan();
    const content = document.getElementById('dashboard-content');
    const emptyState = document.getElementById('dashboard-empty');

    if (!profile || !plan) {
      if (content) qsa(':scope > .dashboard-grid', content).forEach((el) => (el.hidden = true));
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;

    const summary = plan.summary || {};

    // BMI 링차트
    if (Charts) {
      Charts.renderRingChart('bmi-chart', summary.bmi || 0, 35, {
        size: 160,
        strokeWidth: 14,
        color: bmiColor(summary.bmiCategory),
        unit: ''
      });
    }
    const bmiCaption = document.getElementById('bmi-caption');
    if (bmiCaption) {
      bmiCaption.textContent = `${summary.bmiCategory || '-'} (${(summary.bmi || 0).toFixed ? summary.bmi.toFixed(1) : summary.bmi})`;
    }

    // 건강 목표 태그
    const goalsDisplay = document.getElementById('goals-display');
    if (goalsDisplay) {
      goalsDisplay.innerHTML = '';
      (profile.goals || []).forEach((goal) => {
        const tag = document.createElement('span');
        tag.className = 'chip chip--selected';
        tag.textContent = goal;
        goalsDisplay.appendChild(tag);
      });
    }

    // 칼로리 + 매크로 막대차트
    const calorieDisplay = document.getElementById('calorie-display');
    if (calorieDisplay) {
      const num = calorieDisplay.querySelector('.calorie-display__num');
      if (num) num.textContent = summary.dailyCalories || '-';
    }

    if (Charts && summary.macros) {
      Charts.renderBarChart(
        'macro-chart',
        [
          { label: '탄수화물', value: summary.macros.carbs, color: 'var(--color-info)' },
          { label: '단백질', value: summary.macros.protein, color: 'var(--color-primary)' },
          { label: '지방', value: summary.macros.fat, color: 'var(--color-accent)' }
        ],
        { height: 160, animate: true }
      );
    }

    // 위험요인 + 추천사항
    const riskList = document.getElementById('risk-list');
    if (riskList) {
      riskList.innerHTML = '';
      const items = (summary.riskFactors || []).concat(summary.recommendations || []);
      items.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        riskList.appendChild(li);
      });
    }
  }

  function bmiColor(category) {
    switch (category) {
      case '저체중':
        return 'var(--color-info)';
      case '정상':
        return 'var(--color-success)';
      case '과체중':
        return 'var(--color-accent)';
      case '비만':
        return 'var(--color-danger)';
      default:
        return 'var(--color-primary)';
    }
  }

  // ---------------------------------------------------------------------
  // 운동 페이지 렌더
  // ---------------------------------------------------------------------

  function renderExercisePage() {
    const plan = Storage.getPlan();
    const content = document.getElementById('exercise-content');
    const emptyState = document.getElementById('exercise-empty');

    if (!plan || !plan.exercise) {
      if (content) {
        qsa('#exercise-day-tabs, #exercise-day-summary, #exercise-card-list, .card', content).forEach((el) => (el.hidden = true));
      }
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (content) {
      qsa('#exercise-day-tabs, #exercise-day-summary, #exercise-card-list, .card', content).forEach((el) => (el.hidden = false));
    }

    bindDayTabs('exercise-day-tabs', state.exerciseDay, (day) => {
      state.exerciseDay = day;
      renderExerciseDay(plan, day);
    });

    renderExerciseDay(plan, state.exerciseDay);
    renderFourWeekProgression(plan);
  }

  function bindDayTabs(tabsContainerId, activeDay, onSelect) {
    const container = document.getElementById(tabsContainerId);
    if (!container) return;
    qsa('.tab-btn', container).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.day === activeDay);
      btn.onclick = () => {
        qsa('.tab-btn', container).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.day);
      };
    });
  }

  function renderExerciseDay(plan, day) {
    const dayPlan = plan.exercise.weekPlan ? plan.exercise.weekPlan[day] : null;
    const summaryEl = document.getElementById('exercise-day-summary');
    const listEl = document.getElementById('exercise-card-list');
    if (!dayPlan || !summaryEl || !listEl) return;

    if (dayPlan.type === '휴식') {
      summaryEl.textContent = `${day}요일은 휴식일입니다. ${dayPlan.note || ''}`;
      listEl.innerHTML = '';
      return;
    }

    summaryEl.textContent = `${day}요일: ${dayPlan.type} · 총 ${dayPlan.duration}분 · 강도 ${dayPlan.intensity}`;

    listEl.innerHTML = '';
    (dayPlan.exercises || []).forEach((ex, idx) => {
      const card = document.createElement('div');
      card.className = 'card exercise-card';

      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'exercise-card__check';
      check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      check.addEventListener('click', () => {
        const checked = check.classList.toggle('checked');
        card.classList.toggle('done', checked);
        updateExerciseProgress(day, checked);
      });

      const body = document.createElement('div');
      body.className = 'exercise-card__body';

      const name = document.createElement('div');
      name.className = 'exercise-card__name';
      name.textContent = ex.name;

      const meta = document.createElement('div');
      meta.className = 'exercise-card__meta';
      meta.textContent = ex.setsReps || '';

      body.appendChild(name);
      body.appendChild(meta);

      const badge = document.createElement('span');
      badge.className = `badge ${intensityBadgeClass(dayPlan.intensity)}`;
      badge.textContent = dayPlan.intensity;

      card.appendChild(check);
      card.appendChild(body);
      card.appendChild(badge);

      listEl.appendChild(card);
    });
  }

  function intensityBadgeClass(intensity) {
    if (intensity === '고') return 'badge--danger';
    if (intensity === '중') return 'badge--warning';
    return 'badge--info';
  }

  function updateExerciseProgress(day, completed) {
    const todayStr = new Date().toISOString().slice(0, 10);
    Storage.updateProgress(todayStr, { exerciseDone: completed, exerciseDay: day });
    showToast(completed ? '운동 완료로 기록했습니다.' : '운동 완료를 취소했습니다.', 'info');
  }

  function renderFourWeekProgression(plan) {
    const listEl = document.getElementById('progression-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const weeks = (plan.exercise && plan.exercise.fourWeekProgression) || [];
    weeks.forEach((w) => {
      const item = document.createElement('div');
      item.className = 'progression-item';

      const weekLabel = document.createElement('div');
      weekLabel.className = 'progression-item__week';
      weekLabel.textContent = `${w.week}주차`;

      const phase = document.createElement('div');
      phase.className = 'progression-item__phase';
      phase.textContent = w.phase;

      const focus = document.createElement('div');
      focus.className = 'progression-item__focus';
      focus.textContent = w.focus;

      item.appendChild(weekLabel);
      item.appendChild(phase);
      item.appendChild(focus);
      listEl.appendChild(item);
    });
  }

  // ---------------------------------------------------------------------
  // 식단 페이지 렌더
  // ---------------------------------------------------------------------

  function renderDietPage() {
    const plan = Storage.getPlan();
    const content = document.getElementById('diet-content');
    const emptyState = document.getElementById('diet-empty');

    if (!plan || !plan.diet) {
      if (content) {
        qsa('#diet-day-tabs, #diet-calorie-total, .diet-grid, #shopping-list-collapsible', content).forEach((el) => (el.hidden = true));
      }
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (content) {
      qsa('#diet-day-tabs, #diet-calorie-total, .diet-grid, #shopping-list-collapsible', content).forEach((el) => (el.hidden = false));
    }

    bindDayTabs('diet-day-tabs', state.dietDay, (day) => {
      state.dietDay = day;
      renderDietDay(plan, day);
    });

    renderDietDay(plan, state.dietDay);
    renderShoppingList(plan);
    bindShoppingListToggle();
  }

  const MEAL_LABELS = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };

  function renderDietDay(plan, day) {
    const dayPlan = plan.diet.weekPlan ? plan.diet.weekPlan[day] : null;
    const listEl = document.getElementById('meal-card-list');
    const totalEl = document.getElementById('diet-calorie-total');
    if (!dayPlan || !listEl) return;

    listEl.innerHTML = '';
    let total = 0;

    ['breakfast', 'lunch', 'dinner', 'snack'].forEach((key) => {
      const meal = dayPlan[key];
      if (!meal) return;
      total += meal.calories || 0;

      const card = document.createElement('div');
      card.className = 'card meal-card';

      const body = document.createElement('div');
      body.className = 'card__body';

      const titleRow = document.createElement('div');
      titleRow.className = 'meal-card__title';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = MEAL_LABELS[key];
      const calSpan = document.createElement('span');
      calSpan.textContent = `${meal.calories}kcal`;
      titleRow.appendChild(titleSpan);
      titleRow.appendChild(calSpan);

      const menu = document.createElement('div');
      menu.className = 'meal-card__menu';
      menu.textContent = meal.menu;

      body.appendChild(titleRow);
      body.appendChild(menu);
      card.appendChild(body);
      listEl.appendChild(card);
    });

    if (totalEl) {
      totalEl.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = `${day}요일 일일 칼로리 합계`;
      const value = document.createElement('span');
      value.textContent = `${total} kcal`;
      totalEl.appendChild(label);
      totalEl.appendChild(value);
    }

    // 매크로 도넛 차트 (목표 매크로 비율 표시)
    const plan2 = Storage.getPlan();
    const macros = plan2 && plan2.summary ? plan2.summary.macros : null;
    if (Charts && macros) {
      Charts.renderDonutChart(
        'diet-macro-chart',
        [
          { label: '탄수화물', value: macros.carbs, color: 'var(--color-info)' },
          { label: '단백질', value: macros.protein, color: 'var(--color-primary)' },
          { label: '지방', value: macros.fat, color: 'var(--color-accent)' }
        ],
        { size: 160, strokeWidth: 18 }
      );
    }
  }

  function renderShoppingList(plan) {
    const listEl = document.getElementById('shopping-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const items = (plan.diet && plan.diet.shoppingList) || [];
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      listEl.appendChild(li);
    });
  }

  function bindShoppingListToggle() {
    const toggle = document.getElementById('shopping-list-toggle');
    const collapsible = document.getElementById('shopping-list-collapsible');
    if (!toggle || !collapsible) return;
    toggle.onclick = () => {
      collapsible.classList.toggle('open');
    };
  }

  // ---------------------------------------------------------------------
  // 캘린더 페이지 렌더
  // ---------------------------------------------------------------------

  function renderCalendarPage() {
    const plan = Storage.getPlan();
    const content = document.getElementById('calendar-content');
    const emptyState = document.getElementById('calendar-empty');
    const gridEl = document.getElementById('calendar-grid');

    if (!plan || !plan.calendar) {
      if (content) {
        qsa('.calendar-legend, #calendar-grid', content).forEach((el) => (el.hidden = true));
      }
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (content) {
      qsa('.calendar-legend, #calendar-grid', content).forEach((el) => (el.hidden = false));
    }
    if (!gridEl) return;

    gridEl.innerHTML = '';
    const today = todayDayLabel();

    DAYS.forEach((day) => {
      const dayCol = document.createElement('div');
      dayCol.className = 'calendar-day';

      const header = document.createElement('div');
      header.className = 'calendar-day__header';
      if (day === today) header.classList.add('today');
      header.textContent = day;
      dayCol.appendChild(header);

      const events = plan.calendar[day] || [];
      events.forEach((event) => {
        const block = document.createElement('div');
        block.className = `calendar-event calendar-event--${event.type}`;

        const time = document.createElement('span');
        time.className = 'calendar-event__time';
        time.textContent = event.time;

        block.appendChild(time);
        block.appendChild(document.createTextNode(event.label));
        dayCol.appendChild(block);
      });

      gridEl.appendChild(dayCol);
    });
  }

  // ---------------------------------------------------------------------
  // 진행 추적 페이지 렌더
  // ---------------------------------------------------------------------

  function renderTrackerPage() {
    const progress = Storage.getProgress();
    const listEl = document.getElementById('progress-log-list');
    const emptyState = document.getElementById('tracker-empty');

    bindTrackerForm();
    bindStarRating();

    const dateInput = document.getElementById('tracker-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    if (!progress || progress.length === 0) {
      if (listEl) listEl.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      renderWeightChart([]);
      renderAchievementChart([]);
      return;
    }
    if (emptyState) emptyState.hidden = true;

    renderProgressLogList(progress);
    renderWeightChart(progress);
    renderAchievementChart(progress);
  }

  function renderProgressLogList(progress) {
    const listEl = document.getElementById('progress-log-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    progress
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'progress-log-item';

        const date = document.createElement('span');
        date.className = 'progress-log-item__date';
        date.textContent = entry.date;

        const weight = document.createElement('span');
        weight.className = 'progress-log-item__weight';
        weight.textContent = entry.weight ? `${entry.weight}kg` : '-';

        const stars = document.createElement('span');
        stars.className = 'progress-log-item__stars';
        const cond = Number(entry.condition) || 0;
        stars.textContent = '★'.repeat(cond) + '☆'.repeat(5 - cond);

        li.appendChild(date);
        li.appendChild(weight);
        li.appendChild(stars);

        if (entry.notes) {
          const notes = document.createElement('span');
          notes.className = 'progress-log-item__notes';
          notes.textContent = entry.notes;
          li.appendChild(notes);
        }

        listEl.appendChild(li);
      });
  }

  function renderWeightChart(progress) {
    if (!Charts) return;
    const data = progress
      .filter((p) => typeof p.weight === 'number')
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .slice(-14)
      .map((p) => ({ x: p.date.slice(5), y: p.weight }));

    Charts.renderLineChart('weight-chart', data, {
      width: 360,
      height: 200,
      showDots: true,
      showGrid: true,
      animate: true
    });
  }

  function renderAchievementChart(progress) {
    if (!Charts) return;
    const todayDate = new Date();
    const weekAgo = new Date(todayDate);
    weekAgo.setDate(todayDate.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);
    const todayStr = todayDate.toISOString().slice(0, 10);

    const thisWeek = progress.filter((p) => p.date >= weekAgoStr && p.date <= todayStr);
    const doneCount = thisWeek.filter((p) => p.exerciseDone).length;
    const rate = Math.round((doneCount / 7) * 100);

    Charts.renderRingChart('achievement-chart', rate, 100, {
      size: 140,
      strokeWidth: 14,
      color: 'var(--color-success)',
      unit: '%'
    });
  }

  function bindTrackerForm() {
    const form = document.getElementById('tracker-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const date = document.getElementById('tracker-date').value;
      if (!date) {
        showToast('날짜를 선택해주세요.', 'error');
        return;
      }

      const entry = {
        date,
        weight: Number(document.getElementById('tracker-weight').value) || undefined,
        exerciseDone: document.getElementById('tracker-exercise-done').checked,
        condition: state.starRating,
        notes: document.getElementById('tracker-notes').value || ''
      };

      const saved = Storage.addProgress(entry);
      if (saved) {
        showToast('기록이 저장되었습니다.', 'success');
        form.reset();
        state.starRating = 0;
        updateStarUI();
        renderTrackerPage();
      } else {
        showToast('기록 저장에 실패했습니다.', 'error');
      }
    });
  }

  function bindStarRating() {
    const rating = document.getElementById('tracker-star-rating');
    if (!rating || rating.dataset.bound === 'true') return;
    rating.dataset.bound = 'true';

    qsa('.star-rating__star', rating).forEach((star) => {
      star.addEventListener('click', () => {
        state.starRating = Number(star.dataset.star);
        updateStarUI();
      });
    });
  }

  function updateStarUI() {
    const rating = document.getElementById('tracker-star-rating');
    if (!rating) return;
    qsa('.star-rating__star', rating).forEach((star) => {
      star.classList.toggle('filled', Number(star.dataset.star) <= state.starRating);
    });
  }

  // ---------------------------------------------------------------------
  // 설정 / 데이터 리셋
  // ---------------------------------------------------------------------

  function openResetModal() {
    const modal = document.getElementById('reset-modal');
    if (modal) modal.classList.add('open');
  }

  function closeResetModal() {
    const modal = document.getElementById('reset-modal');
    if (modal) modal.classList.remove('open');
  }

  function resetAllData() {
    Storage.clearAll();
    closeResetModal();
    showToast('모든 데이터가 초기화되었습니다.', 'info');
    state.selectedGoals = [];
    state.conditionTags = [];
    state.allergyTags = [];
    state.selectedTimes = [];
    state.selectedExercises = [];
    state.selectedEnv = null;
    state.currentStep = 1;
    navigateTo('onboarding');
  }

  // ---------------------------------------------------------------------
  // 빈 상태 버튼 → 온보딩 이동
  // ---------------------------------------------------------------------

  function bindEmptyStateButtons() {
    [
      'btn-empty-dashboard',
      'btn-empty-exercise',
      'btn-empty-diet',
      'btn-empty-calendar',
      'btn-empty-tracker'
    ].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => navigateTo('onboarding'));
    });
  }

  // ---------------------------------------------------------------------
  // 이벤트 바인딩 (전역)
  // ---------------------------------------------------------------------

  function bindNav() {
    qsa('[data-nav]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(el.dataset.nav);
      });
    });
  }

  function bindHeaderActions() {
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', openResetModal);

    const closeBtn = document.getElementById('reset-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeResetModal);

    const cancelBtn = document.getElementById('reset-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeResetModal);

    const confirmBtn = document.getElementById('reset-confirm-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', resetAllData);

    const overlay = document.getElementById('reset-modal-overlay');
    if (overlay) overlay.addEventListener('click', closeResetModal);
  }

  function bindOnboardingButtons() {
    const startBtn = document.getElementById('btn-start-onboarding');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        document.getElementById('onboarding-welcome').hidden = true;
        document.getElementById('onboarding-form').hidden = false;
        showStep(1);
      });
    }

    const nextBtn = document.getElementById('btn-next-step');
    if (nextBtn) nextBtn.addEventListener('click', nextStep);

    const prevBtn = document.getElementById('btn-prev-step');
    if (prevBtn) prevBtn.addEventListener('click', prevStep);

    const generateBtn = document.getElementById('btn-generate-plan');
    if (generateBtn) generateBtn.addEventListener('click', generatePlanAndGo);

    bindGoalCards();
    bindEnvCards();
    bindChipGroup('chip-group-times', state.selectedTimes);
    bindChipGroup('chip-group-exercises', state.selectedExercises);
    bindTagInput('input-condition-tag', 'tags-conditions', state.conditionTags);
    bindTagInput('input-allergy-tag', 'tags-allergies', state.allergyTags);
  }

  function bindHashChange() {
    global.addEventListener('hashchange', () => {
      const route = getRouteFromHash();
      if (route) navigateTo(route);
    });
  }

  // ---------------------------------------------------------------------
  // 초기화
  // ---------------------------------------------------------------------

  function init() {
    if (!Storage || !Planner) {
      console.error('[HealthFlowApp] Storage 또는 Planner 모듈이 로드되지 않았습니다.');
      return;
    }

    initTheme();
    bindNav();
    bindHeaderActions();
    bindOnboardingButtons();
    bindEmptyStateButtons();
    bindHashChange();

    resolveInitialRoute();
  }

  // ---------------------------------------------------------------------
  // 전역 노출
  // ---------------------------------------------------------------------
  global.HealthFlowApp = {
    init,
    navigateTo,
    showToast,
    toggleTheme,
    resetAllData
  };

  document.addEventListener('DOMContentLoaded', init);

})(typeof window !== 'undefined' ? window : globalThis);
