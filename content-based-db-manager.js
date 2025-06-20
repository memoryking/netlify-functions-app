/**
 * content-based-db-manager.js - 콘텐츠별 데이터베이스 관리자
 * 여러 콘텐츠를 별도의 데이터베이스로 관리하는 기능 제공
 * 버전: 2.3.0 - 싱글톤 패턴 적용, 중복 DB 생성 방지
 */

// Promise를 즉시 생성하여 다른 스크립트가 기다릴 수 있도록 함
window.ContentBasedDBManagerPromise = window.ContentBasedDBManagerPromise || new Promise((resolve, reject) => {
  console.log('ContentBasedDBManager Promise 생성 (즉시 실행)');

  (function() {
    // 중복 로드 방지
    if (window.ContentBasedDBManagerLoaded) {
      console.log('ContentBasedDBManager가 이미 로드되었습니다.');
      if (window.ContentBasedDBManager) resolve(window.ContentBasedDBManager);
      return;
    }
    window.ContentBasedDBManagerLoaded = true;

    /**
     * IndexedDBManager가 로드될 때까지 대기
     * @returns {Promise<typeof IndexedDBManager>}
     */
    function waitForIndexedDBManager() {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100;
        function check() {
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
          setTimeout(check, 50);
        }
        check();
      });
    }

    /**
     * 안전한 URL 파라미터 파싱 (search 또는 hash에서 urlParams=... 추출)
     * @returns {URLSearchParams}
     */
    function safeParseUrlParams() {
      try {
        // 1) search 우선, 없으면 hash
        let raw = window.location.search || window.location.hash;
        
        if (!raw) {
          console.log('[URL Parser] URL에 파라미터 없음');
          return new URLSearchParams();
        }
        
        // HTML 태그 제거
        raw = raw.replace(/[<>]/g, '');
        
        // URL 디코딩
        const decoded = decodeURIComponent(raw);
        
        // urlParams=... 패턴 찾기
        const match = decoded.match(/urlParams=(.+)$/);
        
        if (!match || !match[1]) {
          // urlParams가 없으면 전체 쿼리스트링을 파싱
          console.log('[URL Parser] urlParams 패턴 없음, 전체 파싱');
          return new URLSearchParams(decoded.replace(/^[?#]/, ''));
        }
        
        // urlParams 값 추출 및 복원
        let params = match[1]
          .replace(/https(?!:)/g, 'https:')
          .replace(/http(?!s)/g, 'http:');
          
        console.log('[URL Parser] 추출된 urlParams:', params);
        return new URLSearchParams(params);
      } catch (error) {
        console.error('URL 파라미터 파싱 오류:', error);
        return new URLSearchParams();
      }
    }

    // IndexedDBManager 준비 완료 후 ContentBasedDBManager 정의
    waitForIndexedDBManager().then(IndexedDBManagerClass => {
      console.log('IndexedDBManager 로드 완료, ContentBasedDBManager 생성 시작');

      class ContentBasedDBManager extends IndexedDBManagerClass {
        // ⭐ 싱글톤 패턴 적용
        static instance = null;
        
        static getInstance() {
          // ⭐ URL에서 현재 콘텐츠 확인
          const urlParams = safeParseUrlParams();
          const currentUrlContent = urlParams.get('contents');
          
          // ⭐ 인스턴스가 있고 콘텐츠가 같으면 재사용
          if (ContentBasedDBManager.instance) {
            const instanceContent = ContentBasedDBManager.instance.currentContent;
            
            if (currentUrlContent && currentUrlContent !== instanceContent) {
              console.log(`[Singleton] 콘텐츠 변경 감지: "${instanceContent}" → "${currentUrlContent}"`);
              
              // 새 인스턴스 생성이 아닌 기존 인스턴스의 콘텐츠 전환
              ContentBasedDBManager.instance._contentChanged = true;
              ContentBasedDBManager.instance.initializeContentId();
              
              // DB 재초기화 필요 플래그
              ContentBasedDBManager.instance._needsReinit = true;
            }
            
            return ContentBasedDBManager.instance;
          }
          
          // 첫 인스턴스 생성
          ContentBasedDBManager.instance = new ContentBasedDBManager();
          return ContentBasedDBManager.instance;
        }

        constructor() {
          // ⭐ 싱글톤 패턴 체크
          if (ContentBasedDBManager.instance) {
            return ContentBasedDBManager.instance;
          }
          
          // ⭐ 핵심 수정: 부모 생성자에 null 전달하여 DB 생성 방지
          super(null);
          
          // 콘텐츠 ID 초기화 및 DB 이름 설정
          this.initializeContentId();
          
          // 콘텐츠별 DB 매핑 테이블
          this.contentDatabases = new Map();
          
          // 현재 활성 콘텐츠
          this.activeContent = this.currentContent;
          
          // 싱글톤 인스턴스 설정
          ContentBasedDBManager.instance = this;
          
          console.log(`ContentBasedDBManager 초기화 완료: ${this.DB_NAME}`);
        }

        /**
         * 콘텐츠 ID 초기화 - DB 이름 설정
         */
        initializeContentId() {
          try {
            // URL 파라미터에서 contents 추출
            const urlParams = safeParseUrlParams();
            
            if (urlParams.get('contents')) {
              const newContent = urlParams.get('contents');
              
              // ⭐ 현재 콘텐츠와 비교
              const previousContent = this.currentContent;
              this.currentContent = newContent;
              
              console.log(`타입봇에서 전달받은 콘텐츠: "${this.currentContent}"`);
              
              // ⭐ 콘텐츠가 변경되었는지 확인
              if (previousContent && previousContent !== newContent) {
                console.log(`콘텐츠 변경 감지: "${previousContent}" → "${newContent}"`);
                this._contentChanged = true;
              }
            } else {
              // 로컬 스토리지에서 마지막 콘텐츠 확인
              this.currentContent = localStorage.getItem('current_content') || 'default';
              console.log(`기존 콘텐츠 사용: "${this.currentContent}"`);
            }
            
            // 콘텐츠 ID를 안전한 DB 이름으로 변환
            this.sanitizedContent = this.sanitizeContentId(this.currentContent);
            
            // ⭐ setDatabaseName 메서드 사용하여 DB 이름 설정
            const dbName = `WordsDB_${this.sanitizedContent}`;
            this.setDatabaseName(dbName);  // 부모 클래스의 메서드 호출
            
            // 로컬 스토리지에 현재 콘텐츠 저장
            try {
              localStorage.setItem('current_content', this.currentContent);
              localStorage.setItem('current_db_name', this.DB_NAME);
            } catch (e) {
              console.warn('로컬 스토리지 저장 실패:', e);
            }
            
          } catch (error) {
            console.error('콘텐츠 ID 초기화 오류:', error);
            // 오류 발생 시 기본값 사용
            this.currentContent = 'default';
            this.sanitizedContent = 'default';
            this.setDatabaseName('WordsDB_default');
          }
        }

        /** 콘텐츠 ID를 안전한 DB 이름으로 변환 (정적 메서드) */
        static sanitizeContentId(contentId) {
          if (!contentId) return 'default';
          
          // 한글, 영문, 숫자, 하이픈, 언더스코어만 허용
          const sanitized = contentId
            .replace(/[^\w가-힣\-]/g, '_')  // 허용되지 않는 문자를 언더스코어로
            .replace(/_{2,}/g, '_')         // 연속된 언더스코어 제거
            .replace(/^_|_$/g, '')          // 시작과 끝의 언더스코어 제거
            .substring(0, 30);              // 최대 30자
            
          return sanitized || 'default';
        }

        /** 콘텐츠 ID를 안전한 DB 이름으로 변환 (인스턴스 메서드) */
        sanitizeContentId(contentId) {
          return ContentBasedDBManager.sanitizeContentId(contentId);
        }

        /**
         * 데이터베이스 초기화 - 싱글톤 패턴 적용
         */
        async initDatabase() {
          // ⭐ 전역 DB 연결 관리
          window._dbConnections = window._dbConnections || {};
          
          // ⭐ 콘텐츠 변경 시 이전 DB 연결 정리
          if (this._contentChanged) {
            console.log('[ContentBasedDB] 콘텐츠 변경으로 인한 DB 전환 필요');
            
            // 모든 기존 연결 닫기
            for (const [dbName, db] of Object.entries(window._dbConnections)) {
              if (db && db.readyState !== 'closed' && dbName !== this.DB_NAME) {
                console.log(`[ContentBasedDB] 이전 DB 연결 닫기: ${dbName}`);
                db.close();
                delete window._dbConnections[dbName];
              }
            }
            
            this._contentChanged = false;
          }
          
          // ⭐ 현재 콘텐츠의 DB가 이미 연결되어 있는지 확인
          if (window._dbConnections[this.DB_NAME]) {
            const existingDb = window._dbConnections[this.DB_NAME];
            if (existingDb.readyState !== 'closed') {
              this.db = existingDb;
              console.log(`[ContentBasedDB] 동일 콘텐츠 - 기존 연결 재사용: ${this.DB_NAME}`);
              return this.db;
            }
          }
          
          // ⭐ DB 존재 여부 확인
          const dbExists = await this.checkDBExists(this.DB_NAME);
          
          if (dbExists) {
            console.log(`[ContentBasedDB] 기존 DB 발견, 연결 시도: ${this.DB_NAME}`);
            try {
              this.db = await this.openExistingDB(this.DB_NAME);
              window._dbConnections[this.DB_NAME] = this.db;
              return this.db;
            } catch (error) {
              console.error('기존 DB 연결 실패, 새로 생성:', error);
            }
          }
          
          // 새 DB 생성
          console.log(`[ContentBasedDB] 새 DB 생성: ${this.DB_NAME}`);
          const db = await super.initDatabase();
          
          // 전역 연결 저장
          window._dbConnections[this.DB_NAME] = db;
          
          return db;
        }

        /**
         * DB 존재 여부 확인 헬퍼 메서드
         */
        async checkDBExists(dbName) {
          try {
            // 최신 브라우저 API 사용
            if ('databases' in indexedDB) {
              const databases = await indexedDB.databases();
              return databases.some(db => db.name === dbName);
            }
            
            // 폴백: DB를 열어서 확인
            return new Promise((resolve) => {
              const req = indexedDB.open(dbName);
              
              req.onsuccess = (event) => {
                const db = event.target.result;
                const exists = db.objectStoreNames.length > 0;
                db.close();
                resolve(exists);
              };
              
              req.onerror = () => resolve(false);
              
              req.onupgradeneeded = (event) => {
                // 업그레이드 필요 = DB 없음
                event.target.transaction.abort();
                resolve(false);
              };
            });
          } catch (error) {
            console.error('DB 존재 확인 오류:', error);
            return false;
          }
        }

        /**
         * 기존 DB 열기 헬퍼 메서드
         */
        async openExistingDB(dbName) {
          return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            
            request.onsuccess = (event) => {
              const db = event.target.result;
              console.log(`[ContentBasedDB] 기존 DB 열기 성공: ${dbName}`);
              resolve(db);
            };
            
            request.onerror = () => {
              reject(new Error(`DB 열기 실패: ${dbName}`));
            };
          });
        }

        /**
         * 콘텐츠 전환 시 DB 정리
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
              
              // 전역 연결에서도 제거
              if (window._dbConnections && window._dbConnections[this.DB_NAME]) {
                delete window._dbConnections[this.DB_NAME];
              }
              
              console.log('이전 DB 연결 닫기 완료');
            }
            
            // 2. 새 콘텐츠 정보 설정
            this.currentContent = newContentId;
            this.sanitizedContent = this.sanitizeContentId(newContentId);
            const newDbName = `WordsDB_${this.sanitizedContent}`;
            
            // 3. 새 DB 이름 설정
            this.setDatabaseName(newDbName);
            this.activeContent = newContentId;
            
            // 4. 로컬 스토리지 업데이트
            localStorage.setItem('current_content', this.currentContent);
            localStorage.setItem('current_db_name', this.DB_NAME);
            
            // 5. 새 DB 초기화
            await this.initDatabase();
            
            console.log(`콘텐츠 전환 완료: DB "${this.DB_NAME}" 연결됨`);
            return true;
            
          } catch (error) {
            console.error('콘텐츠 전환 오류:', error);
            return false;
          }
        }

        /** 현재 콘텐츠 ID 반환 */
        getCurrentContentId() { 
          return this.currentContent; 
        }

        /** DB 연결 보장 */
        async ensureConnection() {
          if (!this.db || this.db.readyState === 'closed' || this.db.name !== this.DB_NAME) {
            await this.initDatabase();
          }
        }

        /** 모든 단어 가져오기 (content 필터링 추가) */
        async getAllWords() {
          await this.ensureConnection();
          
          return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.WORDS], 'readonly');
            const store = transaction.objectStore(this.STORES.WORDS);
            const request = store.getAll();
            
            request.onsuccess = () => {
              const allWords = request.result || [];
              // content 필터링
              const filteredWords = allWords.filter(word => 
                !word.content || word.content === this.currentContent
              );
              resolve(filteredWords);
            };
            
            request.onerror = () => {
              console.error('단어 조회 오류:', request.error);
              reject(request.error);
            };
          });
        }

        /** 조건에 맞는 단어 수 계산 */
        async countWords(criteria = {}) {
          const words = await this.getAllWords();
          return words.filter(word => {
            return Object.entries(criteria).every(([key, value]) => {
              // null/undefined 무시
              if (value === null || value === undefined) return true;
              // 문자열 비교
              return String(word[key]) === String(value);
            });
          }).length;
        }

        /** getAll alias */
        async getAll(table = 'words') {
          return table === 'words' ? this.getAllWords() : [];
        }

        /** 조건에 맞는 단어 목록 */
        async getWords(criteria = {}, limit = 20, sort = { field: 'No', direction: 'asc' }) {
          // getAllWords를 직접 호출하지 않고 DB에서 직접 가져오기
          await this.ensureConnection();
          
          return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.WORDS], 'readonly');
            const store = transaction.objectStore(this.STORES.WORDS);
            const results = [];
            
            // content 필터 추가
            const finalCriteria = {
              ...criteria,
              content: this.currentContent
            };
            
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                // 필터 확인
                let match = true;
                for (const key in finalCriteria) {
                  if (finalCriteria.hasOwnProperty(key)) {
                    const filterValue = finalCriteria[key];
                    const cursorValue = cursor.value[key];
                    
                    if (filterValue !== null && filterValue !== undefined) {
                      // 문자열 타입 필드는 문자열로 비교
                      if (['known_2', 'status', 'isStudied', 'content'].includes(key)) {
                        match = String(cursorValue) === String(filterValue);
                      } else {
                        match = cursorValue === filterValue;
                      }
                      
                      if (!match) break;
                    }
                  }
                }
                
                if (match) {
                  results.push(cursor.value);
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
        }

        /** 단어 수 가져오기 */
								// ContentBasedDBManager 클래스의 getWordCount 메서드 수정
								async getWordCount(criteria = {}) {
										await this.ensureConnection();
										
										return new Promise((resolve, reject) => {
												const transaction = this.db.transaction([this.STORES.WORDS], 'readonly');
												const store = transaction.objectStore(this.STORES.WORDS);
												let count = 0;
												
												// content 필터는 모든 쿼리에 추가하지 않음 (content가 명시적으로 지정된 경우만)
												const finalCriteria = { ...criteria };
												
												// content가 명시적으로 null이 아니고, criteria에 content가 없으면 현재 콘텐츠 추가
												if (criteria.content === undefined) {
														finalCriteria.content = this.currentContent;
												}
												
												const request = store.openCursor();
												
												request.onsuccess = (event) => {
														const cursor = event.target.result;
														if (cursor) {
																// 필터 확인
																let match = true;
																for (const key in finalCriteria) {
																		if (finalCriteria.hasOwnProperty(key)) {
																				const filterValue = finalCriteria[key];
																				const cursorValue = cursor.value[key];
																				
																				if (filterValue !== null && filterValue !== undefined) {
																						if (['known_2', 'status', 'isStudied', 'content'].includes(key)) {
																								match = String(cursorValue || '') === String(filterValue);
																						} else if (key === 'difficult' && typeof filterValue === 'object') {
																								// difficult 필드에 대한 범위 쿼리 처리 ($gt, $lt 등)
																								const difficultNum = Number(cursor.value.difficult || 0);
																								for (const operator in filterValue) {
																										const value = Number(filterValue[operator]);
																										switch(operator) {
																												case '$gt':
																														match = match && (difficultNum > value);
																														break;
																												case '$gte':
																														match = match && (difficultNum >= value);
																														break;
																												case '$lt':
																														match = match && (difficultNum < value);
																														break;
																												case '$lte':
																														match = match && (difficultNum <= value);
																														break;
																												case '$ne':
																														match = match && (difficultNum !== value);
																														break;
																										}
																								}
																						} else {
																								match = cursorValue === filterValue;
																						}
																						
																						if (!match) break;
																				}
																		}
																}
																
																if (match) {
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
								}

        /** 
         * 고난도 단어 수 가져오기 (difficult > 2)
         * @returns {Promise<number>} 고난도 단어 수
         */
        async getDifficultWordCount() {
          return await this.getWordCount({ 
            isStudied: "1", 
            difficult: { $gt: 2 }
          });
        }

        /** 
         * 특정 날짜 이전의 장기기억 단어 수 가져오기
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
                    // 장기기억(2)이고 주어진 날짜 이전이며 현재 콘텐츠인지 확인
                    if (String(cursor.value.known_2) === "2" && 
                        cursor.value.studiedDate && 
                        cursor.value.studiedDate < date &&
                        (!cursor.value.content || cursor.value.content === this.currentContent)) {
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
         * ⭐ 콘텐츠별 통계 조회 - 핵심 메서드 추가
         * @param {string} contentId - 콘텐츠 ID (선택적, 기본값은 현재 콘텐츠)
         * @returns {Promise<Object>} 통계 정보
         */
        async getContentStats(contentId = null) {
          try {
            const targetContent = contentId || this.currentContent;
            
            console.log(`[getContentStats] 통계 조회 시작: ${targetContent}`);
            
            // 임시로 다른 콘텐츠의 통계를 조회하는 경우
            if (contentId && contentId !== this.currentContent) {
              console.warn(`[getContentStats] 다른 콘텐츠(${contentId}) 통계 조회는 현재 지원되지 않습니다. 현재 콘텐츠 통계를 반환합니다.`);
            }
            
            // DB 연결 확인
            await this.ensureConnection();
            
            // 전체 단어 수
            const totalWords = await this.getWordCount({});
            
            // 학습한 단어 수 (isStudied = "1")
            const studiedWords = await this.getWordCount({ isStudied: "1" });
            
            // 암기중 단어 수 (isStudied = "1", known_2 = "0")
            const memorizingWords = await this.getWordCount({ 
              isStudied: "1", 
              known_2: "0" 
            });
            
            // 단기기억 단어 수 (isStudied = "1", known_2 = "1")
            const shortTermWords = await this.getWordCount({ 
              isStudied: "1", 
              known_2: "1" 
            });
            
            // 장기기억 단어 수 (isStudied = "1", known_2 = "2")  
            const longTermWords = await this.getWordCount({ 
              isStudied: "1", 
              known_2: "2" 
            });
            
            // S Memory 단어 수 (isStudied = "1", known_2 = "0", status = "0")
            const sMemoryWords = await this.getWordCount({ 
              isStudied: "1", 
              known_2: "0", 
              status: "0" 
            });
            
            // 고난도 단어 수 (isStudied = "1", difficult > 2)
            const difficultWords = await this.getDifficultWordCount();
            
            // 오늘 기준 하루 전 장기기억 단어 수
            const oneDayAgo = this.getTodayISOString();
            const longTermBeforeToday = await this.getLongTermCountBeforeDate(oneDayAgo);
            
            // 남은 단어 수
            const remainingWords = totalWords - studiedWords;
            
            // 학습 진행률 (퍼센트)
            const percentage = totalWords > 0 ? Math.round((studiedWords / totalWords) * 100) : 0;
            
            const stats = {
              content: targetContent,
              total: totalWords,
              studied: studiedWords,
              remaining: remainingWords,
              percentage: percentage,
              // 세부 통계
              memorizing: memorizingWords,
              shortTerm: shortTermWords,
              longTerm: longTermWords,
              longTermBeforeToday: longTermBeforeToday,
              sMemory: sMemoryWords,
              difficult: difficultWords,
              // 추가 정보
              timestamp: new Date().toISOString(),
              dbName: this.DB_NAME
            };
            
            console.log(`[getContentStats] 통계 조회 완료:`, stats);
            
            return stats;
          } catch (error) {
            console.error(`[getContentStats] 통계 조회 오류:`, error);
            
            // 오류 발생 시 기본 통계 반환
            return {
              content: targetContent || this.currentContent,
              total: 0,
              studied: 0,
              remaining: 0,
              percentage: 0,
              memorizing: 0,
              shortTerm: 0,
              longTerm: 0,
              longTermBeforeToday: 0,
              sMemory: 0,
              difficult: 0,
              timestamp: new Date().toISOString(),
              dbName: this.DB_NAME,
              error: error.message
            };
          }
        }

        /** 범위로 단어 가져오기 */
        async getWordsByRange({ content, startIndex = 0, limit = 20 } = {}) {
          const targetContent = content || this.currentContent;
          const arr = await this.getAllWords();
          
          const filtered = arr.filter(w => w.content === targetContent);
          filtered.sort((a, b) => (a.No || 0) - (b.No || 0));
          
          return filtered.slice(startIndex, startIndex + limit);
        }

        /** 콘텐츠별 데이터 내보내기 */
        async exportContentData() {
          const words = await this.getWords({}, 0); // 모든 단어
          const settings = await this.getAllSettings();
          
          return { 
            contentId: this.currentContent, 
            dbName: this.DB_NAME, 
            timestamp: Date.now(), 
            data: { words, settings } 
          };
        }

        /** 콘텐츠별 데이터 가져오기 */
        async importContentData(importData) {
          if (!importData || !importData.contentId || !importData.data) {
            throw new Error('유효하지 않은 가져오기 데이터');
          }
          
          // 콘텐츠 전환
          if (importData.contentId !== this.currentContent) {
            await this.switchContent(importData.contentId);
          }
          
          // 단어 저장
          if (importData.data.words && Array.isArray(importData.data.words)) {
            await this.saveWords(importData.data.words);
          }
          
          // 설정 저장
          if (importData.data.settings) {
            for (const [key, value] of Object.entries(importData.data.settings)) {
              await this.saveSetting(key, value);
            }
          }
          
          return true;
        }

        /** 단어 저장 (content 필드 자동 추가) */
        async saveWords(words) {
          if (!Array.isArray(words) || words.length === 0) {
            return 0;
          }
          
          // content 필드 추가
          const wordsWithContent = words.map(word => ({
            ...word,
            content: this.currentContent
          }));
          
          // bulkAddWords 메서드 사용
          if (typeof this.bulkAddWords === 'function') {
            return await this.bulkAddWords(wordsWithContent);
          }
          
          // 없으면 개별 저장
          let savedCount = 0;
          for (const word of wordsWithContent) {
            try {
              await this.addWord(word);
              savedCount++;
            } catch (error) {
              console.error('단어 저장 오류:', error);
            }
          }
          
          return savedCount;
        }

        /** 단어 추가 (content 필드 자동 추가) */
        async addWord(word) {
          if (!word || !word._id) {
            throw new Error('유효한 단어 객체가 필요합니다');
          }
          
          // content 필드 추가
          const wordWithContent = {
            ...word,
            content: this.currentContent
          };
          
          return await super.addWord(wordWithContent);
        }

        /** 단어 업데이트 (content 보존) */
        async updateWord(wordId, updateData) {
          // 현재 단어의 content를 보존
          const existingWord = await this.getWords({ _id: wordId }, 1);
          if (existingWord.length > 0) {
            updateData.content = existingWord[0].content || this.currentContent;
          }
          
          return await super.updateWord(wordId, updateData);
        }

        /** 데이터베이스 초기화 여부 확인 */
        async isDatabaseInitialized() {
          try {
            const init = await this.getSetting('initialDataLoaded');
            return init === true;
          } catch (error) {
            console.error('초기화 확인 오류:', error);
            return false;
          }
        }
      }

      // 전역 노출 및 Promise 해결
      window.ContentBasedDBManager = ContentBasedDBManager;
      console.log('ContentBasedDBManager 클래스 생성 완료');
      resolve(ContentBasedDBManager);

    }).catch(error => {
      console.error('ContentBasedDBManager 생성 실패:', error);
      reject(error);
    });

  })();
});