// UI 관리자 클래스 - 완전한 오류 해결 버전
class UIManager {
    constructor(app = null) {
        this.app = app;
        this.isInitialized = false;
        this.screens = {
            main: document.getElementById('mainScreen'),
            study: document.getElementById('studyScreen'),
            completion: document.getElementById('completionScreen'),
            qStart: document.getElementById('qStartScreen'),
            qGame: document.getElementById('qGameScreen'),
            qResult: document.getElementById('qResultScreen')
        };

        this.cache = {
            elements: new Map(),
            stats: new Map()
        };
        this.cacheTimeout = 60000;
        this.totalAirtableWords = 0;
        this.currentStudyIndex = 0;
        this.memorizingCount = 0;
        
        // 성능 최적화 관련
        this.frameRequest = null;
        this.batchUpdates = new Set();
        this.updateQueue = Promise.resolve();
        this.updateTimer = null;
        this.updateDelay = 100;
        
        // 초기화 시작
        this.initialize();
    }

    // 새로운 초기화 메서드 - 더 안전하고 유연함
    async initialize() {
        try {
            // app 객체가 이미 전달되었으면 바로 초기화
            if (this.app && this.app.initialized) {
                console.log('UIManager: app 객체가 이미 준비됨');
                this.setupEventListeners();
                this.isInitialized = true;
                return;
            }
            
            // app 객체를 기다리면서 초기화
            console.log('UIManager: app 객체 대기 중...');
            const appFound = await this.waitForApp();
            
            if (appFound) {
                this.setupEventListeners();
                this.isInitialized = true;
                console.log('UIManager: 초기화 완료');
            } else {
                // app을 찾지 못해도 기본 UI는 동작하도록 함
                console.warn('UIManager: app 객체를 찾지 못했지만 기본 UI 초기화');
                this.setupBasicEventListeners();
                this.isInitialized = true;
            }
        } catch (error) {
            console.error('UIManager 초기화 실패:', error);
            // 초기화 실패해도 기본 UI는 동작하도록 함
            this.setupBasicEventListeners();
            this.isInitialized = true;
        }
    }

