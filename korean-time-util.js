// korean-time-util.js - 수정된 버전
window.KoreanTimeUtil = {
    TIMEZONE_OFFSET: 9 * 60 * 60 * 1000,
    
    getKoreanTimeISOString() {
        try {
            const now = new Date();
            const koreanTime = new Date(now.getTime() + this.TIMEZONE_OFFSET);
            return koreanTime.toISOString();
        } catch (error) {
            console.error('getKoreanTimeISOString 오류:', error);
            return new Date().toISOString();
        }
    },
    
    getTodayISOString() {
        try {
            const now = new Date();
            const koreanTime = new Date(now.getTime() + this.TIMEZONE_OFFSET);
            koreanTime.setUTCHours(0, 0, 0, 0);
            return koreanTime.toISOString();
        } catch (error) {
            console.error('getTodayISOString 오류:', error);
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            return fallback.toISOString();
        }
    },
    
    getOneDayAgoISOString() {
        try {
            const now = new Date();
            const koreanTime = new Date(now.getTime() + this.TIMEZONE_OFFSET);
            koreanTime.setUTCHours(0, 0, 0, 0);
            koreanTime.setDate(koreanTime.getDate() - 1);
            return koreanTime.toISOString();
        } catch (error) {
            console.error('getOneDayAgoISOString 오류:', error);
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            fallback.setDate(fallback.getDate() - 1);
            return fallback.toISOString();
        }
    },
    
    formatKoreanTime(date) {
        try {
            const koreanTime = new Date(date.getTime() + this.TIMEZONE_OFFSET);
            const year = koreanTime.getUTCFullYear();
            const month = String(koreanTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(koreanTime.getUTCDate()).padStart(2, '0');
            const hours = String(koreanTime.getUTCHours()).padStart(2, '0');
            const minutes = String(koreanTime.getUTCMinutes()).padStart(2, '0');
            const seconds = String(koreanTime.getUTCSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch (error) {
            console.error('formatKoreanTime 오류:', error);
            return new Date().toLocaleString('ko-KR');
        }
    }
};

// ===== 수정 사항: 전역 함수로도 노출 =====
// 하위 호환성을 위해 전역 함수로도 정의
window.getTodayISOString = function() {
    if (window.KoreanTimeUtil && window.KoreanTimeUtil.getTodayISOString) {
        return window.KoreanTimeUtil.getTodayISOString();
    } else {
        // 폴백: 기본 구현
        try {
            const now = new Date();
            const koreanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            koreanTime.setUTCHours(0, 0, 0, 0);
            return koreanTime.toISOString();
        } catch (error) {
            console.error('getTodayISOString 폴백 오류:', error);
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            return fallback.toISOString();
        }
    }
};

// 기타 유용한 전역 함수들도 추가
window.getKoreanTimeISOString = function() {
    if (window.KoreanTimeUtil && window.KoreanTimeUtil.getKoreanTimeISOString) {
        return window.KoreanTimeUtil.getKoreanTimeISOString();
    } else {
        try {
            const now = new Date();
            const koreanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            return koreanTime.toISOString();
        } catch (error) {
            console.error('getKoreanTimeISOString 폴백 오류:', error);
            return new Date().toISOString();
        }
    }
};

window.getOneDayAgoISOString = function() {
    if (window.KoreanTimeUtil && window.KoreanTimeUtil.getOneDayAgoISOString) {
        return window.KoreanTimeUtil.getOneDayAgoISOString();
    } else {
        try {
            const now = new Date();
            const koreanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            koreanTime.setUTCHours(0, 0, 0, 0);
            koreanTime.setDate(koreanTime.getDate() - 1);
            return koreanTime.toISOString();
        } catch (error) {
            console.error('getOneDayAgoISOString 폴백 오류:', error);
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            fallback.setDate(fallback.getDate() - 1);
            return fallback.toISOString();
        }
    }
};

// 앱 객체에 KoreanTimeUtil 설정
if (window.app) {
    window.app.KoreanTimeUtil = window.KoreanTimeUtil;
}

console.log('Korean Time Util 로드 완료 - 전역 함수 포함');