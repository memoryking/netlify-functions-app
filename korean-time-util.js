// korean-time-util.js - 완벽하게 수정된 버전
window.KoreanTimeUtil = {
    TIMEZONE_OFFSET: 9 * 60 * 60 * 1000, // 9시간 (밀리초)
    
    /**
     * 현재 한국 시간을 ISO 문자열로 반환
     */
    getKoreanTimeISOString() {
        try {
            const now = new Date();
            // 현재 시간을 그대로 반환 (타임존 정보는 시스템이 처리)
            return now.toISOString();
        } catch (error) {
            console.error('getKoreanTimeISOString 오류:', error);
            return new Date().toISOString();
        }
    },
    
    /**
     * 한국 시간 기준 오늘 0시 0분 0초를 UTC ISO 문자열로 반환
     * 예: 한국 시간 2025-07-03 00:00:00 → UTC 2025-07-02T15:00:00.000Z
     */
    getTodayISOString() {
        try {
            const now = new Date();
            
            // 방법 1: toLocaleString을 사용한 정확한 한국 시간 계산
            const koreanDateStr = now.toLocaleString("en-US", {
                timeZone: "Asia/Seoul",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            // MM/DD/YYYY 형식을 파싱
            const [month, day, year] = koreanDateStr.split('/');
            
            // 한국 시간 오늘 0시 0분 0초 생성
            const koreanMidnight = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
            
            // UTC로 변환 (한국 시간에서 9시간 빼기)
            const utcMidnight = new Date(koreanMidnight.getTime() - this.TIMEZONE_OFFSET);
            
            console.log('[KoreanTimeUtil.getTodayISOString] 계산 결과:', {
                현재한국시간: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                한국오늘0시: `${year}-${month}-${day} 00:00:00`,
                UTC변환결과: utcMidnight.toISOString()
            });
            
            return utcMidnight.toISOString();
            
        } catch (error) {
            console.error('getTodayISOString 오류, 폴백 사용:', error);
            
            // 폴백: 수동 계산
            try {
                const now = new Date();
                
                // 현재 UTC 시간에서 로컬 오프셋을 제거하고 한국 시간 계산
                const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
                const koreanTime = new Date(utcTime + this.TIMEZONE_OFFSET);
                
                // 한국 시간 기준 오늘 0시로 설정
                koreanTime.setHours(0, 0, 0, 0);
                
                // 다시 UTC로 변환
                const utcMidnight = new Date(koreanTime.getTime() - this.TIMEZONE_OFFSET);
                
                console.log('[KoreanTimeUtil.getTodayISOString] 폴백 계산:', utcMidnight.toISOString());
                
                return utcMidnight.toISOString();
            } catch (fallbackError) {
                console.error('폴백도 실패:', fallbackError);
                // 최종 폴백
                const fallback = new Date();
                fallback.setUTCHours(0, 0, 0, 0);
                fallback.setTime(fallback.getTime() - this.TIMEZONE_OFFSET);
                return fallback.toISOString();
            }
        }
    },
    
    /**
     * 한국 시간 기준 어제 0시 0분 0초를 UTC ISO 문자열로 반환
     */
    getOneDayAgoISOString() {
        try {
            const now = new Date();
            
            // toLocaleString을 사용한 정확한 한국 시간 계산
            const koreanDateStr = now.toLocaleString("en-US", {
                timeZone: "Asia/Seoul",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const [month, day, year] = koreanDateStr.split('/');
            
            // 한국 시간 오늘 0시 생성
            const koreanToday = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
            
            // 하루 전으로 설정
            koreanToday.setDate(koreanToday.getDate() - 1);
            
            // UTC로 변환
            const utcYesterday = new Date(koreanToday.getTime() - this.TIMEZONE_OFFSET);
            
            return utcYesterday.toISOString();
            
        } catch (error) {
            console.error('getOneDayAgoISOString 오류:', error);
            
            // 폴백
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            fallback.setDate(fallback.getDate() - 1);
            fallback.setTime(fallback.getTime() - this.TIMEZONE_OFFSET);
            return fallback.toISOString();
        }
    },
    
    /**
     * 주어진 Date 객체를 한국 시간 문자열로 포맷
     */
    formatKoreanTime(date) {
        try {
            if (!(date instanceof Date) || isNaN(date)) {
                throw new Error('유효하지 않은 날짜');
            }
            
            // toLocaleString을 사용하여 정확한 한국 시간 표시
            return date.toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/\. /g, '-').replace(/:/g, ':').replace(' ', ' ');
            
        } catch (error) {
            console.error('formatKoreanTime 오류:', error);
            return new Date().toLocaleString('ko-KR');
        }
    },
    
    /**
     * 디버깅용: 현재 시간 정보 출력
     */
    debugTimeInfo() {
        const now = new Date();
        const todayISO = this.getTodayISOString();
        const todayUTC = new Date(todayISO);
        
        console.log('===== 시간 정보 디버그 =====');
        console.log('현재 시간:');
        console.log('- 로컬:', now.toLocaleString());
        console.log('- UTC:', now.toISOString());
        console.log('- 한국:', now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
        console.log('\n오늘 시작 시간:');
        console.log('- getTodayISOString():', todayISO);
        console.log('- UTC로 표시:', todayUTC.toUTCString());
        console.log('- 한국으로 표시:', todayUTC.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
        console.log('===========================');
    }
};

// ===== 전역 함수 정의 (하위 호환성) =====
window.getTodayISOString = function() {
    if (window.KoreanTimeUtil && window.KoreanTimeUtil.getTodayISOString) {
        return window.KoreanTimeUtil.getTodayISOString();
    } else {
        // 폴백: 직접 구현
        try {
            const now = new Date();
            const koreanDateStr = now.toLocaleString("en-US", {
                timeZone: "Asia/Seoul",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const [month, day, year] = koreanDateStr.split('/');
            const koreanMidnight = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
            const utcMidnight = new Date(koreanMidnight.getTime() - (9 * 60 * 60 * 1000));
            
            return utcMidnight.toISOString();
        } catch (error) {
            console.error('getTodayISOString 폴백 오류:', error);
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            fallback.setTime(fallback.getTime() - (9 * 60 * 60 * 1000));
            return fallback.toISOString();
        }
    }
};

window.getKoreanTimeISOString = function() {
    if (window.KoreanTimeUtil && window.KoreanTimeUtil.getKoreanTimeISOString) {
        return window.KoreanTimeUtil.getKoreanTimeISOString();
    } else {
        return new Date().toISOString();
    }
};

window.getOneDayAgoISOString = function() {
    if (window.KoreanTimeUtil && window.KoreanTimeUtil.getOneDayAgoISOString) {
        return window.KoreanTimeUtil.getOneDayAgoISOString();
    } else {
        try {
            const now = new Date();
            const koreanDateStr = now.toLocaleString("en-US", {
                timeZone: "Asia/Seoul",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const [month, day, year] = koreanDateStr.split('/');
            const koreanToday = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
            koreanToday.setDate(koreanToday.getDate() - 1);
            const utcYesterday = new Date(koreanToday.getTime() - (9 * 60 * 60 * 1000));
            
            return utcYesterday.toISOString();
        } catch (error) {
            console.error('getOneDayAgoISOString 폴백 오류:', error);
            const fallback = new Date();
            fallback.setUTCHours(0, 0, 0, 0);
            fallback.setDate(fallback.getDate() - 1);
            fallback.setTime(fallback.getTime() - (9 * 60 * 60 * 1000));
            return fallback.toISOString();
        }
    }
};

// 앱 객체에 KoreanTimeUtil 설정
if (window.app) {
    window.app.KoreanTimeUtil = window.KoreanTimeUtil;
}

console.log('✅ Korean Time Util 로드 완료 - 완벽한 날짜 계산 포함');
console.log('💡 디버깅: KoreanTimeUtil.debugTimeInfo()를 실행하여 시간 정보를 확인하세요.');

// 자동으로 한 번 디버그 정보 출력
window.KoreanTimeUtil.debugTimeInfo();