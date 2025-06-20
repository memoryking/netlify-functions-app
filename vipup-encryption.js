/**
 * VipUpEncryption - 개선된 암호화/복호화 유틸리티
 * - 유니코드/한글 지원 추가
 * - 모든 문자 타입 지원
 * - 안전한 오류 처리
 */
class VipUpEncryption {
  constructor(secretKey = 'suneung-words-app-secret-key') {
    this.secretKey = secretKey;
    this.initialized = true;
  }

  /**
   * 유니코드 안전 btoa - Base64 인코딩
   * 한글 등 유니코드 문자를 지원하는 btoa 대체 함수
   */
  safeEncode(str) {
    if (!str) return '';
    
    try {
      // UTF-8 인코딩을 우회하기 위해 encodeURIComponent 사용
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
      }));
    } catch (e) {
      console.error('안전 인코딩 오류:', e);
      return str; // 실패 시 원본 반환
    }
  }

  /**
   * 유니코드 안전 atob - Base64 디코딩
   * 한글 등 유니코드 문자를 지원하는 atob 대체 함수
   */
  safeDecode(str) {
    if (!str) return '';
    
    // 유효한 Base64 문자열인지 확인
    if (!this.isValidBase64(str)) {
      return str;
    }
    
    try {
      // 디코딩 후 UTF-8로 변환
      return decodeURIComponent(Array.prototype.map.call(atob(str), c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      console.error('안전 디코딩 오류:', e);
      return str; // 실패 시 원본 반환
    }
  }

  /**
   * 유효한 Base64 문자열인지 확인
   * @param {string} str - 확인할 문자열
   * @returns {boolean} 유효한 Base64 문자열 여부
   */
  isValidBase64(str) {
    if (!str || typeof str !== 'string') return false;
    
    try {
      // Base64 패턴 확인 (정규식)
      return /^[A-Za-z0-9+/=]+$/.test(str.trim());
    } catch (e) {
      return false;
    }
  }

  /**
   * 암호화 메서드 - 개선된 버전
   * @param {string|any} text - 암호화할 텍스트
   * @returns {string} 암호화된 텍스트
   */
  encrypt(text) {
    // 입력값이 없거나 null인 경우 빈 문자열 반환
    if (text === null || text === undefined) return '';
    
    try {
      // 문자열 변환 (모든 입력 타입 지원)
      const textString = typeof text === 'string' ? text : String(text);
      
      // 빈 문자열이면 그대로 반환
      if (!textString.trim()) return textString;
      
      // 단순 XOR 기반 암호화
      let result = '';
      for (let i = 0; i < textString.length; i++) {
        const charCode = textString.charCodeAt(i) ^ this.secretKey.charCodeAt(i % this.secretKey.length);
        result += String.fromCharCode(charCode);
      }
      
      // 안전한 Base64 인코딩 (한글 지원)
      return this.safeEncode(result);
    } catch (e) {
      console.error('암호화 오류:', e);
      // 안전하게 원본 반환 (문자열로 변환)
      return typeof text === 'string' ? text : String(text);
    }
  }

  /**
   * 복호화 메서드 - 개선된 버전
   * @param {string} encryptedText - 복호화할 텍스트
   * @returns {string} 복호화된 텍스트
   */
  decrypt(encryptedText) {
    // 입력값이 없거나 null인 경우 빈 문자열 반환
    if (encryptedText === null || encryptedText === undefined) return '';
    
    // 문자열이 아닌 경우 문자열로 변환
    if (typeof encryptedText !== 'string') {
      return String(encryptedText);
    }
    
    try {
      // Base64 형식 확인
      if (!this.isEncrypted(encryptedText)) {
        return encryptedText;
      }
      
      // 안전한 Base64 디코딩 (한글 지원)
      let decoded;
      try {
        decoded = this.safeDecode(encryptedText);
      } catch (e) {
        console.warn('Base64 디코딩 실패, 원본 값 반환');
        return encryptedText;
      }
      
      // XOR 복호화
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i) ^ this.secretKey.charCodeAt(i % this.secretKey.length);
        result += String.fromCharCode(charCode);
      }
      return result;
    } catch (e) {
      console.error('복호화 오류:', e);
      return encryptedText; // 복호화 실패시 원본 반환
    }
  }

  /**
   * 암호화된 값인지 확인하는 헬퍼 메서드
   * @param {string} text - 확인할 텍스트
   * @returns {boolean} 암호화된 텍스트 여부
   */
  isEncrypted(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Base64 형식인지 확인 (정규식 패턴)
    const base64Pattern = /^[A-Za-z0-9+/=]+$/;
    
    // 최소 길이 체크 (의미있는 암호화 데이터는 일정 길이 이상)
    return text.length > 8 && base64Pattern.test(text);
  }
}

// 전역 인스턴스 생성 - 편의성을 위해
window.vipUpEncryptionInstance = new VipUpEncryption();

// 정적 메서드 - 클래스 직접 호출 가능하게
VipUpEncryption.encrypt = function(text) {
  return window.vipUpEncryptionInstance.encrypt(text);
};

VipUpEncryption.decrypt = function(text) {
  return window.vipUpEncryptionInstance.decrypt(text);
};

VipUpEncryption.isEncrypted = function(text) {
  return window.vipUpEncryptionInstance.isEncrypted(text);
};

// 전역 객체로 등록
window.VipUpEncryption = VipUpEncryption;