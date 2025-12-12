/**
 * device-validator.js - 기기 인증 시스템
 * 하나의 전화번호로 여러 기기에서 동시 접속하는 것을 방지합니다.
 *
 * 작동 방식:
 * 1. 타입봇을 통해 접속 시 기기 ID를 생성하고 에어테이블에 저장
 * 2. 고난도 모드 접속 시 저장된 기기 ID와 현재 기기 ID를 비교
 * 3. 불일치 시 타입봇으로 재인증 유도
 */

(function() {
  'use strict';

  const DEVICE_ID_KEY = 'memoryking_device_id';
  const PHONE_KEY = 'memoryking_phone';
  const CONTENTS_KEY = 'memoryking_contents';
  const TYPEBOT_URL_KEY = 'memoryking_typebot_url';
  const DEFAULT_TYPEBOT_URL = 'https://typebot.co/pt-id-dev-lvmrg2k'; // 기본값 (fallback)

  /**
   * 타입봇 URL 가져오기 (localStorage > tokenValidator > 기본값)
   */
  function getTypebotUrl() {
    try {
      // 1. localStorage에서 가져오기 (token-validator.js에서 저장됨)
      const savedUrl = localStorage.getItem(TYPEBOT_URL_KEY);
      if (savedUrl && savedUrl.trim() !== '') {
        return savedUrl;
      }

      // 2. tokenValidator에서 가져오기
      if (window.tokenValidator && window.tokenValidator.TYPEBOT_URL) {
        return window.tokenValidator.TYPEBOT_URL;
      }

      // 3. 기본값 사용
      return DEFAULT_TYPEBOT_URL;
    } catch (e) {
      return DEFAULT_TYPEBOT_URL;
    }
  }

  /**
   * 기기 고유 ID 생성 또는 가져오기
   */
  function getOrCreateDeviceId() {
    try {
      let deviceId = localStorage.getItem(DEVICE_ID_KEY);

      if (deviceId) {
        console.log('[DeviceValidator] 기존 기기 ID 사용:', deviceId.substring(0, 15) + '...');
        return deviceId;
      }

      // 새 기기 ID 생성
      const fingerprint = [
        window.screen.width,
        window.screen.height,
        navigator.language,
        navigator.platform,
        new Date().getTimezoneOffset()
      ].join('_');

      const random = Math.random().toString(36).substring(2, 10);
      const timestamp = Date.now().toString(36);

      deviceId = `mk_${btoa(fingerprint).substring(0, 8)}_${random}_${timestamp}`;

      localStorage.setItem(DEVICE_ID_KEY, deviceId);
      console.log('[DeviceValidator] 새 기기 ID 생성:', deviceId.substring(0, 15) + '...');

      return deviceId;
    } catch (e) {
      console.error('[DeviceValidator] 기기 ID 생성 오류:', e);
      return 'mk_fallback_' + Date.now();
    }
  }

  /**
   * 에어테이블에 기기 ID 등록 (phone + contents 조건)
   * @param {string} phone 전화번호
   * @param {string} contents 콘텐츠명 (선택)
   */
  async function registerDevice(phone, contents) {
    try {
      console.log('[DeviceValidator] 기기 등록 시작:', { phone, contents });

      if (!phone) {
        console.warn('[DeviceValidator] 전화번호가 없습니다.');
        return false;
      }

      // 전화번호 및 contents 저장
      localStorage.setItem(PHONE_KEY, phone);
      if (contents) {
        localStorage.setItem(CONTENTS_KEY, contents);
      }

      // AirtableManager 확인
      if (!window.AirtableManager) {
        console.warn('[DeviceValidator] AirtableManager가 없습니다.');
        return false;
      }

      const airtableManager = window.AirtableManager.getInstance();

      // User DB 설정 확인
      if (!airtableManager.userBaseUrl || !airtableManager.userTable) {
        console.warn('[DeviceValidator] User DB가 설정되지 않았습니다.');
        return false;
      }

      const deviceId = getOrCreateDeviceId();

      // 사용자 조회 (phone + contents)
      console.log('[DeviceValidator] AirtableManager 상태:', {
        userBaseUrl: airtableManager.userBaseUrl,
        userTable: airtableManager.userTable,
        useProxy: airtableManager.useProxy
      });

      // getUserByPhoneAndContents 사용 (contents가 있으면)
      let user;
      if (contents && airtableManager.getUserByPhoneAndContents) {
        user = await airtableManager.getUserByPhoneAndContents(phone, contents);
      } else {
        user = await airtableManager.getUser(phone);
      }

      if (!user) {
        console.warn('[DeviceValidator] 사용자를 찾을 수 없습니다:', { phone, contents });
        return false;
      }

      console.log('[DeviceValidator] 사용자 찾음:', { id: user.id, phone: user.phone, contents: user.contents });

      // 기기 ID 업데이트
      const success = await airtableManager.updateUser(user.id, {
        device_id: deviceId
      });

      if (success) {
        console.log('[DeviceValidator] ✅ 기기 등록 완료');
        window._deviceRegistered = true;
        return true;
      } else {
        console.warn('[DeviceValidator] 기기 등록 실패');
        return false;
      }

    } catch (error) {
      console.error('[DeviceValidator] 기기 등록 오류:', error);
      return false;
    }
  }

  /**
   * 기기 검증 (고난도 모드에서 사용) - phone + contents 조건
   * @param {string} phone 전화번호
   * @param {Object} airtableManager AirtableManager 인스턴스
   * @param {string} contents 콘텐츠명 (선택)
   */
  async function validateDevice(phone, airtableManager, contents) {
    try {
      console.log('[DeviceValidator] 기기 검증 시작:', { phone, contents });

      if (!phone) {
        console.warn('[DeviceValidator] 전화번호가 없습니다. 검증 건너뜀.');
        return { valid: true, reason: '전화번호 없음' };
      }

      if (!airtableManager) {
        console.warn('[DeviceValidator] AirtableManager가 없습니다. 검증 건너뜀.');
        return { valid: true, reason: 'AirtableManager 없음' };
      }

      // User DB 설정 확인
      if (!airtableManager.userBaseUrl || !airtableManager.userTable) {
        console.warn('[DeviceValidator] User DB 미설정. 검증 건너뜀.');
        return { valid: true, reason: 'User DB 미설정' };
      }

      const currentDeviceId = getOrCreateDeviceId();

      // 사용자 조회 (phone + contents)
      let user;
      if (contents && airtableManager.getUserByPhoneAndContents) {
        user = await airtableManager.getUserByPhoneAndContents(phone, contents);
      } else {
        user = await airtableManager.getUser(phone);
      }

      if (!user) {
        console.warn('[DeviceValidator] 사용자 조회 실패. 검증 건너뜀.');
        return { valid: true, reason: '사용자 조회 실패' };
      }

      console.log('[DeviceValidator] 사용자 찾음:', { id: user.id, phone: user.phone, contents: user.contents });

      const storedDeviceId = user.device_id;

      console.log('[DeviceValidator] 기기 비교:', {
        현재: currentDeviceId.substring(0, 20) + '...',
        저장: storedDeviceId ? storedDeviceId.substring(0, 20) + '...' : '(없음)'
      });

      // 저장된 기기 ID가 없으면 통과 (아직 등록 안 됨)
      if (!storedDeviceId || storedDeviceId.trim() === '') {
        console.log('[DeviceValidator] 기기 ID 미등록 상태 - 통과');
        return { valid: true, reason: '기기 ID 미등록' };
      }

      // 기기 ID 비교
      if (storedDeviceId === currentDeviceId) {
        console.log('[DeviceValidator] ✅ 기기 인증 성공');
        return { valid: true, reason: '기기 일치' };
      } else {
        console.warn('[DeviceValidator] ❌ 기기 불일치 - 다른 기기에서 접속 중');
        return { valid: false, reason: '기기 불일치', mismatch: true };
      }

    } catch (error) {
      console.error('[DeviceValidator] 기기 검증 오류:', error);
      return { valid: true, reason: '검증 오류 - 통과 처리' };
    }
  }

  /**
   * 기기 불일치 화면 표시
   */
  function showMismatchScreen() {
    // 타입봇 URL 가져오기
    const typebotUrl = getTypebotUrl();

    // 기존 화면 숨기기
    const containers = document.querySelectorAll('.container, #app, #loading-container');
    containers.forEach(el => el.style.display = 'none');

    // 기존 경고 화면 제거
    const existing = document.getElementById('deviceMismatchScreen');
    if (existing) existing.remove();

    const screen = document.createElement('div');
    screen.id = 'deviceMismatchScreen';
    screen.innerHTML = `
      <style>
        #deviceMismatchScreen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
        }
        #deviceMismatchScreen .modal {
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 400px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
        #deviceMismatchScreen .icon {
          width: 80px;
          height: 80px;
          background: #FEF3C7;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 40px;
        }
        #deviceMismatchScreen h2 {
          font-size: 22px;
          color: #1F2937;
          margin: 0 0 16px;
        }
        #deviceMismatchScreen p {
          font-size: 15px;
          color: #6B7280;
          margin: 0 0 24px;
          line-height: 1.6;
        }
        #deviceMismatchScreen button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #deviceMismatchScreen button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }
        #deviceMismatchScreen .hint {
          font-size: 12px;
          color: #9CA3AF;
          margin-top: 16px;
        }
      </style>
      <div class="modal">
        <div class="icon">🔒</div>
        <h2>접속이 중단됩니다.</h2>
        <p>다른 기기에서 로그인된 상태입니다.<br>이 기기에서 사용하시려면 다시 로그인해주세요.</p>
        <button onclick="window.location.href='${typebotUrl}'">다시 로그인하기</button>
        <p class="hint">새 기기에서 로그인하면 기존 기기는 자동 로그아웃됩니다.</p>
      </div>
    `;
    document.body.appendChild(screen);
  }

  /**
   * 저장된 전화번호 가져오기
   */
  function getSavedPhone() {
    return localStorage.getItem(PHONE_KEY);
  }

  // 전역 객체로 노출
  window.DeviceValidator = {
    getOrCreateDeviceId,
    registerDevice,
    validateDevice,
    showMismatchScreen,
    getSavedPhone,
    getTypebotUrl
  };

  console.log('[DeviceValidator] 기기 인증 시스템 로드 완료');

})();