    // 수정된 waitForApp 메서드 - 타임아웃 증가 및 더 안전한 체크
    async waitForApp(maxWait = 10000) { // 10초로 단축
        const startTime = Date.now();
        let attemptCount = 0;
        
        while (Date.now() - startTime < maxWait) {
            attemptCount++;
            
            // 1. 생성자에서 전달받은 app 확인
            if (this.app && this.app.initialized === true) {
                console.log(`UIManager: 전달받은 app 객체 사용 (시도 ${attemptCount}회)`);
                return true;
            }
            
            // 2. window.app 확인
            if (window.app) {
                // 완전히 초기화된 경우
                if (window.app.initialized === true) {
                    console.log(`UIManager: window.app 객체 발견 (시도 ${attemptCount}회)`);
                    this.app = window.app;
                    return true;
                }
                
                // 초기화 중인 경우 조금 더 기다림
                if (window.app.initializationInProgress === true) {
                    console.log(`UIManager: app 초기화 진행 중... (시도 ${attemptCount}회)`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    continue;
                }
                
                // 부분적으로 초기화된 app이라도 사용
                if (window.app.dbManager || window.app.userPhone) {
                    console.log(`UIManager: 부분 초기화된 app 객체 사용 (시도 ${attemptCount}회)`);
                    this.app = window.app;
                    return true;
                }
            }
            
            // 짧은 간격으로 재시도
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.warn('UIManager: app 객체 대기 시간 초과');
        
        // 마지막으로 window.app이라도 있으면 사용
        if (window.app) {
            console.log('UIManager: 타임아웃 후 window.app 사용');
            this.app = window.app;
            return true;
        }
        
        return false; // 예외 발생시키지 않고 false 반환
    }

    // app 객체 안전 확인 메서드 - 개선됨
    ensureApp() {
        // 1. 이미 app이 있으면 OK
        if (this.app && (this.app.initialized || this.app.dbManager)) {
            return true;
        }
        
        // 2. window.app 재확인
        if (window.app) {
            this.app = window.app;
            if (this.app.initialized || this.app.dbManager) {
                return true;
            }
        }
        
        // 3. app이 없거나 불완전한 경우
        console.warn('UIManager: app 객체가 준비되지 않음');
        this.showMessage('main', '앱이 아직 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.');
        return false;
    }

    // 기본 이벤트 리스너 설정 (app 없이도 동작)
    setupBasicEventListeners() {
        console.log('UIManager: 기본 이벤트 리스너 설정');
        
        // 기본적인 클릭 이벤트만 처리
        document.addEventListener('click', (e) => {
            if (e.target.id) {
                console.log('클릭된 요소 ID:', e.target.id);
                
                // 앱이 준비되지 않은 상태에서 버튼 클릭 시 메시지 표시
                if (e.target.classList.contains('stats-card')) {
                    this.showMessage('main', '앱을 초기화하는 중입니다. 잠시만 기다려주세요.');
                }
            }
        });
        
        // 주기적으로 app 객체 확인
        const checkApp = () => {
            if (window.app && window.app.initialized && !this.isInitialized) {
                console.log('UIManager: app 준비됨, 전체 이벤트 리스너 설정');
                this.app = window.app;
                this.setupEventListeners();
                this.isInitialized = true;
            } else if (!this.isInitialized) {
                setTimeout(checkApp, 1000);
            }
        };
        setTimeout(checkApp, 1000);
    }

    getElement(id) {
        if (!this.cache.elements.has(id)) {
            const element = document.getElementById(id);
            if (element) {
                this.cache.elements.set(id, element);
            }
        }
        return this.cache.elements.get(id);
    }

    async getTotalAirtableWords() {
        if (!this.ensureApp()) return 0;
        
        if (this.totalAirtableWords === 0) {
            try {
                // IndexedDB에서 단어 수 가져오기
                this.totalAirtableWords = await this.app.dbManager.getWordCount({});
            } catch (error) {
                console.error('총 단어 수 조회 오류:', error);
                this.totalAirtableWords = 0;
            }
        }
        return this.totalAirtableWords;
    }

    setupEventListeners() {
        console.log('UIManager: 전체 이벤트 리스너 설정 시작');
        
        const buttons = {
            newWords: this.getElement('newWordsBtn'),
            shortTerm: this.getElement('shortTermBtn'),
            longTerm: this.getElement('longTermBtn'),
            memorizing: this.getElement('memorizingBtn'),
            qMemory: this.getElement('qMemoryBtn'),
            difficult: this.getElement('difficultBtn'),
            know: this.getElement('knowBtn'),
            dontKnow: this.getElement('dontKnowBtn'),
            nextOnly: this.getElement('nextOnlyBtn'), // 암기중 모드에서 처음 학습하는 단어용 "다음" 버튼
            stop: this.getElement('stopBtn'),
            studyClose: this.getElement('studyCloseBtn'),
            continue: this.getElement('continueBtn'),
            start: this.getElement('startBtn'),
            choice1: this.getElement('choiceBtn1'),
            choice2: this.getElement('choiceBtn2'),
            home: this.getElement('homeBtn'),
            loadMore: this.getElement('loadMoreBtn'),
            toHome: this.getElement('toHomeBtn')
        };

        // 신규단어 버튼 - 안전장치 추가
        if (buttons.newWords) {
            buttons.newWords.addEventListener('click', async () => {
                const btn = buttons.newWords;
                
                // app 객체 확인
                if (!this.ensureApp()) {
                    return;
                }
                
                try {
                    btn.disabled = true;
                    const originalText = btn.querySelector('.stats-title')?.textContent || 'NEW';
                    const titleElement = btn.querySelector('.stats-title');
                    if (titleElement) titleElement.textContent = '로딩중...';
                    
                    const result = await this.app.startMode('new');
                    if (result.success) {
                        this.showScreen('study');
                    } else {
                        this.showMessage('main', result.error || '학습을 시작할 수 없습니다.');
                    }
                } catch (error) {
                    console.error('Error starting new words mode:', error);
                    this.showMessage('main', '학습을 시작할 수 없습니다.');
                } finally {
                    btn.disabled = false;
                    const titleElement = btn.querySelector('.stats-title');
                    if (titleElement) titleElement.textContent = 'NEW';
                }
            });
        }
        
        // 암기중 버튼 - 안전장치 추가
        if (buttons.memorizing) {
            buttons.memorizing.addEventListener('click', async () => {
                const btn = buttons.memorizing;
                
                if (!this.ensureApp()) {
                    return;
                }
                
                try {
                    btn.disabled = true;
                    const titleElement = btn.querySelector('.stats-title');
                    if (titleElement) titleElement.textContent = '로딩중...';
                    
                    const result = await this.app.startMode('memorizing');
                    if (result.success) {
                        this.showScreen('study');
                    } else {
                        this.showMessage('main', result.error || '학습을 시작할 수 없습니다.');
                    }
                } catch (error) {
                    console.error('Error starting memorizing mode:', error);
                    this.showMessage('main', '학습을 시작할 수 없습니다.');
                } finally {
                    btn.disabled = false;
                    const titleElement = btn.querySelector('.stats-title');
                    if (titleElement) titleElement.textContent = '암기중';
                }
            });
        }

        // 단기기억 버튼
        if (buttons.shortTerm) {
            buttons.shortTerm.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleShortTermClick();
            });
        }

        // 장기기억 버튼
        if (buttons.longTerm) {
            buttons.longTerm.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleLongTermClick();
            });
        }

        // Q Memory 버튼
        if (buttons.qMemory) {
            buttons.qMemory.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.startQMemoryMode();
            });
        }
        
        // 고난도 버튼
        if (buttons.difficult) {
            buttons.difficult.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleDifficultMode();
            });
        }

        // 학습 버튼 이벤트
        if (buttons.know) {
            buttons.know.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleAnswer(true);
            });
        }
        if (buttons.dontKnow) {
            buttons.dontKnow.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleAnswer(false);
            });
        }
        // 암기중 모드에서 처음 학습하는 단어용 "다음" 버튼 이벤트
        if (buttons.nextOnly) {
            buttons.nextOnly.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleNextOnlyButton();
            });
        }
        if (buttons.stop) {
            buttons.stop.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleStop();
            });
        }
        if (buttons.studyClose) {
            buttons.studyClose.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleStop();
            });
        }
        if (buttons.continue) {
            buttons.continue.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.showNextWord();
            });
        }

        // Q Memory 버튼 이벤트
        if (buttons.start) {
            buttons.start.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.startQMemoryGame();
            });
        }
        if (buttons.choice1) {
            buttons.choice1.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleQMemoryChoice(buttons.choice1.textContent);
            });
        }
        if (buttons.choice2) {
            buttons.choice2.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.handleQMemoryChoice(buttons.choice2.textContent);
            });
        }
        if (buttons.home) {
            buttons.home.addEventListener('click', () => this.goToMain());
        }

        // 완료 화면 버튼 이벤트
        if (buttons.loadMore) {
            buttons.loadMore.addEventListener('click', () => {
                if (!this.ensureApp()) return;
                this.loadMoreWords();
            });
        }
        if (buttons.toHome) {
            buttons.toHome.addEventListener('click', () => this.goToMain());
        }

        // 카드 관련 이벤트
        const card = this.getElement('card');
        if (card) {
            card.addEventListener('click', (e) => {
                if (!this.ensureApp()) return;
                
                if (this.screens.qGame.style.display !== 'none') {
                    if (card.classList.contains('flipped') && 
                        this.getElement('choiceButtons').style.display === 'none') {
                        this.nextQMemoryCard();
                    }
                }
            });
        }

        // 카드 뒷면 클릭 이벤트
        document.addEventListener('click', (e) => {
            if (!this.ensureApp()) return;
            
            // 이미 처리 중인지 확인하는 플래그 추가
            if (window._isProcessingCardClick) return;
            
            const cardBack = e.target.closest('.card-content.back');
            if (cardBack && document.getElementById('navigationButtons').style.display !== 'none') {
                // 처리 중 플래그 설정
                window._isProcessingCardClick = true;
                
                // showNextWord 호출
                this.showNextWord().finally(() => {
                    // 처리 완료 후 플래그 해제 (비동기 작업 후에도 안전하게)
                    setTimeout(() => {
                        window._isProcessingCardClick = false;
                    }, 500);
                });
            }
        });
        
        // 고난도 모드 닫기 버튼 이벤트
        const closeDifficultBtn = document.getElementById('closeDifficultBtn');
        if (closeDifficultBtn) {
            closeDifficultBtn.addEventListener('click', () => {
                const difficultScreen = document.getElementById('difficultScreen');
                if (difficultScreen) {
                    difficultScreen.style.display = 'none';
                }
            });
        }

        // 모달 닫기 버튼 이벤트
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', () => {
                this.hideNoWordsModal();
            });
        }

        // 모달 배경 클릭 시 닫기
        const modal = document.getElementById('noWordsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideNoWordsModal();
                }
            });
        }

        console.log('UIManager: 이벤트 리스너 설정 완료');
    }

    scheduleUpdate(updateFn) {
        if (this.frameRequest) {
            cancelAnimationFrame(this.frameRequest);
        }
        
        this.frameRequest = requestAnimationFrame(() => {
            updateFn();
            this.frameRequest = null;
        });
    }

    batchUpdate(updates) {
        updates.forEach(update => this.batchUpdates.add(update));
        
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.updateTimer = setTimeout(() => {
            this.processBatchUpdates();
        }, this.updateDelay);
    }

    processBatchUpdates() {
        if (this.batchUpdates.size === 0) return;

        this.scheduleUpdate(() => {
            this.batchUpdates.forEach(update => update());
            this.batchUpdates.clear();
        });
    }

    // 화면 전환
    showScreen(screenName) {
        console.log(`[showScreen] 화면 전환: ${screenName}`);
        
        // 화면 전환 시 모든 타이머 제거
        if (this.app && this.app.currentMode && typeof this.app.currentMode.clearFlipTimer === 'function') {
            this.app.currentMode.clearFlipTimer();
        }
        
        // 모든 화면 숨기기
        Object.values(this.screens).forEach(screen => {
            if (screen) {
                screen.style.display = 'none';
                screen.classList.remove('active');
            }
        });
        
        const targetScreen = this.screens[screenName];
        if (targetScreen) {
            targetScreen.style.display = 'flex';
            targetScreen.classList.add('active');
            
            // 메인 화면으로 전환 시 특별 처리
            if (screenName === 'main') {
                console.log('[showScreen] 메인 화면 전환 - 통계 준비');
                
                // DOM 렌더링 완료 대기
                requestAnimationFrame(() => {
                    // 메인 화면 요소들이 준비되었는지 확인
                    const mainReady = document.querySelector('.stats-value') !== null;
                    
                    if (mainReady && this.app) {
                        // 캐시 무효화 후 통계 업데이트
                        if (this.app.cache && this.app.cache.counts) {
                            this.app.cache.counts.clear();
                        }
                        if (this.app.countCache) {
                            this.app.countCache.invalidate();
                        }
                        
                        // 로딩 애니메이션 시작
                        if (typeof showLoadingStates === 'function') {
                            showLoadingStates();
                        }
                        
                        // 통계 갱신
                        if (window.contentAppInitializer && typeof window.contentAppInitializer.updateStatistics === 'function') {
                            console.log('통계 업데이트 실행');
                            window.contentAppInitializer.updateStatistics()
                                .then(() => {
                                    console.log('통계 업데이트 완료');
                                    // 푸터 텍스트 강제 업데이트
                                    setTimeout(() => {
                                        const footerText = document.querySelector('.footer-text');
                                        const totalElement = document.getElementById('totalWords');
                                        if (footerText && totalElement && totalElement.textContent) {
                                            const totalCount = totalElement.textContent;
                                            footerText.textContent = `맥락과 반복 - 전체 ${totalCount}개`;
                                        }
                                    }, 500);
                                })
                                .catch(err => console.error('통계 업데이트 오류:', err));
                        } else if (this.fetchAndRenderStats) {
                            // contentAppInitializer가 없으면 직접 fetchAndRenderStats 호출
                            console.log('fetchAndRenderStats 직접 실행');
                            this.fetchAndRenderStats()
                                .then(() => console.log('fetchAndRenderStats 완료'))
                                .catch(err => console.error('fetchAndRenderStats 오류:', err));
                        }
                    } else {
                        // 요소가 준비되지 않았으면 다시 시도
                        setTimeout(() => {
                            if (this.fetchAndRenderStats) {
                                this.fetchAndRenderStats();
                            } else if (typeof fetchAndRenderStats === 'function') {
                                fetchAndRenderStats();
                            }
                        }, 100);
                    }
                });
            }            
            // 학습 관련 화면 전환 시 인덱스 초기화
            if (screenName === 'study' || screenName === 'qGame') {
                // UI 카운터 초기화
                this.currentStudyIndex = 0;
                
                // 모드의 인덱스도 반드시 함께 초기화
                if (this.app && this.app.currentMode) {
                    console.log(`[showScreen] ${screenName} 화면으로 전환 - 모드 인덱스 초기화`);
                    
                    // 모드 인덱스 초기화
                    this.app.currentMode.currentIndex = 0;
                    
                    // 로컬 스토리지 학습 상태 초기화 (선택적)
                    if (screenName === 'study' && localStorage.getItem('current_learning_state')) {
                        console.log('[showScreen] 이전 학습 상태 초기화');
                        localStorage.removeItem('current_learning_state');
                    }
                }
            }
            
            // 화면 초기화 스케줄링
            this.scheduleUpdate(() => {
                this.initializeScreen(screenName);
            });
        }
    }

    async handleStop() {
        if (!this.ensureApp()) return;
        
        const stopBtn = this.getElement('stopBtn');
        if (!stopBtn) return;
        
        const originalText = stopBtn.textContent;
        
        try {
            // 중지 버튼 로딩 상태로 변경
            stopBtn.classList.add('stop-btn-loading');
            stopBtn.disabled = true;
            stopBtn.textContent = '저장 중...';
            
            // 로딩 스피너 추가
            const spinner = document.createElement('div');
            spinner.className = 'btn-spinner';
            stopBtn.appendChild(spinner);
            
            // 저장 진행 상태를 보여주는 메시지 컨테이너 생성
            const newMessageContainer = this.createSaveProgressMessage();
            if (newMessageContainer) {
                document.body.appendChild(newMessageContainer);
            }
            
            // 실제 저장 처리
            if (this.app.currentMode?.wordSaveQueue) {
                const queue = this.app.currentMode.wordSaveQueue;
                
                // 저장 대기 중인 단어가 있으면 처리
                if (queue.getPendingCount() > 0) {
                    console.log('[handleStop] 저장 대기 중인 단어 처리 시작');
                    await queue.processQueue();
                }
            }
            
            // 메시지 컨테이너 정리
            const oldMessageContainer = document.querySelector('.save-message-container');
            if (oldMessageContainer) {
                oldMessageContainer.remove();
            }
            
            // 캐시 무효화 및 현재 모드 정리
            if (this.app.cache && this.app.cache.counts) {
                this.app.cache.counts.clear();
            }
            if (this.app.countCache) {
                this.app.countCache.invalidate();
            }
            
            if (this.app.currentMode && typeof this.app.currentMode.destroy === 'function') {
                this.app.currentMode.destroy();
            }
            this.app.currentMode = null;
            
            // 메인 화면으로 이동
            await this.goToMain();
            
            // 메인 화면 도달 확인 및 통계 업데이트
            const mainScreen = document.getElementById('mainScreen');
            if (mainScreen && mainScreen.classList.contains('active')) {
                console.log('[handleStop] 메인 화면 도달 확인, 통계 업데이트 시작');
                
                // DOM이 완전히 준비될 때까지 대기
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 요소 존재 확인 로그
                const isStudiedWordsElement = document.getElementById('isStudiedWordsCount');
                console.log('[handleStop] isStudiedWordsCount element:', isStudiedWordsElement);
                
                // 로딩 상태로 설정
                if (typeof showLoadingStates === 'function') {
                    showLoadingStates();
                }
                
                // 통계 업데이트 (더 긴 지연)
                setTimeout(() => {
                    console.log('[handleStop] fetchAndRenderStats 실행');
                    
                    // 캐시 강제 무효화
                    if (this.app && this.app.countCache) {
                        this.app.countCache.invalidate();
                    }
                    
                    if (typeof this.fetchAndRenderStats === 'function') {
                        this.fetchAndRenderStats().then(() => {
                            console.log('[handleStop] 통계 업데이트 완료');
                        }).catch(err => {
                            console.error('[handleStop] 통계 업데이트 오류:', err);
                            
                            // 실패 시 재시도
                            setTimeout(() => {
                                console.log('[handleStop] 통계 업데이트 재시도');
                                if (typeof this.fetchAndRenderStats === 'function') {
                                    this.fetchAndRenderStats();
                                }
                            }, 500);
                        });
                    }
                }, 300);
            }
            
        } catch (error) {
            console.error('Stop handling error:', error);
            
            // 오류 처리
            const errorContainer = document.querySelector('.save-message-container');
            if (errorContainer) {
                const messageText = errorContainer.querySelector('.save-message-text');
                if (messageText) {
                    messageText.textContent = '저장 중 오류가 발생했습니다.';
                }
                
                setTimeout(() => {
                    errorContainer.remove();
                    this.goToMain();
                }, 2000);
            } else {
                this.goToMain();
            }
            
        } finally {
            // 버튼 상태 복원
            if (stopBtn) {
                stopBtn.classList.remove('stop-btn-loading');
                stopBtn.disabled = false;
                stopBtn.textContent = originalText;
                
                // 스피너 제거
                const existingSpinner = stopBtn.querySelector('.btn-spinner');
                if (existingSpinner) {
                    existingSpinner.remove();
                }
            }
        }
    }

    // 저장 진행 메시지 엘리먼트 생성
    createSaveProgressMessage() {
        const existingMessage = document.querySelector('.save-message-container');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageContainer = document.createElement('div');
        messageContainer.className = 'save-message-container';
        messageContainer.innerHTML = `
            <div class="save-message-box">
                <div class="save-message-text">단어 저장 중...</div>
                <div class="loading-spinner"></div>
            </div>
        `;

        return messageContainer;
    }

    initializeScreen(screenName) {
        switch(screenName) {
            case 'qGame':
                this.resetQMemoryGame();
                this.showQMemoryCard();
                break;
            case 'study':
                this.showWord();
                break;
            case 'main':
                break;
        }
    }

    async showWord() {
        if (!this.ensureApp()) return;
        
        try {
            console.log('showWord called, currentStudyIndex:', this.currentStudyIndex);

            // currentMode 존재 여부 확인 추가
            if (!this.app.currentMode) {
                console.error('currentMode가 없습니다');
                this.showCompletionScreen();
                return;
            }

            const currentWord = this.app.getCurrentWord();
            if (!currentWord) {
                console.log('currentWord가 null이므로 완료 화면 표시');
                this.showCompletionScreen();
                return;
            }
            
            // currentIndex가 없으면 0으로 초기화
            if (this.app.currentMode.currentIndex === undefined) {
                console.warn('currentIndex가 undefined, 0으로 초기화');
                this.app.currentMode.currentIndex = 0;
            }
            
            const currentModeIndex = this.app.currentMode.currentIndex;
            console.log('현재 단어 표시 정보:', {
                단어: currentWord.word,
                의미: typeof currentWord.meaning === 'string' ? currentWord.meaning.substring(0, 20) : String(currentWord.meaning || ''),
                모드인덱스: currentModeIndex,
                UI인덱스: this.currentStudyIndex,
                모드타입: this.app.currentMode.constructor.name
            });

            const elements = {
                cardSlide: this.getElement('cardSlide'),
                frontWord: this.getElement('frontWord'),
                backWord: this.getElement('backWord'),
                meaning: this.getElement('meaning'),
                pronunciation: this.getElement('pronunciation'),
                vipup: this.getElement('vipup'),
                currentProgress: this.getElement('currentProgress'),
                totalWordsProgress: this.getElement('totalWordsProgress'),
                answerButtons: this.getElement('answerButtons'),
                navigationButtons: this.getElement('navigationButtons')
            };

            if (!elements.cardSlide || !elements.frontWord || !elements.backWord) {
                console.error('Essential DOM elements are missing');
                return;
            }

            // 단어 화면 애니메이션
            elements.cardSlide.style.opacity = '0';
            elements.cardSlide.style.transition = 'opacity 0.3s ease';

            await new Promise(resolve => setTimeout(resolve, 300));

            this.batchUpdate([
                () => {
                    elements.cardSlide.classList.remove('show-answer');

                    // "card touch" 문구 숨김 (카드 앞면)
                    const cardTouchHint = this.getElement('cardTouchHint');
                    if (cardTouchHint) {
                        cardTouchHint.style.display = 'none';
                    }

                    // 안전하게 텍스트 설정
                    elements.frontWord.textContent = currentWord.word || '';
                    elements.backWord.textContent = currentWord.word || '';
                    elements.meaning.textContent = currentWord.meaning || '';

                    if (currentWord.pronunciation) {
                        elements.pronunciation.textContent = currentWord.pronunciation;
                        elements.pronunciation.style.display = 'block';
                    } else {
                        elements.pronunciation.style.display = 'none';
                    }
                    
                    if (elements.vipup) {
                        if (currentWord.vipup) {
                            let vipupText = currentWord.vipup;
                            
                            // JSON 배열 형태 ["..."] 처리
                            if (typeof vipupText === 'string' && 
                                    vipupText.startsWith('["') && 
                                    vipupText.endsWith('"]')) {
                                    try {
                                            const parsed = JSON.parse(vipupText);
                                            if (Array.isArray(parsed) && parsed.length > 0) {
                                                    vipupText = parsed[0];
                                                    console.log('VipUp JSON 배열 파싱 성공');
                                            }
                                    } catch (e) {
                                            console.warn('VipUp JSON 파싱 실패:', e);
                                    }
                            }
                            
                            elements.vipup.textContent = vipupText;
                            elements.vipup.style.display = 'block';
                        } else {
                            elements.vipup.style.display = 'none';
                        }
                    }
                    // 진행 상태 업데이트 부분 수정 - 항상 모델의 currentIndex 사용
                    if (elements.currentProgress && elements.totalWordsProgress) {
                        if (this.app.currentMode instanceof NewWordsMode) {
                            // 중요: 모드 인덱스에 1을 더해 표시 (0부터 시작하므로)
                            elements.currentProgress.textContent = `${currentModeIndex + 1}`;
                            
                            // 단어 배열 길이 사용
                            const totalWords = this.app.currentMode.words?.length || 0;
                            elements.totalWordsProgress.textContent = totalWords > 0 ? totalWords : '?';
                        }
                        else if (this.app.currentMode instanceof MemorizingMode) {
                            elements.currentProgress.textContent = `${currentModeIndex + 1}`;
                            elements.totalWordsProgress.textContent = this.app.currentMode.totalCount || 0;
                        }
                    }

                    if (elements.answerButtons && elements.navigationButtons) {
                        // 암기중 모드에서 처음 학습하는 단어인지 확인
                        const nextOnlyButtons = document.getElementById('nextOnlyButtons');
                        if (this.app.currentMode instanceof MemorizingMode && currentWord.firstTimeInMemorizing) {
                            // 처음 암기중에서 학습하는 단어: "다음" 버튼만 표시
                            elements.answerButtons.style.display = 'none';
                            if (nextOnlyButtons) nextOnlyButtons.style.display = 'flex';
                        } else {
                            // 일반적인 경우: "알아요/몰라요" 버튼 표시
                            elements.answerButtons.style.display = 'flex';
                            if (nextOnlyButtons) nextOnlyButtons.style.display = 'none';
                        }
                        elements.navigationButtons.style.display = 'none';
                    }
                    
                    elements.cardSlide.style.opacity = '1';
                }
            ]);

            // UI 인덱스를 현재 모드 인덱스와 동기화 - 중요한 수정 부분
            this.currentStudyIndex = currentModeIndex;

        } catch (error) {
            console.error('Error in showWord:', error);
            this.showCompletionScreen();
        }
    }

    async handleAnswer(isKnown) {
        if (!this.ensureApp()) return false;
        
        // 디바운싱 추가 - 이미 처리 중인지 확인
        if (this._isHandlingAnswer) {
            console.log('[handleAnswer] 이미 처리 중입니다');
            return false;
        }
        
        // 처리 중 플래그 설정
        this._isHandlingAnswer = true;
        
        try {
            const elements = {
                cardSlide: this.getElement('cardSlide'),
                answerButtons: this.getElement('answerButtons'),
                navigationButtons: this.getElement('navigationButtons')
            };
            
            // 즉시 카드 뒷면을 보여줌 (UI 응답성 유지)
            if (elements.cardSlide) {
                elements.cardSlide.classList.add('show-answer');
            }

            // "card touch" 문구 표시 (카드 뒷면)
            const cardTouchHint = this.getElement('cardTouchHint');
            if (cardTouchHint) {
                cardTouchHint.style.display = 'block';
                console.log('[handleAnswer] "card touch" 문구 표시됨');
            } else {
                console.warn('[handleAnswer] cardTouchHint 요소를 찾을 수 없음');
            }

            if (elements.answerButtons) {
                elements.answerButtons.style.display = 'none';
            }
            if (elements.navigationButtons) {
                elements.navigationButtons.style.display = 'flex';
            }
            
            // 현재 단어 로깅
            const currentWord = this.app.getCurrentWord();
            const currentModeIndex = this.app.currentMode.currentIndex;
            
            console.log('[handleAnswer] 처리 단어:', {
                word: currentWord?.word,
                No: currentWord?.No,
                isKnown: isKnown,
                모드인덱스: currentModeIndex
            });
            
            // 백그라운드에서 상태 업데이트하고 결과 확인
            const updateSuccessful = await this.app.currentMode.handleAnswer(this.app.userPhone, isKnown);
            
            if (updateSuccessful) {
                console.log('[handleAnswer] 저장 완료');
                // 캐시 무효화 (메인 화면으로 돌아갔을 때 정확한 통계 표시를 위해)
                if (this.app.cache && this.app.cache.counts) {
                    this.app.cache.counts.clear();
                }
                if (this.app.countCache) {
                    this.app.countCache.invalidate();
                }
            } else {
                console.error('[handleAnswer] 단어 상태 업데이트 실패');
            }
            
            return updateSuccessful;
        } catch (error) {
            console.error('[handleAnswer] UI 처리 오류:', error);
            return false;
        } finally {
            // 처리 완료 후 플래그 해제 (더 긴 지연시간으로 안전성 확보)
            setTimeout(() => {
                this._isHandlingAnswer = false;
            }, 800);
        }
    }

    /**
     * 암기중 모드에서 처음 학습하는 단어의 "다음" 버튼 처리
     * - firstTimeInMemorizing을 false로 변경하고 DB 업데이트
     * - 다음 단어로 이동
     */
    async handleNextOnlyButton() {
        if (!this.ensureApp()) return false;

        // 디바운싱
        if (this._isHandlingNextOnly) {
            console.log('[handleNextOnlyButton] 이미 처리 중입니다');
            return false;
        }

        this._isHandlingNextOnly = true;

        try {
            const currentWord = this.app.getCurrentWord();
            if (!currentWord || !currentWord._id) {
                console.error('[handleNextOnlyButton] 현재 단어 없음');
                return false;
            }

            console.log('[handleNextOnlyButton] 처리 시작:', currentWord.word);

            // 1. IndexedDB에서 firstTimeInMemorizing을 false로 업데이트
            const koreanTimeNow = window.KoreanTimeUtil ?
                window.KoreanTimeUtil.getKoreanTimeISOString() :
                new Date().toISOString();

            const updateData = {
                firstTimeInMemorizing: false,
                updatedAt: koreanTimeNow
            };

            await this.app.dbManager.updateWord(currentWord._id, updateData);
            console.log('[handleNextOnlyButton] DB 업데이트 완료');

            // 2. 로컬 firstTimeFlags 배열도 업데이트
            if (this.app.currentMode.firstTimeFlags && this.app.currentMode.currentIndex < this.app.currentMode.firstTimeFlags.length) {
                this.app.currentMode.firstTimeFlags[this.app.currentMode.currentIndex] = false;
            }

            // 3. "다음" 버튼 숨기고 네비게이션 버튼 표시 (계속 버튼용)
            const nextOnlyButtons = document.getElementById('nextOnlyButtons');
            const navigationButtons = this.getElement('navigationButtons');
            const cardSlide = this.getElement('cardSlide');

            if (nextOnlyButtons) nextOnlyButtons.style.display = 'none';
            if (navigationButtons) navigationButtons.style.display = 'flex';
            if (cardSlide) cardSlide.classList.add('show-answer');

            // "card touch" 문구 표시
            const cardTouchHint = this.getElement('cardTouchHint');
            if (cardTouchHint) cardTouchHint.style.display = 'block';

            return true;
        } catch (error) {
            console.error('[handleNextOnlyButton] 오류:', error);
            return false;
        } finally {
            setTimeout(() => {
                this._isHandlingNextOnly = false;
            }, 800);
        }
    }

    // UIManager 클래스의 showNextWord 함수 개선
    async showNextWord() {
        if (!this.ensureApp()) return false;
        
        // 이미 처리 중인지 확인
        if (this._isShowingNextWord) {
            console.log('[showNextWord] 이미 다음 단어 처리 중');
            return false;
        }
        
        // 처리 중 플래그 설정
        this._isShowingNextWord = true;
        
        console.log('[showNextWord] 다음 단어 표시 시작');
        
        try {
            if (!this.app.currentMode) {
                console.error('[showNextWord] 현재 모드가 없습니다');
                this.showCompletionScreen();
                return false;
            }
            
            // 모드의 현재 상태 확인
            const currentIndex = this.app.currentMode.currentIndex;
            const wordsLength = this.app.currentMode.words?.length || 0;
            
            console.log('[showNextWord] 현재 상태:', {
                모드: this.app.currentMode.constructor.name,
                현재인덱스: currentIndex,
                총단어수: wordsLength
            });
            
            // 마지막 단어인지 확인
            if (currentIndex >= wordsLength - 1) {
                console.log('[showNextWord] 이미 마지막 단어입니다. 종료 화면으로 이동');
                this.showCompletionScreen();
                return false;
            }
            
            // 다음 단어로 이동
            this.app.currentMode.currentIndex++;
            console.log('[showNextWord] 다음 단어로 이동:', this.app.currentMode.currentIndex);
            
            // UI 인덱스도 함께 업데이트
            this.currentStudyIndex = this.app.currentMode.currentIndex;
            
            // 변경된 인덱스로 단어 표시
            await this.showWord();
            
            return true;
        } catch (error) {
            console.error('[showNextWord] 오류 발생:', error);
            this.showCompletionScreen();
            return false;
        } finally {
            // 처리 완료 후 플래그 해제
            setTimeout(() => {
                this._isShowingNextWord = false;
            }, 500);
        }
    }

    async showCompletionScreen() {
        if (!this.ensureApp()) return;
        
        // 학습 상태 저장 여부 확인
        console.log('[showCompletionScreen] 시작 - 전체 학습된 단어 수:', 
                    this.app.currentMode?.words?.length || 0);
        
        // 1. 결과(완료) 화면으로 전환
        this.showScreen('completion');
        
        const statsContainer = this.getElement('statsBox');
        const loadMoreBtn = this.getElement('loadMoreBtn');
        const toHomeBtn = this.getElement('toHomeBtn');

        // 버튼 이벤트 핸들러 설정
        if (loadMoreBtn) {
            loadMoreBtn.onclick = () => this.loadMoreWords();
        }
        if (toHomeBtn) {
            toHomeBtn.onclick = () => this.goToMain();
        }

        // 2. 초기 통계 표시 (임시)
        if (statsContainer) {
            // 현재 모드에서 통계 가져오기 - 없으면 기본값 사용
            let localStats = { knownCount: 0, unknownCount: 0, wordsStudied: 0 };
            
            if (this.app.currentMode) {
                try {
                    localStats = this.app.currentMode.getStats() || localStats;
                    console.log('[showCompletionScreen] 현재 모드 통계:', localStats);
                } catch (error) {
                    console.error('[showCompletionScreen] 통계 가져오기 오류:', error);
                }
            }
            
            // 단어 총 개수 표시 추가
            const totalStudiedWords = this.app.currentMode?.words?.length || 0;
            
            statsContainer.innerHTML = `
                <div style="text-align:center; padding:0.5rem 0;">
                    <div style="font-size:1.3rem; font-weight:bold; color:#4F46E5 !important;">학습 결과</div>
                    <div style="margin-top:6px; font-size:0.85rem; color:#6B7280 !important;">총 ${totalStudiedWords}개 학습 완료</div>
                    <div style="margin-top:15px; display: flex; justify-content: space-between; gap:1rem; padding:0 0.3rem;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.9rem; color:#10B981 !important; font-weight:bold; white-space:nowrap;">알아요</div>
                            <div id="finalKnownCount" style="font-size:1.4rem; color:#10B981 !important; margin-top:5px; font-weight:600;">${localStats.knownCount}</div>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.9rem; color:#EF4444 !important; font-weight:bold; white-space:nowrap;">몰라요</div>
                            <div id="finalUnknownCount" style="font-size:1.4rem; color:#EF4444 !important; margin-top:5px; font-weight:600;">${localStats.unknownCount}</div>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.9rem; color:#F59E0B !important; font-weight:bold; white-space:nowrap;">남은 단어</div>
                            <div id="finalRemainingCount" style="font-size:1.4rem; color:#F59E0B !important; margin-top:5px; font-weight:600;">로딩중</div>
                        </div>
                    </div>
                </div>
            `;
        }

        let finalStats = null;
        let remainingCount = 0;
        const currentModeName = this.app.currentMode?.constructor.name;

        try {
            // 3. 결과 계산
            if (currentModeName === 'NewWordsMode') {
                finalStats = this.app.currentMode.getStats();
                remainingCount = finalStats.remainingWords;
                console.log('[showCompletionScreen] NewWordsMode 통계:', finalStats);
            } else if (currentModeName === 'MemorizingMode') {
                finalStats = this.app.currentMode.getStats();
                remainingCount = await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "0" });
            } else if (currentModeName === 'ShortTermQMemoryMode') {
                finalStats = this.app.currentMode.getStats();
                remainingCount = await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "1" });
            } else if (currentModeName === 'LongTermQMemoryMode') {
                finalStats = this.app.currentMode.getStats();
                remainingCount = await this.app.dbManager.getLongTermCountBeforeDate(getTodayISOString());
            } else if (currentModeName === 'QMemoryMode') {
                finalStats = this.app.currentMode.getStats();
                remainingCount = await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "0", status: "0" });
            } else {
                finalStats = this.app.currentMode ? this.app.currentMode.getStats() : { knownCount: 0, unknownCount: 0 };
            }
            finalStats.remainingWords = remainingCount;

            // 4. 최종 결과 UI 업데이트
            this.updateCompletionScreen(finalStats);
            
            // 5. "더 학습하기" 버튼 표시/숨김 처리
            if (loadMoreBtn) {
                loadMoreBtn.style.display = (remainingCount > 0) ? 'block' : 'none';
            }
            
            // 6. 학습 데이터 초기화
            if (this.app.currentMode) {
                console.log('[showCompletionScreen] 학습 모드 정리 전 상태:', {
                    모드: currentModeName,
                    단어수: this.app.currentMode.words?.length || 0
                });
                
                // 모든 단어가 처리된 후 상태 초기화
                if (typeof this.app.currentMode.resetStats === 'function') {
                    this.app.currentMode.resetStats();
                    console.log('[showCompletionScreen] 통계 초기화 완료');
                }
            }
            
        } catch (error) {
            console.error('[showCompletionScreen] 오류 발생:', error);
            if (statsContainer) {
                statsContainer.innerHTML = `
                    <div class="error-state" style="padding:15px; text-align:center; color:#EF4444;">
                        통계 로딩 중 오류가 발생했습니다: ${error.message}
                    </div>
                `;
            }
        } finally {
            // 캐시 무효화 및 모드 종료 처리
            if (this.app.countCache) {
                this.app.countCache.invalidate();
            }
            
            // 모드 정리
            if (this.app.currentMode && typeof this.app.currentMode.destroy === 'function') {
                console.log('[showCompletionScreen] 모드 정리 시작');
                this.app.currentMode.destroy();
                console.log('[showCompletionScreen] 모드 정리 완료');
            }
        }
    }

    updateCompletionScreen(finalStats) {
        const statsContainer = this.getElement('statsBox');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div style="text-align:center; padding:0.5rem 0;">
                    <div style="display: flex; justify-content: space-between; gap:1rem; font-size:1rem; padding:0 0.3rem;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight: bold; color:#10B981 !important; font-size:0.9rem; white-space:nowrap;">알아요</div>
                            <div id="finalKnownCount" style="font-size:1.4rem; margin-top:5px; color:#10B981 !important; font-weight:600;">${finalStats.knownCount}</div>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight: bold; color:#EF4444 !important; font-size:0.9rem; white-space:nowrap;">몰라요</div>
                            <div id="finalUnknownCount" style="font-size:1.4rem; margin-top:5px; color:#EF4444 !important; font-weight:600;">${finalStats.unknownCount}</div>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight: bold; color:#F59E0B !important; font-size:0.9rem; white-space:nowrap;">남은 단어</div>
                            <div id="finalRemainingCount" style="font-size:1.4rem; margin-top:5px; color:#F59E0B !important; font-weight:600;">${finalStats.remainingWords}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // 메시지 표시 메서드 개선
    showMessage(screenId, message, type = 'error') {
        const messageContainer = document.getElementById(`${screenId}Message`) || 
                               document.getElementById('mainMessage');
        
        if (!messageContainer) {
            // 메시지 컨테이너가 없으면 콘솔에만 출력
            console.warn('메시지 컨테이너를 찾을 수 없음:', message);
            return;
        }

        this.batchUpdate([
            () => {
                messageContainer.textContent = message;
                messageContainer.classList.add('show');
                
                if (type === 'success') {
                    messageContainer.style.color = '#10B981';
                    messageContainer.style.fontWeight = 'bold';
                } else if (type === 'info') {
                    messageContainer.style.color = '#3B82F6';
                    messageContainer.style.fontWeight = 'normal';
                } else {
                    messageContainer.style.color = '#4F46E5';
                    messageContainer.style.fontWeight = 'normal';
                }
            }
        ]);

        // 기존 타이머 제거
        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
        }

        // 새 타이머 설정
        this.messageTimer = setTimeout(() => {
            this.batchUpdate([
                () => {
                    messageContainer.classList.remove('show');
                    messageContainer.style.color = '';
                    messageContainer.style.fontWeight = '';
                }
            ]);
        }, 4000);
    }

    // Q Memory 버튼
    async startQMemoryMode() {
        if (!this.ensureApp()) return;
        
        try {
            const result = await this.app.startMode('qMemory');
            if (result.success) {
                this.showScreen('qStart');
                await this.initializeQMemoryMode();
                await this.app.updateWordCounts('qMemory');
            } else {
                this.showMessage('main', '학습할 단어가 없습니다.');
                this.goToMain();
            }
        } catch (error) {
            console.error('Error starting Q Memory mode:', error);
            this.showMessage('main', 'Q Memory 모드를 시작할 수 없습니다.');
            this.goToMain();
        }
    }

    async initializeQMemoryMode() {
        if (!this.ensureApp()) return;
        
        try {
            await this.app.currentMode.initialize(this.app.userPhone);
            const startBtn = this.getElement('startBtn');
            if (startBtn) {
                startBtn.style.display = 'block';
            }
        } catch (error) {
            console.error('Error initializing Q Memory mode:', error);
            this.showMessage('main', 'Q Memory 모드 초기화 중 오류가 발생했습니다.');
            this.goToMain();
        }
    }

    startQMemoryGame() {
        if (!this.ensureApp()) return;
        
        // 기존 타이머 제거
        if (this.app.currentMode && typeof this.app.currentMode.clearFlipTimer === 'function') {
            this.app.currentMode.clearFlipTimer();
        }
        
        this.showScreen('qGame');
        this.resetQMemoryGame();
        
        // requestAnimationFrame을 제거하고 직접 호출
        this.showQMemoryCard();
    }

    resetQMemoryGame() {
        if (!this.ensureApp()) return;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) return;
        
        // 현재 실행 중인 타이머 제거
        if (typeof currentMode.clearFlipTimer === 'function') {
            currentMode.clearFlipTimer();
        }
        
        // 초기화 시 isDestroyed 플래그 리셋
        currentMode.isDestroyed = false;
        currentMode.currentIndex = 0;
    }

    async handleShortTermClick() {
        if (!this.ensureApp()) return;
        
        console.log('Short term button clicked');
    
        // 버튼 클릭 시 직접 단어 개수 확인
        try {
            const shortTermCount = await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "1" });
            console.log('단기기억 단어 개수 (직접 확인):', shortTermCount);
            
            // 몇 개 샘플 단어 확인
            const sampleWords = await this.app.dbManager.getWords({ isStudied: "1", known_2: "1" }, 3);
            console.log('단기기억 샘플 단어:', sampleWords);
        } catch (err) {
            console.error('단어 개수 확인 오류:', err);
        }
    
        // 기존 코드 계속 실행
        const result = await this.app.startMode('shortTerm');
        console.log('Start mode result:', result);
            
        if (result.success) {
            if (this.app.currentMode?.words?.length > 0) {
                this.showScreen('qGame');
                this.resetQMemoryGame();
                this.showQMemoryCard();
                await this.app.updateWordCounts('shortTerm'); // 필요한 카운트만 업데이트
            } else {
                this.showMessage('main', '학습할 단어가 없습니다.');
            }
        } else {
            this.showMessage('main', result.error || '학습을 시작할 수 없습니다.');
        }
    }

    async handleLongTermClick() {
        if (!this.ensureApp()) return;

        console.log('Long term button clicked');
        const result = await this.app.startMode('longTerm');
        console.log('Start mode result:', result);
        console.log('Current mode words length:', this.app.currentMode?.words?.length);

        // 단어를 불러올 수 없거나 단어가 없는 경우 모달 표시
        if (!result.success || !this.app.currentMode?.words?.length) {
            console.log('장기기억 학습할 단어 없음 - 모달 표시');
            this.showNoWordsModal();
            return;
        }

        // 학습 시작
        console.log('장기기억 학습 시작 - 단어 있음');
        this.showScreen('qGame');
        this.resetQMemoryGame();
        this.showQMemoryCard();
        await this.app.updateWordCounts('longTerm');
    }

    showNoWordsModal() {
        console.log('showNoWordsModal 호출됨');
        const modal = document.getElementById('noWordsModal');
        console.log('모달 요소:', modal);
        if (modal) {
            modal.style.display = 'flex';
            console.log('모달 display 설정:', modal.style.display);
        } else {
            console.error('noWordsModal 요소를 찾을 수 없음');
        }
    }

    hideNoWordsModal() {
        const modal = document.getElementById('noWordsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async showQMemoryCard() {
        if (!this.ensureApp()) return;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) {
            console.error('No active mode');
            return;
        }

        // 안전 장치: 이전에 설정된 타이머 강제 제거
        if (typeof currentMode.clearFlipTimer === 'function') {
            currentMode.clearFlipTimer();
        }

        const currentWord = currentMode.getCurrentWord();
        if (!currentWord) {
            console.error('No current word available');
            return;
        }

        // 여기에 디버깅 코드 삽입
        console.log("Setting up choices for word:", currentWord.word);
        this.setupQMemoryChoices(currentWord);

        const elements = {
            card: this.getElement('card'),
            choiceButtons: this.getElement('choiceButtons'),
            nextBtn: this.getElement('nextBtn'),
            frontText: this.getElement('frontText'),
            wordText: this.getElement('wordText'),
            backText: this.getElement('backText'),
            cardCount: this.getElement('cardCount')
        };

        // 필수 요소 확인
        if (!elements.card || !elements.frontText || !elements.wordText) {
            console.error('Required DOM elements missing');
            return;
        }

        // 카드 상태 초기화
        elements.card.classList.remove('flipped');
        
        // UI 업데이트 배치 처리
        this.batchUpdate([
            () => {
                elements.nextBtn.style.display = 'none';
                elements.choiceButtons.style.display = 'flex';

                if (currentMode.currentIndex === 0) {
                    elements.frontText.textContent = currentWord.word;
                    elements.wordText.textContent = currentWord.word;
                    elements.backText.textContent = currentWord.meaning;
                } else {
                    this.animateQMemoryCard(elements, currentWord);
                }

                if (elements.cardCount) {
                    elements.cardCount.textContent = 
                        `${currentMode.currentIndex + 1} / ${currentMode.words.length}`;
                }
            }
        ]);

        // DOM 업데이트가 완료되었음을 보장하기 위한 짧은 지연
        await new Promise(resolve => setTimeout(resolve, 50));

        // 타이머 시작 (DOM이 업데이트된 후)
        currentMode.startFlipTimer(() => {
            if (!elements.card.classList.contains('flipped')) {
                this.handleAutoFlip();
            }
        });
    }

    animateQMemoryCard(elements, currentWord) {
        // 먼저 텍스트 내용을 설정
        elements.frontText.textContent = currentWord.word;
        elements.wordText.textContent = currentWord.word;
        elements.backText.textContent = currentWord.meaning;

        // 초기 스타일 설정 – 텍스트 요소들에 대해
        [elements.frontText, elements.wordText, elements.backText].forEach(el => {
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
        });

        // 강제로 리플로우 발생
        void elements.frontText.offsetHeight;

        // 텍스트를 보여주는 함수 정의
        const showText = () => {
            [elements.frontText, elements.wordText, elements.backText].forEach(el => {
                el.style.transition = 'all 0.3s ease-out';
                el.style.transform = 'translateY(0)';
                el.style.opacity = '1';
            });
        };

        // fallback 타임아웃: transitionend 이벤트가 발생하지 않으면 350ms 후에 텍스트를 보여줌
        const fallbackTimeout = setTimeout(() => {
            showText();
        }, 350);

        // frontText 요소에 transitionend 이벤트 리스너를 등록
        const handleTransitionEnd = (event) => {
            if (event.propertyName === 'opacity') {
                clearTimeout(fallbackTimeout);
                showText();
                elements.frontText.removeEventListener('transitionend', handleTransitionEnd);
            }
        };

        elements.frontText.addEventListener('transitionend', handleTransitionEnd);

        // requestAnimationFrame을 사용하여 애니메이션을 시작함
        requestAnimationFrame(() => {
            showText();
        });
    }

    async handleQMemoryChoice(selectedSyllable) {
        if (!this.ensureApp()) return;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) return;
        
        currentMode.clearFlipTimer();
        const currentWord = currentMode.getCurrentWord();
        if (!currentWord) return;
        
        // meaning이 문자열인지 확인
        const meaningText = typeof currentWord.meaning === 'string' 
            ? currentWord.meaning 
            : String(currentWord.meaning);
        
        // 첫 글자가 있는지 확인
        const correctSyllable = meaningText.length > 0 ? meaningText.charAt(0) : '가';
        const isCorrect = selectedSyllable === correctSyllable;
        const isLastWord = !currentMode.hasNextWord();
        
        const elements = {
            choiceButtons: this.getElement('choiceButtons'),
            card: this.getElement('card'),
            wordText: this.getElement('wordText'),
            backText: this.getElement('backText')
        };

        try {
            // 즉시 UI 업데이트
            this.batchUpdate([
                () => {
                    elements.choiceButtons.style.display = 'none';
                    elements.wordText.textContent = currentWord.word;
                    elements.backText.textContent = currentWord.meaning;
                    elements.card.classList.add('flipped');
                }
            ]);
            
            const cardBack = elements.card.querySelector('.card-back');
            if (cardBack) {
                // 정답/오답에 따라 배경색 설정 (마지막 단어도 동일하게)
                cardBack.style.backgroundColor = isCorrect ? '#FFA500' : '#FFFFFF';
            }
                
            // 백그라운드에서 상태 업데이트
            currentMode.updateWordStatus(currentWord._id, isCorrect).catch(error => {
                console.error('Error updating word status:', error);
            });

            const delay = isCorrect ? 1000 : 2000;
            
            setTimeout(() => {
                if (isLastWord) {
                    this.showQMemoryResult();
                } else {
                    if (cardBack) cardBack.style.backgroundColor = '';
                    this.nextQMemoryCard();
                }
            }, delay);

        } catch (error) {
            console.error('Error handling Q Memory choice:', error);
            setTimeout(() => this.showQMemoryResult(), isCorrect ? 1000 : 2000);
        } finally {
            currentMode.clearFlipTimer();
        }
    }

    async handleAutoFlip() {
        if (!this.ensureApp()) return;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) return;

        const elements = {
            card: this.getElement('card'),
            choiceButtons: this.getElement('choiceButtons'),
            wordText: this.getElement('wordText'),
            backText: this.getElement('backText')
        };
        
        const currentWord = currentMode.getCurrentWord();
        if (!currentWord?._id) return;
        
        const isLastWord = !currentMode.hasNextWord();

        try {
            // 즉시 UI 업데이트
            this.batchUpdate([
                () => {
                    elements.wordText.textContent = currentWord.word;
                    elements.backText.textContent = currentWord.meaning;
                    elements.card.classList.add('flipped');
                    elements.choiceButtons.style.display = 'none';

                    // "card touch" 문구 표시
                    const cardTouchHint = this.getElement('cardTouchHint');
                    if (cardTouchHint) {
                        cardTouchHint.style.display = 'block';
                    }
                }
            ]);

            const cardBack = elements.card.querySelector('.card-back');
            if (cardBack) {
                // 자동 뒤집기의 경우 항상 오답 처리 (마지막 단어도 동일하게)
                cardBack.style.backgroundColor = '#FFFFFF';
            }
            
            // 백그라운드에서 상태 업데이트
            currentMode.updateWordStatus(currentWord._id, false).catch(error => {
                console.error('Error updating word status:', error);
            });

            setTimeout(() => {
                if (isLastWord) {
                    this.showQMemoryResult();
                } else {
                    if (cardBack) cardBack.style.backgroundColor = '';
                    this.nextQMemoryCard();
                }
            }, 2000);

        } catch (error) {
            console.error('Error handling auto flip:', error);
            setTimeout(() => this.showQMemoryResult(), 2000);
        } finally {
            currentMode.clearFlipTimer();
        }
    }

    nextQMemoryCard() {
        if (!this.ensureApp()) return;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) return;

        currentMode.clearFlipTimer();
        
        if (currentMode.hasNextWord()) {
            const moved = currentMode.moveToNextWord();
            if (moved) {
                this.showQMemoryCard();
            } else {
                this.showQMemoryResult();
            }
        } else {
            this.showQMemoryResult();
        }
    }

    setupQMemoryChoices(currentWord) {
        // meaning이 JSON 문자열인지 확인하고 변환
        let meaningText = typeof currentWord.meaning === 'string' 
            ? currentWord.meaning 
            : JSON.stringify(currentWord.meaning);
        
        // JSON 문자열인 경우 파싱
        if (meaningText.startsWith('[') && meaningText.endsWith(']')) {
            try {
                const parsedMeaning = JSON.parse(meaningText);
                // 배열의 첫 번째 항목을 사용
                if (Array.isArray(parsedMeaning) && parsedMeaning.length > 0) {
                    meaningText = parsedMeaning[0];
                }
            } catch (error) {
                console.error('의미 파싱 오류:', error);
                // 파싱 실패 시 원래 텍스트 유지
            }
        }
        
        // 첫 글자가 있는지 확인
        const correctSyllable = meaningText.length > 0 ? meaningText.charAt(0) : '가';
        const wrongSyllable = this.getRandomSyllable(correctSyllable);
        const buttons = this.shuffleArray([correctSyllable, wrongSyllable]);
        
        console.log("Choices setup:", {
            meaningText,
            correctSyllable,
            wrongSyllable,
            shuffled: buttons
        });

        // 버튼 설정 코드는 그대로 유지
        const choiceBtn1 = document.getElementById('choiceBtn1');
        const choiceBtn2 = document.getElementById('choiceBtn2');
        const choiceButtons = document.getElementById('choiceButtons');
        const nextBtn = document.getElementById('nextBtn');
        
        if (choiceBtn1) {
            choiceBtn1.textContent = buttons[0];
        }
        
        if (choiceBtn2) {
            choiceBtn2.textContent = buttons[1];
        }
        
        if (choiceButtons) choiceButtons.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'none';
    }

    getRandomSyllable(exclude) {
        const syllables = ['강', '민', '성', '준', '현', '지', '태', '영', '수', '진', '동', '혜', '미', '상', '원'];
        let syllable;
        do {
            syllable = syllables[Math.floor(Math.random() * syllables.length)];
        } while (syllable === exclude);
        return syllable;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    async showQMemoryResult() {
        if (!this.ensureApp()) return;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) return;

        this.showScreen('qResult');

        const elements = {
            scorePercentage: this.getElement('scorePercentage'),
            studyMissedBtn: this.getElement('studyMissedBtn'),
            remainingCount: this.getElement('remainingCount')
        };

        // 즉시 점수 표시
        const score = currentMode.getScore();
        if (elements.scorePercentage) {
            elements.scorePercentage.textContent = score;
        }

        // 남은 단어 수 로딩 상태 표시
        if (elements.remainingCount) {
            elements.remainingCount.textContent = '로딩중...';
        }
        if (elements.studyMissedBtn) {
            elements.studyMissedBtn.disabled = true;
            elements.studyMissedBtn.textContent = '로딩중...';
        }

        try {
            // 캐시 무효화
            if (this.app.countCache) {
                this.app.countCache.invalidate();
            }

            // 남은 단어 수 새로 계산
            let remainingCount = 0;

            if (currentMode instanceof QMemoryMode) {
                remainingCount = await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "0", status: "0" });
            } else if (currentMode instanceof ShortTermQMemoryMode) {
                remainingCount = await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "1" });
            } else if (currentMode instanceof LongTermQMemoryMode) {
                remainingCount = await this.app.dbManager.getLongTermCountBeforeDate(getTodayISOString());
            }

            // UI 업데이트
            this.batchUpdate([
                () => {
                    if (elements.remainingCount) {
                        elements.remainingCount.textContent = remainingCount;
                    }
                    if (elements.studyMissedBtn) {
                        elements.studyMissedBtn.disabled = false;
                        elements.studyMissedBtn.textContent = '다음 단어 학습하기';
                        elements.studyMissedBtn.style.display = remainingCount > 0 ? 'block' : 'none';
                        this.setupStudyMissedButton(elements.studyMissedBtn);
                    }
                }
            ]);

            // 백그라운드에서 전체 카운트 업데이트
            if (this.app.updateWordCounts) {
                this.app.updateWordCounts(true).catch(error => {
                    console.error('Error updating word counts:', error);
                });
            }

        } catch (error) {
            console.error('Error in showQMemoryResult:', error);
            if (elements.remainingCount) {
                elements.remainingCount.textContent = '오류 발생';
            }
            if (elements.studyMissedBtn) {
                elements.studyMissedBtn.disabled = false;
                elements.studyMissedBtn.textContent = '다음 단어 학습하기';
            }
        }
    }

    setupStudyMissedButton(button) {
        if (!button || !this.ensureApp()) return;
        
        button.onclick = async () => {
            button.textContent = '로딩중...';
            button.disabled = true;

            try {
                let modeKey = this.getCurrentModeKey();
                if (!modeKey) throw new Error('Invalid mode type');

                const result = await this.app.startMode(modeKey);
                if (result.success) {
                    this.showScreen('qGame');
                    this.resetQMemoryGame();
                    await this.showQMemoryCard();
                } else {
                    button.textContent = '다음 단어 학습하기';
                    button.disabled = false;
                    this.showMessage('qResult', '더 이상 학습할 단어가 없습니다.');
                    setTimeout(() => this.goToMain(), 1500);
                }
            } catch (error) {
                console.error('Error loading more words:', error);
                button.textContent = '다음 단어 학습하기';
                button.disabled = false;
                this.showMessage('qResult', '단어를 불러오는데 실패했습니다.');
            }
        };
    }

    getCurrentModeKey() {
        if (!this.ensureApp()) return null;
        
        const currentMode = this.app.currentMode;
        if (!currentMode) return null;

        if (currentMode instanceof QMemoryMode) return 'qMemory';
        if (currentMode instanceof ShortTermQMemoryMode) return 'shortTerm';
        if (currentMode instanceof LongTermQMemoryMode) return 'longTerm';
        return null;
    }

    async calculateRemainingWords(currentMode) {
        if (!this.ensureApp()) return 0;
        
        if (currentMode instanceof QMemoryMode) {
            return await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "0", status: "0" });
        } else if (currentMode instanceof ShortTermQMemoryMode) {
            return await this.app.dbManager.getWordCount({ isStudied: "1", known_2: "1" });
        } else if (currentMode instanceof LongTermQMemoryMode) {
            return await this.app.dbManager.getLongTermCountBeforeDate(getTodayISOString());
        }
        return 0;
    }
    
    async fetchAndRenderStats() {
        console.log('[fetchAndRenderStats] 통계 업데이트 시작');
        
        try {
            // window.app과 dbManager 확인
            if (!window.app || !window.app.dbManager) {
                console.error('[fetchAndRenderStats] app 또는 dbManager가 없습니다');
                return;
            }
            
            // 1. 기본 통계 가져오기
            const stats = await window.app.dbManager.getContentStats();
            console.log('[fetchAndRenderStats] 가져온 통계:', stats);
            
            // 전체 단어 개수 가져오기 추가
            const totalWords = stats.total;
            
            // 2. 모든 카테고리별 통계 가져오기
            const [
                shortTermCount,
                memorizingCount,
                qMemoryCount,
                longTermTotal,
                longTermBeforeDate,
                difficultCount
            ] = await Promise.all([
                window.app.dbManager.getWordCount({ isStudied: "1", known_2: "1" }),
                window.app.dbManager.getWordCount({ isStudied: "1", known_2: "0" }),
                window.app.dbManager.getWordCount({ isStudied: "1", known_2: "0", status: "0" }),
                window.app.dbManager.getWordCount({ isStudied: "1", known_2: "2" }),
                window.app.dbManager.getLongTermCountBeforeDate(window.KoreanTimeUtil ? 
                    window.KoreanTimeUtil.getTodayISOString() : 
                    getTodayISOString()),
                window.app.dbManager.getWordCount({ isStudied: "1", difficult: { $gt: 2 } })
            ]);
            
            console.log('[fetchAndRenderStats] 카테고리별 통계:', {
                shortTermCount,
                memorizingCount,
                qMemoryCount,
                longTermTotal,
                longTermBeforeDate,
                difficultCount
            });
            
            // 3. DOM 요소 업데이트
            const elements = {
                isStudiedWordsCount: document.getElementById('isStudiedWordsCount'),
                progressPercentage: document.getElementById('progressPercentage'),
                shortTermCount: document.getElementById('shortTermCount'),
                memorizingCount: document.getElementById('memorizingCount'),
                qMemoryCount: document.getElementById('qMemoryCount'),
                longTermCount: document.getElementById('longTermCount'),
                difficultCount: document.getElementById('difficultCount')
            };
            
            // 4. 기본 통계 업데이트
            
            if (elements.isStudiedWordsCount) {
                elements.isStudiedWordsCount.textContent = stats.studied;
                console.log(`[fetchAndRenderStats] 학습한 단어 업데이트: ${stats.studied}`);
            }
            
            if (elements.progressPercentage) {
                elements.progressPercentage.textContent = stats.percentage;
            }
            
            // 5. 카테고리별 통계 업데이트
            if (elements.shortTermCount) {
                elements.shortTermCount.textContent = shortTermCount;
            }
            
            if (elements.memorizingCount) {
                elements.memorizingCount.textContent = memorizingCount;
            }
            
            if (elements.qMemoryCount) {
                elements.qMemoryCount.textContent = qMemoryCount;
            }
            
            if (elements.longTermCount) {
                // 장기기억은 전체 개수만 표시
                elements.longTermCount.textContent = longTermTotal;
            }
            
            if (elements.difficultCount) {
                elements.difficultCount.textContent = difficultCount;
            }
            
            // 6. 프로그레스 서클 업데이트
            const progressFill = document.querySelector('.progress-circle-fill');
            if (progressFill) {
																const circumference = 2 * Math.PI * 70; // 439.8
																const percentage = stats.percentage || 0;
																const offset = circumference - (percentage / 100) * circumference;
																
																// 초기값이 잘못되어 있을 경우를 대비한 강제 설정
																progressFill.style.strokeDasharray = circumference;
																progressFill.style.strokeDashoffset = offset;
																
																console.log(`프로그레스 업데이트: ${percentage}%, offset: ${offset}`);
												}
            
            // 7. 하단 텍스트 업데이트 추가
            const footerText = document.querySelector('.footer-text');
            if (footerText) {
                footerText.textContent = `맥락과 반복 - 전체 ${totalWords}개`;
            }

            // 8. 전체 단어 개수 요소 업데이트 추가 (중복 체크)
            const totalWordsElement = document.getElementById('totalWords');
            if (totalWordsElement && !totalWordsElement.textContent) {
                totalWordsElement.textContent = totalWords;
                totalWordsElement.style.display = 'block';
            }
            
            // 9. 로딩 클래스 제거 (모든 요소가 loaded 상태가 되도록)
            Object.values(elements).forEach(element => {
                if (element && element.classList) {
                    element.classList.remove('loading');
                    element.classList.add('loaded');
                }
            });
            
            console.log('[fetchAndRenderStats] 모든 통계 업데이트 완료');
        } catch (error) {
            console.error('[fetchAndRenderStats] 오류:', error);
        }
    }

    // UIManager 클래스의 goToMain 메서드 개선
    async goToMain() {
        console.log('[DEBUG] 개선된 goToMain 시작');
        try {
            // 1. 모든 화면을 비활성화
            Object.values(this.screens).forEach(screen => {
                if (screen) {
                    screen.classList.remove('active');
                    screen.style.display = 'none';
                }
            });
            
            // 2. 메인 화면만 활성화
            const mainScreen = document.getElementById('mainScreen');
            if (!mainScreen) {
                console.error('[ERROR] 메인 화면 요소를 찾을 수 없음');
                return false;
            }
            
            mainScreen.classList.add('active');
            mainScreen.style.display = 'flex';
            
            // 3. DOM 렌더링 완료 대기
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 4. 학습 모드 변수 정리 (app이 있을 때만)
            if (this.app) {
                if (this.app.currentMode && typeof this.app.currentMode.destroy === 'function') {
                    this.app.currentMode.destroy();
                }
                this.app.currentMode = null;
                
                // 5. 캐시 무효화
                if (this.app.cache && this.app.cache.counts) {
                    this.app.cache.counts.clear();
                }
                if (this.app.countCache) {
                    this.app.countCache.invalidate();
                }
            }
            
            // 6. DOM 요소 상태 확인 및 로깅
            const isStudiedWordsElement = document.getElementById('isStudiedWordsCount');
            console.log('[goToMain] isStudiedWordsCount 요소 상태:', {
                exists: !!isStudiedWordsElement,
                innerHTML: isStudiedWordsElement?.innerHTML,
                classList: isStudiedWordsElement?.classList?.toString()
            });
            
            // 7. DOM 안정화를 위한 추가 대기
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // 8. 직접 fetchAndRenderStats 호출
            console.log('[goToMain] fetchAndRenderStats 직접 호출');
            if (this.fetchAndRenderStats) {
                await this.fetchAndRenderStats();
            } else if (typeof fetchAndRenderStats === 'function') {
                await fetchAndRenderStats();
            } else {
                // fetchAndRenderStats가 없을 경우 직접 업데이트
                console.log('[goToMain] fetchAndRenderStats 없음, 직접 업데이트 시도');
                try {
                    if (window.app && window.app.dbManager) {
                        const stats = await window.app.dbManager.getContentStats();
                        console.log('[goToMain] 직접 가져온 통계:', stats);
                        
                        const studiedElement = document.getElementById('isStudiedWordsCount');
                        if (studiedElement) {
                            studiedElement.textContent = stats.studied;
                            console.log(`[goToMain] 학습한 단어 직접 업데이트: ${stats.studied}`);
                        }
                        
                        const percentElement = document.getElementById('progressPercentage');
                        if (percentElement) {
                            percentElement.textContent = stats.percentage;
                        }
                        
                        // 전체 단어 개수 업데이트 추가
                        const totalWordsElement = document.getElementById('totalWords');
                        if (totalWordsElement) {
                            totalWordsElement.textContent = stats.total;
                            totalWordsElement.style.display = 'block';
                        }
                        
                        // 하단 텍스트 업데이트 추가
                        const footerText = document.querySelector('.footer-text');
                        if (footerText) {
                            footerText.textContent = `맥락과 반복 - 전체 ${stats.total}개`;
                        }
                    }
                } catch (error) {
                    console.error('[goToMain] 직접 업데이트 오류:', error);
                }
            }
        } catch (error) {
            console.error('[goToMain] 오류:', error);
        }
    }

    // 🔧 수정된 handleDifficultMode 메서드 (핵심 수정 부분)
				// 🔧 수정된 handleDifficultMode 메서드 - 파라미터 문제 해결
				async handleDifficultMode() {
								if (!this.ensureApp()) return;
								
								console.log('고난도 모드 버튼 클릭됨');
								
								try {
												// 로딩 메시지 표시
												this.showMessage('main', '고난도 단어를 불러오는 중...', 'info');
												
												// 디버깅: DB 매니저 확인
												console.log('DB Manager 타입:', this.app.dbManager.constructor.name);
												console.log('현재 콘텐츠:', this.app.dbManager.currentContent);
												
												// 고난도 단어 가져오기
												const filter = { 
																isStudied: "1"
												};
												const sort = { field: 'difficult', direction: 'desc' };
												const limit = 0; // 모든 단어 가져오기
												
												// 먼저 모든 학습한 단어를 가져옴
												let allStudiedWords = [];
												try {
																allStudiedWords = await this.app.dbManager.getWords(filter, limit, sort);
																console.log(`학습한 단어 ${allStudiedWords.length}개 가져옴`);
																
																// difficult > 2인 단어만 필터링 (숫자 타입으로 명시적 변환)
																const difficultWords = allStudiedWords.filter(word => {
																				const difficulty = Number(word.difficult);
																				return difficulty > 2;
																});
																
																console.log(`고난도 단어 ${difficultWords.length}개 필터링됨`);
																
																if (!difficultWords || difficultWords.length === 0) {
																				this.showMessage('main', '현재 고난도 단어가 없습니다. 학습을 진행하면서 "몰라요"로 자주 응답한 단어가 이곳에 추가됩니다.', 'info');
																				return;
																}
																
																// 최대 100개로 제한
																const limitedDifficultWords = difficultWords.slice(0, 100);
																
																// 🔧 완전히 수정된 에어테이블 API 정보 추출 로직
																console.log('=== 에어테이블 정보 추출 시작 ===');
																
																// 1. 현재 URL 전체 정보 로깅
																const currentUrl = window.location.href;
																const currentSearch = window.location.search;
																console.log('현재 전체 URL:', currentUrl);
																console.log('현재 검색 문자열:', currentSearch);
																
																// 2. 모든 가능한 소스에서 에어테이블 정보 수집
																let airtableApiKey = null;
																let airtableContentsDB = null;
																let airtableContentsTable = null;
																
																// 2.1. 현재 URL에서 직접 추출 시도
																if (currentSearch) {
																				try {
																								const currentParams = new URLSearchParams(currentSearch);
																								
																								// urlParams가 있는지 확인
																								const urlParamsValue = currentParams.get('urlParams');
																								if (urlParamsValue) {
																												console.log('현재 URL에서 urlParams 발견:', urlParamsValue.substring(0, 50) + '...');
																												const decodedParams = new URLSearchParams(decodeURIComponent(urlParamsValue));
																												
																												if (!airtableApiKey) airtableApiKey = decodedParams.get('airtable_apikey');
																												if (!airtableContentsDB) airtableContentsDB = decodedParams.get('airtable_contents_DB');
																												if (!airtableContentsTable) airtableContentsTable = decodedParams.get('airtable_contents_table');
																								}
																								
																								// 직접 파라미터도 확인
																								if (!airtableApiKey) airtableApiKey = currentParams.get('airtable_apikey');
																								if (!airtableContentsDB) airtableContentsDB = currentParams.get('airtable_contents_DB');
																								if (!airtableContentsTable) airtableContentsTable = currentParams.get('airtable_contents_table');
																				} catch (e) {
																								console.error('현재 URL 파라미터 추출 오류:', e);
																				}
																}
																
																// 2.2. app.airtableManager에서 추출
																if (this.app.airtableManager) {
																				console.log('airtableManager 확인');
																				if (!airtableApiKey && this.app.airtableManager.apiKey) {
																								airtableApiKey = this.app.airtableManager.apiKey;
																								console.log('airtableManager에서 API 키 획득');
																				}
																				if (!airtableContentsDB && this.app.airtableManager.contentsBaseUrl) {
																								airtableContentsDB = this.app.airtableManager.contentsBaseUrl;
																								console.log('airtableManager에서 콘텐츠 DB 획득');
																				}
																				if (!airtableContentsTable && this.app.airtableManager.wordTable) {
																								airtableContentsTable = this.app.airtableManager.wordTable;
																								console.log('airtableManager에서 테이블명 획득');
																				}
																}
																
																// 2.3. app.airtableAdapter에서 추출
																if (this.app.airtableAdapter) {
																				console.log('airtableAdapter 확인');
																				if (!airtableApiKey && this.app.airtableAdapter.apiKey) {
																								airtableApiKey = this.app.airtableAdapter.apiKey;
																								console.log('airtableAdapter에서 API 키 획득');
																				}
																				if (!airtableContentsDB && this.app.airtableAdapter.contentsBaseUrl) {
																								airtableContentsDB = this.app.airtableAdapter.contentsBaseUrl;
																								console.log('airtableAdapter에서 콘텐츠 DB 획득');
																				}
																				if (!airtableContentsTable && this.app.airtableAdapter.wordTable) {
																								airtableContentsTable = this.app.airtableAdapter.wordTable;
																								console.log('airtableAdapter에서 테이블명 획득');
																				}
																}
																
																// 2.4. 전역 parseUrlParams() 함수 사용
																if (typeof window.parseUrlParams === 'function') {
																				try {
																								console.log('전역 parseUrlParams 함수 사용');
																								const globalParams = window.parseUrlParams();
																								if (!airtableApiKey) airtableApiKey = globalParams.get('airtable_apikey');
																								if (!airtableContentsDB) airtableContentsDB = globalParams.get('airtable_contents_DB');
																								if (!airtableContentsTable) airtableContentsTable = globalParams.get('airtable_contents_table');
																				} catch (e) {
																								console.error('전역 parseUrlParams 오류:', e);
																				}
																}
																
																// 3. 최종 수집된 정보 로깅
																console.log('=== 최종 수집된 에어테이블 정보 ===');
																console.log('API 키:', airtableApiKey ? `${airtableApiKey.substring(0, 15)}...` : 'NULL');
																console.log('콘텐츠 DB:', airtableContentsDB ? `${airtableContentsDB.substring(0, 40)}...` : 'NULL');
																console.log('콘텐츠 테이블:', airtableContentsTable || 'NULL');
																
																// 4. null 값 처리 및 유효성 검증
																const cleanNullValue = (value) => {
																				if (!value || value === 'null' || value === 'undefined' || value === 'placeholder') {
																								return null;
																				}
																				return value;
																};
																
																airtableApiKey = cleanNullValue(airtableApiKey);
																airtableContentsDB = cleanNullValue(airtableContentsDB);
																airtableContentsTable = cleanNullValue(airtableContentsTable);
																
																// 5. 유효성 최종 검증
																const hasValidAirtableInfo = airtableApiKey && airtableApiKey.length > 10 &&
																																												airtableContentsDB && airtableContentsDB.startsWith('https://') &&
																																												airtableContentsTable && airtableContentsTable.length > 0;
																
																console.log('에어테이블 정보 유효성:', hasValidAirtableInfo);
																
																// 6. URL 파라미터 구성
																const params = new URLSearchParams();
																
																// 현재 파라미터 복사 (phoneParam 등)
																if (currentSearch) {
																				try {
																								const existingParams = new URLSearchParams(currentSearch);
																								const existingUrlParams = existingParams.get('urlParams');
																								
																								if (existingUrlParams) {
																												// 기존 urlParams의 내용을 파싱하여 복사
																												const decodedExisting = new URLSearchParams(decodeURIComponent(existingUrlParams));
																												for (const [key, value] of decodedExisting) {
																																params.set(key, value);
																												}
																								} else {
																												// 직접 파라미터들을 복사
																												for (const [key, value] of existingParams) {
																																if (key !== 'urlParams') {
																																				params.set(key, value);
																																}
																												}
																								}
																				} catch (e) {
																								console.error('기존 파라미터 복사 오류:', e);
																				}
																}
																
																// 7. 에어테이블 정보 추가 (유효한 값만)
																if (airtableApiKey) {
																				params.set('airtable_apikey', airtableApiKey);
																				console.log('API 키 파라미터에 추가됨');
																}
																if (airtableContentsDB) {
																				params.set('airtable_contents_DB', airtableContentsDB);
																				console.log('콘텐츠 DB 파라미터에 추가됨');
																}
																if (airtableContentsTable) {
																				params.set('airtable_contents_table', airtableContentsTable);
																				console.log('콘텐츠 테이블 파라미터에 추가됨');
																}
																
																// 8. 최종 URL 생성
																const finalParamString = params.toString();
																const difficultUrl = `difficult.html?urlParams=${encodeURIComponent(finalParamString)}`;
																
																console.log('=== 최종 URL 정보 ===');
																console.log('파라미터 문자열:', finalParamString);
																console.log('최종 URL (처음 120자):', difficultUrl.substring(0, 120) + '...');
																
																// 9. 로컬 스토리지에 데이터 백업
																try {
																				localStorage.setItem('difficult_words_cache', JSON.stringify(limitedDifficultWords));
																				localStorage.setItem('difficult_words_timestamp', Date.now().toString());
																				console.log('고난도 단어를 로컬 스토리지에 저장 완료');
																} catch (e) {
																				console.warn('로컬 스토리지 백업 실패:', e);
																}
																
																// 10. 전역 변수에도 저장
																window.difficultWords = limitedDifficultWords;
																
																// 11. 새 창 열기
																const difficultWindow = window.open(
																				difficultUrl, 
																				'고난도단어', 
																				'width=450,height=700,resizable=yes,scrollbars=yes'
																);
																
																// 12. 창 열기 성공 여부 확인
																if (!difficultWindow || difficultWindow.closed || typeof difficultWindow.closed === 'undefined') {
																				this.showMessage('main', '팝업 창이 차단되었습니다. 팝업 차단을 해제해 주세요.', 'warning');
																				console.error('고난도 모드 팝업 창이 차단되었습니다.');
																				return;
																}
																
																// 13. 창이 성공적으로 열린 경우 포커스 설정
																difficultWindow.focus();
																
																// 14. 새 창에 데이터 전달
																difficultWindow.onload = () => {
																				console.log('고난도 창 로드됨, 데이터 전달 시작');
																				
																				try {
																								// 앱 객체 공유 시도
																								if (this.app && this.app.dbManager) {
																												if (!difficultWindow.app) difficultWindow.app = {};
																												difficultWindow.app.dbManager = this.app.dbManager;
																												console.log('dbManager 공유 성공');
																								}
																								
																								// 고난도 단어 데이터 직접 전달
																								difficultWindow.difficultWords = limitedDifficultWords;
																								
																								// 데이터 로드 트리거 이벤트 발생
																								const event = new Event('difficultDataReady');
																								difficultWindow.document.dispatchEvent(event);
																								console.log('difficultDataReady 이벤트 발생');
																								
																								// 성공 메시지 표시
																								const messageType = hasValidAirtableInfo ? 'success' : 'info';
																								const messageText = hasValidAirtableInfo ? 
																												`${limitedDifficultWords.length}개의 고난도 단어를 새 창에서 표시합니다. 추가 정보 로드가 가능합니다.` :
																												`${limitedDifficultWords.length}개의 고난도 단어를 새 창에서 표시합니다. (에어테이블 정보 부족으로 추가 정보 로드 제한)`;
																								
																								this.showMessage('main', messageText, messageType);
																				} catch(e) {
																								console.error('데이터 전달 오류:', e);
																								this.showMessage('main', '고난도 창이 열렸습니다. 데이터는 자동으로 로드됩니다.', 'info');
																				}
																};
																
												} catch(error) {
																console.error('고난도 단어 가져오기 실패:', error);
																this.showMessage('main', '데이터 로드 중 오류가 발생했습니다', 'error');
																return;
												}
								} catch (error) {
												console.error('고난도 모드 처리 오류:', error);
												this.showMessage('main', '고난도 모드 처리 중 오류가 발생했습니다.', 'error');
								}
				}
    // 고난도 단어 렌더링 함수
    renderDifficultWords(words, container) {
        // 컨테이너 초기화
        container.innerHTML = '';
        
        // 헤더 추가
        const headerElement = document.createElement('div');
        headerElement.innerHTML = `
            <div style="text-align: center; padding: 10px 0 20px 0;">
                <p style="font-size: 1.2rem; color: #4F46E5; font-weight: 600;">총 ${words.length}개의 고난도 단어</p>
            </div>
        `;
        container.appendChild(headerElement);
        
        // 각 단어에 대한 HTML 생성
        words.forEach(word => {
            const wordElement = document.createElement('div');
            wordElement.className = 'difficult-entry';
            
            // 난이도에 따른 별표 표시
            let difficultLevel = Number(word.difficult);
            const difficultyStars = difficultLevel >= 6 ? "⭐⭐⭐" : (difficultLevel >= 4 ? "⭐⭐" : "⭐");
            
            // 기본 단어 정보
            let wordHTML = `
                <h2>${word.word} <span style="color: #EF4444; font-size: 0.8em;">${difficultyStars}</span></h2>
                <p style="margin-bottom: 8px;">${word.meaning || ''}</p>
            `;
            
            // 발음이 있으면 추가
            if (word.pronunciation) {
                wordHTML += `<p style="margin-bottom: 8px; font-size: 0.9em;"><strong>발음:</strong> ${word.pronunciation}</p>`;
            }
            
            // VipUp이 있으면 추가
            if (word.vipup) {
                wordHTML += `
                    <div style="background-color: #EEF2FF; padding: 8px; border-radius: 8px; margin-bottom: 12px;">
                        ${word.vipup}
                    </div>
                `;
            }
            
            wordElement.innerHTML = wordHTML;
            
            // 컨테이너에 추가
            container.appendChild(wordElement);
        });
    }

    // loadMoreWords 메서드 추가
    async loadMoreWords() {
        if (!this.ensureApp()) return;
        
        const loadMoreBtn = this.getElement('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = '로딩중...';
        }

        try {
            // 현재 모드 확인
            const currentModeName = this.app.currentMode?.constructor.name;
            let modeKey = 'new'; // 기본값

            if (currentModeName === 'MemorizingMode') {
                modeKey = 'memorizing';
            } else if (currentModeName === 'NewWordsMode') {
                modeKey = 'new';
            }

            const result = await this.app.startMode(modeKey);
            if (result.success) {
                this.showScreen('study');
            } else {
                this.showMessage('completion', '더 이상 학습할 단어가 없습니다.');
                setTimeout(() => this.goToMain(), 2000);
            }
        } catch (error) {
            console.error('Error loading more words:', error);
            this.showMessage('completion', '단어를 불러오는데 실패했습니다.');
        } finally {
            if (loadMoreBtn) {
                loadMoreBtn.disabled = false;
                loadMoreBtn.textContent = '더 학습하기';
            }
        }
    }
}

// 전역 스코프에 UIManager 등록
window.UIManager = UIManager;

// 디버깅용 전역 함수들
window.debugUIManager = function() {
    console.log('=== UIManager 디버그 정보 ===');
    console.log('UIManager 클래스 존재:', typeof UIManager);
    console.log('window.UIManager 존재:', typeof window.UIManager);
    console.log('uiManager 인스턴스 존재:', typeof window.uiManager);
    if (window.uiManager) {
        console.log('- 초기화 상태:', window.uiManager.isInitialized);
        console.log('- app 연결 상태:', !!window.uiManager.app);
        console.log('- 활성 화면:', Object.entries(window.uiManager.screens).find(([k,v]) => v?.classList?.contains('active'))?.[0] || 'none');
    }
    console.log('=======================');
};

console.log('UIManager.js 로드 완료');