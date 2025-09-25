/**
 * =============================================================================
 * 완성된 콘텐츠 기반 학습 앱 시스템 (수정 버전)
 * =============================================================================
 * 
 * 오류 수정:
 * 1. ContentBasedDBManager Promise 대기 추가
 * 2. URL 파라미터 파싱 개선
 * 3. 타이밍 이슈 완전 해결
 * 
 * 버전: 2.0.3
 * =============================================================================
 */

// 중복 로드 방지 및 의존성 체크
if (window.ContentBasedSystemLoaded) {
    console.log('ContentBasedSystem이 이미 로드되었습니다. 중복 로드를 방지합니다.');
    // 즉시 종료 - IIFE 내부가 아니므로 그냥 스크립트 실행을 멈춤
} else if (!window.IndexedDBManager) {
    console.warn('ContentBasedSystem: IndexedDBManager가 아직 로드되지 않았습니다. 대기 중...');
    // enhanced-loader가 나중에 로드할 것이므로 여기서는 종료
} else {
    // 모든 조건이 충족되면 실행
    window.ContentBasedSystemLoaded = true;

    // =============================================================================
    // 1. IndexedDBManager 존재 확인 및 대기
    // =============================================================================

    /**
     * IndexedDBManager 로드 대기 함수
     */
    function waitForIndexedDBManager() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100;
            
            const checkManager = () => {
                attempts++;
                
                if (typeof window.IndexedDBManager === 'function') {
                    console.log(`IndexedDBManager 발견됨 (${attempts}번째 시도)`);
                    resolve(window.IndexedDBManager);
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    console.error(`IndexedDBManager를 찾을 수 없습니다 (${maxAttempts}번 시도)`);
                    reject(new Error('IndexedDBManager not found'));
                    return;
                }
                
                setTimeout(checkManager, 50);
            };
            
            checkManager();
        });
    }

    // =============================================================================
    // 2. URL 파라미터 안전 파싱 함수
    // =============================================================================

    /**
     * 안전한 URL 파라미터 파싱
     */
    function safeParseUrlParams() {
        try {
            const search = window.location.search;
            
            if (!search) {
                return { contents: null };
            }
            
            // HTML 태그만 제거하고 URL 구조는 유지
            let cleanSearch = search.replace(/[<>]/g, '');
            
            let decodedSearch;
            try {
                decodedSearch = decodeURIComponent(cleanSearch);
            } catch (decodeError) {
                console.warn('URL 디코딩 실패, 원본 사용:', decodeError);
                decodedSearch = cleanSearch;
            }
            
            console.log('정리된 검색 문자열:', decodedSearch);
            
            // urlParams= 패턴 찾기
            const urlParamsMatch = decodedSearch.match(/urlParams=(.+)$/);
            
            if (!urlParamsMatch || !urlParamsMatch[1]) {
                console.log('urlParams 패턴을 찾을 수 없음');
                return { contents: null };
            }
            
            // URL 구조 복원
            let params = urlParamsMatch[1];
            params = params.replace(/https/g, 'https:')
                          .replace(/http(?!s)/g, 'http:')
                          .replace(/:\/([^\/])/g, '://$1');
            
            // URLSearchParams로 안전하게 파싱
            let parsedParams;
            try {
                parsedParams = new URLSearchParams(params);
            } catch (parseError) {
                console.error('URLSearchParams 파싱 오류:', parseError);
                return { contents: null };
            }
            
            const contents = parsedParams.get('contents');
            console.log('파싱된 contents 값:', contents);
            
            return {
                contents: contents,
                type: parsedParams.get('type'),
                phoneParam: parsedParams.get('phoneParam'),
                params: parsedParams
            };
        } catch (error) {
            console.error('URL 파라미터 파싱 오류:', error);
            return { contents: null };
        }
    }

    // =============================================================================
    // 3. 콘텐츠 기반 DB 매니저 (비동기 초기화)
    // =============================================================================

    /**
     * ContentBasedDBManager 비동기 팩토리
     */
    async function createContentBasedDBManager() {
        // IndexedDBManager 로드 대기
        const IndexedDBManagerClass = await waitForIndexedDBManager();
        
        /**
         * 콘텐츠별 완전 분리된 데이터베이스를 관리하는 매니저
         */
        class ContentBasedDBManager extends IndexedDBManagerClass {
            constructor() {
                super();
                
                // 현재 콘텐츠 ID 초기화
                this.initializeContentId();
                
                // 콘텐츠별 DB 매핑 테이블
                this.contentDatabases = new Map();
                
                // 현재 활성 콘텐츠
                this.activeContent = this.currentContent;
                
                console.log(`ContentBasedDBManager 초기화: 콘텐츠 "${this.currentContent}"`);
            }
            
            /**
             * 콘텐츠 ID 초기화 - 타입봇 변수 우선 처리
             */
            initializeContentId() {
                try {
                    // 1. URL 파라미터에서 contents 추출 (타입봇에서 전달)
                    const urlParams = safeParseUrlParams();
                    console.log('URL에서 파싱된 파라미터:', urlParams);
                    
                    if (urlParams.contents) {
                        this.currentContent = urlParams.contents;
                        console.log(`타입봇에서 전달받은 콘텐츠: "${this.currentContent}"`);
                    } else {
                        // 2. 로컬 스토리지에서 마지막 콘텐츠 확인
                        this.currentContent = localStorage.getItem('current_content') || 'default';
                        console.log(`기본 콘텐츠 사용: "${this.currentContent}"`);
                    }
                    
                    // 3. 콘텐츠 ID를 안전한 DB 이름으로 변환
                    this.sanitizedContent = this.sanitizeContentId(this.currentContent);
                    
                    // 4. 콘텐츠별 DB 이름 설정
                    this.DB_NAME = `WordsDB_${this.sanitizedContent}`;
                    
                    // 5. 로컬 스토리지에 현재 콘텐츠 저장
                    try {
                        localStorage.setItem('current_content', this.currentContent);
                        localStorage.setItem('current_db_name', this.DB_NAME);
                    } catch (e) {
                        console.warn('로컬 스토리지 저장 실패:', e);
                    }
                    
                    console.log(`DB 이름 설정: "${this.DB_NAME}"`);
                } catch (error) {
                    console.error('콘텐츠 ID 초기화 오류:', error);
                    this.currentContent = 'default';
                    this.sanitizedContent = 'default';
                    this.DB_NAME = 'WordsDB_default';
                }
            }
            
            /**
             * 콘텐츠 ID를 DB 이름으로 안전하게 변환
             */
            sanitizeContentId(contentId) {
                if (!contentId) return 'default';
                
                // 알파벳, 숫자, 한글, 언더스코어, 하이픈만 허용
                // 특수문자는 언더스코어로 대체
                let sanitized = contentId
                    .replace(/[^\w가-힣-]/g, '_')  // 특수문자를 언더스코어로
                    .replace(/_{2,}/g, '_')        // 연속 언더스코어 정리
                    .replace(/^_|_$/g, '')         // 앞뒤 언더스코어 제거
                    .substring(0, 30);             // 길이 제한
                
                return sanitized || 'default';
            }
            
            /**
             * 콘텐츠 전환 - 완전히 다른 DB로 전환
             */
            async switchContent(newContentId) {
                if (!newContentId || newContentId === this.currentContent) {
                    console.log('콘텐츠 전환 불필요:', newContentId);
                    return true;
                }
                
                try {
                    console.log(`콘텐츠 전환 시작: "${this.currentContent}" → "${newContentId}"`);
                    
                    // 1. 현재 DB 연결 닫기
                    if (this.db && this.db.readyState !== 'closed') {
                        this.db.close();
                        console.log('이전 DB 연결 닫기 완료');
                    }
                    
                    // 2. 새 콘텐츠 정보 설정
                    this.currentContent = newContentId;
                    this.sanitizedContent = this.sanitizeContentId(newContentId);
                    this.DB_NAME = `WordsDB_${this.sanitizedContent}`;
                    this.activeContent = newContentId;
                    
                    // 3. 로컬 스토리지 업데이트
                    try {
                        localStorage.setItem('current_content', this.currentContent);
                        localStorage.setItem('current_db_name', this.DB_NAME);
                    } catch (e) {
                        console.warn('로컬 스토리지 업데이트 실패:', e);
                    }
                    
                    // 4. 새 DB 초기화
                    await this.initDatabase();
                    
                    console.log(`콘텐츠 전환 완료: DB "${this.DB_NAME}" 연결됨`);
                    return true;
                } catch (error) {
                    console.error('콘텐츠 전환 오류:', error);
                    return false;
                }
            }
            
            /**
             * 현재 콘텐츠 ID 반환
             */
            getCurrentContentId() {
                return this.currentContent;
            }
            
            /**
             * 콘텐츠별 통계 조회
             */
            async getContentStats(contentId = null) {
                const targetContent = contentId || this.currentContent;
                
                try {
                    // 임시로 다른 콘텐츠의 통계를 조회하는 경우
                    if (contentId && contentId !== this.currentContent) {
                        const tempDbName = `WordsDB_${this.sanitizeContentId(contentId)}`;
                        // 여기서는 간단히 0을 반환 (필요시 임시 DB 연결 구현)
                        return {
                            total: 0,
                            studied: 0,
                            remaining: 0
                        };
                    }
                    
                    // 현재 콘텐츠 통계
                    const totalWords = await this.getWordCount({});
                    const studiedWords = await this.getWordCount({ isStudied: "1" });
                    
                    return {
                        content: targetContent,
                        total: totalWords,
                        studied: studiedWords,
                        remaining: totalWords - studiedWords,
                        percentage: totalWords > 0 ? Math.round((studiedWords / totalWords) * 100) : 0
                    };
                } catch (error) {
                    console.error('콘텐츠 통계 조회 오류:', error);
                    return {
                        content: targetContent,
                        total: 0,
                        studied: 0,
                        remaining: 0,
                        percentage: 0
                    };
                }
            }
        }
        
        return ContentBasedDBManager;
    }

    // =============================================================================
    // 4. 완성된 콘텐츠 인식 데이터 로더 팩토리
    // =============================================================================

    /**
     * CompletedContentAwareDataLoader 비동기 팩토리
     */
    async function createCompletedContentAwareDataLoader() {
        // 필요한 클래스들이 로드될 때까지 대기
        const waitForClass = (className, maxWait = 10000) => {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = maxWait / 50;
                
                const check = () => {
                    attempts++;
                    if (window[className]) {
                        resolve(window[className]);
                        return;
                    }
                    
                    if (attempts >= maxAttempts) {
                        reject(new Error(`${className} not found after ${maxWait}ms`));
                        return;
                    }
                    
                    setTimeout(check, 50);
                };
                
                check();
            });
        };
        
        // DirectDataLoader 대기
        const DirectDataLoaderClass = await waitForClass('DirectDataLoader');
        
        /**
         * 콘텐츠 인식 데이터 로더 - 에어테이블 연동 완성
         */
        class CompletedContentAwareDataLoader extends DirectDataLoaderClass {
            constructor(dbManager, airtableManager, networkManager) {
                super(dbManager);

                // 추가 매니저들 저장
                this.airtableManager = airtableManager;
                this.networkManager = networkManager;
                
                // 초기화 완료 플래그
                this.fullyInitialized = false;
                
                // 진행 상황 콜백
                this.onProgress = null;
                
                console.log('CompletedContentAwareDataLoader 초기화');
            }
            
            /**
             * 완전한 앱 초기화 프로세스
             */
            async initializeWithContent(contentId) {
                console.log(`=== 콘텐츠 "${contentId}" 완전 초기화 시작 ===`);
                
                try {
                    // 1. DB 매니저의 콘텐츠 설정 확인
                    if (this.dbManager.currentContent !== contentId) {
                        console.log(`DB 매니저 콘텐츠 전환: ${this.dbManager.currentContent} → ${contentId}`);
                        await this.dbManager.switchContent(contentId);
                    }
                    
                    // 2. 현재 콘텐츠 설정
                    this.contentId = contentId;
                    
                    // 3. 기존 데이터 확인
                    const existingWordCount = await this.dbManager.getWordCount({});
                    console.log(`기존 데이터: ${existingWordCount}개 단어`);
                    
                    // 4. 데이터가 없거나 업데이트가 필요한 경우 로드
                    if (existingWordCount === 0) {
                        console.log('새 콘텐츠 데이터 로드 필요');
                        
                        // 부모 클래스의 loadAllWords 메서드 사용
                        let loadSuccess = false;
                        if (typeof this.loadAllWords === 'function') {
                            console.log('부모 클래스의 loadAllWords 메서드 사용');
                            loadSuccess = await this.loadAllWords(contentId);
                        } else if (typeof super.loadAllWords === 'function') {
                            console.log('super.loadAllWords 메서드 사용');
                            loadSuccess = await super.loadAllWords(contentId);
                        } else {
                            console.log('직접 데이터 로드 시도');
                            loadSuccess = await this.loadWordsDirectly(contentId);
                        }
                        
                        if (!loadSuccess) {
                            console.warn(`콘텐츠 "${contentId}" 데이터 로드 실패`);
                            return false;
                        }
                    } else {
                        console.log(`콘텐츠 "${contentId}" 기존 데이터 사용`);
                    }
                    
                    // 5. 초기화 완료
                    this.fullyInitialized = true;
                    
                    console.log(`=== 콘텐츠 "${contentId}" 완전 초기화 완료 ===`);
                    return true;
                    
                } catch (error) {
                    console.error(`콘텐츠 "${contentId}" 초기화 오류:`, error);
                    return false;
                }
            }
            
            /**
             * 직접 데이터 로드 메서드 (폴백)
             */
            async loadWordsDirectly(contentId) {
                try {
                    console.log(`직접 데이터 로드 시작: ${contentId}`);
                    
                    // 네트워크 상태 확인
                    if (!this.networkManager || (this.networkManager.isOffline && this.networkManager.isOffline())) {
                        console.log('오프라인 상태: 데이터 로드 건너뜀');
                        return false;
                    }
                    
                    // Airtable 매니저 확인 및 설정 보완
                    if (!this.airtableManager) {
                        console.error('AirtableManager가 없습니다');
                        return false;
                    }
                    
                    // URL 파라미터에서 설정 추출
                    const urlParams = safeParseUrlParams();
                    const apiKey = this.airtableManager.apiKey || (urlParams.params ? urlParams.params.get('airtable_apikey') : null);
                    const contentsBaseUrl = this.airtableManager.contentsBaseUrl || (urlParams.params ? urlParams.params.get('airtable_contents_DB') : null);
                    const wordTable = this.airtableManager.wordTable || (urlParams.params ? urlParams.params.get('airtable_contents_table') : null);
                    
                    if (!apiKey || !contentsBaseUrl || !wordTable) {
                        console.error('Airtable 필수 설정이 누락되었습니다:', {
                            apiKey: !!apiKey,
                            contentsBaseUrl: !!contentsBaseUrl,
                            wordTable: !!wordTable
                        });
                        return false;
                    }
                    
                    console.log('Airtable 설정 확인됨:', {
                        baseUrl: contentsBaseUrl,
                        table: wordTable,
                        hasApiKey: !!apiKey
                    });
                    
                    // 진행 상황 알림
                    if (this.onProgress) {
                        this.onProgress({
                            stage: 'start',
                            message: '에어테이블에서 데이터 다운로드 시작...',
                            progress: 0
                        });
                    }
                    
                    // 기본 API URL 구성
                    const baseUrl = `${contentsBaseUrl}/${wordTable}`;
                    const headers = {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    };
                    
                    // 모든 단어 로드 (페이지네이션)
                    let allWords = [];
                    let offset = null;
                    let pageCount = 0;
                    
                    do {
                        pageCount++;
                        console.log(`페이지 ${pageCount} 로드 중...`);
                        
                        // API URL 구성 (offset 포함)
                        const params = new URLSearchParams({
                            pageSize: '100',
                            'sort[0][field]': 'No',
                            'sort[0][direction]': 'asc'
                        });
                        
                        if (offset) {
                            params.append('offset', offset);
                        }
                        
                        const url = `${baseUrl}?${params.toString()}`;
                        
                        // 진행 상황 업데이트
                        if (this.onProgress) {
                            this.onProgress({
                                stage: 'loading',
                                message: `페이지 ${pageCount} 다운로드 중...`,
                                progress: Math.min(pageCount * 10, 90)
                            });
                        }
                        
                        // API 호출
                        let response;
                        try {
                            if (this.networkManager && typeof this.networkManager.get === 'function') {
                                response = await this.networkManager.get(url, headers, true);
                            } else {
                                console.log('NetworkManager가 없으므로 fetch 사용');
                                const fetchResponse = await fetch(url, { method: 'GET', headers });
                                
                                if (!fetchResponse.ok) {
                                    throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
                                }
                                
                                response = await fetchResponse.json();
                            }
                        } catch (apiError) {
                            console.error(`페이지 ${pageCount} API 호출 오류:`, apiError);
                            
                            // 인증 오류인 경우 중단
                            if (apiError.message.includes('401') || apiError.message.includes('403')) {
                                console.error('API 인증 오류: 데이터 로드 중단');
                                break;
                            }
                            
                            // 기타 오류는 재시도
                            continue;
                        }
                        
                        // 응답 검증
                        if (!response || !response.records || !Array.isArray(response.records)) {
                            console.warn(`페이지 ${pageCount}: 유효하지 않은 응답`, response);
                            break;
                        }
                        
                        // 단어 변환 및 추가
                        const transformedWords = this.transformAirtableRecords(response.records, contentId);
                        allWords = allWords.concat(transformedWords);
                        
                        console.log(`페이지 ${pageCount}: ${transformedWords.length}개 단어 로드 (총 ${allWords.length}개)`);
                        
                        // 다음 페이지 확인
                        offset = response.offset;
                        
                        // API 제한 방지 딜레이
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                    } while (offset && pageCount < 50); // 최대 50페이지 제한
                    
                    // 진행 상황 업데이트
                    if (this.onProgress) {
                        this.onProgress({
                            stage: 'saving',
                            message: `${allWords.length}개 단어를 데이터베이스에 저장 중...`,
                            progress: 95
                        });
                    }
                    
                    // 데이터베이스에 저장
                    if (allWords.length > 0) {
                        await this.dbManager.saveWords(allWords);
                        console.log(`${allWords.length}개 단어 저장 완료`);
                        
                        // 로드 완료 상태 저장
                        if (typeof this.dbManager.saveSetting === 'function') {
                            await this.dbManager.saveSetting('dataLoaded', true);
                            await this.dbManager.saveSetting('lastLoadTime', Date.now());
                            await this.dbManager.saveSetting('loadedContent', contentId);
                        }
                    }
                    
                    // 완료
                    if (this.onProgress) {
                        this.onProgress({
                            stage: 'complete',
                            message: `${allWords.length}개 단어 로드 완료!`,
                            progress: 100
                        });
                    }
                    
                    console.log(`직접 데이터 로드 완료: ${allWords.length}개 단어`);
                    return allWords.length > 0;
                    
                } catch (error) {
                    console.error('직접 데이터 로드 오류:', error);
                    
                    if (this.onProgress) {
                        this.onProgress({
                            stage: 'error',
                            message: `데이터 로드 오류: ${error.message}`,
                            progress: 0
                        });
                    }
                    
                    return false;
                }
            }
            
            /**
             * Airtable 레코드를 앱 데이터 형식으로 변환
             */
            transformAirtableRecords(records, contentId) {
                const getKoreanTime = () => {
                    if (window.KoreanTimeUtil && typeof window.KoreanTimeUtil.getKoreanTimeISOString === 'function') {
                        return window.KoreanTimeUtil.getKoreanTimeISOString();
                    }
                    return new Date().toISOString();
                };
                
                return records.map((record, index) => {
                    try {
                        const fields = record.fields || {};
                        
                        return {
                            _id: record.id,
                            id: record.id,
                            word: String(fields.word || '').trim(),
                            meaning: String(fields.meaning || '').trim(),
                            pronunciation: String(fields.pronunciation || '').trim(),
                            airtableId: record.id,
                            No: parseInt(fields.No) || index + 1,
                            known_2: "0",
                            status: "0",
                            difficult: 0,
                            phone: "01000000000", // 기본값
                            updatedAt: getKoreanTime(),
                            studiedDate: getKoreanTime(),
                            isStudied: "0",
                            content: contentId,
                            hasVipup: !!(fields.vipup),
                            vipup: fields.vipup || ''
                        };
                    } catch (recordError) {
                        console.error('레코드 처리 오류:', recordError, record);
                        return {
                            _id: record.id || `error-${index}`,
                            id: record.id || `error-${index}`,
                            word: `오류단어-${index}`,
                            meaning: '단어 처리 중 오류 발생',
                            No: index + 1,
                            known_2: "0",
                            status: "0",
                            difficult: 0,
                            isStudied: "0",
                            content: contentId,
                            hasVipup: false,
                            vipup: ''
                        };
                    }
                });
            }
            
            /**
             * 진행 상황 콜백 설정
             */
            setProgressCallback(callback) {
                this.onProgress = callback;
            }
        }
        
        return CompletedContentAwareDataLoader;
    }

    // =============================================================================
    // 5. 통합 앱 초기화 매니저
    // =============================================================================

    /**
     * 콘텐츠 기반 앱 완전 초기화 매니저
     */
    class ContentAppInitializer {
        constructor() {
            this.initialized = false;
            this.currentContent = null;
            this.dbManager = null;
            this.dataLoader = null;
            
            // 초기화 진행 상황
            this.initProgress = {
                stage: 'start',
                progress: 0,
                message: '초기화 준비 중...'
            };
            
            console.log('ContentAppInitializer 생성');
        }
        
        /**
         * 완전한 앱 초기화 프로세스
         */
        async initializeApp() {
            console.log('=== 콘텐츠 기반 앱 완전 초기화 시작 ===');
            
            try {
                // 1. URL에서 콘텐츠 파라미터 추출
                this.updateProgress(10, 'URL 파라미터 분석 중...');
                const contentInfo = safeParseUrlParams();
                this.currentContent = contentInfo.contents || 'default';
                
                console.log(`감지된 콘텐츠: "${this.currentContent}"`);
                
                // 2. 콘텐츠 기반 DB 매니저 초기화
																this.updateProgress(20, '데이터베이스 초기화 중...');

																// enhanced-loader.js에서 이미 초기화된 DB 매니저 사용
																if (window.app && window.app.dbManager) {
																				console.log('기존 DB 매니저 재사용');
																				this.dbManager = window.app.dbManager;
																} else {
																				// DB 매니저가 없는 경우에만 새로 생성
																				console.log('새 DB 매니저 생성 필요');
																				
																				// ContentBasedDBManager 클래스 확인
																				let ContentBasedDBManagerClass;
																				if (window.ContentBasedDBManager && typeof window.ContentBasedDBManager === 'function') {
																								ContentBasedDBManagerClass = window.ContentBasedDBManager;
																				} else if (window.ContentBasedDBManagerPromise) {
																								ContentBasedDBManagerClass = await window.ContentBasedDBManagerPromise;
																				} else {
																								throw new Error('ContentBasedDBManager를 찾을 수 없습니다');
																				}
																				
																				// 싱글톤 인스턴스 사용
																				if (ContentBasedDBManagerClass.getInstance) {
																								this.dbManager = ContentBasedDBManagerClass.getInstance();
																				} else {
																								this.dbManager = new ContentBasedDBManagerClass();
																				}
																				
																				// DB가 아직 초기화되지 않은 경우에만 초기화
																				if (!this.dbManager.db || this.dbManager.db.readyState === 'closed') {
																								await this.dbManager.initDatabase();
																				}
																}

																console.log(`DB 연결 확인: ${this.dbManager.DB_NAME}`);
                
                // 3. 네트워크 매니저 초기화
																this.updateProgress(30, '네트워크 연결 확인 중...');
																let networkManager = window.app?.networkManager;

																if (!networkManager && window.NetworkManager) {
																				// 전역 싱글톤 확인
																				if (!window._networkManagerInstance) {
																								window._networkManagerInstance = new window.NetworkManager();
																								console.log('NetworkManager 싱글톤 생성');
																				}
																				networkManager = window._networkManagerInstance;
																}
                
                // 4. Airtable 매니저 초기화
                this.updateProgress(40, 'Airtable 연결 설정 중...');
                let airtableManager = window.app?.airtableManager;
                
                if (!airtableManager && window.AirtableManager) {
                    try {
                        // 싱글톤 사용
																								if (window.AirtableManager.getInstance) {
																										airtableManager = window.AirtableManager.getInstance();
																								} else {
																										airtableManager = new window.AirtableManager();
																								}
																								console.log('AirtableManager 인스턴스 가져오기 완료');
                    } catch (airtableError) {
                        console.error('AirtableManager 생성 오류:', airtableError);
                        airtableManager = null;
                    }
                }
                
                // AirtableManager가 없으면 수동으로 생성
                if (!airtableManager) {
                    console.log('수동 AirtableManager 생성 시도...');
                    
                    if (contentInfo.params && contentInfo.params.get('airtable_apikey') && contentInfo.params.get('airtable_contents_DB')) {
                        airtableManager = {
                            apiKey: contentInfo.params.get('airtable_apikey'),
                            contentsBaseUrl: contentInfo.params.get('airtable_contents_DB'),
                            wordTable: contentInfo.params.get('airtable_contents_table') || 'words',
                            userBaseUrl: contentInfo.params.get('airtable_user_DB'),
                            userTable: contentInfo.params.get('airtable_user_table') || 'user'
                        };
                        console.log('수동 AirtableManager 생성 성공:', {
                            hasApiKey: !!airtableManager.apiKey,
                            contentsBaseUrl: airtableManager.contentsBaseUrl,
                            wordTable: airtableManager.wordTable
                        });
                    } else {
                        console.error('Airtable 설정 파라미터가 없습니다');
                        airtableManager = null;
                    }
                }
                
                // Airtable Manager 설정 검증 및 보완
                if (airtableManager) {
                    console.log('AirtableManager 설정 검증 중...');
                    console.log('API Key:', airtableManager.apiKey ? '설정됨' : '없음');
                    console.log('Contents Base URL:', airtableManager.contentsBaseUrl ? '설정됨' : '없음');
                    console.log('Word Table:', airtableManager.wordTable ? '설정됨' : '없음');
                    
                    // 설정이 누락된 경우 URL 파라미터에서 다시 추출
                    if (!airtableManager.apiKey || !airtableManager.contentsBaseUrl || !airtableManager.wordTable) {
                        console.log('AirtableManager 설정 보완 시도...');
                        
                        if (contentInfo.params) {
                            if (!airtableManager.apiKey && contentInfo.params.get('airtable_apikey')) {
                                airtableManager.apiKey = contentInfo.params.get('airtable_apikey');
                                console.log('API Key 보완됨');
                            }
                            
                            if (!airtableManager.contentsBaseUrl && contentInfo.params.get('airtable_contents_DB')) {
                                airtableManager.contentsBaseUrl = contentInfo.params.get('airtable_contents_DB');
                                console.log('Contents Base URL 보완됨');
                            }
                            
                            if (!airtableManager.wordTable && contentInfo.params.get('airtable_contents_table')) {
                                airtableManager.wordTable = contentInfo.params.get('airtable_contents_table');
                                console.log('Word Table 보완됨');
                            }
                        }
                    }
                } else {
                    console.warn('AirtableManager를 생성할 수 없습니다. 오프라인 모드로 진행');
                }
                
                // 5. 데이터 로더 초기화
                this.updateProgress(50, '데이터 로더 초기화 중...');
                const CompletedContentAwareDataLoaderClass = await createCompletedContentAwareDataLoader();
                this.dataLoader = new CompletedContentAwareDataLoaderClass(
                    this.dbManager,
                    airtableManager,
                    networkManager
                );
                
                // 진행 상황 콜백 설정
                this.dataLoader.setProgressCallback((progress) => {
                    this.updateProgress(
                        50 + (progress.progress * 0.4), // 50%~90% 범위에서 데이터 로드 진행률 표시
                        progress.message
                    );
                });
                
                // 6. 콘텐츠별 완전 초기화
                this.updateProgress(60, `콘텐츠 "${this.currentContent}" 초기화 중...`);
                const initSuccess = await this.dataLoader.initializeWithContent(this.currentContent);
                
                if (!initSuccess) {
                    throw new Error(`콘텐츠 "${this.currentContent}" 초기화 실패`);
                }
                
                // 7. 앱 객체에 등록
																this.updateProgress(95, '앱 등록 중...');
																window.app = window.app || {};
																window.app.dbManager = this.dbManager;
																window.app.dataLoader = this.dataLoader;
																window.app.currentContent = this.currentContent;
																window.app.initialized = true;
																
																// 8. UI 업데이트 - 로그 추가
																this.updateProgress(100, '초기화 완료!');
																console.log('[initializeApp] UI 업데이트 시작');
																await this.updateUI();
																console.log('[initializeApp] UI 업데이트 완료');
																
																this.initialized = true;
																console.log('=== 콘텐츠 기반 앱 완전 초기화 완료 ===');
				// window.app 객체가 없으면 생성
				if (!window.app) {
					window.app = {};
				}

				// 필수 속성들 추가
				if (this.dbManager) window.app.dbManager = this.dbManager;
				if (this.dataLoader) window.app.dataLoader = this.dataLoader;
				if (this.airtableManager) window.app.airtableManager = this.airtableManager;
				if (this.networkManager) window.app.networkManager = this.networkManager;
				if (this.currentContent) window.app.currentContent = this.currentContent;

				console.log('✅ window.app 객체 업데이트 완료');
                
                return true;
                
            } catch (error) {
                console.error('앱 초기화 오류:', error);
                this.updateProgress(0, `초기화 오류: ${error.message}`);
                return false;
            }
        }
        
        /**
         * 초기화 진행 상황 업데이트
         */
        updateProgress(progress, message) {
            this.initProgress = {
                stage: progress >= 100 ? 'complete' : 'loading',
                progress: Math.min(progress, 100),
                message: message
            };
            
            console.log(`[${this.initProgress.progress}%] ${message}`);
            
            // UI에 진행 상황 표시
            this.showProgressInUI();
        }
        
        /**
         * UI에 진행 상황 표시
         */
        showProgressInUI() {
									   // 메인 메시지를 표시하지 않음
												return;
			
        }
        
        /**
         * UI 업데이트
         */
        async updateUI() {
												try {
																// 초기화 시 스킵 플래그 확인 - 타이틀 업데이트는 항상 실행
																const shouldSkipStats = window._skipInitialUIUpdate;
																
																// 메인 메시지 숨기기
																const mainMessage = document.getElementById('mainMessage');
																if (mainMessage) {
																				mainMessage.style.display = 'none';
																				mainMessage.className = 'message-container';
																				mainMessage.innerHTML = '';
																}
																
																// 콘텐츠 정보는 항상 표시 (스킵 플래그와 무관)
																this.showContentInfo();
																
																// 통계 업데이트는 조건부로 실행
																if (!shouldSkipStats) {
																				await this.updateStatistics();
																}
																
												} catch (error) {
																console.error('UI 업데이트 오류:', error);
												}
								}        
								/**
									* 통계 업데이트
									*/
								async updateStatistics() {
												try {
																console.log('[updateStatistics] 시작');
																
																const stats = await this.dbManager.getContentStats();
																console.log('[updateStatistics] 현재 콘텐츠 통계:', stats);
																
																// 메인 화면 통계 업데이트
																const elements = {
																				totalWords: document.getElementById('totalWords'),
																				isStudiedWordsCount: document.getElementById('isStudiedWordsCount'),
																				progressPercentage: document.getElementById('progressPercentage')
																};
																
																if (elements.totalWords) {
																				elements.totalWords.textContent = stats.total;
																}
																
																if (elements.isStudiedWordsCount) {
																				elements.isStudiedWordsCount.textContent = stats.studied;
																				console.log(`[updateStatistics] 학습한 단어 업데이트: ${stats.studied}`);
																}
																
																if (elements.progressPercentage) {
																				elements.progressPercentage.textContent = stats.percentage;
																}
																
																// 프로그레스 서클 업데이트
																this.updateProgressCircle(stats.percentage);
																
																// 푸터 텍스트 업데이트 - 더 강력하게 처리
																setTimeout(() => {
																				const footerText = document.querySelector('.footer-text');
																				if (footerText && stats.total > 0) {
																								footerText.textContent = `맥락과 반복 - 전체 ${stats.total}개`;
																								console.log(`[updateStatistics] 푸터 텍스트 최종 업데이트: 맥락과 반복 - 전체 ${stats.total}개`);
																				}
																}, 100);
																
												} catch (error) {
																console.error('[updateStatistics] 통계 업데이트 오류:', error);
																
																// 오류 발생 시에도 기본 텍스트 표시
																const footerText = document.querySelector('.footer-text');
																if (footerText) {
																				footerText.textContent = '맥락과 반복';
																}
												}
								}        
        /**
         * 프로그레스 서클 업데이트
         */
        updateProgressCircle(percentage) {
            try {
                const progressFill = document.querySelector('.progress-circle-fill');
                if (progressFill) {
                    const circumference = 2 * Math.PI * 70; // 반지름 70
                    const offset = circumference - (percentage / 100) * circumference;
                    progressFill.style.strokeDashoffset = offset;
                }
            } catch (error) {
                console.error('프로그레스 서클 업데이트 오류:', error);
            }
        }
        
								/**
									* 콘텐츠 정보 표시
									*/
								showContentInfo() {
												try {
																// 페이지 타이틀 업데이트
																document.title = `수능영단어 - ${this.currentContent}`;
																
																// 푸터 텍스트는 "맥락과 반복"으로만 설정
																// 전체 단어 수는 updateStatistics()에서 처리됨
																const footerText = document.querySelector('.footer-text');
																if (footerText) {
																				footerText.textContent = '맥락과 반복';
																}
																// 대시보드 상단 제목 업데이트
																const dashboardTitle = document.getElementById('dashboardTitle');
																if (dashboardTitle) {
																		dashboardTitle.textContent = this.currentContent;
																}
																
																
												} catch (error) {
																console.error('콘텐츠 정보 표시 오류:', error);
												}
								}
        /**
         * 다른 콘텐츠로 전환
         */
        async switchToContent(newContentId) {
            if (!newContentId || newContentId === this.currentContent) {
                return true;
            }
            
            console.log(`콘텐츠 전환 요청: ${this.currentContent} → ${newContentId}`);
            
            try {
                // 로딩 표시
                this.updateProgress(0, `콘텐츠 "${newContentId}"로 전환 중...`);
                
                // DB 전환
                this.updateProgress(30, '데이터베이스 전환 중...');
                await this.dbManager.switchContent(newContentId);
                
                // 데이터 로더 재초기화
                this.updateProgress(60, '데이터 로드 확인 중...');
                await this.dataLoader.initializeWithContent(newContentId);
                
                // 앱 상태 업데이트
                this.currentContent = newContentId;
                window.app.currentContent = newContentId;
                
                // UI 업데이트
                this.updateProgress(90, 'UI 업데이트 중...');
                await this.updateUI();
                
                this.updateProgress(100, '전환 완료!');
                
                console.log(`콘텐츠 전환 완료: "${newContentId}"`);
                return true;
                
            } catch (error) {
                console.error('콘텐츠 전환 오류:', error);
                this.updateProgress(0, `전환 오류: ${error.message}`);
                return false;
            }
        }
    }

				// =============================================================================
				// 6. 클래스 및 유틸리티 전역 노출 (자동 실행 없음)
				// =============================================================================

				/**
					* ContentAppInitializer 클래스만 전역 노출
					* enhanced-loader.js에서 필요할 때 인스턴스를 생성하고 초기화를 실행함
					*/
				window.ContentAppInitializer = ContentAppInitializer;

				/**
					* 오류 메시지 표시 유틸리티 함수
					* @param {string} message - 표시할 오류 메시지
					*/
				window.showContentErrorMessage = function(message) {
								const mainMessage = document.getElementById('mainMessage');
								if (mainMessage) {
												mainMessage.innerHTML = `
																<div style="color: #EF4444; text-align: center; padding: 20px;">
																				<div style="font-weight: bold; margin-bottom: 10px;">${message}</div>
																				<button onclick="window.location.reload()" style="background: #4F46E5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
																								페이지 새로고침
																				</button>
																</div>
												`;
												mainMessage.style.display = 'block';
												mainMessage.className = 'message-container show';
								}
				};

				console.log('ContentAppInitializer 클래스 정의 완료 (자동 실행 없음)');

    // =============================================================================
    // 7. 전역 함수 및 유틸리티
    // =============================================================================

    /**
     * 현재 콘텐츠 정보 조회
     */
    window.getCurrentContentInfo = function() {
        if (window.app && window.app.dbManager) {
            return {
                content: window.app.currentContent,
                dbName: window.app.dbManager.DB_NAME,
                stats: window.app.dbManager.getContentStats()
            };
        }
        return null;
    };

    /**
     * 콘텐츠 전환 (프로그래밍 방식)
     */
    window.switchToContent = function(contentId) {
        if (window.contentAppInitializer) {
            return window.contentAppInitializer.switchToContent(contentId);
        }
        return Promise.resolve(false);
    };

    /**
     * 모든 콘텐츠 목록 조회
     */
    window.getAllContents = async function() {
        if (window.app && window.app.dbManager && typeof window.app.dbManager.getAllContentsList === 'function') {
            return await window.app.dbManager.getAllContentsList();
        }
        return [];
    };

    // 전역 클래스 노출 (다른 모듈에서 사용 가능하도록)
    window.ContentBasedDBManager = window.ContentBasedDBManager || createContentBasedDBManager;
    window.CompletedContentAwareDataLoader = window.CompletedContentAwareDataLoader || createCompletedContentAwareDataLoader;
    window.ContentAppInitializer = ContentAppInitializer;

    console.log('콘텐츠 기반 학습 앱 시스템 로드 완료 (자동 초기화 비활성화)');
} // 전체 조건문 끝