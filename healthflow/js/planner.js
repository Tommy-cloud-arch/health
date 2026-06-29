/**
 * planner.js
 * HealthFlow 플랜 생성 알고리즘 모듈
 * - 사용자 프로파일을 받아 BMR/TDEE/매크로/운동/식단/캘린더를 포함한 완전한 plan 객체를 생성한다.
 * - 외부 라이브러리 없이 순수 JavaScript로 구현한다.
 * - 실제 의료 조언이 아닌 프로토타입 수준의 합리적인 알고리즘이다.
 */

(function (global) {
  'use strict';

  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // =====================================================================
  // 1. 활동계수 / 운동 강도 테이블
  // =====================================================================

  // 현재 운동량(현재수준) 기반 활동계수
  const ACTIVITY_FACTOR = {
    '비활동': 1.2,
    '없음': 1.2,
    '거의안함': 1.2,
    '초급': 1.375,
    '가벼움': 1.375,
    '낮음': 1.375,
    '중급': 1.55,
    '보통': 1.55,
    '고급': 1.725,
    '활발': 1.725,
    '높음': 1.725,
    '매우높음': 1.9
  };

  function getActivityFactor(currentLevel) {
    return ACTIVITY_FACTOR[currentLevel] || 1.375;
  }

  // =====================================================================
  // 2. BMR / TDEE / 목표 칼로리 / 매크로 / BMI 계산
  // =====================================================================

  /**
   * Mifflin-St Jeor 공식으로 기초대사량(BMR)을 계산한다.
   * @param {object} basic - { age, gender, height, weight }
   * @returns {number} BMR (kcal)
   */
  function calcBMR(basic) {
    const { age, gender, height, weight } = basic;
    const base = 10 * weight + 6.25 * height - 5 * age;
    if (gender === 'male' || gender === '남' || gender === '남성') {
      return Math.round(base + 5);
    }
    return Math.round(base - 161);
  }

  /**
   * BMR과 활동계수를 곱해 TDEE(일일 총 소비 에너지)를 계산한다.
   * @param {number} bmr
   * @param {string} currentLevel
   * @returns {number} TDEE (kcal)
   */
  function calcTDEE(bmr, currentLevel) {
    return Math.round(bmr * getActivityFactor(currentLevel));
  }

  // 목표별 칼로리 보정값 / 매크로 비율 테이블
  const GOAL_CALORIE_ADJUST = {
    '체중감량': -500,
    '다이어트': -500,
    '근육증가': 300,
    '근육량': 300,
    '체중증가': 300,
    '벌크업': 300,
    '체력향상': 0,
    '질환관리': 0,
    '컨디션유지': 0,
    '건강관리': 0
  };

  const GOAL_MACROS = {
    '체중감량': { carbs: 40, protein: 35, fat: 25 },
    '다이어트': { carbs: 40, protein: 35, fat: 25 },
    '근육증가': { carbs: 45, protein: 35, fat: 20 },
    '근육량': { carbs: 45, protein: 35, fat: 20 },
    '체력향상': { carbs: 50, protein: 25, fat: 25 },
    '질환관리': { carbs: 50, protein: 30, fat: 20 },
    '컨디션유지': { carbs: 50, protein: 30, fat: 20 },
    '건강관리': { carbs: 50, protein: 30, fat: 20 }
  };

  const DEFAULT_MACROS = { carbs: 50, protein: 30, fat: 20 };

  /**
   * 여러 목표가 있을 경우 칼로리 보정값을 가중평균한다.
   * @param {Array<string>} goals
   * @returns {number}
   */
  function calcCalorieAdjust(goals) {
    if (!Array.isArray(goals) || goals.length === 0) return 0;
    const valid = goals.filter((g) => GOAL_CALORIE_ADJUST.hasOwnProperty(g));
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, g) => acc + GOAL_CALORIE_ADJUST[g], 0);
    return Math.round(sum / valid.length);
  }

  /**
   * 여러 목표가 있을 경우 매크로 비율을 가중평균하고 합이 100이 되도록 보정한다.
   * @param {Array<string>} goals
   * @returns {{carbs:number, protein:number, fat:number}}
   */
  function calcMacros(goals) {
    if (!Array.isArray(goals) || goals.length === 0) return Object.assign({}, DEFAULT_MACROS);
    const valid = goals.filter((g) => GOAL_MACROS.hasOwnProperty(g));
    if (valid.length === 0) return Object.assign({}, DEFAULT_MACROS);

    const sum = valid.reduce(
      (acc, g) => {
        const m = GOAL_MACROS[g];
        acc.carbs += m.carbs;
        acc.protein += m.protein;
        acc.fat += m.fat;
        return acc;
      },
      { carbs: 0, protein: 0, fat: 0 }
    );

    const n = valid.length;
    let carbs = Math.round(sum.carbs / n);
    let protein = Math.round(sum.protein / n);
    let fat = 100 - carbs - protein; // 합계 100 보정

    if (fat < 10) {
      // 지방 비율이 너무 낮아지지 않도록 최소값 보정
      const diff = 10 - fat;
      fat = 10;
      carbs = Math.max(0, carbs - diff);
    }

    return { carbs, protein, fat };
  }

  /**
   * BMI를 계산한다.
   * @param {number} weight kg
   * @param {number} height cm
   * @returns {number} BMI (소수점 1자리)
   */
  function calcBMI(weight, height) {
    const h = height / 100;
    return Math.round((weight / (h * h)) * 10) / 10;
  }

  /**
   * BMI 카테고리를 분류한다 (한국 기준).
   * @param {number} bmi
   * @returns {string}
   */
  function classifyBMI(bmi) {
    if (bmi < 18.5) return '저체중';
    if (bmi < 25) return '정상';
    if (bmi < 30) return '과체중';
    return '비만';
  }

  // =====================================================================
  // 3. 위험요인 / 추천사항 평가
  // =====================================================================

  // 기저질환별 주의사항 매핑 (프로토타입 수준의 일반적인 조언)
  const CONDITION_RISK_MAP = {
    '고혈압': '고혈압 주의: 고강도 운동 시 혈압 변화에 유의하고 나트륨 섭취를 줄이세요.',
    '당뇨': '당뇨 관리: 식사 후 혈당 변화를 고려해 탄수화물 섭취 시간을 분산하세요.',
    '당뇨병': '당뇨 관리: 식사 후 혈당 변화를 고려해 탄수화물 섭취 시간을 분산하세요.',
    '심장질환': '심장질환 주의: 고강도 인터벌 운동보다 저강도 유산소 운동을 우선하세요.',
    '관절염': '관절 보호: 충격이 큰 운동(점프, 달리기)보다 수영, 자전거 등을 권장합니다.',
    '천식': '호흡기 주의: 운동 전 충분한 워밍업과 호흡 조절이 필요합니다.',
    '허리디스크': '척추 보호: 고중량 스쿼트/데드리프트는 전문가 지도 하에 진행하세요.',
    '비만': '체중 관리: 무릎/관절 부담이 적은 저충격 운동부터 시작하세요.'
  };

  /**
   * 건강상태(기저질환, 알레르기, 부상이력)를 기반으로 위험요인 문구를 생성한다.
   * @param {object} health - { conditions, medications, allergies, injuries }
   * @param {number} bmi
   * @returns {Array<string>}
   */
  function assessRiskFactors(health, bmi) {
    const risks = [];
    const conditions = (health && health.conditions) || [];
    const allergies = (health && health.allergies) || [];
    const injuries = (health && health.injuries) || '';

    conditions.forEach((c) => {
      if (CONDITION_RISK_MAP[c]) {
        risks.push(CONDITION_RISK_MAP[c]);
      } else {
        risks.push(`${c} 보유: 운동/식단 변경 전 담당 의료진과 상담을 권장합니다.`);
      }
    });

    if (allergies.length > 0) {
      risks.push(`알레르기 주의: ${allergies.join(', ')} 성분이 포함된 식단을 피해주세요.`);
    }

    if (injuries && injuries.trim() !== '') {
      risks.push(`부상 이력 고려: "${injuries}" 부위에 무리가 가지 않는 동작으로 대체하세요.`);
    }

    if (bmi >= 25) {
      risks.push('과체중/비만 범위: 관절 부담이 적은 저충격 운동을 우선 권장합니다.');
    } else if (bmi < 18.5) {
      risks.push('저체중 범위: 단백질 섭취를 늘리고 근력 운동을 병행하세요.');
    }

    if (risks.length === 0) {
      risks.push('특별한 위험요인이 발견되지 않았습니다. 현재 패턴을 꾸준히 유지하세요.');
    }

    return risks;
  }

  /**
   * 목표와 BMI, 운동환경 등을 고려한 일반 추천사항을 생성한다.
   * @param {object} profile
   * @param {number} bmi
   * @returns {Array<string>}
   */
  function buildRecommendations(profile, bmi) {
    const recs = [];
    const goals = profile.goals || [];

    if (goals.includes('체중감량')) {
      recs.push('유산소 운동을 주 4회 이상 포함해 칼로리 소모를 늘리세요.');
      recs.push('가공식품과 액상과당 음료 섭취를 줄이세요.');
    }
    if (goals.includes('근육증가') || goals.includes('근육량')) {
      recs.push('체중 1kg당 1.6~2g의 단백질을 섭취하고 점진적 과부하 원칙을 적용하세요.');
    }
    if (goals.includes('체력향상')) {
      recs.push('인터벌 트레이닝과 꾸준한 유산소 운동을 병행해 심폐지구력을 향상시키세요.');
    }
    if (goals.includes('질환관리')) {
      recs.push('규칙적인 생활 패턴과 정기적인 건강검진을 유지하세요.');
    }
    if (goals.includes('컨디션유지')) {
      recs.push('현재 체중과 체력을 유지하기 위해 운동/식단의 균형을 지속하세요.');
    }

    if (bmi >= 23 && bmi < 25) {
      recs.push('과체중 경계 구간입니다. 식사량을 조금씩 줄이고 걷기 운동을 늘려보세요.');
    }

    recs.push('하루 7시간 이상의 수면과 충분한 수분 섭취(1.5~2L)를 유지하세요.');

    return recs;
  }

  // =====================================================================
  // 4. 운동 콘텐츠 라이브러리
  // =====================================================================

  // 운동 종류별 세부 동작 라이브러리 (환경/수준별 다양성 확보)
  const EXERCISE_LIBRARY = {
    유산소: {
      홈: ['실내 걷기', '계단 오르내리기', '점핑잭', '버피', '제자리 뛰기', '훌라후프'],
      헬스장: ['트레드밀 걷기/달리기', '실내 사이클', '일립티컬 머신', '로잉 머신'],
      야외: ['빠르게 걷기', '조깅', '자전거 타기', '등산', '줄넘기']
    },
    근력: {
      홈: ['스쿼트', '런지', '푸시업', '플랭크', '브릿지', '마운틴 클라이머', '버드독'],
      헬스장: ['레그프레스', '랫풀다운', '벤치프레스', '덤벨 숄더프레스', '케이블 로우', '바벨 스쿼트'],
      야외: ['철봉 매달리기', '벤치 딥스', '계단 런지', '맨몸 스쿼트']
    },
    스트레칭: {
      홈: ['전신 스트레칭', '고양이-소 자세', '햄스트링 스트레칭', '어깨 스트레칭', '폼롤러 마사지'],
      헬스장: ['전신 스트레칭', '폼롤러 마사지', '동적 스트레칭'],
      야외: ['가벼운 전신 스트레칭', '목/어깨 스트레칭']
    },
    요가: {
      홈: ['수리야 나마스카(태양경배자세)', '다운독 자세', '전사 자세', '아동 자세', '코브라 자세'],
      헬스장: ['요가 매트 플로우', '전신 요가 시퀀스'],
      야외: ['공원 요가 플로우']
    },
    필라테스: {
      홈: ['플랭크 변형', '레그레이즈', '백 익스텐션', '롤업', '사이드 킥'],
      헬스장: ['필라테스 머신 동작', '코어 강화 시퀀스'],
      야외: ['매트 필라테스 기본 동작']
    },
    걷기: {
      홈: ['실내 걷기'],
      헬스장: ['트레드밀 걷기'],
      야외: ['공원 걷기', '산책']
    },
    수영: {
      홈: ['수영 대체: 실내 자전거'],
      헬스장: ['수영장 자유형/평형 (헬스장 내 수영장 이용시)'],
      야외: ['야외 수영장 자유형/배영']
    }
  };

  // 수준별 강도/세트-횟수 가이드
  const LEVEL_INTENSITY = {
    초급: { intensity: '저', sets: 2, reps: 10, durationFactor: 0.8 },
    중급: { intensity: '중', sets: 3, reps: 12, durationFactor: 1.0 },
    고급: { intensity: '고', sets: 4, reps: 15, durationFactor: 1.2 }
  };

  function normalizeLevel(level) {
    if (level === '초급' || level === '중급' || level === '고급') return level;
    if (level === '비활동' || level === '없음' || level === '가벼움') return '초급';
    if (level === '보통') return '중급';
    if (level === '활발') return '고급';
    return '초급';
  }

  /**
   * 선호 운동과 환경을 고려해 특정 운동 타입에 대한 세부 동작 리스트를 만든다.
   * @param {string} type - 유산소/근력/스트레칭 등
   * @param {string} environment - 홈/헬스장/야외
   * @param {Array<string>} preferred - 선호 운동 목록
   * @param {number} count - 동작 개수
   * @returns {Array<string>}
   */
  function pickExercises(type, environment, preferred, count) {
    const envKey = EXERCISE_LIBRARY[type] ? (EXERCISE_LIBRARY[type][environment] ? environment : '홈') : '홈';
    const pool = (EXERCISE_LIBRARY[type] && EXERCISE_LIBRARY[type][envKey]) || [];

    // 선호 운동 중 동일 타입 라이브러리에 매칭되는 이름이 있으면 우선 배치
    const preferredMatches = pool.filter((ex) => (preferred || []).some((p) => ex.includes(p) || p.includes(ex)));
    const rest = pool.filter((ex) => !preferredMatches.includes(ex));
    const ordered = preferredMatches.concat(rest);

    const selected = ordered.slice(0, count > 0 ? count : ordered.length);
    return selected.length > 0 ? selected : pool.slice(0, count);
  }

  // =====================================================================
  // 5. 주간 운동 플랜 생성
  // =====================================================================

  /**
   * 가용 시간대 문자열을 대략적인 24h 시간으로 매핑한다 (캘린더 배치용).
   */
  const TIME_SLOT_MAP = {
    '아침': '06:30',
    '오전': '10:00',
    '점심': '12:30',
    '오후': '15:00',
    '저녁': '19:00',
    '밤': '21:00'
  };

  function pickExerciseTime(availableTimes, wakeUp) {
    if (Array.isArray(availableTimes) && availableTimes.length > 0) {
      const slot = availableTimes[0];
      if (TIME_SLOT_MAP[slot]) return TIME_SLOT_MAP[slot];
    }
    return '19:00';
  }

  /**
   * 주간 운동 플랜을 생성한다 (한글 요일 키 버전, 내부 계산용).
   * - 기본: 주 3~5회 운동 + 1~2회 휴식
   * - 수준에 따라 강도/시간 조절
   * @param {object} exercise - profile.exercise { currentLevel, preferred, environment }
   * @param {object} schedule - profile.schedule
   * @param {Array<string>} goals
   * @returns {object} weekPlan (한글 요일 키: 월~일)
   */
  function buildExerciseWeekPlan(exercise, schedule, goals) {
    const level = normalizeLevel((exercise && exercise.currentLevel) || '초급');
    const environment = (exercise && exercise.environment) || '홈';
    const preferred = (exercise && exercise.preferred) || ['걷기', '스트레칭'];
    const levelInfo = LEVEL_INTENSITY[level];

    // 목표에 따라 운동 횟수/타입 패턴 결정
    const wantsMuscle = goals.includes('근육증가') || goals.includes('근육량');
    const wantsCardio = goals.includes('체중감량') || goals.includes('체력향상');

    // 7일 패턴: 유산소/근력/스트레칭/요가 등을 분산 배치
    // 기본 패턴: 월(유산소) 화(근력) 수(스트레칭/요가) 목(근력) 금(유산소) 토(가벼운활동) 일(휴식)
    let pattern;
    if (wantsMuscle && wantsCardio) {
      pattern = ['유산소', '근력', '스트레칭', '근력', '유산소', '필라테스', '휴식'];
    } else if (wantsMuscle) {
      pattern = ['근력', '유산소', '근력', '스트레칭', '근력', '요가', '휴식'];
    } else if (wantsCardio) {
      pattern = ['유산소', '근력', '유산소', '스트레칭', '유산소', '요가', '휴식'];
    } else {
      pattern = ['유산소', '근력', '스트레칭', '요가', '근력', '유산소', '휴식'];
    }

    // 초급자는 주 3~4회로 줄이고 휴식을 늘림
    if (level === '초급') {
      pattern = pattern.map((t, idx) => ((idx === 2 || idx === 5) && t !== '휴식' ? '휴식' : t));
    }

    const weekPlan = {};

    DAYS.forEach((day, idx) => {
      const type = pattern[idx];

      if (type === '휴식') {
        weekPlan[day] = {
          type: '휴식',
          exercises: [],
          duration: 0,
          intensity: '없음',
          note: '근육 회복과 컨디션 관리를 위한 휴식일입니다. 가벼운 산책이나 스트레칭은 무방합니다.'
        };
        return;
      }

      const exNames = pickExercises(type, environment, preferred, type === '근력' ? 4 : 3);
      const exercises = exNames.map((name) => ({
        name,
        sets: type === '근력' || type === '필라테스' ? levelInfo.sets : 1,
        reps: type === '근력' || type === '필라테스' ? levelInfo.reps : 1,
        intensity: level
      }));

      const baseDuration = type === '유산소' ? 35 : type === '근력' ? 45 : 25;
      const duration = Math.round(baseDuration * levelInfo.durationFactor);

      weekPlan[day] = {
        type,
        exercises,
        duration,
        intensity: levelInfo.intensity
      };
    });

    return weekPlan;
  }

  /**
   * 4주 진행 계획을 생성한다.
   * 1주차 적응기 -> 2~3주차 강화기 -> 4주차 회복기
   * @param {string} level
   * @returns {Array<object>}
   */
  function buildFourWeekProgression(level) {
    const normalized = normalizeLevel(level);

    return [
      { week: 1, focus: '적응기', intensityMod: 0.8, note: '무리하지 않고 정확한 자세를 익히는 데 집중하세요.' },
      { week: 2, focus: '습관형성기', intensityMod: 0.9, note: '세트당 반복 수 또는 운동 시간을 5~10% 늘려보세요.' },
      { week: 3, focus: '강화기', intensityMod: 1.0, note: `신체 반응을 살피며 강도를 유지하거나 소폭 증가시키세요 (${normalized} 기준).` },
      { week: 4, focus: '도약기', intensityMod: 1.15, note: '컨디션을 점검하며 다음 4주 사이클의 강도를 재설정하세요.' }
    ];
  }

  // =====================================================================
  // 6. 식단 콘텐츠 라이브러리 및 생성
  // =====================================================================

  // 한국식 메뉴 라이브러리: 끼니별로 다양하게 구성 (밥/국/반찬 구성 위주)
  // 채식/비건 사용자도 항상 충분한 선택지를 가질 수 있도록 각 끼니에
  // 고기/생선/계란/유제품이 들어가지 않는 메뉴를 다수 포함한다.
  const MEAL_LIBRARY = {
    breakfast: [
      { menu: '현미밥, 계란찜, 시금치나물, 김치', calories: 420, items: ['현미밥 1/2공기', '계란 2개', '시금치나물', '김치'] },
      { menu: '오트밀 죽, 삶은 계란, 방울토마토', calories: 380, items: ['오트밀 50g', '계란 1개', '방울토마토 10개'] },
      { menu: '통밀 토스트, 아보카도, 그릭요거트', calories: 400, items: ['통밀빵 2장', '아보카도 1/2개', '그릭요거트 100g'] },
      { menu: '두부 스크램블, 잡곡밥 소량, 미역국', calories: 410, items: ['두부 100g', '잡곡밥 1/3공기', '미역국 1그릭'] },
      { menu: '바나나, 그래놀라, 우유', calories: 390, items: ['바나나 1개', '그래놀라 40g', '우유 200ml'] },
      { menu: '현미밥, 된장국, 두부조림, 나물반찬', calories: 430, items: ['현미밥 1/2공기', '된장국 1그릭', '두부조림', '나물반찬'] },
      { menu: '단호박죽, 견과류, 삶은 달걀', calories: 400, items: ['단호박죽 1그릭', '견과류 15g', '계란 1개'] },
      { menu: '두유, 그래놀라, 바나나, 블루베리', calories: 380, items: ['두유 200ml', '그래놀라 30g', '바나나 1개', '블루베리 50g'] },
      { menu: '현미밥, 강된장, 가지나물, 오이무침', calories: 410, items: ['현미밥 1/2공기', '강된장', '가지나물', '오이무침'] },
      { menu: '두부 들깨탕, 잡곡밥 소량, 김치', calories: 420, items: ['두부 100g', '들깨탕 1그릭', '잡곡밥 1/3공기', '김치'] }
    ],
    lunch: [
      { menu: '잡곡밥, 닭가슴살 구이, 된장국, 나물반찬', calories: 620, items: ['잡곡밥 1공기', '닭가슴살 120g', '된장국 1그릭', '나물반찬'] },
      { menu: '현미밥, 고등어구이, 미역국, 김치', calories: 600, items: ['현미밥 1공기', '고등어구이 1토막', '미역국 1그릭', '김치'] },
      { menu: '비빔밥(현미밥, 채소, 고추장 소량), 계란후라이', calories: 640, items: ['현미밥 1공기', '나물 모음', '고추장', '계란 1개'] },
      { menu: '닭가슴살 샐러드, 통밀빵, 단호박 수프', calories: 580, items: ['닭가슴살 100g', '샐러드 채소', '통밀빵 1장', '단호박 수프'] },
      { menu: '잡곡밥, 제육볶음(저염), 콩나물국, 깍두기', calories: 650, items: ['잡곡밥 1공기', '제육볶음 100g', '콩나물국 1그릭', '깍두기'] },
      { menu: '현미밥, 두부조림, 시금치나물, 계란찜', calories: 600, items: ['현미밥 1공기', '두부조림', '시금치나물', '계란찜'] },
      { menu: '곤약밥, 불고기(소량), 야채볶음, 김치', calories: 610, items: ['곤약밥 1공기', '불고기 80g', '야채볶음', '김치'] },
      { menu: '두부 야채비빔밥(현미밥, 채소, 고추장 소량), 된장국', calories: 600, items: ['현미밥 1공기', '두부 100g', '채소', '고추장', '된장국'] },
      { menu: '잡곡밥, 두부조림, 시금치나물, 콩나물국, 김치', calories: 590, items: ['잡곡밥 1공기', '두부조림', '시금치나물', '콩나물국', '김치'] },
      { menu: '곤약밥, 버섯볶음, 두부구이, 나물반찬, 된장국', calories: 580, items: ['곤약밥 1공기', '버섯볶음', '두부구이', '나물반찬', '된장국'] },
      { menu: '렌틸콩 카레, 현미밥, 채소샐러드', calories: 610, items: ['렌틸콩 카레 1그릭', '현미밥 1/2공기', '채소샐러드'] }
    ],
    dinner: [
      { menu: '현미밥, 연어구이, 브로콜리, 된장국', calories: 520, items: ['현미밥 1/2공기', '연어 150g', '브로콜리', '된장국 1그릭'] },
      { menu: '잡곡밥, 닭가슴살 스테이크, 양배추샐러드', calories: 500, items: ['잡곡밥 1/2공기', '닭가슴살 120g', '양배추샐러드'] },
      { menu: '두부김치, 현미밥 소량, 미역국', calories: 480, items: ['두부 150g', '김치', '현미밥 1/3공기', '미역국 1그릭'] },
      { menu: '소고기 야채볶음, 곤약밥, 콩나물무침', calories: 530, items: ['소고기 80g', '야채볶음', '곤약밥 1/2공기', '콩나물무침'] },
      { menu: '생선구이, 현미밥, 시금치된장국, 나물반찬', calories: 510, items: ['생선구이 1토막', '현미밥 1/2공기', '시금치된장국', '나물반찬'] },
      { menu: '닭가슴살 야채죽, 김치, 오이무침', calories: 470, items: ['닭가슴살 야채죽 1그릭', '김치', '오이무침'] },
      { menu: '두부스테이크, 현미밥, 채소구이', calories: 490, items: ['두부 150g', '현미밥 1/2공기', '채소구이'] },
      { menu: '버섯 두부전, 현미밥, 미역국, 나물반찬', calories: 480, items: ['버섯 두부전', '현미밥 1/3공기', '미역국 1그릭', '나물반찬'] },
      { menu: '두부김치찌개(저염), 잡곡밥 소량, 콩나물무침', calories: 500, items: ['두부김치찌개 1그릭', '잡곡밥 1/3공기', '콩나물무침'] },
      { menu: '채소 야채죽, 두부조림, 김치', calories: 460, items: ['야채죽 1그릭', '두부조림', '김치'] },
      { menu: '병아리콩 샐러드, 통밀빵, 채소수프', calories: 470, items: ['병아리콩 샐러드', '통밀빵 1장', '채소수프'] }
    ],
    snack: [
      { menu: '그릭요거트, 블루베리', calories: 180, items: ['그릭요거트 100g', '블루베리 50g'] },
      { menu: '아몬드 한 줌(15알), 사과 반쪽', calories: 200, items: ['아몬드 15알', '사과 1/2개'] },
      { menu: '단백질 쉐이크', calories: 190, items: ['단백질파우더 1스쿱', '물 또는 우유 200ml'] },
      { menu: '바나나, 무가당 두유', calories: 210, items: ['바나나 1개', '두유 200ml'] },
      { menu: '삶은 계란, 방울토마토', calories: 170, items: ['계란 2개', '방울토마토 10개'] },
      { menu: '오이, 당근 스틱, 후무스', calories: 160, items: ['오이', '당근', '후무스'] },
      { menu: '고구마 1/2개', calories: 190, items: ['고구마 1/2개'] },
      { menu: '견과류 한 줌, 두유', calories: 200, items: ['견과류 20g', '두유 200ml'] },
      { menu: '방울토마토, 아몬드', calories: 170, items: ['방울토마토 10개', '아몬드 10알'] }
    ]
  };

  // 식단 회피/제한에 따른 메뉴 필터링 키워드
  const RESTRICTION_FILTERS = {
    '채식': (menu) => !/(닭|고기|생선|연어|고등어|소고기|제육|불고기|계란|달걀)/.test(menu),
    '비건': (menu) => !/(닭|고기|생선|연어|고등어|소고기|제육|불고기|계란|달걀|우유|요거트|치즈)/.test(menu),
    '할랄': (menu) => !/(돼지|제육|삼겹)/.test(menu),
    '저탄수': (menu) => !/(밥|빵|죽|토스트)/.test(menu) || /현미|통밀|곤약/.test(menu),
    '글루텐프리': (menu) => !/(빵|면|토스트)/.test(menu),
    '락토프리': (menu) => !/(우유|치즈|요거트)/.test(menu)
  };

  /**
   * 식이제한을 반영해 메뉴 풀을 필터링한다. 모든 메뉴가 걸러지면 원본 풀을 반환(안전장치).
   * @param {Array<object>} pool
   * @param {Array<string>} restrictions
   * @param {string} avoided
   * @returns {Array<object>}
   */
  function filterMeals(pool, restrictions, avoided) {
    let filtered = pool;

    (restrictions || []).forEach((r) => {
      const fn = RESTRICTION_FILTERS[r];
      if (fn) {
        const next = filtered.filter((item) => fn(item.menu));
        if (next.length > 0) filtered = next;
      }
    });

    if (avoided && avoided.trim() !== '') {
      const avoidWords = avoided.split(/[,\s]+/).filter(Boolean);
      const next = filtered.filter((item) => !avoidWords.some((w) => item.menu.includes(w)));
      if (next.length > 0) filtered = next;
    }

    return filtered.length > 0 ? filtered : pool;
  }

  /**
   * 끼니별 칼로리를 일일 목표 칼로리 비율에 맞게 조정하고, 메뉴를 선택한다.
   * @param {Array<object>} pool - 필터링된 메뉴 풀
   * @param {number} targetCalories - 해당 끼니의 목표 칼로리
   * @param {number} dayIndex - 요일 인덱스 (다양성을 위한 회전)
   * @returns {object} { menu, calories, items }
   */
  function pickMeal(pool, targetCalories, dayIndex) {
    const idx = dayIndex % pool.length;
    const base = pool[idx];
    return {
      menu: base.menu,
      calories: Math.round(targetCalories),
      items: (base.items || []).slice()
    };
  }

  /**
   * 주간 식단 플랜을 생성한다 (한글 요일 키 버전, 내부 계산용).
   * 일일 칼로리 분배: 아침 25%, 점심 35%, 저녁 30%, 간식 10%
   * @param {object} diet - profile.diet
   * @param {number} dailyCalories
   * @returns {object} { weekPlan, shoppingList }
   */
  function buildDietWeekPlan(diet, dailyCalories) {
    const restrictions = (diet && diet.restrictions) || [];
    const avoided = (diet && diet.avoided) || '';
    const mealPattern = (diet && diet.mealPattern) || '3끼';

    const breakfastPool = filterMeals(MEAL_LIBRARY.breakfast, restrictions, avoided);
    const lunchPool = filterMeals(MEAL_LIBRARY.lunch, restrictions, avoided);
    const dinnerPool = filterMeals(MEAL_LIBRARY.dinner, restrictions, avoided);
    const snackPool = filterMeals(MEAL_LIBRARY.snack, restrictions, avoided);

    const ratios = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
    const includeSnack = mealPattern !== '2끼';

    const weekPlan = {};

    DAYS.forEach((day, idx) => {
      const breakfast = pickMeal(breakfastPool, dailyCalories * ratios.breakfast, idx);
      const lunch = pickMeal(lunchPool, dailyCalories * ratios.lunch, idx);
      const dinner = pickMeal(dinnerPool, dailyCalories * ratios.dinner, idx);

      const dayPlan = { breakfast, lunch, dinner };

      if (includeSnack) {
        dayPlan.snack = pickMeal(snackPool, dailyCalories * ratios.snack, idx);
      } else {
        // 간식을 포함하지 않는 경우 그 칼로리를 점심/저녁에 분산
        dayPlan.lunch.calories = Math.round(dailyCalories * (ratios.lunch + ratios.snack / 2));
        dayPlan.dinner.calories = Math.round(dailyCalories * (ratios.dinner + ratios.snack / 2));
      }

      weekPlan[day] = dayPlan;
    });

    const shoppingList = buildShoppingList(weekPlan);

    return { weekPlan, shoppingList };
  }

  // 메뉴 문자열에서 식재료를 추출하기 위한 매핑 (간단한 키워드 기반)
  const INGREDIENT_KEYWORDS = [
    '현미밥', '현미', '잡곡밥', '곤약밥', '오트밀', '통밀빵', '토스트', '그래놀라',
    '계란', '달걀', '두부', '닭가슴살', '고등어', '연어', '소고기', '제육', '불고기',
    '시금치', '미역', '된장', '콩나물', '브로콜리', '양배추', '오이', '당근', '고구마',
    '단호박', '바나나', '사과', '방울토마토', '블루베리', '아몬드', '그릭요거트', '우유',
    '두유', '김치', '깍두기', '나물', '견과류', '후무스', '아보카도'
  ];

  // 식재료 카테고리 매핑 (쇼핑 리스트 분류용)
  const INGREDIENT_CATEGORY_MAP = {
    '곡류': ['현미밥', '현미', '잡곡밥', '곤약밥', '오트밀', '통밀빵', '토스트', '그래놀라'],
    '육류/단백질': ['계란', '달걀', '두부', '닭가슴살', '고등어', '연어', '소고기', '제육', '불고기'],
    '채소': ['시금치', '미역', '콩나물', '브로콜리', '양배추', '오이', '당근', '고구마', '단호박', '나물', '아보카도'],
    '유제품': ['그릭요거트', '우유', '두유'],
    '과일': ['바나나', '사과', '방울토마토', '블루베리'],
    '조미료/기타': ['된장', '김치', '깍두기', '견과류', '후무스', '아몬드']
  };

  /**
   * 주간 식단 데이터에서 식재료를 추출해 통합 쇼핑 리스트를 만든다.
   * @param {object} weekPlan
   * @returns {Array<string>}
   */
  function buildShoppingList(weekPlan) {
    const found = new Set();

    Object.values(weekPlan).forEach((dayPlan) => {
      Object.values(dayPlan).forEach((meal) => {
        if (!meal || !meal.menu) return;
        INGREDIENT_KEYWORDS.forEach((kw) => {
          if (meal.menu.includes(kw)) found.add(kw);
        });
      });
    });

    return Array.from(found).sort();
  }

  /**
   * 식재료 키워드 배열을 카테고리별로 분류한다.
   * @param {Array<string>} ingredients
   * @returns {object}
   */
  function categorizeIngredients(ingredients) {
    const result = {};
    Object.keys(INGREDIENT_CATEGORY_MAP).forEach((cat) => { result[cat] = []; });
    result['기타'] = [];

    (ingredients || []).forEach((item) => {
      const matchedCategory = Object.keys(INGREDIENT_CATEGORY_MAP).find((cat) =>
        INGREDIENT_CATEGORY_MAP[cat].includes(item)
      );
      if (matchedCategory) {
        result[matchedCategory].push(item);
      } else {
        result['기타'].push(item);
      }
    });

    return result;
  }

  // =====================================================================
  // 7. 통합 캘린더 생성
  // =====================================================================

  /**
   * 끼니 시간을 기상/취침 시간을 고려해 대략적으로 산출한다.
   * @param {string} wakeUp - "HH:MM"
   * @returns {{breakfast:string, lunch:string, dinner:string, snack:string}}
   */
  function deriveMealTimes(wakeUp) {
    const [h] = (wakeUp || '07:00').split(':').map(Number);
    const breakfastHour = isNaN(h) ? 7 : h;
    const pad = (n) => String(((n % 24) + 24) % 24).padStart(2, '0');

    return {
      breakfast: `${pad(breakfastHour)}:30`,
      snack: `${pad(breakfastHour + 3)}:00`,
      lunch: '12:30',
      dinner: '18:30'
    };
  }

  /**
   * 운동/식사/휴식 정보를 통합한 주간 캘린더를 생성한다 (한글 요일 키 버전, 내부 계산용).
   * @param {object} exerciseWeekPlan
   * @param {object} dietWeekPlan
   * @param {object} schedule
   * @returns {object} calendar
   */
  function buildCalendar(exerciseWeekPlan, dietWeekPlan, schedule) {
    const wakeUp = (schedule && schedule.wakeUp) || '07:00';
    const sleep = (schedule && schedule.sleep) || '23:00';
    const availableTimes = (schedule && schedule.availableTimes) || ['저녁'];
    const mealTimes = deriveMealTimes(wakeUp);
    const exerciseTime = pickExerciseTime(availableTimes, wakeUp);

    const calendar = {};

    DAYS.forEach((day) => {
      const events = [];
      const meals = dietWeekPlan[day];
      const ex = exerciseWeekPlan[day];

      events.push({
        time: wakeUp,
        type: 'rest',
        label: '기상',
        detail: '기상 후 물 한 잔과 가벼운 스트레칭으로 하루를 시작하세요.'
      });

      if (meals.breakfast) {
        events.push({
          time: mealTimes.breakfast,
          type: 'meal',
          label: '아침식사',
          detail: `${meals.breakfast.menu} (${meals.breakfast.calories}kcal)`
        });
      }

      if (meals.snack) {
        events.push({
          time: mealTimes.snack,
          type: 'meal',
          label: '간식',
          detail: `${meals.snack.menu} (${meals.snack.calories}kcal)`
        });
      }

      events.push({
        time: mealTimes.lunch,
        type: 'meal',
        label: '점심식사',
        detail: `${meals.lunch.menu} (${meals.lunch.calories}kcal)`
      });

      if (ex.type === '휴식') {
        events.push({
          time: exerciseTime,
          type: 'rest',
          label: '휴식일',
          detail: ex.note || '오늘은 휴식하며 회복에 집중하세요.'
        });
      } else {
        events.push({
          time: exerciseTime,
          type: 'exercise',
          label: `${ex.type} ${ex.duration}분`,
          detail: ex.exercises.map((e) => e.name).join(', ')
        });
      }

      events.push({
        time: mealTimes.dinner,
        type: 'meal',
        label: '저녁식사',
        detail: `${meals.dinner.menu} (${meals.dinner.calories}kcal)`
      });

      events.push({
        time: sleep,
        type: 'rest',
        label: '취침',
        detail: '양질의 수면을 위해 취침 1시간 전 전자기기 사용을 줄이세요.'
      });

      // 시간순 정렬
      events.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));

      calendar[day] = events;
    });

    return calendar;
  }

  // =====================================================================
  // 8. Planner 메인 진입점 (내부 한글 버전)
  // =====================================================================

  /**
   * 프로파일 객체에 기본값을 채워 안전하게 사용할 수 있도록 정규화한다.
   * @param {object} profile
   * @returns {object} normalized profile
   */
  function normalizeProfile(profile) {
    const p = profile || {};
    return {
      basic: Object.assign({ age: 30, gender: 'male', height: 170, weight: 65 }, p.basic),
      goals: Array.isArray(p.goals) && p.goals.length > 0 ? p.goals : ['컨디션유지'],
      health: Object.assign({ conditions: [], medications: '', allergies: [], injuries: '' }, p.health),
      schedule: Object.assign(
        { wakeUp: '07:00', sleep: '23:00', workPattern: '주간근무', availableTimes: ['저녁'] },
        p.schedule
      ),
      diet: Object.assign({ mealPattern: '3끼', preferred: '', avoided: '', restrictions: [] }, p.diet),
      exercise: Object.assign(
        { currentLevel: '초급', preferred: ['걷기', '스트레칭'], environment: '홈' },
        p.exercise
      )
    };
  }

  /**
   * 사용자 프로파일을 받아 완전한 플랜 객체를 생성한다 (한글 요일 키 버전).
   * @param {object} profile
   * @returns {object} plan
   */
  function generatePlan(profile) {
    const p = normalizeProfile(profile);

    // --- 수치 계산 ---
    const bmr = calcBMR(p.basic);
    const tdee = calcTDEE(bmr, p.exercise.currentLevel);
    const calorieAdjust = calcCalorieAdjust(p.goals);
    const dailyCalories = Math.max(1200, Math.round(tdee + calorieAdjust)); // 최소 칼로리 안전장치
    const macros = calcMacros(p.goals);
    const bmi = calcBMI(p.basic.weight, p.basic.height);
    const bmiCategory = classifyBMI(bmi);

    const riskFactors = assessRiskFactors(p.health, bmi);
    const recommendations = buildRecommendations(p, bmi);

    // --- 운동 플랜 ---
    const exerciseWeekPlan = buildExerciseWeekPlan(p.exercise, p.schedule, p.goals);
    const fourWeekProgression = buildFourWeekProgression(p.exercise.currentLevel);

    // --- 식단 플랜 ---
    const dietResult = buildDietWeekPlan(p.diet, dailyCalories);

    // --- 통합 캘린더 ---
    const calendar = buildCalendar(exerciseWeekPlan, dietResult.weekPlan, p.schedule);

    return {
      generated: new Date().toISOString().slice(0, 10),
      dailyCalories,
      macros,
      summary: {
        bmi,
        bmiCategory,
        dailyCalories,
        tdee,
        bmr,
        macros,
        riskFactors,
        recommendations
      },
      exercise: {
        weekPlan: exerciseWeekPlan,
        fourWeekProgression
      },
      diet: {
        weekPlan: dietResult.weekPlan,
        shoppingList: dietResult.shoppingList
      },
      calendar
    };
  }

  // =====================================================================
  // 9. 과제 명세 호환 공개 API (영문 요일 키 / 표준 함수명)
  // - web-ui와 과제 명세서가 기대하는 정확한 함수 시그니처를 제공하는 어댑터.
  // - 내부적으로는 위의 한글 버전 로직을 그대로 재사용한다.
  // =====================================================================

  /**
   * 한글 요일 키 객체를 영문 요일 키 객체로 변환한다.
   * @param {object} obj - { 월: ..., 화: ..., ... }
   * @returns {object} { monday: ..., tuesday: ..., ... }
   */
  function toEnglishDayKeys(obj) {
    const result = {};
    DAYS.forEach((krDay, idx) => {
      result[DAY_KEYS[idx]] = obj[krDay];
    });
    return result;
  }

  /**
   * BMI를 계산하고 체중 카테고리를 분류한다.
   * @param {number} height - cm
   * @param {number} weight - kg
   * @returns {{value: number, category: string}}
   */
  function calculateBMI(height, weight) {
    if (!height || !weight || height <= 0 || weight <= 0) {
      return { value: 0, category: '알수없음' };
    }
    const value = calcBMI(weight, height);
    return { value, category: classifyBMI(value) };
  }

  /**
   * 해리스-베네딕트 계열(Mifflin-St Jeor) 공식으로 기초대사량(BMR)을 계산한다.
   * @param {number} age
   * @param {string} gender - 'male'|'female' (또는 '남성'/'여성')
   * @param {number} height - cm
   * @param {number} weight - kg
   * @returns {number}
   */
  function calculateBMR(age, gender, height, weight) {
    return calcBMR({ age, gender, height, weight });
  }

  /**
   * BMR과 활동량 수준으로 TDEE(총 일일 소비 칼로리)를 계산한다.
   * @param {number} bmr
   * @param {string} activityLevel - '거의안함'|'낮음'|'보통'|'높음'|'매우높음'
   * @returns {number}
   */
  function calculateTDEE(bmr, activityLevel) {
    const multiplier = getActivityFactor(activityLevel);
    return Math.round(bmr * multiplier);
  }

  /**
   * 목표에 따라 TDEE를 조정해 일일 권장 칼로리를 계산한다.
   * (감량: -500, 증가: +300, 유지: 0)
   * @param {number} tdee
   * @param {Array<string>} goals
   * @returns {number}
   */
  function calculateDailyCalories(tdee, goals) {
    const adjustment = calcCalorieAdjust(goals);
    return Math.max(1200, Math.round(tdee + adjustment));
  }

  /**
   * 목표에 따라 탄수화물/단백질/지방 비율(%)을 계산한다.
   * @param {number} dailyCalories
   * @param {Array<string>} goals
   * @returns {{carbs: number, protein: number, fat: number}}
   */
  function calculateMacros(dailyCalories, goals) {
    return calcMacros(goals);
  }

  /**
   * 프로파일을 기반으로 7일 운동 루틴(영문 요일 키)과 4주 진행 가이드를 생성한다.
   * @param {object} profile
   * @returns {object} { monday: {...}, ..., sunday: {...}, weeks: [...] }
   */
  function generateExercisePlan(profile) {
    const p = normalizeProfile(profile);
    const weekPlanKr = buildExerciseWeekPlan(p.exercise, p.schedule, p.goals);

    const plan = toEnglishDayKeys(weekPlanKr);

    // 반환 형태를 명세에 맞춰 { name, exercises, duration, type } 구조로 정리
    Object.keys(plan).forEach((dayKey) => {
      const day = plan[dayKey];
      if (day.type === '휴식') {
        plan[dayKey] = { name: '휴식일', exercises: [], duration: 0, type: 'rest' };
      } else {
        plan[dayKey] = {
          name: `${day.type} 운동`,
          exercises: day.exercises,
          duration: day.duration,
          type: day.type
        };
      }
    });

    plan.weeks = buildFourWeekProgression(p.exercise.currentLevel);
    return plan;
  }

  /**
   * 프로파일/칼로리/매크로를 반영해 7일 식단 플랜(영문 요일 키)을 생성한다.
   * @param {object} profile
   * @param {number} dailyCalories
   * @param {object} macros - { carbs, protein, fat }
   * @returns {object} { monday: {...}, ..., sunday: {...} }
   */
  function generateDietPlan(profile, dailyCalories, macros) {
    const p = normalizeProfile(profile);
    const dietResult = buildDietWeekPlan(p.diet, dailyCalories);
    const weekPlanEn = toEnglishDayKeys(dietResult.weekPlan);

    const plan = {};
    Object.keys(weekPlanEn).forEach((dayKey) => {
      const meals = weekPlanEn[dayKey];
      const totalCalories = Object.values(meals).reduce((sum, m) => sum + (m.calories || 0), 0);
      plan[dayKey] = {
        meals,
        totalCalories,
        targetCalories: dailyCalories,
        macros
      };
    });

    return plan;
  }

  /**
   * 식단 플랜에서 재료를 추출해 카테고리별 쇼핑 리스트를 생성한다.
   * @param {object} dietPlan - generateDietPlan()의 반환값
   * @returns {object} { 곡류: [...], 채소: [...], '육류/단백질': [...], 유제품: [...], 과일: [...], '조미료/기타': [...] }
   */
  function generateShoppingList(dietPlan) {
    const ingredients = new Set();

    Object.values(dietPlan || {}).forEach((day) => {
      if (!day || !day.meals) return;
      Object.values(day.meals).forEach((meal) => {
        (meal.items || []).forEach((item) => {
          INGREDIENT_KEYWORDS.forEach((kw) => {
            if (item.includes(kw)) ingredients.add(kw);
          });
        });
      });
    });

    return categorizeIngredients(Array.from(ingredients));
  }

  /**
   * 운동 플랜, 식단 플랜, 스케줄을 통합해 7일치 캘린더 이벤트(영문 요일 키)를 생성한다.
   * @param {object} exercisePlan - generateExercisePlan()의 반환값
   * @param {object} dietPlan - generateDietPlan()의 반환값
   * @param {object} schedule - { wakeUp, sleep, workPattern, availableTimes }
   * @returns {object} { monday: { events: [...] }, ... }
   */
  function generateWeeklyCalendar(exercisePlan, dietPlan, schedule) {
    const sched = schedule || {};
    const wakeUp = sched.wakeUp || '07:00';
    const sleep = sched.sleep || '23:00';
    const availableTimes = sched.availableTimes || ['저녁'];
    const mealTimes = deriveMealTimes(wakeUp);
    const exerciseTime = pickExerciseTime(availableTimes, wakeUp);

    const calendar = {};

    DAY_KEYS.forEach((dayKey) => {
      const events = [];
      const dayDiet = dietPlan ? dietPlan[dayKey] : null;
      const dayExercise = exercisePlan ? exercisePlan[dayKey] : null;

      events.push({ time: wakeUp, type: 'rest', title: '기상', color: 'rest' });

      if (dayDiet && dayDiet.meals) {
        const m = dayDiet.meals;
        if (m.breakfast) events.push({ time: mealTimes.breakfast, type: 'meal', title: `아침: ${m.breakfast.menu}`, color: 'meal' });
        if (m.snack) events.push({ time: mealTimes.snack, type: 'meal', title: `간식: ${m.snack.menu}`, color: 'meal' });
        if (m.lunch) events.push({ time: mealTimes.lunch, type: 'meal', title: `점심: ${m.lunch.menu}`, color: 'meal' });
        if (m.dinner) events.push({ time: mealTimes.dinner, type: 'meal', title: `저녁: ${m.dinner.menu}`, color: 'meal' });
      }

      if (dayExercise && dayExercise.type && dayExercise.type !== 'rest') {
        events.push({
          time: exerciseTime,
          type: 'exercise',
          title: `${dayExercise.name} ${dayExercise.duration}분`,
          color: 'exercise'
        });
      } else if (dayExercise) {
        events.push({ time: exerciseTime, type: 'rest', title: '휴식일 - 가벼운 산책 추천', color: 'rest' });
      }

      events.push({ time: sleep, type: 'rest', title: '취침', color: 'rest' });

      events.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));

      calendar[dayKey] = { label: DAY_LABEL_KR_BY_KEY[dayKey], events };
    });

    return calendar;
  }

  const DAY_LABEL_KR_BY_KEY = {
    monday: '월요일', tuesday: '화요일', wednesday: '수요일', thursday: '목요일',
    friday: '금요일', saturday: '토요일', sunday: '일요일'
  };

  /**
   * 프로파일을 입력받아 BMI/TDEE 계산부터 운동/식단/캘린더까지 전체 플랜을 생성한다.
   * 순서: BMI/TDEE 계산 -> 칼로리/매크로 -> 운동 -> 식단 -> 통합 캘린더
   * @param {object} profile
   * @returns {object|null} 전체 플랜 객체
   */
  function generateFullPlan(profile) {
    if (!profile || !profile.basic) {
      console.warn('[Planner] generateFullPlan: 유효하지 않은 프로파일입니다.', profile);
      return null;
    }

    const p = normalizeProfile(profile);
    const { age, gender, height, weight } = p.basic;
    const goals = p.goals;

    const exerciseLevel = p.exercise.currentLevel;
    const activityLevelGuess = exerciseLevel === '고급' ? '높음' : exerciseLevel === '중급' ? '보통' : '낮음';

    // 1. BMI / BMR / TDEE
    const bmi = calculateBMI(height, weight);
    const bmr = calculateBMR(age, gender, height, weight);
    const tdee = calculateTDEE(bmr, activityLevelGuess);

    // 2. 칼로리 / 매크로
    const dailyCalories = calculateDailyCalories(tdee, goals);
    const macros = calculateMacros(dailyCalories, goals);

    // 3. 운동 플랜
    const exercisePlan = generateExercisePlan(p);

    // 4. 식단 플랜
    const dietPlan = generateDietPlan(p, dailyCalories, macros);
    const shoppingList = generateShoppingList(dietPlan);

    // 5. 통합 캘린더
    const calendar = generateWeeklyCalendar(exercisePlan, dietPlan, p.schedule);

    return {
      generated: new Date().toISOString().slice(0, 10),
      analysis: { bmi, bmr, tdee, activityLevelGuess },
      dailyCalories,
      macros,
      exercise: exercisePlan,
      diet: dietPlan,
      shoppingList,
      calendar
    };
  }

  // ---------------------------------------------------------------------
  // 전역 노출
  // ---------------------------------------------------------------------
  const Planner = {
    // 과제 명세 표준 API (영문 요일 키)
    calculateBMI,
    calculateBMR,
    calculateTDEE,
    calculateDailyCalories,
    calculateMacros,
    generateExercisePlan,
    generateDietPlan,
    generateShoppingList,
    generateWeeklyCalendar,
    generateFullPlan,
    // 한글 요일 키 기반의 통합 생성 함수 (하위호환용)
    generatePlan,
    // 내부 계산 함수들도 테스트/디버깅 편의를 위해 노출
    _internal: {
      calcBMR,
      calcTDEE,
      calcCalorieAdjust,
      calcMacros,
      calcBMI,
      classifyBMI
    }
  };

  global.HealthFlowPlanner = Planner;
  // 하위호환을 위해 별칭도 함께 노출
  global.Planner = global.Planner || Planner;

})(typeof window !== 'undefined' ? window : globalThis);
