/**
 * storage.js
 * HealthFlow localStorage CRUD 모듈
 * - 프로파일 / 플랜 / 진행기록 / 설정 데이터를 localStorage에 저장하고 관리한다.
 * - 모든 키는 "healthflow_" 접두사를 사용한다.
 * - JSON.parse/stringify 예외 상황(깨진 데이터, 저장공간 초과 등)에 대비한다.
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // 내부 상수
  // ---------------------------------------------------------------------
  const KEYS = {
    PROFILE: 'healthflow_profile',
    PLAN: 'healthflow_plan',
    PROGRESS: 'healthflow_progress',
    SETTINGS: 'healthflow_settings'
  };

  // ---------------------------------------------------------------------
  // 내부 유틸 함수
  // ---------------------------------------------------------------------

  /**
   * localStorage에서 안전하게 값을 읽어 JSON으로 파싱한다.
   * 데이터가 없거나 깨진 경우 fallback을 반환한다.
   * @param {string} key
   * @param {*} fallback
   * @returns {*}
   */
  function safeGet(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Storage] "${key}" 데이터 파싱 실패. 기본값을 반환합니다.`, err);
      return fallback;
    }
  }

  /**
   * 값을 JSON 문자열로 변환해 localStorage에 안전하게 저장한다.
   * 저장공간 초과(QuotaExceededError) 등의 예외를 방어한다.
   * @param {string} key
   * @param {*} value
   * @returns {boolean} 저장 성공 여부
   */
  function safeSet(key, value) {
    try {
      const raw = JSON.stringify(value);
      global.localStorage.setItem(key, raw);
      return true;
    } catch (err) {
      if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
        console.error(`[Storage] "${key}" 저장 실패: 저장공간이 가득 찼습니다.`, err);
      } else {
        console.error(`[Storage] "${key}" 데이터 저장 실패.`, err);
      }
      return false;
    }
  }

  /**
   * localStorage에서 특정 키를 제거한다.
   * @param {string} key
   * @returns {boolean} 삭제 성공 여부
   */
  function safeRemove(key) {
    try {
      global.localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.warn(`[Storage] "${key}" 삭제 실패.`, err);
      return false;
    }
  }

  /**
   * 현재 시각의 ISO 8601 문자열을 반환한다.
   * @returns {string}
   */
  function nowISO() {
    return new Date().toISOString();
  }

  /**
   * 프로파일 객체의 최소 유효성을 검증한다.
   * (web-ui에서 불완전한 객체를 넘기더라도 앱이 죽지 않도록 방어)
   * @param {*} profile
   * @returns {boolean}
   */
  function isValidProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (!profile.basic || typeof profile.basic !== 'object') return false;
    const { age, gender, height, weight } = profile.basic;
    if (typeof age !== 'number' || age <= 0) return false;
    if (typeof gender !== 'string' || gender === '') return false;
    if (typeof height !== 'number' || height <= 0) return false;
    if (typeof weight !== 'number' || weight <= 0) return false;
    return true;
  }

  /**
   * 진행 기록 entry의 최소 유효성을 검증한다.
   * @param {*} entry
   * @returns {boolean}
   */
  function isValidProgressEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (typeof entry.date !== 'string' || entry.date === '') return false;
    return true;
  }

  /**
   * "YYYY-MM-DD" 형식 날짜 문자열 비교용 헬퍼.
   * @param {string} date
   * @param {string} start
   * @param {string} end
   * @returns {boolean}
   */
  function isWithinRange(date, start, end) {
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }

  // ---------------------------------------------------------------------
  // Storage 공개 API
  // ---------------------------------------------------------------------
  const Storage = {

    // -------------------------------------------------------------
    // 프로파일
    // -------------------------------------------------------------

    /**
     * 저장된 사용자 프로파일을 가져온다.
     * @returns {object|null}
     */
    getProfile() {
      return safeGet(KEYS.PROFILE, null);
    },

    /**
     * 사용자 프로파일을 저장한다. createdAt/updatedAt 타임스탬프를 자동 관리한다.
     * @param {object} profile
     * @returns {boolean} 저장 성공 여부
     */
    saveProfile(profile) {
      if (!isValidProfile(profile)) {
        console.warn('[Storage] saveProfile: 유효하지 않은 프로파일 객체입니다.', profile);
        return false;
      }

      const existing = this.getProfile();
      const timestamp = nowISO();

      const toSave = Object.assign({}, profile, {
        createdAt: (existing && existing.createdAt) || profile.createdAt || timestamp,
        updatedAt: timestamp
      });

      return safeSet(KEYS.PROFILE, toSave);
    },

    /**
     * 저장된 프로파일을 삭제한다.
     * @returns {boolean} 삭제 성공 여부
     */
    clearProfile() {
      return safeRemove(KEYS.PROFILE);
    },

    // -------------------------------------------------------------
    // 플랜
    // -------------------------------------------------------------

    /**
     * 저장된 건강 플랜을 가져온다.
     * @returns {object|null}
     */
    getPlan() {
      return safeGet(KEYS.PLAN, null);
    },

    /**
     * 건강 플랜을 저장한다.
     * @param {object} plan
     * @returns {boolean} 저장 성공 여부
     */
    savePlan(plan) {
      if (!plan || typeof plan !== 'object') {
        console.warn('[Storage] savePlan: 유효하지 않은 플랜 객체입니다.', plan);
        return false;
      }

      const toSave = Object.assign({}, plan, {
        generated: plan.generated || new Date().toISOString().slice(0, 10),
        savedAt: nowISO()
      });

      return safeSet(KEYS.PLAN, toSave);
    },

    /**
     * 저장된 플랜을 삭제한다.
     * @returns {boolean} 삭제 성공 여부
     */
    clearPlan() {
      return safeRemove(KEYS.PLAN);
    },

    // -------------------------------------------------------------
    // 진행 추적
    // -------------------------------------------------------------

    /**
     * 진행 기록 배열을 가져온다. 데이터가 없으면 빈 배열을 반환한다.
     * @returns {Array<object>}
     */
    getProgress() {
      const data = safeGet(KEYS.PROGRESS, []);
      return Array.isArray(data) ? data : [];
    },

    /**
     * 진행 기록을 추가한다. 동일한 날짜가 이미 있으면 병합(업데이트)한다.
     * @param {object} entry - { date, weight, exerciseDone, condition, notes, ... }
     * @returns {boolean} 저장 성공 여부
     */
    addProgress(entry) {
      if (!isValidProgressEntry(entry)) {
        console.warn('[Storage] addProgress: 유효하지 않은 진행 기록입니다.', entry);
        return false;
      }

      const list = this.getProgress();
      const idx = list.findIndex((item) => item.date === entry.date);
      const timestamp = nowISO();

      if (idx >= 0) {
        // 동일 날짜 기록이 있으면 병합하여 갱신
        list[idx] = Object.assign({}, list[idx], entry, { updatedAt: timestamp });
      } else {
        list.push(Object.assign({}, entry, { createdAt: timestamp, updatedAt: timestamp }));
      }

      // 날짜순 정렬 (오름차순)
      list.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

      return safeSet(KEYS.PROGRESS, list);
    },

    /**
     * 특정 날짜의 진행 기록을 부분 수정한다. 기록이 없으면 새로 생성한다.
     * @param {string} date - "YYYY-MM-DD"
     * @param {object} updates - 수정할 필드들
     * @returns {boolean} 저장 성공 여부
     */
    updateProgress(date, updates) {
      if (typeof date !== 'string' || date === '') {
        console.warn('[Storage] updateProgress: 유효하지 않은 날짜입니다.', date);
        return false;
      }
      if (!updates || typeof updates !== 'object') {
        console.warn('[Storage] updateProgress: 유효하지 않은 updates 객체입니다.', updates);
        return false;
      }

      const list = this.getProgress();
      const idx = list.findIndex((item) => item.date === date);
      const timestamp = nowISO();

      if (idx >= 0) {
        list[idx] = Object.assign({}, list[idx], updates, { date, updatedAt: timestamp });
      } else {
        list.push(Object.assign({ date }, updates, { createdAt: timestamp, updatedAt: timestamp }));
        list.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
      }

      return safeSet(KEYS.PROGRESS, list);
    },

    /**
     * 특정 날짜의 진행 기록을 삭제한다.
     * @param {string} date - "YYYY-MM-DD"
     * @returns {boolean} 삭제 성공 여부 (삭제 대상이 없어도 저장은 시도)
     */
    deleteProgress(date) {
      if (typeof date !== 'string' || date === '') {
        console.warn('[Storage] deleteProgress: 유효하지 않은 날짜입니다.', date);
        return false;
      }

      const list = this.getProgress();
      const filtered = list.filter((item) => item.date !== date);

      if (filtered.length === list.length) {
        // 삭제할 항목이 없었음
        return true;
      }

      return safeSet(KEYS.PROGRESS, filtered);
    },

    /**
     * 날짜 범위(포함)에 해당하는 진행 기록만 가져온다.
     * @param {string} startDate - "YYYY-MM-DD" (생략 가능)
     * @param {string} endDate - "YYYY-MM-DD" (생략 가능)
     * @returns {Array<object>}
     */
    getProgressByDateRange(startDate, endDate) {
      const list = this.getProgress();
      return list.filter((item) => isWithinRange(item.date, startDate, endDate));
    },

    // -------------------------------------------------------------
    // 설정
    // -------------------------------------------------------------

    /**
     * 저장된 설정을 가져온다 (다크모드 등).
     * @returns {object}
     */
    getSettings() {
      return safeGet(KEYS.SETTINGS, {});
    },

    /**
     * 설정을 저장한다. 기존 설정과 병합한다.
     * @param {object} settings
     * @returns {boolean}
     */
    saveSettings(settings) {
      if (!settings || typeof settings !== 'object') {
        console.warn('[Storage] saveSettings: 유효하지 않은 설정 객체입니다.', settings);
        return false;
      }
      const merged = Object.assign({}, this.getSettings(), settings);
      return safeSet(KEYS.SETTINGS, merged);
    },

    // -------------------------------------------------------------
    // 유틸
    // -------------------------------------------------------------

    /**
     * healthflow_ 로 시작하는 모든 localStorage 키를 삭제한다.
     * @returns {boolean} 전체 삭제 성공 여부
     */
    clearAll() {
      try {
        const allKeys = Object.values(KEYS);
        let success = true;
        allKeys.forEach((key) => {
          if (!safeRemove(key)) success = false;
        });
        return success;
      } catch (err) {
        console.error('[Storage] clearAll 실패.', err);
        return false;
      }
    },

    /**
     * 프로파일 존재 여부를 반환한다.
     * @returns {boolean}
     */
    hasProfile() {
      return this.getProfile() !== null;
    },

    /**
     * 플랜 존재 여부를 반환한다.
     * @returns {boolean}
     */
    hasPlan() {
      return this.getPlan() !== null;
    },

    /**
     * 전체 데이터(프로파일, 플랜, 진행기록, 설정)를 하나의 JSON 문자열로 내보낸다.
     * @returns {string} JSON 문자열
     */
    exportData() {
      const payload = {
        exportedAt: nowISO(),
        version: 1,
        data: {
          profile: this.getProfile(),
          plan: this.getPlan(),
          progress: this.getProgress(),
          settings: this.getSettings()
        }
      };

      try {
        return JSON.stringify(payload, null, 2);
      } catch (err) {
        console.error('[Storage] exportData 변환 실패.', err);
        return JSON.stringify({ exportedAt: nowISO(), version: 1, data: {} });
      }
    },

    /**
     * JSON 문자열을 받아 전체 데이터를 가져온다 (덮어쓰기).
     * @param {string} jsonStr
     * @returns {boolean} 성공 여부
     */
    importData(jsonStr) {
      if (typeof jsonStr !== 'string' || jsonStr.trim() === '') {
        console.warn('[Storage] importData: 빈 문자열입니다.');
        return false;
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (err) {
        console.error('[Storage] importData: JSON 파싱 실패.', err);
        return false;
      }

      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || typeof data !== 'object') {
        console.warn('[Storage] importData: 데이터 형식이 올바르지 않습니다.');
        return false;
      }

      let success = true;

      try {
        if (data.profile) {
          if (isValidProfile(data.profile)) {
            success = safeSet(KEYS.PROFILE, data.profile) && success;
          } else {
            console.warn('[Storage] importData: 프로파일 데이터가 유효하지 않아 건너뜁니다.');
          }
        }

        if (data.plan) {
          success = safeSet(KEYS.PLAN, data.plan) && success;
        }

        if (Array.isArray(data.progress)) {
          success = safeSet(KEYS.PROGRESS, data.progress) && success;
        }

        if (data.settings) {
          success = safeSet(KEYS.SETTINGS, data.settings) && success;
        }
      } catch (err) {
        console.error('[Storage] importData 처리 중 오류 발생.', err);
        success = false;
      }

      return success;
    }
  };

  // ---------------------------------------------------------------------
  // 전역 노출 (빌드도구 없이 script 태그로 로드)
  // 주의: 브라우저/Node 전역에는 이미 네이티브 "Storage" 인터페이스(클래스)가
  // 존재하므로 (예: localStorage instanceof Storage), `global.Storage || Storage`
  // 형태로는 절대 덮어써지지 않는다. web-ui 명세에 따라 명시적으로 덮어쓴다.
  // ---------------------------------------------------------------------
  global.HealthFlowStorage = Storage;
  global.Storage = Storage;

})(typeof window !== 'undefined' ? window : globalThis);
