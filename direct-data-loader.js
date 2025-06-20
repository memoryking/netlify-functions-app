/**
* 간소화된 DirectDataLoader 클래스
* vipup 데이터를 직접 인덱스DB에서만 가져오는 방식
* - 싱글톤 패턴 적용
* - 중복 선언 방지 기능 추가
*/
if (typeof window.DirectDataLoader === 'undefined') {
 class DirectDataLoader {
   static instance = null;
   
   static getInstance(dbManager) {
       if (!DirectDataLoader.instance) {
           DirectDataLoader.instance = new DirectDataLoader(dbManager);
       }
       return DirectDataLoader.instance;
   }
   
   constructor(dbManager) {
       // 싱글톤 체크
       if (DirectDataLoader.instance) {
           return DirectDataLoader.instance;
       }
       
       this.dbManager = dbManager;
       this.initialized = false;
       this.isInitializing = false;
       
       // 캐시 설정 (기존 HybridDataLoader와 호환성 유지)
       this.cache = new Map();
       this.lastCacheCleanup = Date.now();
       
       // 싱글톤 인스턴스 설정
       DirectDataLoader.instance = this;
       
       console.log('DirectDataLoader 생성됨');
   }

   /**
    * 초기화 메서드 (HybridDataLoader 호환성)
    * @returns {Promise<boolean>} 초기화 성공 여부
    */
   async initialize() {
     if (this.initialized) {
       return true;
     }
     
     if (this.isInitializing) {
       // 이미 초기화 중이면 완료될 때까지 대기
       return new Promise(resolve => {
         const checkInterval = setInterval(() => {
           if (this.initialized) {
             clearInterval(checkInterval);
             resolve(true);
           }
         }, 100);
       });
     }
     
     this.isInitializing = true;
     
     try {
       // 여기서는 특별한 초기화 작업이 필요 없음
       this.initialized = true;
       this.isInitializing = false;
       console.log('DirectDataLoader 초기화 완료');
       return true;
     } catch (error) {
       console.error('DirectDataLoader 초기화 오류:', error);
       this.isInitializing = false;
       return false;
     }
   }

			/**
				* 단어의 VipUp 데이터 로드 (암호화된 데이터를 복호화하여 반환)
				* @param {string} airtableId - 에어테이블 ID
				* @returns {Promise<string>} VipUp 데이터
				*/
			async loadVipUp(airtableId) {
					if (!airtableId) return '';
					
					try {
							// DB에서 단어 가져오기
							const words = await this.dbManager.getWords({ airtableId }, 1);
							
							if (words.length > 0 && words[0].vipup) {
									const encryptedVipup = words[0].vipup;
									
									// VipUpEncryption이 실제 암호화 클래스인지 확인
									if (window.VipUpEncryption && 
													typeof window.VipUpEncryption.decrypt === 'function' &&
													typeof window.VipUpEncryption.isEncrypted === 'function') {
											
											try {
													// 암호화된 데이터인지 확인
													if (window.VipUpEncryption.isEncrypted(encryptedVipup)) {
															// 복호화
															const decrypted = window.VipUpEncryption.decrypt(encryptedVipup);
															console.log(`VipUp 복호화 성공 (${airtableId})`);
															return decrypted;
													} else {
															// 암호화되지 않은 데이터
															console.log(`VipUp이 암호화되지 않은 상태 (${airtableId})`);
															return encryptedVipup;
													}
											} catch (error) {
													console.error(`VipUp 복호화 실패 (${airtableId}):`, error);
													return encryptedVipup; // 복호화 실패 시 원본 반환
											}
									} else {
											// VipUpEncryption이 없거나 더미 클래스인 경우
											console.log('VipUpEncryption이 없거나 더미 클래스입니다. 원본 반환');
											return encryptedVipup;
									}
							}
							
							return '';
					} catch (error) {
							console.error(`VipUp 로드 오류 (${airtableId}):`, error);
							return '';
					}
			}

   /**
    * getVipUp 메서드 (HybridDataLoader 호환성)
    * @param {string} airtableId - 에어테이블 ID
    * @returns {Promise<string|null>} VipUp 데이터 또는 null
    */
   async getVipUp(airtableId) {
     return this.loadVipUp(airtableId);
   }

   /**
    * 여러 단어의 VipUp 데이터 일괄 가져오기 (HybridDataLoader 호환성)
    * @param {string[]} airtableIds - 에어테이블 ID 배열
    * @returns {Promise<Object>} ID를 키로 하는 VipUp 데이터 객체
    */
   async getMultipleVipUps(airtableIds) {
     if (!airtableIds || !Array.isArray(airtableIds) || airtableIds.length === 0) {
       return {};
     }
     
     try {
       const result = {};
       
       // 각 단어에 대해 VipUp 로드
       for (const id of airtableIds) {
         if (id) {
           const vipup = await this.loadVipUp(id);
           if (vipup) {
             result[id] = vipup;
           }
         }
       }
       
       return result;
     } catch (error) {
       console.error('getMultipleVipUps 오류:', error);
       return {};
     }
   }

   /**
    * 단어 학습을 위한 데이터 로드 메서드 (간소화)
    */
   async preloadOfflineData(words) {
     // 아무 작업도 하지 않음 - 모든 데이터는 이미 IndexedDB에 저장되어 있음
     return words ? words.length : 0;
   }

   /**
    * VipUp 캐시 갱신 필요 여부 확인 (HybridDataLoader 호환성)
    * @returns {Promise<boolean>} 갱신 필요 여부
    */
   async shouldRefreshVipUpCache() {
     // DirectDataLoader에서는 항상 false 반환 (갱신 불필요)
     return false;
   }

   /**
    * 백그라운드 캐싱 시작 (HybridDataLoader 호환성)
    * @returns {Promise<boolean>} 성공 여부
    */
   async startBackgroundCaching() {
     // DirectDataLoader에서는 아무 작업도 수행하지 않음
     console.log('DirectDataLoader: 백그라운드 캐싱 요청 무시됨');
     return true;
   }

   /**
    * 모든 VipUp 데이터 갱신 (HybridDataLoader 호환성)
    * @returns {Promise<boolean>} 성공 여부
    */
   async refreshAllVipUpData() {
     // DirectDataLoader에서는 아무 작업도 수행하지 않음
     console.log('DirectDataLoader: VipUp 데이터 갱신 요청 무시됨');
     return true;
   }

   /**
    * 캐시 정리 (HybridDataLoader 호환성)
    * @returns {Promise<number>} 제거된 항목 수
    */
   async cleanupCache() {
     // DirectDataLoader에서는 아무 작업도 수행하지 않음
     console.log('DirectDataLoader: 캐시 정리 요청 무시됨');
     return 0;
   }
 }

 // 전역 객체로 노출
 window.DirectDataLoader = DirectDataLoader;
 console.log('DirectDataLoader 클래스가 성공적으로 정의되었습니다.');
} else {
 console.log('DirectDataLoader 클래스가 이미 정의되어 있어 다시 로드하지 않습니다.');
}

// VipUpEncryption이 없는 경우 더미 객체 생성 - 체크 후 생성 방식으로 수정
if (typeof window.VipUpEncryption === 'undefined') {
 // 함수가 아닌 객체로 설정하는 버그 수정
 window.VipUpEncryption = function() {};
 window.VipUpEncryption.prototype.encrypt = function(text) { return text; };
 window.VipUpEncryption.prototype.decrypt = function(text) { return text; };
 window.VipUpEncryption.prototype.isEncrypted = function(text) { return false; };
 console.log('VipUpEncryption 더미 클래스 생성됨');
}