/**
 * premium-splash.js
 * 프리미엄 스플래시 스크린 컨트롤러
 * 앱 시작 시 매끄러운 로딩 경험 제공
 */

class PremiumSplashScreen {
    constructor() {
        this.splash = null;
        this.progressFill = null;
        this.stageText = null;
        this.percentageText = null;
        this.sparkleContainer = null;
        this.currentProgress = 0;
        this.isInitialized = false;
        
        // 로딩 스테이지 정의
        this.stages = [
            { progress: 15, message: '코어 시스템 로딩', duration: 400 },
            { progress: 30, message: '데이터베이스 초기화', duration: 400 },
            { progress: 45, message: '네트워크 연결', duration: 350 },
            { progress: 60, message: '콘텐츠 준비', duration: 400 },
            { progress: 75, message: '단어 데이터 로드', duration: 350 },
            { progress: 90, message: '최종 설정', duration: 300 },
            { progress: 100, message: '완료!', duration: 200 }
        ];
    }
    
    /**
     * 스플래시 스크린 초기화
     */
    init() {
        if (this.isInitialized) {
            console.log('✅ 스플래시 스크린이 이미 초기화되었습니다.');
            return;
        }
        
        // DOM 요소 가져오기
        this.splash = document.getElementById('premiumSplash');
        
        if (!this.splash) {
            console.error('❌ 스플래시 스크린 요소를 찾을 수 없습니다.');
            return;
        }
        
        this.progressFill = document.getElementById('splashProgressFill');
        this.stageText = document.getElementById('splashStage');
        this.percentageText = document.getElementById('splashPercentage');
        this.sparkleContainer = document.getElementById('sparkleContainer');
        
        // 반짝이는 효과 생성
        this.createSparkles();
        
        this.isInitialized = true;
        console.log('✅ 프리미엄 스플래시 스크린 초기화 완료');
    }
    
    /**
     * 반짝이는 배경 효과 생성
     */
    createSparkles() {
        if (!this.sparkleContainer) return;
        
        const sparkleCount = 20;
        
        for (let i = 0; i < sparkleCount; i++) {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle-item';
            sparkle.style.left = `${Math.random() * 100}%`;
            sparkle.style.top = `${Math.random() * 100}%`;
            sparkle.style.animationDelay = `${Math.random() * 2}s`;
            this.sparkleContainer.appendChild(sparkle);
        }
    }
    
    /**
     * 스플래시 스크린 표시
     */
    show() {
        if (!this.splash) {
            console.warn('⚠️ 스플래시 스크린이 초기화되지 않았습니다.');
            return;
        }
        
        // body overflow 숨김
        document.body.style.overflow = 'hidden';
        
        // container 숨기기
        const container = document.querySelector('.container');
        if (container) {
            container.classList.add('loading-hidden');
            container.classList.remove('loading-visible');
        }
        
        // 스플래시 스크린 표시
        this.splash.style.display = 'flex';
        this.splash.classList.remove('fade-out');
        this.splash.classList.add('show');
        
        // 초기 상태 설정
        this.updateProgress(0, '앱 준비중');
        
        console.log('✨ 스플래시 스크린 표시');
    }
    
    /**
     * 프로그레스 업데이트
     * @param {number} progress - 0-100 사이의 진행률
     * @param {string} message - 표시할 메시지
     */
    updateProgress(progress, message) {
        this.currentProgress = progress;
        
        if (this.progressFill) {
            this.progressFill.style.width = `${progress}%`;
        }
        
        if (this.percentageText) {
            this.percentageText.textContent = `${Math.round(progress)}%`;
        }
        
        if (this.stageText && message) {
            const dotsHTML = '<span class="loading-dots"><span></span><span></span><span></span></span>';
            this.stageText.innerHTML = message + (progress < 100 ? dotsHTML : '');
        }
    }
    
    /**
     * 자동 로딩 시퀀스 실행
     */
    async runLoadingSequence() {
        console.log('🚀 로딩 시퀀스 시작');
        
        for (const stage of this.stages) {
            await this.animateToStage(stage);
        }
        
        console.log('✅ 로딩 시퀀스 완료');
        
        // 완료 후 약간의 딜레이
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    /**
     * 각 스테이지로 애니메이션
     * @param {Object} stage - { progress, message, duration }
     */
    animateToStage(stage) {
        return new Promise(resolve => {
            this.updateProgress(stage.progress, stage.message);
            setTimeout(resolve, stage.duration);
        });
    }
    
    /**
     * 스플래시 스크린 숨기기
     * @param {number} delay - 숨기기 전 지연 시간 (ms)
     */
    hide(delay = 0) {
        if (!this.splash) return;
        
        setTimeout(() => {
            // 페이드아웃 애니메이션
            this.splash.classList.add('fade-out');
            this.splash.classList.remove('show');
            
            // body overflow 복원
            document.body.style.overflow = '';
            
            // container 표시
            const container = document.querySelector('.container');
            if (container) {
                container.classList.remove('loading-hidden');
                container.classList.add('loading-visible');
            }
            
            console.log('👋 스플래시 스크린 숨김 시작');
            
            // 애니메이션 완료 후 완전히 숨김
            setTimeout(() => {
                this.splash.style.display = 'none';
                this.splash.classList.remove('fade-out');
                
                // 진행률 초기화
                this.updateProgress(0, '');
                
                console.log('✅ 스플래시 스크린 완전히 숨김');
                
                // 완료 이벤트 발생
                const event = new CustomEvent('splashScreenHidden', {
                    detail: { timestamp: Date.now() }
                });
                window.dispatchEvent(event);
            }, 800); // CSS transition 시간과 동일
        }, delay);
    }
    
    /**
     * 수동 진행률 설정 (외부에서 호출)
     * @param {number} progress - 0-100 사이의 진행률
     * @param {string} message - 표시할 메시지
     */
    setProgress(progress, message) {
        this.updateProgress(progress, message);
    }
}

// 전역 인스턴스 생성 및 노출
window.premiumSplash = null;

/**
 * 스플래시 스크린 초기화
 */
window.initPremiumSplash = function() {
    if (!window.premiumSplash) {
        window.premiumSplash = new PremiumSplashScreen();
        window.premiumSplash.init();
    }
    return window.premiumSplash;
};

/**
 * 스플래시 스크린 표시
 */
window.showPremiumSplash = function() {
    if (!window.premiumSplash) {
        window.initPremiumSplash();
    }
    window.premiumSplash.show();
};

/**
 * 프로그레스 업데이트
 * @param {number} progress - 0-100 사이의 진행률
 * @param {string} message - 표시할 메시지
 */
window.updateSplashProgress = function(progress, message) {
    if (window.premiumSplash) {
        window.premiumSplash.setProgress(progress, message);
    }
};

/**
 * 스플래시 스크린 숨기기
 * @param {number} delay - 숨기기 전 지연 시간 (ms)
 */
window.hidePremiumSplash = function(delay = 0) {
    if (window.premiumSplash) {
        window.premiumSplash.hide(delay);
    }
};

/**
 * 자동 로딩 시퀀스 실행
 */
window.runSplashSequence = async function() {
    if (!window.premiumSplash) {
        window.initPremiumSplash();
    }
    window.premiumSplash.show();
    await window.premiumSplash.runLoadingSequence();
    window.premiumSplash.hide();
};

// 클래스도 노출
window.PremiumSplashScreen = PremiumSplashScreen;

console.log('💫 프리미엄 스플래시 스크린 스크립트 로드 완료');
