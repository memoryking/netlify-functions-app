/**
 * 개선된 고난도 모드 관리자
 * IndexedDB에서 difficult > 2인 단어를 가져와 에어테이블에서 추가 정보를 로드합니다.
 */
class DifficultModeManager {
    constructor() {
        this.DB_NAME = 'difficultModeDB';
        this.DB_VERSION = 1;
        this.STORE_NAME = 'difficultWords';
        this.SETTINGS_STORE = 'settings';
        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.dataCache = null; // 데이터 캐시 추가
        this.lastFetchTime = 0; // 마지막 데이터 조회 시간
    }

    /**
     * IndexedDB 데이터베이스 초기화
     */
    async initDatabase() {
        // 이미 초기화 진행 중이면 진행 중인 Promise 반환
        if (this.initPromise) return this.initPromise;
        
        // 이미 초기화 완료되었으면 바로 완료
        if (this.isInitialized) return Promise.resolve();
        
        this.initPromise = new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    // 단어 저장소 생성
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        const wordStore = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                        wordStore.createIndex('word', 'word', { unique: false });
                        wordStore.createIndex('difficult', 'difficult', { unique: false });
                        wordStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                    
                    // 설정 저장소 생성
                    if (!db.objectStoreNames.contains(this.SETTINGS_STORE)) {
                        db.createObjectStore(this.SETTINGS_STORE, { keyPath: 'key' });
                    }
                };
                
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isInitialized = true;
                    console.log('DifficultMode IndexedDB 초기화 성공:', this.DB_NAME);
                    resolve();
                };
                
                request.onerror = (event) => {
                    console.error('DifficultMode IndexedDB 초기화 오류:', event.target.error);
                    reject(event.target.error);
                };
            } catch (e) {
                console.error('DB 초기화 중 예외 발생:', e);
                reject(e);
            }
        });
        
        return this.initPromise;
    }

    /**
     * 메인 IndexedDB에서 고난도 단어 가져오기
     * @param {Object} mainDbManager - 메인 IndexedDB 매니저 인스턴스
     * @returns {Promise<Array>} 고난도 단어 배열
     */
    async loadDifficultWordsFromMainDB(mainDbManager) {
        try {
            if (!mainDbManager) {
                throw new Error('메인 DB 매니저가 없습니다');
            }
            
            // 캐싱 - 마지막 요청이 30초 이내라면 캐시 사용
            const now = Date.now();
            if (this.dataCache && (now - this.lastFetchTime < 30000)) {
                console.log('캐시된 고난도 단어 사용 (30초 이내 요청)');
                return this.dataCache;
            }
            
            console.log('메인 DB에서 고난도 단어 가져오기 시작...');
            
            // isStudied: "1" 이고 difficult가 2보다 큰 단어 가져오기
            const filter = { isStudied: "1", difficult: { $gt: 2 } };
            const sort = { field: 'difficult', direction: 'desc' };
            const limit = 100;
            
            const words = await mainDbManager.getWords(filter, limit, sort);
            console.log(`메인 DB에서 고난도 단어 ${words.length}개 로드 완료`);
            
            // 결과 캐싱
            this.dataCache = words;
            this.lastFetchTime = now;
            
            return words;
        } catch (error) {
            console.error('메인 DB에서 고난도 단어 로드 오류:', error);
            throw error;
        }
    }

    /**
     * 에어테이블에서 단어 상세 정보 가져오기 (개선된 버전)
     * @param {Array} words - 기본 단어 정보 배열
     * @param {Object} params - URL 파라미터 또는 API 설정 객체
     * @returns {Promise<Array>} 상세 정보가 추가된 단어 배열
     */
    async loadDetailsFromAirtable(words, params) {
        if (!words || words.length === 0) {
            return [];
        }
        
        // 파라미터 처리
        let airtableApiKey, airtableContentsDB, airtableContentsTable;
        
        if (params instanceof URLSearchParams) {
            // URL 파라미터인 경우
            airtableApiKey = params.get('airtable_apikey');
            airtableContentsDB = params.get('airtable_contents_DB');
            airtableContentsTable = params.get('airtable_contents_table');
        } else if (typeof params === 'object') {
            // 설정 객체인 경우
            airtableApiKey = params.apiKey;
            airtableContentsDB = params.contentsDB;
            airtableContentsTable = params.contentsTable;
        } else {
            throw new Error('유효하지 않은 파라미터 형식입니다');
        }
        
        if (!airtableApiKey || !airtableContentsDB || !airtableContentsTable) {
            throw new Error('에어테이블 API 정보가 없습니다');
        }
        
        console.log(`에어테이블 상세 정보 로드 시작: ${words.length}개 단어`);
        
        // 요청 병렬 처리를 위한 배치 처리
        const BATCH_SIZE = 5; // 동시에 처리할 요청 수
        const batches = [];
        for (let i = 0; i < words.length; i += BATCH_SIZE) {
            batches.push(words.slice(i, i + BATCH_SIZE));
        }
        
        const allDetailedWords = [];
        
        // 각 배치를 순차적으로 처리
        for (const batch of batches) {
            // 배치 내에서는 병렬 처리
            const batchResults = await Promise.all(
                batch.map(async (word) => {
                    if (!word.airtableId || !word.word) {
                        return word;
                    }
                    
                    try {
                        console.log(`'${word.word}' 에어테이블 데이터 요청 시작`);
                        
                        // 필터 문자열 구성
                        let encodedFilter;
                        try {
                            // 특수문자 처리를 위한 이스케이핑
                            const escapedWord = word.word.replace(/'/g, "\\'");
                            encodedFilter = encodeURIComponent(`word='${escapedWord}'`);
                        } catch (e) {
                            console.error(`필터 인코딩 오류:`, e);
                            // 폴백: 에어테이블 ID로 직접 조회
                            encodedFilter = encodeURIComponent(`RECORD_ID()='${word.airtableId}'`);
                        }
                        
                        const detailUrl = `${airtableContentsDB}/${airtableContentsTable}?filterByFormula=${encodedFilter}`;
                        console.log(`요청 URL: ${detailUrl.substring(0, 100)}...`);
                        
                        // 요청 시도
                        let detailResponse;
                        try {
                            detailResponse = await fetch(
                                detailUrl,
                                { 
                                    method: "GET",
                                    headers: { 
                                        "Authorization": `Bearer ${airtableApiKey}`,
                                        "Accept": "application/json"
                                    }
                                }
                            );
                        } catch (fetchError) {
                            console.error(`'${word.word}' 페치 오류:`, fetchError);
                            return word; // 기본 단어 반환
                        }
                        
                        if (!detailResponse.ok) {
                            console.error(`'${word.word}' API 응답 오류:`, detailResponse.status);
                            return word;
                        }
                        
                        // 응답 데이터 파싱
                        let detailData;
                        try {
                            detailData = await detailResponse.json();
                        } catch (jsonError) {
                            console.error(`'${word.word}' JSON 파싱 오류:`, jsonError);
                            return word;
                        }
                        
                        if (!detailData.records || !detailData.records.length) {
                            console.log(`'${word.word}' 레코드 없음`);
                            return word;
                        }
                        
                        // 레코드 찾기 (ID 매칭 또는 첫 번째 레코드)
                        const record = detailData.records.find(r => r.id === word.airtableId) || detailData.records[0];
                        
                        // 필드 추출 (안전하게 처리)
                        const getField = (fieldName) => {
                            try {
                                return record.fields[fieldName] || "";
                            } catch (e) {
                                return "";
                            }
                        };
                        
                        // 이미지 URL 추출
                        const getImageUrl = () => {
                            try {
                                if (record.fields.image && Array.isArray(record.fields.image) && record.fields.image.length > 0) {
                                    return record.fields.image[0].url || "";
                                }
                                return "";
                            } catch (e) {
                                return "";
                            }
                        };
                        
                        // 오디오 URL 추출
                        const getAudioUrl = () => {
                            try {
                                if (record.fields.audio && Array.isArray(record.fields.audio) && record.fields.audio.length > 0) {
                                    return record.fields.audio[0].url || "";
                                }
                                return "";
                            } catch (e) {
                                return "";
                            }
                        };
                        
                        // 비디오 URL 추출
                        const getVideoUrl = () => {
                            try {
                                if (!record.fields.video) return "";
                                
                                // 타입에 따른 처리
                                if (typeof record.fields.video === 'string') {
                                    return record.fields.video.trim();
                                } else if (Array.isArray(record.fields.video) && record.fields.video.length > 0) {
                                    if (typeof record.fields.video[0] === 'string') {
                                        return record.fields.video[0].trim();
                                    } else if (record.fields.video[0] && record.fields.video[0].url) {
                                        return record.fields.video[0].url.trim();
                                    }
                                } else if (typeof record.fields.video === 'object' && record.fields.video !== null) {
                                    if (record.fields.video.url) {
                                        return record.fields.video.url.trim();
                                    }
                                    
                                    // 객체에서 가능한 URL을 찾기
                                    const possibleUrlProps = ['url', 'link', 'videoUrl', 'src'];
                                    for (const prop of possibleUrlProps) {
                                        if (record.fields.video[prop]) {
                                            return String(record.fields.video[prop]).trim();
                                        }
                                    }
                                }
                                return "";
                            } catch (e) {
                                return "";
                            }
                        };
                        
                        // 필드 값 가져오기
                        const pronunciation = getField('pronunciation');
                        const vipup = getField('vipup');
                        const context = getField('context');
                        const imagetext = getField('imagetext');
                        const videotext = getField('videotext');
                        const image = getImageUrl();
                        const audio = getAudioUrl();
                        const video = getVideoUrl();
                        
                        console.log(`'${word.word}' 데이터 로드 완료`);
                        
                        // 기존 단어에 상세 정보 추가
                        return {
                            ...word,
                            pronunciation,
                            vipup,
                            context,
                            imagetext,
                            videotext,
                            image,
                            audio,
                            video
                        };
                        
                    } catch (error) {
                        console.error(`'${word.word}' 에어테이블 데이터 로드 오류:`, error);
                        return word;
                    }
                })
            );
            
            // 결과 합치기
            allDetailedWords.push(...batchResults);
            
            // API 제한을 위한 짧은 대기
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('에어테이블 상세 정보 로드 완료');
        return allDetailedWords;
    }

    /**
     * 단어 데이터 저장하기
     * @param {Array} words - 저장할 단어 배열
     */
    async saveWords(words) {
        await this.initDatabase();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                let savedCount = 0;
                
                // 기존 데이터 모두 지우기
                store.clear().onsuccess = () => {
                    console.log('기존 고난도 단어 데이터 초기화 완료');
                    
                    // 새 데이터 저장
                    words.forEach(word => {
                        const wordId = word._id || word.airtableId || `word_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        
                        const request = store.put({
                            id: wordId,
                            ...word,
                            timestamp: Date.now()
                        });
                        
                        request.onsuccess = () => {
                            savedCount++;
                            if (savedCount === words.length) {
                                console.log(`${savedCount}개 단어 저장 완료`);
                            }
                        };
                    });
                };
                
                transaction.oncomplete = () => {
                    console.log('단어 저장 트랜잭션 완료');
                    resolve(true);
                };
                
                transaction.onerror = (event) => {
                    console.error('단어 저장 오류:', event.target.error);
                    reject(event.target.error);
                };
            } catch (e) {
                console.error('단어 저장 중 예외 발생:', e);
                reject(e);
            }
        });
    }

    /**
     * 저장된 단어 가져오기
     */
    async getWords() {
        await this.initDatabase();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                
                // 난이도 내림차순으로 정렬된 모든 단어 가져오기
                const index = store.index('difficult');
                const request = index.openCursor(null, 'prev');
                
                const words = [];
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        words.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(words);
                    }
                };
                
                request.onerror = (event) => {
                    console.error('단어 조회 오류:', event.target.error);
                    reject(event.target.error);
                };
            } catch (e) {
                console.error('단어 조회 중 예외 발생:', e);
                reject(e);
            }
        });
    }
    
    /**
     * 마지막 업데이트 시간 저장
     */
    async setLastUpdated(timestamp) {
        await this.initDatabase();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(this.SETTINGS_STORE, 'readwrite');
                const store = transaction.objectStore(this.SETTINGS_STORE);
                
                const request = store.put({
                    key: 'lastUpdated',
                    value: timestamp || Date.now()
                });
                
                request.onsuccess = () => resolve(true);
                request.onerror = (event) => reject(event.target.error);
            } catch (e) {
                console.error('마지막 업데이트 시간 저장 중 예외 발생:', e);
                reject(e);
            }
        });
    }
    
    /**
     * 마지막 업데이트 시간 가져오기
     */
    async getLastUpdated() {
        await this.initDatabase();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(this.SETTINGS_STORE, 'readonly');
                const store = transaction.objectStore(this.SETTINGS_STORE);
                const request = store.get('lastUpdated');
                
                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : null);
                };
                
                request.onerror = (event) => reject(event.target.error);
            } catch (e) {
                console.error('마지막 업데이트 시간 조회 중 예외 발생:', e);
                reject(e);
            }
        });
    }
    
    /**
     * 로컬 스토리지에 단어 데이터 캐싱
     * 부모-자식 창 간 통신 문제시 백업용
     */
    cacheToLocalStorage(words) {
        try {
            // 용량 초과를 방지하기 위해 핵심 필드만 저장
            const essentialData = words.map(word => ({
                _id: word._id,
                word: word.word,
                meaning: word.meaning,
                difficult: word.difficult,
                pronunciation: word.pronunciation,
                airtableId: word.airtableId
            }));
            
            localStorage.setItem('difficult_words_cache', JSON.stringify(essentialData));
            localStorage.setItem('difficult_words_timestamp', Date.now().toString());
            
            console.log(`${words.length}개 단어 로컬 스토리지에 캐싱 완료`);
            return true;
        } catch (e) {
            console.error('로컬 스토리지 캐싱 오류:', e);
            return false;
        }
    }
    
    /**
     * 로컬 스토리지에서 단어 데이터 복구
     */
    getFromLocalStorage() {
        try {
            const cachedData = localStorage.getItem('difficult_words_cache');
            const timestamp = localStorage.getItem('difficult_words_timestamp');
            
            if (!cachedData) return null;
            
            // 캐시가 24시간 이상 지났으면 무효화
            if (timestamp && (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000)) {
                localStorage.removeItem('difficult_words_cache');
                localStorage.removeItem('difficult_words_timestamp');
                return null;
            }
            
            const parsedData = JSON.parse(cachedData);
            console.log(`로컬 스토리지에서 ${parsedData.length}개 단어 복구`);
            return parsedData;
        } catch (e) {
            console.error('로컬 스토리지 복구 오류:', e);
            return null;
        }
    }
}

// 인스턴스 생성 및 전역 객체에 노출
window.DifficultModeManager = DifficultModeManager;

// 이전 버전 호환성을 위한 별칭
window.DifficultModeDB = DifficultModeManager;