// korean-time-util.js - 완벽하게 수정된 버전
window.KoreanTimeUtil = {
    TIMEZONE_OFFSET: 9 * 60 * 60 * 1000, // 9시간 (밀리초)
    
    /**
     * 현재 한국 시간을 ISO 문자열로 반환
     */
    getKoreanTimeISOString() {
        try {
            const now = new Date();
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
            
            // en-CA 로케일을 사용하면 YYYY-MM-DD 형식으로 반환
            const koreanDate = now.toLocaleDateString('en-CA', { 
                timeZone: 'Asia/Seoul' 
            });
            
            // 한국 시간 자정을 생성 (시간대 명시)
            const koreanMidnight = new Date(koreanDate + 'T00:00:00+09:00');
            
            // ISO 문자열로 변환 (자동으로 UTC로 변환됨)
            const result = koreanMidnight.toISOString();
            
            console.log('[KoreanTimeUtil.getTodayISOString] 계산 결과:', {
                현재한국시간: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                한국날짜: koreanDate,
                한국자정: koreanDate + 'T00:00:00+09:00',
                UTC결과: result
            });
            
            return result;
            
        } catch (error) {
            console.error('getTodayISOString 오류, 폴백 사용:', error);
            
            // 폴백: 수동 계산
            try {
                const now = new Date();
                
                // 현재 시간을 밀리초로
                const currentTime = now.getTime();
                
                // 로컬 타임존 오프셋 제거
                const utcTime = currentTime + (now.getTimezoneOffset() * 60 * 1000);
                
                // 한국 시간으로 변환 (UTC + 9시간)
                const koreanTime = new Date(utcTime + this.TIMEZONE_OFFSET);
                
                // 한국 시간 기준 오늘 0시로 설정
                koreanTime.setHours(0, 0, 0, 0);
                
                // 다시 UTC로 변환 (한국 시간 - 9시간)
                const todayStartUTC = new Date(koreanTime.getTime() - this.TIMEZONE_OFFSET);
                
                console.log('[KoreanTimeUtil.getTodayISOString] 폴백 계산:', todayStartUTC.toISOString());
                
                return todayStartUTC.toISOString();
            } catch (fallbackError) {
                console.error('폴백도 실패:', fallbackError);
                // 최종 폴백: 현재 UTC 날짜의 15시간 전 (한국 시간 전날 자정)
                const now = new Date();
                now.setUTCHours(15, 0, 0, 0);
                now.setUTCDate(now.getUTCDate() - 1);
                return now.toISOString();
            }
        }
    },
    
    /**
     * 한국 시간 기준 어제 0시 0분 0초를 UTC ISO 문자열로 반환
     */
    getOneDayAgoISOString() {
        try {
            const now = new Date();
            
            // en-CA 로케일을 사용하여 한국 날짜 가져오기
            const koreanDate = now.toLocaleDateString('en-CA', { 
                timeZone: 'Asia/Seoul' 
            });
            
            // Date 객체로 변환하고 하루 빼기
            const date = new Date(koreanDate);
            date.setDate(date.getDate() - 1);
            
            // YYYY-MM-DD 형식으로 변환
            const yesterdayKorean = date.toISOString().split('T')[0];
            
            // 한국 시간 어제 자정 생성
            const koreanYesterdayMidnight = new Date(yesterdayKorean + 'T00:00:00+09:00');
            
            return koreanYesterdayMidnight.toISOString();
            
        } catch (error) {
            console.error('getOneDayAgoISOString 오류:', error);
            
            // 폴백
            const todayISO = this.getTodayISOString();
            const today = new Date(todayISO);
            today.setUTCDate(today.getUTCDate() - 1);
            return today.toISOString();
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
            
            return date.toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
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
        const yesterdayISO = this.getOneDayAgoISOString();
        
        console.log('===== 시간 정보 디버그 =====');
        console.log('현재 시간:');
        console.log('- 로컬:', now.toLocaleString());
        console.log('- UTC:', now.toISOString());
        console.log('- 한국:', now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
        console.log('\n오늘 시작 시간:');
        console.log('- getTodayISOString():', todayISO);
        console.log('- UTC로 표시:', todayUTC.toUTCString());
        console.log('- 한국으로 표시:', todayUTC.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
        console.log('\n어제 시작 시간:');
        console.log('- getOneDayAgoISOString():', yesterdayISO);
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
            const koreanDate = now.toLocaleDateString('en-CA', { 
                timeZone: 'Asia/Seoul' 
            });
            const koreanMidnight = new Date(koreanDate + 'T00:00:00+09:00');
            return koreanMidnight.toISOString();
        } catch (error) {
            console.error('getTodayISOString 폴백 오류:', error);
            const now = new Date();
            now.setUTCHours(15, 0, 0, 0);
            now.setUTCDate(now.getUTCDate() - 1);
            return now.toISOString();
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
            const koreanDate = now.toLocaleDateString('en-CA', { 
                timeZone: 'Asia/Seoul' 
            });
            const date = new Date(koreanDate);
            date.setDate(date.getDate() - 1);
            const yesterdayKorean = date.toISOString().split('T')[0];
            const koreanYesterdayMidnight = new Date(yesterdayKorean + 'T00:00:00+09:00');
            return koreanYesterdayMidnight.toISOString();
        } catch (error) {
            console.error('getOneDayAgoISOString 폴백 오류:', error);
            const todayISO = window.getTodayISOString();
            const today = new Date(todayISO);
            today.setUTCDate(today.getUTCDate() - 1);
            return today.toISOString();
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