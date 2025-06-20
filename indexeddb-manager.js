/**
 * IndexedDB 관리자 클래스
 * 단어 학습 앱의 로컬 데이터베이스 기능을 제공
 * 수정: DB 생성 방지를 위한 생성자 매개변수 추가
 */
if (typeof window.IndexedDBManager === 'undefined') {
  class IndexedDBManager {
    constructor(dbName = null) {  // ⭐ 기본값을 null로 변경
      // DB 이름을 매개변수로 받거나, 없으면 나중에 설정
      this.DB_NAME = dbName;  // ⭐ 고정값 대신 매개변수 사용
      this.DB_VERSION = 1;
      this.STORES = {
        WORDS: 'words',
        SETTINGS: 'settings',
        SYNC_QUEUE: 'syncQueue',
        SYNC_LOG: 'syncLog'
      };
      this.db = null;
      
      // 한국 시간대 추가
      this.TIMEZONE_OFFSET = 9 * 60 * 60 * 1000;
      
      // 연결 상태 관리
      this._connecting = false;
      this._connectionPromise = null;
      this._lastConnectionCheck = 0;
      this._connectionCheckInterval = 5000;
      
      // 트랜잭션 및 작업 큐 관리
      this._transactionQueue = Promise.resolve();
      this._pendingOperations = new Set();
      this._maxRetries = 3;
      
      // ⭐ DB 이름이 설정되지 않았으면 초기화하지 않음
      this._initialized = false;
    }

    /**
     * DB 이름 설정 메서드 추가
     */
    setDatabaseName(dbName) {
      if (this.db && this.db.readyState !== 'closed') {
        throw new Error('이미 DB가 열려있습니다. 먼저 연결을 종료하세요.');
      }
      this.DB_NAME = dbName;
      console.log(`[IndexedDBManager] DB 이름 설정: ${this.DB_NAME}`);
    }

    /**
     * 데이터베이스 초기화 - DB_NAME이 없으면 오류
     */
    async initDatabase() {
      // ⭐ DB 이름 체크 추가
      if (!this.DB_NAME) {
        throw new Error('DB_NAME이 설정되지 않았습니다. setDatabaseName()을 먼저 호출하세요.');
      }
      
      console.log(`[IndexedDB] 데이터베이스 초기화 시작: ${this.DB_NAME}`);
      
      // 이미 연결되어 있다면 재사용
      if (this.db && this.db.readyState !== 'closed') {
        console.log('[IndexedDB] 이미 연결되어 있음');
        return this.db;
      }
      
      // 연결 중이라면 대기
      if (this._connecting && this._connectionPromise) {
        console.log('[IndexedDB] 연결 진행 중, 대기...');
        return this._connectionPromise;
      }
      
      this._connecting = true;
      
      this._connectionPromise = new Promise((resolve, reject) => {
        try {
          // DB 열기 요청
          const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
          
          // 업그레이드 필요시 (첫 생성 또는 버전 변경)
          request.onupgradeneeded = (event) => {
            console.log(`[IndexedDB] 데이터베이스 업그레이드: ${this.DB_NAME}`);
            const db = event.target.result;
            
            // words 스토어 생성
            if (!db.objectStoreNames.contains(this.STORES.WORDS)) {
              console.log('[IndexedDB] words 스토어 생성');
              const wordStore = db.createObjectStore(this.STORES.WORDS, { keyPath: '_id' });
              
              // 인덱스 생성
              wordStore.createIndex('No', 'No', { unique: false });
              wordStore.createIndex('known_2', 'known_2', { unique: false });
              wordStore.createIndex('status', 'status', { unique: false });
              wordStore.createIndex('difficult', 'difficult', { unique: false });
              wordStore.createIndex('studiedDate', 'studiedDate', { unique: false });
              wordStore.createIndex('isStudied', 'isStudied', { unique: false });
              wordStore.createIndex('updatedAt', 'updatedAt', { unique: false });
              wordStore.createIndex('content', 'content', { unique: false });
              wordStore.createIndex('phone', 'phone', { unique: false });
            }
            
            // settings 스토어 생성
            if (!db.objectStoreNames.contains(this.STORES.SETTINGS)) {
              console.log('[IndexedDB] settings 스토어 생성');
              db.createObjectStore(this.STORES.SETTINGS, { keyPath: 'key' });
            }
            
            // syncQueue 스토어 생성
            if (!db.objectStoreNames.contains(this.STORES.SYNC_QUEUE)) {
              console.log('[IndexedDB] syncQueue 스토어 생성');
              const syncStore = db.createObjectStore(this.STORES.SYNC_QUEUE, { 
                keyPath: 'id', 
                autoIncrement: true 
              });
              syncStore.createIndex('status', 'status', { unique: false });
              syncStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            // syncLog 스토어 생성
            if (!db.objectStoreNames.contains(this.STORES.SYNC_LOG)) {
              console.log('[IndexedDB] syncLog 스토어 생성');
              const logStore = db.createObjectStore(this.STORES.SYNC_LOG, { 
                keyPath: 'id', 
                autoIncrement: true 
              });
              logStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
          };
          
          // 연결 성공
          request.onsuccess = (event) => {
            this.db = event.target.result;
            this._connecting = false;
            this._initialized = true;
            console.log(`[IndexedDB] 연결 성공: ${this.DB_NAME}`);
            
            // 연결 에러 처리
            this.db.onerror = (error) => {
              console.error('[IndexedDB] 데이터베이스 오류:', error);
            };
            
            // 연결이 닫혔을 때 처리
            this.db.onclose = () => {
              console.log('[IndexedDB] 연결이 닫혔습니다');
              this.db = null;
              this._initialized = false;
            };
            
            resolve(this.db);
          };
          
          // 연결 실패
          request.onerror = (event) => {
            this._connecting = false;
            this._connectionPromise = null;
            console.error('[IndexedDB] 연결 실패:', event.target.error);
            reject(event.target.error);
          };
          
          // 차단됨
          request.onblocked = (event) => {
            console.warn('[IndexedDB] 연결이 차단됨 (다른 탭에서 사용 중)');
          };
          
        } catch (error) {
          this._connecting = false;
          this._connectionPromise = null;
          console.error('[IndexedDB] 연결 중 오류:', error);
          reject(error);
        }
      });
      
      return this._connectionPromise;
    }

    /**
     * DB 연결 가져오기 (없으면 재연결)
     * @returns {Promise<IDBDatabase>} 데이터베이스 연결
     */
    async getDbConnection() {
      // DB가 없거나 닫혀있으면 재연결
      if (!this.db || this.db.readyState === 'closed') {
        console.log('[IndexedDB] DB 재연결 필요');
        return await this.initDatabase();
      }
      return this.db;
    }

    /**
     * 트랜잭션 실행 헬퍼
     * @private
     * @param {string} storeName - 스토어 이름
     * @param {string} mode - 트랜잭션 모드 ('readonly' 또는 'readwrite')
     * @param {Function} callback - 트랜잭션 콜백
     * @returns {Promise<any>} 트랜잭션 결과
     */
    async _executeTransaction(storeName, mode, callback) {
      const db = await this.getDbConnection();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction([storeName], mode);
          const store = transaction.objectStore(storeName);
          
          transaction.oncomplete = () => {
            console.log(`[Transaction] ${storeName} 트랜잭션 완료`);
          };
          
          transaction.onerror = (event) => {
            console.error(`[Transaction] ${storeName} 트랜잭션 오류:`, event.target.error);
            reject(event.target.error);
          };
          
          transaction.onabort = (event) => {
            console.error(`[Transaction] ${storeName} 트랜잭션 중단:`, event.target.error);
            reject(event.target.error);
          };
          
          // 콜백 실행
          const result = callback(store);
          
          // 콜백이 Promise를 반환하면 그대로 사용, 아니면 resolve
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          } else {
            resolve(result);
          }
        } catch (error) {
          console.error(`[Transaction] ${storeName} 트랜잭션 생성 오류:`, error);
          reject(error);
        }
      });
    }

    /**
     * 필드 타입 정규화
     * @param {Object} data - 정규화할 데이터
     * @returns {Object} 정규화된 데이터
     */
    normalizeFieldTypes(data) {
      if (!data || typeof data !== 'object') return data;
      
      const normalized = { ...data };
      
      // 문자열 필드
      ['known_2', 'status', 'isStudied'].forEach(field => {
        if (normalized.hasOwnProperty(field)) {
          normalized[field] = String(normalized[field] || '0');
        }
      });
      
      // 숫자 필드
      if (normalized.hasOwnProperty('difficult')) {
        normalized.difficult = Number(normalized.difficult) || 0;
      }
      
      if (normalized.hasOwnProperty('No')) {
        normalized.No = Number(normalized.No) || 0;
      }
      
      return normalized;
    }

    /**
     * 단어 추가
     * @param {Object} word - 추가할 단어
     * @returns {Promise<string>} 추가된 단어 ID
     */
    async addWord(word) {
      if (!word || !word._id) {
        return Promise.reject(new Error('유효한 단어 객체가 필요합니다'));
      }
      
      const normalizedWord = this.normalizeFieldTypes(word);
      normalizedWord.updatedAt = this.getKoreanTimeISOString();
      
      return await this._executeTransaction(this.STORES.WORDS, 'readwrite', (store) => {
        return new Promise((resolve, reject) => {
          const request = store.add(normalizedWord);
          
          request.onsuccess = () => {
            resolve(request.result);
          };
          
          request.onerror = (event) => {
            console.error('단어 추가 오류:', event.target.error);
            reject(event.target.error);
          };
        });
      });
    }

    /**
     * 여러 단어 일괄 추가
     * @param {Array} words - 추가할 단어 배열
     * @returns {Promise<number>} 추가된 단어 수
     */
    async bulkAddWords(words) {
      if (!Array.isArray(words) || words.length === 0) {
        return 0;
      }
      
      return await this._executeTransaction(this.STORES.WORDS, 'readwrite', (store) => {
        return new Promise((resolve, reject) => {
          let addedCount = 0;
          let errorCount = 0;
          const koreanTime = this.getKoreanTimeISOString();
          
          words.forEach((word, index) => {
            if (!word || !word._id) {
              errorCount++;
              return;
            }
            
            const normalizedWord = this.normalizeFieldTypes(word);
            normalizedWord.updatedAt = koreanTime;
            
            const request = store.put(normalizedWord); // add 대신 put 사용 (업데이트 가능)
            
            request.onsuccess = () => {
              addedCount++;
              if (addedCount + errorCount === words.length) {
                console.log(`[bulkAddWords] ${addedCount}/${words.length} 단어 추가 완료`);
                resolve(addedCount);
              }
            };
            
            request.onerror = (event) => {
              console.error(`단어 추가 오류 (인덱스 ${index}):`, event.target.error);
              errorCount++;
              if (addedCount + errorCount === words.length) {
                console.log(`[bulkAddWords] ${addedCount}/${words.length} 단어 추가 완료 (오류: ${errorCount})`);
                resolve(addedCount);
              }
            };
          });
        });
      });
    }

    /**
     * 단어 가져오기
     * @param {Object} filter - 필터 조건
     * @param {number} limit - 최대 개수
     * @param {Object} sort - 정렬 옵션
     * @returns {Promise<Array>} 단어 배열
     */
    async getWords(filter = {}, limit = 20, sort = { field: 'No', direction: 'asc' }) {
      return await this._executeTransaction(this.STORES.WORDS, 'readonly', (store) => {
        return new Promise((resolve, reject) => {
          const results = [];
          const request = store.openCursor();
          
          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              // 필터 확인
              let match = true;
              for (const key in filter) {
                if (filter.hasOwnProperty(key)) {
                  // 필드 타입에 따른 비교
                  const filterValue = filter[key];
                  const cursorValue = cursor.value[key];
                  
                  // null/undefined 처리
                  if (filterValue === null || filterValue === undefined) {
                    continue;
                  }
                  
                  // 문자열 비교 (known_2, status, isStudied)
                  if (['known_2', 'status', 'isStudied'].includes(key)) {
                    match = String(cursorValue) === String(filterValue);
                  } else {
                    match = cursorValue === filterValue;
                  }
                  
                  if (!match) break;
                }
              }
              
              if (match) {
                results.push(this.normalizeFieldTypes(cursor.value));
              }
              
              cursor.continue();
            } else {
              // 정렬
              if (sort && sort.field) {
                results.sort((a, b) => {
                  const aVal = a[sort.field] || 0;
                  const bVal = b[sort.field] || 0;
                  
                  if (sort.direction === 'desc') {
                    return bVal > aVal ? 1 : -1;
                  }
                  return aVal > bVal ? 1 : -1;
                });
              }
              
              // 제한
              const finalResults = limit > 0 ? results.slice(0, limit) : results;
              resolve(finalResults);
            }
          };
          
          request.onerror = (event) => {
            console.error('단어 조회 오류:', event.target.error);
            reject(event.target.error);
          };
        });
      });
    }

    /**
     * 단어 수 가져오기
     * @param {Object} filter - 필터 조건
     * @returns {Promise<number>} 단어 수
     */
    async getWordCount(filter = {}) {
      const words = await this.getWords(filter, 0); // limit 0 = 모든 단어
      return words.length;
    }

    /**
     * 모든 단어 가져오기
     * @returns {Promise<Array>} 모든 단어 배열
     */
    async getAllWords() {
      return await this.getWords({}, 0); // 필터 없음, limit 0
    }

    /**
     * 현재 한국 날짜/시간을 ISO 문자열로 반환
     * @returns {string} 한국 시간 ISO 문자열
     */
    getKoreanTimeISOString() {
      const now = new Date();
      const koreanTime = new Date(now.getTime() + this.TIMEZONE_OFFSET);
      return koreanTime.toISOString();
    }

    /**
     * 데이터베이스 연결 종료
     * @returns {boolean} 성공 여부
     */
    closeConnection() {
      if (this.db) {
        try {
          // 진행 중인 작업이 있는지 확인
          if (this._pendingOperations.size > 0) {
            console.warn('진행 중인 작업이 있습니다. 완료 후 연결을 종료합니다.');
            
            // 모든 진행 중인 작업이 완료될 때까지 기다린 후 연결 종료
            setTimeout(() => {
              if (this._pendingOperations.size === 0) {
                this._closeDbConnection();
              }
            }, 500);
            
            return true;
          }
          
          return this._closeDbConnection();
        } catch (error) {
          console.error('DB 연결 종료 오류:', error);
          return false;
        }
      }
      return false;
    }
    
    /**
     * 실제 DB 연결 종료 처리
     * @private
     * @returns {boolean} 성공 여부
     */
    _closeDbConnection() {
      if (!this.db) return false;
      
      try {
        this.db.close();
        this.db = null;
        this._connecting = false;
        this._connectionPromise = null;
        this._initialized = false;
        console.log('DB 연결이 성공적으로 종료되었습니다.');
        return true;
      } catch (error) {
        console.error('DB 연결 종료 실패:', error);
        return false;
      }
    }

    /**
     * 단어 업데이트 - 오류 처리 강화
     * @param {string} wordId - 단어 ID
     * @param {Object} updateData - 업데이트할 데이터
     * @returns {Promise<Object>} 업데이트된 단어
     */
    async updateWord(wordId, updateData) {
      if (!wordId) {
        return Promise.reject(new Error('유효한 단어 ID가 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.WORDS, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.get(wordId);
            
            request.onsuccess = (event) => {
              const word = event.target.result;
              
              if (!word) {
                reject(new Error(`ID가 ${wordId}인 단어를 찾을 수 없습니다`));
                return;
              }
              
              // 타입 변환된 업데이트 데이터
              const typedUpdateData = this.normalizeFieldTypes(updateData);
              
              // 기존 데이터와 업데이트 데이터 병합
              const updatedWord = {
                ...word,
                ...typedUpdateData,
                updatedAt: this.getKoreanTimeISOString() // 한국 시간 적용
              };
              
              // difficult 필드 최종 확인
              if (updatedWord.hasOwnProperty('difficult')) {
                updatedWord.difficult = Number(updatedWord.difficult);
                if (isNaN(updatedWord.difficult)) {
                  updatedWord.difficult = 0;
                }
              }
            
              // known_2, status 필드 최종 확인
              if (updatedWord.hasOwnProperty('known_2')) {
                updatedWord.known_2 = String(updatedWord.known_2 || "0");
              }
              
              if (updatedWord.hasOwnProperty('status')) {
                updatedWord.status = String(updatedWord.status || "0");
              }
              
              // isStudied 필드 최종 확인
              if (updatedWord.hasOwnProperty('isStudied')) {
                updatedWord.isStudied = String(updatedWord.isStudied || "0");
              }
              
              // 단어 업데이트
              const updateRequest = store.put(updatedWord);
              
              updateRequest.onsuccess = () => {
                resolve(updatedWord);
              };
              
              updateRequest.onerror = (event) => {
                console.error('단어 업데이트 오류:', event.target.error);
                reject(event.target.error);
              };
            };
            
            request.onerror = (event) => {
              console.error('단어 조회 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('updateWord 메서드 오류:', error);
        throw error;
      }
    }
    
    /**
     * 설정 저장
     * @param {string} key - 설정 키
     * @param {any} value - 설정 값
     * @returns {Promise<boolean>} 성공 여부
     */
    async saveSetting(key, value) {
      if (!key) {
        return Promise.reject(new Error('유효한 설정 키가 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SETTINGS, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.put({
              key,
              value,
              updatedAt: this.getKoreanTimeISOString() // 한국 시간 적용
            });
            
            request.onsuccess = () => {
              resolve(true);
            };
            
            request.onerror = (event) => {
              console.error('설정 저장 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('saveSetting 메서드 오류:', error);
        return false;
      }
    }
    
    /**
     * 설정 가져오기
     * @param {string} key - 설정 키
     * @returns {Promise<any>} 설정 값
     */
    async getSetting(key) {
      if (!key) {
        return Promise.resolve(null);
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SETTINGS, 'readonly', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.get(key);
            
            request.onsuccess = (event) => {
              const result = event.target.result;
              resolve(result ? result.value : null);
            };
            
            request.onerror = (event) => {
              console.error('설정 조회 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('getSetting 메서드 오류:', error);
        return null;
      }
    }
    
    /**
     * 설정 삭제하기
     * @param {string} key - 설정 키
     * @returns {Promise<boolean>} 성공 여부
     */
    async removeSetting(key) {
      if (!key) {
        return Promise.reject(new Error('유효한 설정 키가 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SETTINGS, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.delete(key);
            
            request.onsuccess = () => {
              resolve(true);
            };
            
            request.onerror = (event) => {
              console.error('설정 삭제 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('removeSetting 메서드 오류:', error);
        return false;
      }
    }
    
    /**
     * 모든 설정 가져오기
     * @returns {Promise<Object>} 모든 설정
     */
    async getAllSettings() {
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SETTINGS, 'readonly', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.getAll();
            
            request.onsuccess = (event) => {
              const results = event.target.result;
              const settings = {};
              
              results.forEach(item => {
                if (item && item.key) {
                  settings[item.key] = item.value;
                }
              });
              
              resolve(settings);
            };
            
            request.onerror = (event) => {
              console.error('설정 전체 조회 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('getAllSettings 메서드 오류:', error);
        return {};
      }
    }
    
    /**
     * 동기화 큐에 항목 추가
     * @param {Object} item - 동기화 항목
     * @returns {Promise<number>} 추가된 항목의 ID
     */
    async addToSyncQueue(item) {
      if (!item) {
        return Promise.reject(new Error('유효한 동기화 항목이 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SYNC_QUEUE, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.add({
              ...item,
              timestamp: Date.now(),
              status: 'pending',
              retryCount: 0
            });
            
            request.onsuccess = (event) => {
              resolve(event.target.result);
            };
            
            request.onerror = (event) => {
              console.error('동기화 큐 추가 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('addToSyncQueue 메서드 오류:', error);
        throw error;
      }
    }
    
    /**
     * 동기화 큐 가져오기
     * @param {Object} filter - 필터 조건
     * @param {number} limit - 최대 개수
     * @returns {Promise<Array>} 동기화 큐 항목 배열
     */
    async getSyncQueue(filter = {}, limit = 50) {
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SYNC_QUEUE, 'readonly', (store) => {
          return new Promise((resolve, reject) => {
            const results = [];
            
            // 인덱스 사용 가능 여부 확인
            let useIndex = false;
            let indexName = null;
            
            if (filter && Object.keys(filter).length === 1) {
              const filterKey = Object.keys(filter)[0];
              const filterValue = filter[filterKey];
              
              // 기본 타입 값(문자열, 숫자, 부울)인 경우만 인덱스 사용
              if (typeof filterValue !== 'object' && filterValue !== null && 
                  store.indexNames.contains(filterKey)) {
                indexName = filterKey;
                useIndex = true;
              }
            }
            
            // 인덱스 또는 일반 커서 열기
            let request;
            if (useIndex && indexName) {
              const index = store.index(indexName);
              try {
                request = index.openCursor(IDBKeyRange.only(filter[indexName]));
              } catch (error) {
                console.warn('인덱스 쿼리 오류, 전체 스캔으로 전환:', error);
                request = store.openCursor();
              }
            } else {
              request = store.openCursor();
            }
            
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                // 필터 조건 확인
                let match = true;
                for (const key in filter) {
                  if (match && filter.hasOwnProperty(key)) {
                    // 객체형 필터 비교 지원 (예: {$gt: 5})
                    if (typeof filter[key] === 'object' && filter[key] !== null) {
                      // 객체 필터 로직이 필요하면 여기에 추가
                      // 예: $gt, $lt 등 연산자 지원
                      for (const operator in filter[key]) {
                        const value = filter[key][operator];
                        switch(operator) {
                          case '$lt':
                            match = match && cursor.value[key] < value;
                            break;
                          case '$lte':
                            match = match && cursor.value[key] <= value;
                            break;
                          case '$gt':
                            match = match && cursor.value[key] > value;
                            break;
                          case '$gte':
                            match = match && cursor.value[key] >= value;
                            break;
                          case '$ne':
                            match = match && cursor.value[key] !== value;
                            break;
                        }
                      }
                    } else {
                      // 단순 일치 조건
                      match = cursor.value[key] === filter[key];
                    }
                  }
                }
                
                if (match) {
                  results.push(cursor.value);
                }
                
                if (limit && results.length >= limit) {
                  resolve(results.slice(0, limit));
                } else {
                  cursor.continue();
                }
              } else {
                resolve(limit ? results.slice(0, limit) : results);
              }
            };
            
            request.onerror = (event) => {
              console.error('동기화 큐 조회 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('getSyncQueue 메서드 오류:', error);
        return [];
      }
    }
    
    /**
     * 동기화 큐 항목 업데이트
     * @param {number} id - 항목 ID
     * @param {Object} updateData - 업데이트할 데이터
     * @returns {Promise<Object>} 업데이트된 항목
     */
    async updateSyncQueueItem(id, updateData) {
      if (!id) {
        return Promise.reject(new Error('유효한 동기화 항목 ID가 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SYNC_QUEUE, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.get(id);
            
            request.onsuccess = (event) => {
              const item = event.target.result;
              
              if (!item) {
                reject(new Error(`ID가 ${id}인 동기화 항목을 찾을 수 없습니다`));
                return;
              }
              
              // 기존 데이터와 업데이트 데이터 병합
              const updatedItem = {
                ...item,
                ...updateData,
                updatedAt: this.getKoreanTimeISOString() // 한국 시간 적용
              };
              
              const updateRequest = store.put(updatedItem);
              
              updateRequest.onsuccess = () => {
                resolve(updatedItem);
              };
              
              updateRequest.onerror = (event) => {
                console.error('동기화 큐 항목 업데이트 오류:', event.target.error);
                reject(event.target.error);
              };
            };
            
            request.onerror = (event) => {
              console.error('동기화 큐 항목 조회 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('updateSyncQueueItem 메서드 오류:', error);
        throw error;
      }
    }
    
    /**
     * 동기화 큐에서 항목 삭제
     * @param {number} id - 항목 ID
     * @returns {Promise<boolean>} 성공 여부
     */
    async removeSyncQueueItem(id) {
      if (!id) {
        return Promise.reject(new Error('유효한 동기화 항목 ID가 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SYNC_QUEUE, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.delete(id);
            
            request.onsuccess = () => {
              resolve(true);
            };
            
            request.onerror = (event) => {
              console.error('동기화 큐 항목 삭제 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('removeSyncQueueItem 메서드 오류:', error);
        return false;
      }
    }
    
    /**
     * 동기화 로그 추가
     * @param {Object} log - 로그 데이터
     * @returns {Promise<number>} 추가된 로그 ID
     */
    async addSyncLog(log) {
      if (!log) {
        return Promise.reject(new Error('유효한 로그 데이터가 필요합니다'));
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.SYNC_LOG, 'readwrite', (store) => {
          return new Promise((resolve, reject) => {
            const request = store.add({
              ...log,
              timestamp: Date.now()
            });
            
            request.onsuccess = (event) => {
              resolve(event.target.result);
            };
            
            request.onerror = (event) => {
              console.error('동기화 로그 추가 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('addSyncLog 메서드 오류:', error);
        throw error;
      }
    }
    
    /**
     * 오늘 기준 DateString 가져오기 (00:00:00 기준, 한국시간)
     * @returns {string} 오늘 날짜의 ISO 문자열
     */
    getTodayISOString() {
      // 현재 시간을 한국 시간으로 변환
      const now = new Date();
      const koreanTime = new Date(now.getTime() + this.TIMEZONE_OFFSET);
      
      // 00:00:00로 설정 (한국 기준 날짜의 시작)
      koreanTime.setUTCHours(0, 0, 0, 0);
      
      return koreanTime.toISOString();
    }
    
    /**
     * 하루 전 DateString 가져오기 (한국시간)
     * @returns {string} 어제 날짜의 ISO 문자열
     */
    getOneDayAgoISOString() {
      // 현재 시간을 한국 시간으로 변환
      const now = new Date();
      const koreanTime = new Date(now.getTime() + this.TIMEZONE_OFFSET);
      
      // 00:00:00로 설정하고 하루 전으로 이동
      koreanTime.setUTCHours(0, 0, 0, 0);
      koreanTime.setDate(koreanTime.getDate() - 1);
      
      return koreanTime.toISOString();
    }
    
    /**
     * 특정 일자 이전의 장기기억 단어 수 가져오기
     * @param {string} date - 기준 날짜 (ISO 문자열)
     * @returns {Promise<number>} 단어 수
     */
    async getLongTermCountBeforeDate(date) {
      if (!date) {
        return Promise.resolve(0);
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.WORDS, 'readonly', (store) => {
          return new Promise((resolve, reject) => {
            let count = 0;
            
            // 커서 열기
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                // 장기기억(2)이고 주어진 날짜 이전인지 확인
                // known_2 필드는 반드시 문자열로 비교
                if (String(cursor.value.known_2) === "2" && 
                    cursor.value.studiedDate && 
                    cursor.value.studiedDate < date) {
                  count++;
                }
                cursor.continue();
              } else {
                resolve(count);
              }
            };
            
            request.onerror = (event) => {
              console.error('단어 카운트 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('getLongTermCountBeforeDate 실행 오류:', error);
        // 오류 발생 시 0 반환
        return 0;
      }
    }
     
    /**
     * 마지막으로 저장된 단어 가져오기
     * @param {string} phoneNumber - 전화번호
     * @returns {Promise<Object|null>} 단어 객체 또는 null
     */
    async getLastSavedWord(phoneNumber) {
      if (!phoneNumber) {
        return Promise.resolve(null);
      }
      
      try {
        // 트랜잭션 실행
        return await this._executeTransaction(this.STORES.WORDS, 'readonly', (store) => {
          return new Promise((resolve, reject) => {
            // No 인덱스 사용
            const noIndex = store.index('No');
            const request = noIndex.openCursor(null, 'prev'); // 내림차순으로 열기
            
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                if (cursor.value.phone === phoneNumber) {
                  // 전화번호 일치시 바로 리턴
                  resolve(this.normalizeFieldTypes(cursor.value));
                } else {
                  cursor.continue();
                }
              } else {
                // 결과 없음
                resolve(null);
              }
            };
            
            request.onerror = (event) => {
              console.error('단어 조회 오류:', event.target.error);
              reject(event.target.error);
            };
          });
        });
      } catch (error) {
        console.error('getLastSavedWord 메서드 오류:', error);
        return null;
      }
    }
    
    /**
     * 필드 타입 일관성 검증 및 복구 유틸리티 함수
     * 필요시 콘솔에서 실행하여 기존 데이터 수정
     * @returns {Promise<Object>} 처리 결과
     */
    async normalizeAllFieldTypes() {
      console.log('===== 필드 타입 정규화 시작 =====');
      
      try {
        // DB 연결 확인
        await this.getDbConnection();
        
        // 모든 단어 가져오기 (limit=0은 모든 단어 가져오기)
        const allWords = await this.getWords({}, 0);
        console.log(`총 ${allWords.length}개 단어 처리 중...`);
        
        let updateCount = 0;
        const koreanNow = this.getKoreanTimeISOString();
        const errors = [];
        const batchSize = 50; // 일괄 처리 크기
        
        // 배치 처리를 위한 단어 그룹화
        for (let i = 0; i < allWords.length; i += batchSize) {
          const batch = allWords.slice(i, i + batchSize);
          const updatePromises = [];
          
          for (const word of batch) {
            try {
              let needsUpdate = false;
              const updateData = {};
              
              // known_2 필드 (문자열)
              if (word.known_2 !== undefined && typeof word.known_2 !== 'string') {
                updateData.known_2 = String(word.known_2);
                needsUpdate = true;
              }
              
              // status 필드 (문자열)
              if (word.status !== undefined && typeof word.status !== 'string') {
                updateData.status = String(word.status);
                needsUpdate = true;
              }
              
              // isStudied 필드 (문자열)
              if (word.isStudied !== undefined && typeof word.isStudied !== 'string') {
                updateData.isStudied = String(word.isStudied);
                needsUpdate = true;
              }
              
              // difficult 필드 (숫자)
              if (word.difficult !== undefined && typeof word.difficult !== 'number') {
                const numValue = Number(word.difficult);
                if (!isNaN(numValue)) {
                  updateData.difficult = numValue;
                  needsUpdate = true;
                } else {
                  updateData.difficult = 0;
                  needsUpdate = true;
                }
              }
              
              // 시간 필드 확인
              if (!word.updatedAt) {
                updateData.updatedAt = koreanNow;
                needsUpdate = true;
              }
              
              if (!word.studiedDate) {
                updateData.studiedDate = word.updatedAt || koreanNow;
                needsUpdate = true;
              }
              
              // 업데이트 필요한 경우에만 실행
              if (needsUpdate) {
                updateData.updatedAt = koreanNow;
                updatePromises.push(this.updateWord(word._id, updateData)
                  .then(() => updateCount++)
                  .catch(error => {
                    console.error(`단어 ID: ${word._id} 업데이트 실패:`, error);
                    errors.push({ id: word._id, error: error.message });
                  })
                );
              }
            } catch (error) {
              console.error(`단어 ID: ${word._id} 업데이트 준비 실패:`, error);
              errors.push({ id: word._id, error: error.message });
            }
          }
          
          // 현재 배치의 업데이트 작업 완료 대기
          if (updatePromises.length > 0) {
            await Promise.allSettled(updatePromises);
            
            // 진행 상황 표시 (10% 간격)
            const progress = Math.round(((i + batch.length) / allWords.length) * 100);
            console.log(`진행률: ${progress}% (${i + batch.length}/${allWords.length})`);
            
            // UI가 렌더링될 수 있도록 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        console.log(`===== 필드 타입 정규화 완료 =====`);
        console.log(`총 단어: ${allWords.length}`);
        console.log(`업데이트된 단어: ${updateCount}`);
        console.log(`에러 발생: ${errors.length}개`);
        
        return {
          total: allWords.length,
          updated: updateCount,
          errors: errors
        };
      } catch (error) {
        console.error('필드 타입 정규화 중 오류 발생:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }

    /**
     * 필드 타입 검증 함수 - 데이터 일관성 확인
     * @returns {Promise<Object>} 검증 결과
     */
    async validateFieldTypes() {
      console.log('===== 필드 타입 검증 시작 =====');
      
      try {
        // DB 연결 확인
        await this.getDbConnection();
        
        // 샘플 단어만 가져오기 (50개)
        const words = await this.getWords({}, 50);
        console.log(`${words.length}개 단어 검증 중...`);
        
        // 타입 통계
        const stats = {
          known_2: {},
          status: {},
          difficult: {},
          isStudied: {},
          studiedDate: {},
          updatedAt: {}
        };
        
        // 각 단어 필드 타입 확인
        words.forEach(word => {
          for (const field in stats) {
            if (word[field] !== undefined) {
              const type = typeof word[field];
              stats[field][type] = (stats[field][type] || 0) + 1;
            } else {
              stats[field]['undefined'] = (stats[field]['undefined'] || 0) + 1;
            }
          }
        });
        
        console.log('필드별 타입 분포:');
        for (const field in stats) {
          console.log(`- ${field}:`, stats[field]);
        }
        
        // 일관성 검증
        const issues = [];
        
        // known_2, status는 문자열이어야 함
        if (stats.known_2.string !== words.length && stats.known_2.undefined !== words.length) {
          issues.push('known_2 필드가 일관되게 문자열이 아닙니다.');
        }
        
        if (stats.status.string !== words.length && stats.status.undefined !== words.length) {
          issues.push('status 필드가 일관되게 문자열이 아닙니다.');
        }
        
        // difficult는 숫자여야 함
        if (stats.difficult.number !== words.length && stats.difficult.undefined !== words.length) {
          issues.push('difficult 필드가 일관되게 숫자가 아닙니다.');
        }
        
        // isStudied는 이제 문자열이어야 함 (변경됨)
        if (stats.isStudied.string !== words.length && stats.isStudied.undefined !== words.length) {
          issues.push('isStudied 필드가 일관되게 문자열이 아닙니다.');
        }
        
        if (issues.length > 0) {
          console.log('===== 필드 타입 문제 발견 =====');
          issues.forEach(issue => console.log(`- ${issue}`));
          console.log('필드 정규화 함수를 실행하는 것을 권장합니다.');
        } else {
          console.log('===== 모든 필드 타입이 일관됨 =====');
        }
        
        return {
          stats,
          issues
        };
      } catch (error) {
        console.error('필드 타입 검증 중 오류 발생:', error);
        return {
          issues: [`검증 오류: ${error.message}`]
        };
      }
    }

    /**
     * 단어 일괄 저장 (bulkAddWords의 별칭)
     * @param {Array} words - 저장할 단어 배열
     * @returns {Promise<number>} 저장된 단어 수
     */
    async saveWords(words) {
      return await this.bulkAddWords(words);
    }
  }
  
  window.IndexedDBManager = IndexedDBManager;
}