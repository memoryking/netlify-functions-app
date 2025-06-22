/**
 * token-validator.js - 완성된 토큰 검증 시스템
 * 타입봇에서 생성한 토큰을 검증하고 만료 시 접근을 차단합니다
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
    
    // Base64 디코드 함수 (브라우저 호환)
    decodeBase64(str) {
      try {
        // 브라우저의 atob 함수 사용
        return atob(str);
      } catch (e) {
        console.error('Base64 디코드 실패:', e);
        return null;
      }
    }
    
    // 토큰 검증
    verifyToken(token) {
      try {
        if (!token) {
          return { valid: false, reason: '토큰이 없습니다' };
        }
        
        // 토큰 형식: base64데이터_x7K9m
        if (!token.endsWith('_x7K9m')) {
          return { valid: false, reason: '잘못된 토큰 형식입니다' };
        }
        
        // 토큰에서 _x7K9m 제거
        const encoded = token.replace('_x7K9m', '');
        
        // Base64 디코드
        const decoded = this.decodeBase64(encoded);
        if (!decoded) {
          return { valid: false, reason: '토큰 디코드 실패' };
        }
        
        console.log('디코드된 토큰 데이터:', decoded);
        
        // 데이터 파싱: 전화번호_만료시간_검증숫자
        const parts = decoded.split('_');
        
        if (parts.length !== 3) {
          return { valid: false, reason: '토큰 데이터가 올바르지 않습니다' };
        }
        
        const [phone, expStr, checkStr] = parts;
        const exp = parseInt(expStr);
        const check = parseInt(checkStr);
        
        // 숫자 유효성 검사
        if (isNaN(exp) || isNaN(check)) {
          return { valid: false, reason: '토큰 데이터가 손상되었습니다' };
        }
        
        // 검증 숫자 확인 (변조 방지)
        const expectedCheck = (exp * 7) % 999983;
        if (check !== expectedCheck) {
          console.error('검증 숫자 불일치:', { 
            expected: expectedCheck, 
            actual: check,
            exp: exp
          });
          return { valid: false, reason: '토큰이 변조되었습니다' };
        }
        
        // 현재 시간
        const now = Date.now();
        console.log('시간 비교:', {
          now: new Date(now).toISOString(),
          exp: new Date(exp).toISOString(),
          diff: exp - now
        });
        
        // 만료 시간 확인
        if (exp < now) {
          const expiredDate = new Date(exp).toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          return { 
            valid: false, 
            reason: '사용 기간이 만료되었습니다',
            expiredAt: expiredDate,
            phone: phone
          };
        }
        
        // 유효한 토큰
        const remainingMs = exp - now;
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        const remainingHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        
        return {
          valid: true,
          phone: phone,
          expiresAt: new Date(exp).toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }),
          remainingTime: remainingMs,
          remainingDays: remainingDays,
          remainingHours: remainingHours,
          remainingText: `${remainingDays}일 ${remainingHours}시간`
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
          ">서비스 이용 기간이 종료되었습니다.</p>
          
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
    
    // 성공 시 토스트 메시지 표시 (옵션)
    showSuccessToast(validationResult) {
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #10B981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
      `;
      
      toast.innerHTML = `
        ✓ 인증 성공 | 남은 기간: ${validationResult.remainingText}
      `;
      
      document.body.appendChild(toast);
      
      // 애니메이션
      setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      }, 100);
      
      // 3초 후 제거
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
    
    // URL에서 토큰 추출
    extractTokenFromUrl() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        console.log('URL에서 추출한 토큰:', token);
        return token;
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
      
      // 검증 성공 시 실행되는 부분
						console.log('토큰 검증 성공:', {
								phone: result.phone,
								expiresAt: result.expiresAt,
								remainingDays: result.remainingDays,
								remainingHours: result.remainingHours
						});

						// 성공 토스트 표시 (옵션)
						this.showSuccessToast(result);

						// 검증 성공 - URL에서 토큰만 안전하게 제거
						try {
								const url = new URL(window.location.href);
								url.searchParams.delete('token');
								
								// pushState 대신 replaceState 사용 (히스토리에 남기지 않음)
								window.history.replaceState({}, document.title, url.toString());
								
								console.log('토큰이 URL에서 제거되었습니다');
						} catch (urlError) {
								console.error('URL 처리 오류:', urlError);
								// URL 처리 실패해도 계속 진행
						}

						this.validationResult = result;
						this.isValidated = true;
      
      // 성공 시 전역 app 객체에 정보 저장
      if (window.app) {
        window.app.tokenValidation = {
          validated: true,
          phone: result.phone,
          expiresAt: result.expiresAt,
          remainingDays: result.remainingDays,
          remainingHours: result.remainingHours
        };
      }
      
      return result;
    }
    
    // 주기적인 만료 체크 (5분마다)
    startPeriodicCheck(intervalMinutes = 5) {
      console.log(`주기적 토큰 체크 시작 (${intervalMinutes}분마다)`);
      
      setInterval(() => {
        if (this.validationResult && this.validationResult.valid) {
          const now = Date.now();
          const expiresTimestamp = new Date(this.validationResult.expiresAt).getTime();
          
          console.log('주기적 체크:', {
            now: new Date(now).toISOString(),
            expires: new Date(expiresTimestamp).toISOString(),
            isExpired: now > expiresTimestamp
          });
          
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
    
    // 남은 시간 정보 가져오기 (개발자 도구용)
    getRemainingTime() {
      if (!this.validationResult || !this.validationResult.valid) {
        return null;
      }
      
      const now = Date.now();
      const exp = new Date(this.validationResult.expiresAt).getTime();
      const remaining = exp - now;
      
      if (remaining <= 0) {
        return { expired: true };
      }
      
      const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      
      return {
        expired: false,
        days: days,
        hours: hours,
        minutes: minutes,
        totalMs: remaining,
        text: `${days}일 ${hours}시간 ${minutes}분`
      };
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
  
  // 개발자 도구 명령어
  console.log('💡 토큰 검증 시스템 로드 완료');
  console.log('남은 시간 확인: tokenValidator.getRemainingTime()');
  console.log('검증 결과 확인: tokenValidator.validationResult');
  
})();