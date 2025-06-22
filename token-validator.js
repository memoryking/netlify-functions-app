/**
 * token-validator.js - 개선된 토큰 검증 시스템
 * 검증 숫자를 포함한 안전한 토큰 검증
 */

(function() {
  'use strict';
  
  // 토큰 검증 클래스
  class TokenValidator {
    constructor() {
      // 타입봇 URL 설정
      this.TYPEBOT_URL = 'https://typebot.co/pt-id-bl1gnoc';
      
      // 검증 상태
      this.isValidated = false;
      this.validationResult = null;
    }
    
    // 토큰 검증 (개선된 방식)
    verifyToken(token) {
      try {
        if (!token) {
          return { valid: false, reason: '토큰이 없습니다' };
        }
        
        // 토큰 형식: base64데이터_x7K9m
        if (!token.endsWith('_x7K9m')) {
          return { valid: false, reason: '잘못된 토큰 형식입니다' };
        }
        
        // 토큰 분리
        const encoded = token.replace('_x7K9m', '');
        
        // Base64 디코드
        let decoded;
        try {
          decoded = atob(encoded);
        } catch (e) {
          return { valid: false, reason: '토큰 디코드 실패' };
        }
        
        // 데이터 파싱: 전화번호_만료시간_검증숫자
        const parts = decoded.split('_');
        
        if (parts.length !== 3) {
          return { valid: false, reason: '토큰 데이터가 올바르지 않습니다' };
        }
        
        const [phone, expStr, checkStr] = parts;
        const exp = parseInt(expStr);
        const check = parseInt(checkStr);
        
        // 검증 숫자 확인 (변조 방지)
        const expectedCheck = (exp * 7) % 999983;
        if (check !== expectedCheck) {
          return { valid: false, reason: '토큰이 변조되었습니다' };
        }
        
        // 만료 시간 확인
        const now = Date.now();
        
        if (exp < now) {
          const expiredDate = new Date(exp).toLocaleString('ko-KR');
          return { 
            valid: false, 
            reason: '사용 기간이 만료되었습니다',
            expiredAt: expiredDate,
            phone: phone
          };
        }
        
        // 유효한 토큰
        return {
          valid: true,
          phone: phone,
          expiresAt: new Date(exp).toLocaleString('ko-KR'),
          remainingTime: exp - now,
          remainingDays: Math.ceil((exp - now) / (24 * 60 * 60 * 1000))
        };
        
      } catch (error) {
        console.error('토큰 검증 오류:', error);
        return { valid: false, reason: '토큰 검증 중 오류가 발생했습니다' };
      }
    }
    
    // 만료 화면 표시
    showExpiredScreen(validationResult) {
      // 기존 화면 숨기기
      const container = document.querySelector('.container');
      if (container) {
        container.style.display = 'none';
      }
      
      // 로딩 오버레이 숨기기
      const loadingOverlay = document.getElementById('appLoadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
      
      // 만료 화면 생성
      const expiredDiv = document.createElement('div');
      expiredDiv.id = 'tokenExpiredScreen';
      expiredDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      `;
      
      expiredDiv.innerHTML = `
        <div style="
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          text-align: center;
        ">
          <div style="
            width: 80px;
            height: 80px;
            background: #FEE2E2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          ">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="#EF4444"/>
              <path d="M11 7H13V13H11V7ZM11 15H13V17H11V15Z" fill="#EF4444"/>
            </svg>
          </div>
          
          <h2 style="
            font-size: 24px;
            font-weight: 700;
            color: #1F2937;
            margin: 0 0 16px;
          ">사용 기간이 만료되었습니다</h2>
          
          <p style="
            font-size: 16px;
            color: #6B7280;
            line-height: 1.5;
            margin: 0 0 8px;
          ">${validationResult.reason || '서비스 이용 기간이 종료되었습니다.'}</p>
          
          ${validationResult.expiredAt ? `
            <p style="
              font-size: 14px;
              color: #9CA3AF;
              margin: 0 0 24px;
            ">만료일: ${validationResult.expiredAt}</p>
          ` : ''}
          
          <p style="
            font-size: 16px;
            color: #6B7280;
            margin: 0 0 32px;
          ">계속 이용하시려면 다시 로그인해 주세요.</p>
          
          <button onclick="window.location.href='${this.TYPEBOT_URL}'" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            width: 100%;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.5)'"
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(102, 126, 234, 0.4)'">
            타입봇으로 이동
          </button>
          
          ${validationResult.phone ? `
            <p style="
              font-size: 12px;
              color: #9CA3AF;
              margin: 16px 0 0;
            ">등록된 번호: ${validationResult.phone}</p>
          ` : ''}
        </div>
      `;
      
      document.body.appendChild(expiredDiv);
    }
    
    // 접근 차단 화면 표시
    showAccessDeniedScreen(reason = '접근 권한이 없습니다') {
      // 기존 화면 숨기기
      const container = document.querySelector('.container');
      if (container) {
        container.style.display = 'none';
      }
      
      // 로딩 오버레이 숨기기
      const loadingOverlay = document.getElementById('appLoadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
      
      // 접근 차단 화면 생성
      const deniedDiv = document.createElement('div');
      deniedDiv.id = 'accessDeniedScreen';
      deniedDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #ffd89b 0%, #19547b 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      `;
      
      deniedDiv.innerHTML = `
        <div style="
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          text-align: center;
        ">
          <div style="
            width: 80px;
            height: 80px;
            background: #FEF3C7;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          ">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 9V13M12 17H12.01M5.07 19H18.93C20.62 19 21.8 17.33 21.36 15.68L14.43 3.32C13.59 1.66 10.41 1.66 9.57 3.32L2.64 15.68C2.2 17.33 3.38 19 5.07 19Z" 
                    stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          
          <h2 style="
            font-size: 24px;
            font-weight: 700;
            color: #1F2937;
            margin: 0 0 16px;
          ">접근 권한 없음</h2>
          
          <p style="
            font-size: 16px;
            color: #6B7280;
            line-height: 1.5;
            margin: 0 0 32px;
          ">${reason}</p>
          
          <button onclick="window.location.href='${this.TYPEBOT_URL}'" style="
            background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
            width: 100%;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(245, 158, 11, 0.5)'"
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(245, 158, 11, 0.4)'">
            타입봇으로 이동
          </button>
        </div>
      `;
      
      document.body.appendChild(deniedDiv);
    }
    
    // URL에서 토큰 추출
    extractTokenFromUrl() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token');
      } catch (error) {
        console.error('URL 파싱 오류:', error);
        return null;
      }
    }
    
    // 검증 실행
    async validate() {
      // 이미 검증되었으면 스킵
      if (this.isValidated) {
        return this.validationResult;
      }
      
      console.log('토큰 검증 시작...');
      
      // URL에서 토큰 추출
      const token = this.extractTokenFromUrl();
      
      if (!token) {
        console.log('토큰이 없습니다. 접근 차단.');
        this.showAccessDeniedScreen('타입봇을 통해 접속해주세요.');
        this.validationResult = { valid: false, blocked: true };
        this.isValidated = true;
        return this.validationResult;
      }
      
      console.log('검증할 토큰:', token);
      
      // 토큰 검증
      const result = this.verifyToken(decodeURIComponent(token));
      
      if (!result.valid) {
        console.log('토큰 검증 실패:', result.reason);
        
        if (result.reason.includes('만료')) {
          this.showExpiredScreen(result);
        } else {
          this.showAccessDeniedScreen(result.reason);
        }
        
        this.validationResult = { ...result, blocked: true };
        this.isValidated = true;
        return this.validationResult;
      }
      
      console.log('토큰 검증 성공:', {
        phone: result.phone,
        expiresAt: result.expiresAt,
        remainingDays: result.remainingDays
      });
      
      // 검증 성공 - URL에서 토큰 제거 (보안)
      const newUrl = window.location.pathname + window.location.search.replace(/[?&]token=[^&]+/, '');
      window.history.replaceState({}, document.title, newUrl);
      
      this.validationResult = result;
      this.isValidated = true;
      
      // 성공 시 전역 app 객체에 정보 저장
      if (window.app) {
        window.app.tokenValidation = {
          validated: true,
          phone: result.phone,
          expiresAt: result.expiresAt,
          remainingDays: result.remainingDays
        };
      }
      
      return result;
    }
    
    // 주기적인 만료 체크 (옵션)
    startPeriodicCheck(intervalMinutes = 5) {
      setInterval(() => {
        if (this.validationResult && this.validationResult.valid) {
          const now = Date.now();
          const expiresTimestamp = new Date(this.validationResult.expiresAt).getTime();
          
          if (now > expiresTimestamp) {
            console.log('토큰이 만료되었습니다. 만료 화면 표시.');
            this.showExpiredScreen({
              reason: '사용 기간이 만료되었습니다',
              expiredAt: this.validationResult.expiresAt,
              phone: this.validationResult.phone
            });
          }
        }
      }, intervalMinutes * 60 * 1000);
    }
  }
  
  // 전역 인스턴스 생성
  window.tokenValidator = new TokenValidator();
  
  // 자동 검증 실행 - DOM 로드 전에도 실행
  window.tokenValidator.validate().then(result => {
    if (result && result.valid) {
      console.log('토큰 검증 완료, 앱 로드 계속 진행');
      
      // 주기적 체크 시작 (5분마다)
      window.tokenValidator.startPeriodicCheck(5);
    } else {
      console.log('토큰 검증 실패, 앱 로드 중단');
      
      // 앱 초기화 중단
      if (window._initStatus) {
        window._initStatus.blocked = true;
      }
    }
  }).catch(error => {
    console.error('토큰 검증 오류:', error);
    // 오류 발생 시에도 접근 차단
    window.tokenValidator.showAccessDeniedScreen('토큰 검증 중 오류가 발생했습니다.');
    if (window._initStatus) {
      window._initStatus.blocked = true;
    }
  });
  
})();