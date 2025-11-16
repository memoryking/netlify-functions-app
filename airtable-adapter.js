/**
* AirtableManager 어댑터 클래스
* 기존 AirtableManager와 IndexedDB 사이의 브릿지 역할
*/
if (typeof window.AirtableManagerAdapter === 'undefined') {
 class AirtableManagerAdapter {
   constructor(airtableManager, dbManager, networkManager) {
     this.airtableManager = airtableManager;
     this.dbManager = dbManager;
     this.networkManager = networkManager;
     this.offlineFirst = false;
     this.directLoader = null; // DirectDataLoader 참조
     this.cache = {
       studyCount: new Map(),
       words: new Map(),
       vipup: new Map()
     };
     this.cacheTimeout = 60000; // 캐시 타임아웃 (1분)
   }
   
   /**
    * 하이브리드 로더 설정
    * @param {HybridDataLoader} hybridLoader - 하이브리드 데이터 로더
    */
   setHybridLoader(hybridLoader) {
     // 전달받은 loader가 DirectDataLoader인지 확인
     if (hybridLoader && hybridLoader.constructor.name === 'DirectDataLoader') {
       this.directLoader = hybridLoader;
       console.log('기존 DirectDataLoader 재사용');
     } else if (hybridLoader && window.DirectDataLoader && window.DirectDataLoader.getInstance) {
       // getInstance 메서드 사용
       this.directLoader = window.DirectDataLoader.getInstance(this.dbManager);
       console.log('DirectDataLoader 싱글톤 사용');
     } else {
       // 새로 생성해야 하는 경우에만 생성
       if (window.DirectDataLoader && window.DirectDataLoader.getInstance) {
         this.directLoader = window.DirectDataLoader.getInstance(this.dbManager);
         console.log('DirectDataLoader 싱글톤 생성');
       } else {
         console.error('DirectDataLoader를 찾을 수 없습니다');
       }
     }
   }
   
   /**
    * 오프라인 우선 모드 설정
    * @param {boolean} enabled - 활성화 여부
    */
   setOfflineFirst(enabled) {
     this.offlineFirst = enabled;
     console.log(`오프라인 우선 모드 ${enabled ? '활성화' : '비활성화'}`);
   }
   
   /**
    * 학습 카운트 조회
    * @param {string} phoneNumber - 전화번호
    * @returns {Promise<Object>} 학습 카운트 정보
    */
   async getStudyCount(phone) {
     if (!phone) {
       throw new Error('전화번호가 필요합니다');
     }
     
     try {
       // 캐시 확인
       const cacheKey = `studyCount-${phone}`;
       const cachedData = this.cache.studyCount.get(cacheKey);
       
       if (cachedData && (Date.now() - cachedData.timestamp < this.cacheTimeout)) {
         return cachedData.data;
       }
       
       // 현재 저장된 학습 정보 가져오기
       let studyCountInfo = await this.dbManager.getSetting(`studyCount-${phone}`);
       
       // 오프라인 우선 모드가 아니고 온라인 상태일 때 서버에서 가져오기
       if (!this.offlineFirst && this.networkManager.isNetworkOnline()) {
         try {
           const serverStudyCount = await this.airtableManager.getStudyCount(phone);
           
           // 서버 데이터가 있으면 사용하고 로컬에 저장
           if (serverStudyCount && serverStudyCount.get_id_air) {
             studyCountInfo = serverStudyCount;
             await this.dbManager.saveSetting(`studyCount-${phone}`, serverStudyCount);
           }
         } catch (error) {
           console.warn('서버 학습 정보 조회 실패, 로컬 데이터 사용:', error);
         }
       }
       
       // 로컬 데이터도 없으면 신규 생성
       if (!studyCountInfo) {
         // 마지막 저장된 단어의 No 값 찾기
         const lastWord = await this.dbManager.getLastSavedWord(phone);
         const lastNo = lastWord ? lastWord.No : 0;
         
         studyCountInfo = {
           get_id_air: null, // 로컬 전용 ID
           study_count: lastNo
         };
         
         // 로컬에 저장
         await this.dbManager.saveSetting(`studyCount-${phone}`, studyCountInfo);
         
         // 온라인 상태면 서버에도 생성 시도
         if (this.networkManager.isNetworkOnline()) {
           try {
             const newStudyCount = await this.airtableManager.createNewStudyRecord(phone);
             if (newStudyCount && newStudyCount.get_id_air) {
               studyCountInfo = newStudyCount;
               await this.dbManager.saveSetting(`studyCount-${phone}`, newStudyCount);
             }
           } catch (error) {
             console.warn('서버 학습 정보 생성 실패:', error);
           }
         }
       }
       
       // 캐시에 저장
       this.cache.studyCount.set(cacheKey, {
         data: studyCountInfo,
         timestamp: Date.now()
       });
       
       return studyCountInfo;
     } catch (error) {
       console.error('학습 정보 조회 오류:', error);
       
       // 기본값 반환
       return {
         get_id_air: null,
         study_count: 0
       };
     }
   }
   
   /**
    * 신규 학습 기록 생성
    * @param {string} phone - 전화번호
    * @returns {Promise<Object>} 생성된 학습 기록
    */
   async createNewStudyRecord(phone) {
     // 오프라인 우선 모드이거나 오프라인 상태일 때 로컬 데이터만 생성
     if (this.offlineFirst || !this.networkManager.isNetworkOnline()) {
       const studyCount = {
         get_id_air: null,
         study_count: 0
       };
       
       await this.dbManager.saveSetting(`studyCount-${phone}`, studyCount);
       return studyCount;
     }
     
     try {
       // 서버에 생성 요청
       const result = await this.airtableManager.createNewStudyRecord(phone);
       
       // 로컬에도 저장
       await this.dbManager.saveSetting(`studyCount-${phone}`, result);
       
       return result;
     } catch (error) {
       console.error('신규 학습 기록 생성 오류:', error);
       
       // 오류 시 로컬 데이터만 생성
       const studyCount = {
         get_id_air: null,
         study_count: 0
       };
       
       await this.dbManager.saveSetting(`studyCount-${phone}`, studyCount);
       return studyCount;
     }
   }
   
   /**
    * 학습 카운트 업데이트
    * @param {string} recordId - 레코드 ID
    * @param {number} count - 업데이트할 카운트
    * @returns {Promise<boolean>} 업데이트 성공 여부
    */
   async updateStudyCount(recordId, count) {
     const phone = await this.dbManager.getSetting('currentPhoneNumber');
     
     // 로컬 데이터 업데이트
     const studyCount = await this.dbManager.getSetting(`studyCount-${phone}`);
     
     if (studyCount) {
       studyCount.study_count = count;
       await this.dbManager.saveSetting(`studyCount-${phone}`, studyCount);
     }
     
     // 오프라인 우선 모드이거나 오프라인 상태일 때 로컬 업데이트만 수행
     if (this.offlineFirst || !this.networkManager.isNetworkOnline()) {
       return true;
     }
     
     // 레코드 ID가 있을 때만 서버 업데이트 시도
     if (recordId) {
       try {
         const result = await this.airtableManager.updateStudyCount(recordId, count);
         return result;
       } catch (error) {
         console.warn('서버 학습 카운트 업데이트 실패:', error);
         // 동기화 큐에 추가 (향후 구현)
         return true; // 로컬 업데이트는 성공
       }
     }
     
     return true;
   }
   
   /**
    * 신규 단어 조회
    * @param {number} studyCount - 현재 학습 카운트
    * @returns {Promise<Array>} 단어 배열
    */
   async getNewWords(studyCount) {
     try {
       // 연결된 전화번호 가져오기
       const phone = await this.dbManager.getSetting('currentPhoneNumber');
       
       // 로컬 DB에서 미학습 단어 가져오기
       const localWords = await this.dbManager.getWords(
         { isStudied: "0" },
         10,
         { field: 'No', direction: 'asc' }
       );
       
       // 로컬에 충분한 단어가 있거나 오프라인 우선 모드면 바로 반환
       if (localWords.length >= 10 || this.offlineFirst || !this.networkManager.isNetworkOnline()) {
         return localWords;
       }
       
       // 온라인 모드: 서버에서 추가 단어 가져오기
       try {
         // 마지막 No 값 찾기
         let lastNo = studyCount;
         if (localWords.length > 0) {
           const maxNo = Math.max(...localWords.map(w => w.No));
           lastNo = Math.max(lastNo, maxNo);
         }
         
         const serverWords = await this.airtableManager.getNewWords(lastNo);
         
         if (serverWords && serverWords.length > 0) {
           // 서버 단어를 IndexedDB 형식으로 변환
           const formattedWords = serverWords.map(word => ({
             _id: word.airtableId + '-' + phone,
             word: word.word,
             meaning: word.meaning,
             pronunciation: word.pronunciation || '',
             airtableId: word.airtableId,
             No: parseInt(lastNo) + 1 + serverWords.indexOf(word),
             known_2: "0",
             status: "0",
             difficult: "0",
             phone: phone,
             updatedAt: new Date().toISOString(),
             studiedDate: new Date().toISOString(),
             isStudied: "0"
           }));
           
           // IndexedDB에 저장
           await this.dbManager.saveWords(formattedWords);
           
           // 모든 단어 반환 (로컬 + 서버)
           return [...localWords, ...formattedWords].slice(0, 10);
         }
       } catch (error) {
         console.warn('서버 단어 로드 실패:', error);
       }
       
       // 서버 로드에 실패하면 로컬 단어만 반환
       return localWords;
     } catch (error) {
       console.error('신규 단어 조회 오류:', error);
       return [];
     }
   }
   
   /**
    * 아이디로 단어 조회
    * @param {string} airtableId - 에어테이블 ID
    * @returns {Promise<Object>} 단어 정보
    */
   async getWordByAirtableId(airtableId) {
     try {
       // 캐시 확인
       const cacheKey = `word-${airtableId}`;
       const cachedData = this.cache.words.get(cacheKey);
       
       if (cachedData && (Date.now() - cachedData.timestamp < this.cacheTimeout)) {
         return cachedData.data;
       }
       
       // 로컬에서 먼저 찾기
       const localWords = await this.dbManager.getWords({ airtableId }, 1);
       
       if (localWords.length > 0) {
         // 캐시에 저장
         this.cache.words.set(cacheKey, {
           data: localWords[0],
           timestamp: Date.now()
         });
         
         return localWords[0];
       }
       
       // 온라인이고 오프라인 우선 모드가 아닐 때 서버에서 조회
       if (!this.offlineFirst && this.networkManager.isNetworkOnline()) {
         try {
           const word = await this.airtableManager.getWordByAirtableId(airtableId);
           
           if (word) {
             // 캐시에 저장
             this.cache.words.set(cacheKey, {
               data: word,
               timestamp: Date.now()
             });
             
             return word;
           }
         } catch (error) {
           console.warn('서버 단어 조회 실패:', error);
         }
       }
       
       return null;
     } catch (error) {
       console.error('단어 조회 오류:', error);
       return null;
     }
   }
   
   /**
    * 단어 번호로 단어 조회
    * @param {number} no - 단어 번호
    * @returns {Promise<Object>} 단어 정보
    */
   async getWordByNo(no) {
     try {
       // 번호를 숫자로 변환
       const numericNo = parseInt(no);
       if (isNaN(numericNo)) return null;
       
       // 로컬에서 먼저 찾기
       const localWords = await this.dbManager.getWords({ No: numericNo }, 1);
       
       if (localWords.length > 0) {
         return localWords[0];
       }
       
       // 온라인이고 오프라인 우선 모드가 아닐 때 서버에서 조회
       if (!this.offlineFirst && this.networkManager.isNetworkOnline()) {
         try {
           const word = await this.airtableManager.getWordByNo(numericNo);
           
           if (word) {
             // 변환 및 저장 (필요한 경우)
             return word;
           }
         } catch (error) {
           console.warn('서버 단어 조회 실패:', error);
         }
       }
       
       return null;
     } catch (error) {
       console.error('단어 조회 오류:', error);
       return null;
     }
   }
   
   /**
    * VipUp 데이터 조회 - 하이브리드 방식
    * @param {string} airtableId - 에어테이블 ID
    * @returns {Promise<string>} VipUp 데이터
    */
   async fetchVipUp(airtableId) {
     // DirectDataLoader가 있으면 사용
     if (this.directLoader) {
       return this.directLoader.loadVipUp(airtableId);
     }
     
     // 없으면 null 반환
     return null;
   }
   
   /**
    * 기존 방식의 VipUp 로드 (대체 방식)
    */
   async fetchClassicVipUp(airtableId) {
     if (!airtableId) return null;
     
     // 캐시 확인
     const cacheKey = `vipup-${airtableId}`;
     const cachedData = this.cache.vipup.get(cacheKey);
     
     if (cachedData && (Date.now() - cachedData.timestamp < this.cacheTimeout)) {
       return cachedData.data;
     }
     
     // 로컬에서 찾기
     const vipupData = await this.dbManager.getSetting(cacheKey);
     
     if (vipupData) {
       // 캐시에 저장
       this.cache.vipup.set(cacheKey, {
         data: vipupData,
         timestamp: Date.now()
       });
       
       return vipupData;
     }
     
     // 온라인이고 오프라인 우선 모드가 아닐 때 서버에서 조회
     if (!this.offlineFirst && this.networkManager.isNetworkOnline()) {
       try {
         // VipUp 캐시 매니저가 있으면 사용
         if (this.airtableManager.vipupCache) {
           const vipup = await this.airtableManager.vipupCache.fetchVipUp(airtableId);
           
           if (vipup) {
             // 로컬에도 저장
             await this.dbManager.saveSetting(cacheKey, vipup);
             
             // 캐시에 저장
             this.cache.vipup.set(cacheKey, {
               data: vipup,
               timestamp: Date.now()
             });
             
             return vipup;
           }
         } else {
           // VipUp 캐시 매니저가 없으면 직접 조회
           // NetworkManager가 프록시 지원하는지 확인
											if (this.networkManager && typeof this.networkManager.get === 'function') {
															// NetworkManager의 get 메서드는 이미 프록시를 지원하므로 isAirtable 플래그만 추가
															const response = await this.networkManager.get(url, {}, true); // 세 번째 파라미터 true = isAirtable

															if (response && response.fields && response.fields.vipup && response.fields.vipup !== 'KBsbCRkz') {
																			const vipup = response.fields.vipup;

																			// 로컬에도 저장
																			await this.dbManager.saveSetting(cacheKey, vipup);

																			// 캐시에 저장
																			this.cache.vipup.set(cacheKey, {
																							data: vipup,
																							timestamp: Date.now()
																			});

																			return vipup;
															}
											} else {
															console.warn('NetworkManager를 사용할 수 없습니다');
											}
           
           if (response && response.fields && response.fields.vipup && response.fields.vipup !== 'KBsbCRkz') {
             const vipup = response.fields.vipup;

             // 로컬에도 저장
             await this.dbManager.saveSetting(cacheKey, vipup);

             // 캐시에 저장
             this.cache.vipup.set(cacheKey, {
               data: vipup,
               timestamp: Date.now()
             });

             return vipup;
           }
         }
       } catch (error) {
         console.warn('서버 VipUp 조회 실패:', error);
       }
     }
     
     return null;
   }
   
   /**
    * 단어의 미디어 정보 로드
    * @param {string} airtableId - 에어테이블 ID
    * @returns {Promise<Object>} 미디어 정보
    */
   async getWordMedia(airtableId) {
     // DirectDataLoader를 통해 vipup만 로드
     const vipup = await this.fetchVipUp(airtableId);
     
     return {
       vipup,
       hasMedia: !!vipup,
       isOfflineMode: !this.networkManager.isNetworkOnline()
     };
   }
   
   /**
    * 단어 데이터 새로고침 (암기중/고난도 모드용)
    * @param {string} airtableId - 에어테이블 ID
    * @returns {Promise<Object>} 업데이트된 단어 데이터
    */
   async refreshWordData(airtableId) {
     // DirectDataLoader 사용 시 refreshWordData 불필요
     console.log('DirectDataLoader 사용 시 refreshWordData 불필요');
     return null;
   }
   
   /**
    * 단어 학습 진행 시 호출 (에어테이블 데이터 선제적 로드)
    * @param {Array} words - 현재 학습 중인 단어 배열
    */
   async preloadWordMediaData(words) {
     // DirectDataLoader 사용 시 preloadWordMediaData 불필요
     console.log('DirectDataLoader 사용 시 preloadWordMediaData 불필요');
     return;
   }
   
   /**
    * 캐시 정리 요청
    */
   async cleanupCache() {
     // 메모리 캐시만 정리
     this.cache.studyCount.clear();
     this.cache.words.clear();
     this.cache.vipup.clear();
     console.log('AirtableManagerAdapter 캐시 정리 완료');
   }
   
   // 추가: tableName과 wordTable 접근자
   get tableName() {
     return this.airtableManager.tableName;
   }
   
   get wordTable() {
     return this.airtableManager.wordTable;
   }
   
   // 속성 전달 (기존 AirtableManager와 호환성 유지)
   get apiKey() {
     return this.airtableManager.apiKey;
   }
   
   get baseUrl() {
     return this.airtableManager.baseUrl;
   }
   
   get challengeTable() {
     return this.airtableManager.challengeTable;
   }
   
   get contents() {
     return this.airtableManager.contents;
   }
   
   get contentsBaseUrl() {
     return this.airtableManager.contentsBaseUrl;
   }
 }
 
 // 전역 객체로 노출 (모듈 시스템을 사용하지 않음)
 window.AirtableManagerAdapter = AirtableManagerAdapter;
}