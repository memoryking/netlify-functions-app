/**
 * 데이터 로더 클래스
 * 초기 데이터 로드 및 동기화 처리
 */
if (typeof window.DataLoader === 'undefined') {
  class DataLoader {
  constructor(dbManager, airtableManager, networkManager) {
    this.dbManager = dbManager;
    this.airtableManager = airtableManager;
    this.networkManager = networkManager;
    this.batchSize = 20; // 한 번에 로드할 단어 수
    this.isLoading = false;
    this.hybridLoader = null; // HybridDataLoader 참조 저장용
  }
  
  /**
   * HybridDataLoader 설정
   * @param {HybridDataLoader} loader - 하이브리드 로더 인스턴스
   */
  setHybridLoader(loader) {
    this.hybridLoader = loader;
    console.log('HybridDataLoader 설정 완료');
  }
  
  /**
   * 초기 데이터 로드 필요 여부 확인
   * @returns {Promise<boolean>} 초기 로드 필요 여부
   */
  async isInitialLoadRequired() {
    // DB 초기화
    if (!this.dbManager.db) {
      await this.dbManager.initDatabase();
    }
    
    try {
      // 단어 수 확인
      const wordCount = await this.dbManager.getWordCount();
      const lastSyncTime = await this.dbManager.getSetting('lastSyncTime');
      
      // 단어가 없거나 마지막 동기화가 없으면 초기 로드 필요
      return wordCount === 0 || !lastSyncTime;
    } catch (error) {
      console.error('초기 로드 필요 여부 확인 오류:', error);
      return true; // 오류 발생 시 안전하게 초기 로드
    }
  }
  
  /**
   * 모든 단어 로드
   * @param {string} contents - 콘텐츠 ID
   * @returns {Promise<boolean>} 로드 성공 여부
   */
  async loadAllWords(contents) {
    if (this.isLoading) {
      console.log('이미 데이터 로드 중입니다');
      return false;
    }
    
    if (!this.networkManager.isNetworkOnline()) {
      console.error('오프라인 상태에서 데이터를 로드할 수 없습니다');
      return false;
    }
    
    this.isLoading = true;
    let loadedCount = 0;
    let totalCount = 0;
    let loadedWords = []; // 로드된 단어 배열 추가
    
    try {
      // 로딩 시작 메시지 표시
      this.showLoadingMessage('단어 데이터 로딩 중...');
      
      // 총 단어 수 확인
      totalCount = await this.getTotalWordCount(contents);
      
      if (totalCount === 0) {
        console.error('불러올 단어가 없습니다');
        this.showLoadingMessage('불러올 단어가 없습니다', 'error');
        return false;
      }
      
      // 진행 상태 업데이트
      this.updateLoadingProgress(0, totalCount);
      
      // 배치로 단어 로드
      let offset = 0;
      let hasMore = true;
      
      while (hasMore && this.networkManager.isNetworkOnline()) {
        const words = await this.loadWordBatch(contents, offset, this.batchSize);
        
        if (!words || words.length === 0) {
          hasMore = false;
          break;
        }
        
        // 단어 저장 (내부적으로 처리)
        await this.saveWordBatch(words);
        
        // 로드된 단어 배열에 추가
        loadedWords = loadedWords.concat(words);
        
        loadedCount += words.length;
        offset += words.length;
        
        // 진행 상태 업데이트
        this.updateLoadingProgress(loadedCount, totalCount);
        
        // 다음 배치 전 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // 마지막 동기화 시간 업데이트
      await this.dbManager.saveSetting('lastSyncTime', new Date().toISOString());
      await this.dbManager.saveSetting('initialDataLoaded', true);
      
      // 새로운 로직: VipUp 데이터 함께 로드 (HybridDataLoader가 있을 경우)
      if (this.hybridLoader && loadedWords.length > 0 && typeof this.hybridLoader.preloadOfflineData === 'function') {
        try {
          this.showLoadingMessage(`단어 로드 완료! VipUp 데이터 로드 중... (${loadedCount}/${totalCount})`, 'info');
          
          // airtableId가 있는 단어만 필터링
          const wordIdsToLoad = loadedWords
            .filter(word => word && word.airtableId)
            .map(word => ({ airtableId: word.airtableId }));
          
          console.log(`VipUp 캐싱을 위해 ${wordIdsToLoad.length}개 단어 준비 중...`);
          
          // 방어적 코딩: 빈 배열이면 건너뛰기
          let vipupCount = 0;
          if (wordIdsToLoad.length > 0) {
            vipupCount = await this.hybridLoader.preloadOfflineData(wordIdsToLoad);
            console.log(`VipUp 캐싱 완료: ${vipupCount}개 항목 캐싱됨`);
          }
          
          this.showLoadingMessage(`모든 데이터 로드 완료! ${loadedCount}개 단어, ${vipupCount}개 VipUp 로드됨`, 'success');
        } catch (error) {
          console.error('VipUp 데이터 로드 중 오류:', error);
          // VipUp 로드 실패해도 전체 로드는 성공으로 간주
          this.showLoadingMessage(`단어 로드 완료! ${loadedCount}개 단어가 로드되었습니다 (VipUp 로드 실패)`, 'success');
        }
      } else {
        // 로딩 완료 메시지
        this.showLoadingMessage(`로딩 완료! ${loadedCount}개 단어가 로드되었습니다`, 'success');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500)); // 완료 메시지 노출 시간
      this.hideLoadingMessage();
      
      return loadedCount > 0;
    } catch (error) {
      console.error('단어 로드 오류:', error);
      this.showLoadingMessage('단어 로드 중 오류가 발생했습니다', 'error');
      return false;
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * 총 단어 수 확인
   * @param {string} contents - 콘텐츠 ID
   * @returns {Promise<number>} 총 단어 수
   */
  async getTotalWordCount(contents) {
    try {
      // Airtable API URL 구성
      const baseUrl = this.airtableManager.contentsBaseUrl;
      const tableId = this.airtableManager.wordTable;
      const apiKey = this.airtableManager.apiKey;
      
      // 필터 조건 구성 (contents 파라미터 사용)
      let url = `${baseUrl}/${tableId}?maxRecords=1&sort[0][field]=No&sort[0][direction]=desc`;
      
      // API 요청
      const response = await this.networkManager.get(url, {
        'Authorization': `Bearer ${apiKey}`
      });
      
      if (!response || !response.records || response.records.length === 0) {
        return 0;
      }
      
      // 마지막 단어의 No가 총 단어 수
      return parseInt(response.records[0].fields.No) || 0;
    } catch (error) {
      console.error('총 단어 수 확인 오류:', error);
      return 0;
    }
  }
  
  /**
   * 단어 배치 로드
   * @param {string} contents - 콘텐츠 ID
   * @param {number} offset - 시작 위치
   * @param {number} batchSize - 배치 크기
   * @returns {Promise<Array>} 단어 배열
   */
  async loadWordBatch(contents, offset, batchSize) {
    try {
      // Airtable API URL 구성
      const baseUrl = this.airtableManager.contentsBaseUrl;
      const tableId = this.airtableManager.wordTable;
      const apiKey = this.airtableManager.apiKey;
      
      console.log(`단어 배치 로드: offset=${offset}, batchSize=${batchSize}`);
      
      // No 필드 기준 정렬하여 가져오기
      let url = `${baseUrl}/${tableId}?maxRecords=${batchSize}&sort[0][field]=No&sort[0][direction]=asc`;
      
      // 오프셋 사용 (Airtable은 이를 직접 지원하지 않으므로 No 필드로 필터링)
      if (offset > 0) {
        const formula = encodeURIComponent(`{No} > ${offset}`);
        url += `&filterByFormula=${formula}`;
      }
      
      // API 요청
      const response = await this.networkManager.get(url, {
        'Authorization': `Bearer ${apiKey}`
      });
      
      if (!response || !response.records) {
        console.warn('Airtable API 응답이 없거나 records 필드가 없습니다.');
        return [];
      }
      
      console.log(`Airtable에서 ${response.records.length}개 단어 가져옴`);
      
      // 현재 전화번호 가져오기
      const phone = await this.dbManager.getSetting('currentPhoneNumber');
      
      // 결과 매핑 및 정제
      const processedWords = response.records.map((record, index) => {
        // 기본 단어 데이터 가공
        const wordData = {
          _id: record.id, // Airtable의 레코드 ID를 기본 키로 사용
          word: this.safeTrim(record.fields.word) || '',
          meaning: this.safeTrim(record.fields.meaning) || '',
          pronunciation: this.safeTrim(record.fields.pronunciation) || '',
          airtableId: record.id,
          No: parseInt(record.fields.No) || 0,
          known_2: "0", // 기본값 설정
          status: "0",
          difficult: 0,
          phone: phone, // 현재 사용자 전화번호
          updatedAt: new Date().toISOString(),
          studiedDate: new Date().toISOString(),
          isStudied: "0", // 문자열로 변경
          contents: contents // 컨텐츠 ID 저장
        };
        
								// vipup 필드 안전하게 처리
								if (record.fields.hasOwnProperty('vipup')) {
										try {
												const vipupValue = record.fields.vipup;
												
												// null, undefined 체크
												if (vipupValue === null || vipupValue === undefined) {
														wordData.vipup = '';
												}
												// 빈 문자열 체크
												else if (vipupValue === '') {
														wordData.vipup = '';
												}
												// 문자열인 경우 암호화
												else if (typeof vipupValue === 'string') {
														// VipUpEncryption 사용 가능한지 확인
														if (window.VipUpEncryption && typeof window.VipUpEncryption.encrypt === 'function') {
																wordData.vipup = window.VipUpEncryption.encrypt(vipupValue);
																console.log('VipUp 암호화 적용됨');
														} else {
																console.warn('VipUpEncryption을 찾을 수 없습니다. 원본 저장');
																wordData.vipup = vipupValue;
														}
												}
												// 배열인 경우 특별 처리
												else if (Array.isArray(vipupValue)) {
														if (vipupValue.length === 0) {
																wordData.vipup = '';
														} else if (vipupValue.length === 1 && typeof vipupValue[0] === 'string') {
																// 단일 항목 배열은 첫 번째 요소만 추출하여 암호화
																if (window.VipUpEncryption && typeof window.VipUpEncryption.encrypt === 'function') {
																		wordData.vipup = window.VipUpEncryption.encrypt(vipupValue[0]);
																} else {
																		wordData.vipup = vipupValue[0];
																}
														} else {
																// 복잡한 배열은 JSON 문자열로 변환 후 암호화
																try {
																		const jsonStr = JSON.stringify(vipupValue);
																		if (window.VipUpEncryption && typeof window.VipUpEncryption.encrypt === 'function') {
																				wordData.vipup = window.VipUpEncryption.encrypt(jsonStr);
																		} else {
																				wordData.vipup = jsonStr;
																		}
																} catch (e) {
																		console.warn('vipup 배열 JSON 변환 실패:', e);
																		wordData.vipup = String(vipupValue);
																}
														}
												}
												// 객체인 경우 JSON으로 변환 후 암호화
												else if (typeof vipupValue === 'object') {
														try {
																const jsonStr = JSON.stringify(vipupValue);
																if (window.VipUpEncryption && typeof window.VipUpEncryption.encrypt === 'function') {
																		wordData.vipup = window.VipUpEncryption.encrypt(jsonStr);
																} else {
																		wordData.vipup = jsonStr;
																}
														} catch (e) {
																console.warn('vipup 객체 JSON 변환 실패:', e);
																wordData.vipup = String(vipupValue);
														}
												}
												// 기타 모든 타입은 문자열로 변환 후 암호화
												else {
														const strValue = String(vipupValue);
														if (window.VipUpEncryption && typeof window.VipUpEncryption.encrypt === 'function') {
																wordData.vipup = window.VipUpEncryption.encrypt(strValue);
														} else {
																wordData.vipup = strValue;
														}
												}
										} catch (e) {
												console.error('vipup 필드 처리 중 오류:', e);
												wordData.vipup = ''; // 오류 발생 시 빈 문자열 설정
										}
								} else {
										// vipup 필드가 없으면 빈 문자열 설정
										wordData.vipup = '';
								}
        
        // 첫 번째와 마지막 단어는 디버깅을 위해 상세 로깅
        if (index === 0 || index === response.records.length - 1) {
          const logInfo = {
            wordId: wordData._id,
            word: wordData.word,
            no: wordData.No,
            vipupType: typeof wordData.vipup,
            vipupLength: wordData.vipup ? wordData.vipup.length : 0
          };
          console.log(`단어 처리 ${index === 0 ? '첫번째' : '마지막'} 항목:`, logInfo);
        }
        
        return wordData;
      });
      
      // 처리 결과 요약 로그
      console.log(`단어 배치 처리 완료: ${processedWords.length}개`);
      
      return processedWords;
    } catch (error) {
      console.error('단어 배치 로드 오류:', error);
      return [];
    }
  }

  /**
   * 문자열 안전하게 공백 제거 (trim)
   * 문자열이 아닌 값은 변환 후 처리
   */
  safeTrim(value) {
    if (value === null || value === undefined) return '';
    
    try {
      if (typeof value === 'string') {
        return value.trim();
      } else {
        return String(value).trim();
      }
    } catch (e) {
      console.warn('safeTrim 오류:', e);
      return String(value);
    }
  }
  
  /**
   * 단어 배치 저장
   * @param {Array} words - 단어 배열
   * @returns {Promise<boolean>} 저장 성공 여부
   */
  async saveWordBatch(words) {
    if (!words || words.length === 0) {
      return false;
    }
    
    try {
      // IndexedDB에 저장
      await this.dbManager.saveWords(words);
      return true;
    } catch (error) {
      console.error('단어 배치 저장 오류:', error);
      return false;
    }
  }
  
  /**
   * 로딩 진행 상태 업데이트
   * @param {number} current - 현재 로드된 수
   * @param {number} total - 총 단어 수
   */
  updateLoadingProgress(current, total) {
    const percent = Math.floor((current / total) * 100);
    
    // 새로운 다운로드 오버레이 사용
    if (typeof window.updateDownloadProgress === 'function') {
      window.updateDownloadProgress(percent);
      
      // 서브타이틀 업데이트
      const overlay = document.getElementById('downloadOverlay');
      if (overlay) {
        const subtitleElement = overlay.querySelector('.download-subtitle');
        if (subtitleElement) {
          subtitleElement.textContent = `${current}/${total} 단어 로드됨`;
        }
      }
      return;
    }
    
    // 폴백: 기존 방식 사용 (만약 새 함수가 없는 경우)
    const loadingElement = document.getElementById('data-loading-progress');
    if (!loadingElement) return;
    
    loadingElement.textContent = `${current}/${total} (${percent}%)`;
    
    const progressBar = document.getElementById('data-loading-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }
  
  /**
   * 로딩 메시지 표시
   * @param {string} message - 표시할 메시지
   * @param {string} type - 메시지 유형 (info, success, error)
   */
  showLoadingMessage(message, type = 'info') {
			// 초기화 중이면 다운로드 오버레이 표시하지 않음
    if (message.includes('초기화') || message.includes('로딩 중')) {
        console.log(message);
        return;
    }
    // 새로운 다운로드 오버레이 사용
    if (typeof window.showDownloadOverlay === 'function') {
      // 메시지 타입에 따라 처리
      if (type === 'success' || type === 'error') {
        // 성공 또는 오류 시 100% 표시
        window.showDownloadOverlay(100);
        
        // 오버레이 내용 업데이트
        const overlay = document.getElementById('downloadOverlay');
        if (overlay) {
          const textElement = overlay.querySelector('.download-text');
          if (textElement) {
            textElement.textContent = message;
          }
          
          // 아이콘 업데이트
          const iconElement = overlay.querySelector('.download-icon');
          if (iconElement) {
            if (type === 'success') {
              iconElement.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
            } else if (type === 'error') {
              iconElement.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
            }
          }
        }
      } else {
        // 일반 로딩 메시지
        window.showDownloadOverlay(0);
        
        // 메시지 업데이트
        const overlay = document.getElementById('downloadOverlay');
        if (overlay) {
          const textElement = overlay.querySelector('.download-text');
          if (textElement) {
            textElement.textContent = message;
          }
        }
      }
      return;
    }
    
    // 폴백: showDownloadOverlay 함수가 없는 경우
    console.warn('showDownloadOverlay 함수를 찾을 수 없습니다.');
  }
  
  /**
   * 로딩 메시지 숨기기
   */
  hideLoadingMessage() {
    // 새로운 다운로드 오버레이 숨기기
    if (typeof window.hideDownloadOverlay === 'function') {
      window.hideDownloadOverlay();
      return;
    }
    
    // 폴백: 기존 방식 사용
    const loadingElement = document.getElementById('data-loading-container');
    if (loadingElement) {
      loadingElement.style.opacity = '0';
      loadingElement.style.transition = 'opacity 0.3s ease';
      
      setTimeout(() => {
        if (loadingElement.parentNode) {
          loadingElement.parentNode.removeChild(loadingElement);
        }
      }, 300);
    }
  }
}

// 전역 객체로 노출
window.DataLoader = DataLoader;
}