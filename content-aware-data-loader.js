/**
 * ContentAwareDataLoader 클래스
 * 콘텐츠 ID에 따라 데이터 로딩 방식을 조정하는 확장된 데이터 로더
 * 필터를 사용하지 않고 전체 데이터를 다운로드하여 IndexedDB에 저장
 * Netlify 프록시 지원 추가
 */
class ContentAwareDataLoader {
  constructor(dbManager, airtableManager, networkManager) {
    this.dbManager = dbManager;
    this.airtableManager = airtableManager;
    this.networkManager = networkManager;
    
    // 설정
    this.pageSize = 100; // 한 번에 가져올 최대 레코드 수
    this.maxRetries = 3;  // 최대 재시도 횟수
    this.requestDelay = 300; // 연속 요청 사이의 지연시간 (ms)
    
    // 상태 관리
    this._loadingPromise = null;
    this._isLoading = false;
    this._lastLoadedContent = null;
    
    // 로그 및 진행 정보
    this.progressCallback = null;
    this.loadStats = {
      totalRecords: 0,
      loadedRecords: 0,
      startTime: null,
      endTime: null
    };
    
    // 오프라인 모드 설정
    this._offlineMode = false;
    
    // Netlify 환경 감지
    this.isNetlifyEnvironment = window.ENV_CONFIG?.isNetlify || 
                                (window.location.hostname.includes('netlify.app') || 
                                 window.location.hostname.includes('netlify.com'));
  }

  /**
   * 오프라인 모드 설정
   * @param {boolean} isOffline - 오프라인 모드 여부
   */
  setOfflineMode(isOffline) {
    this._offlineMode = !!isOffline;
    console.log(`오프라인 모드 ${this._offlineMode ? '활성화' : '비활성화'}`);
  }

  /**
   * 진행상황 콜백 설정
   * @param {Function} callback - 진행상황 콜백 함수
   */
  setProgressCallback(callback) {
    if (typeof callback === 'function') {
      this.progressCallback = callback;
    }
  }

  /**
   * 초기 로드 필요 여부 확인
   * @returns {Promise<boolean>} 초기 로드 필요 여부
   */
  async isInitialLoadRequired() {
    try {
      // 로드된 단어가 있는지 확인
      const wordCount = await this.dbManager.getWordCount({});
      
      console.log(`현재 로드된 단어 수: ${wordCount}`);
      
      // 단어가 없으면 초기 로드 필요
      if (wordCount === 0) {
        console.log('로드된 단어가 없어 초기화가 필요합니다.');
        return true;
      }
      
      // 마지막 로드 시간 확인
      const lastLoadTime = await this.dbManager.getSetting('lastLoadTime');
      
      // 마지막 로드 시간이 없으면 초기 로드 필요
      if (!lastLoadTime) {
        console.log('마지막 로드 시간 정보가 없어 초기화가 필요합니다.');
        return true;
      }
      
      // 마지막 로드 확인 (1주일 이상 지났으면 로드)
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (lastLoadTime < oneWeekAgo) {
        console.log('마지막 로드 이후 1주일이 지나 재로드가 필요합니다.');
        return true;
      }
      
      console.log('초기 데이터 로드가 필요하지 않습니다.');
      return false;
    } catch (error) {
      console.error('초기 로드 필요 여부 확인 오류:', error);
      return true; // 오류 발생 시 안전하게 초기 로드 수행
    }
  }

  /**
   * API 요청 수행 (프록시 지원)
   * @param {string} url - API URL
   * @param {Object} headers - 요청 헤더
   * @returns {Promise<Object>} API 응답
   */
  async makeApiRequest(url, headers = {}) {
    // Netlify 환경에서 프록시 사용
    if (this.isNetlifyEnvironment) {
      const proxyUrl = window.ENV_CONFIG?.proxyUrl || '/.netlify/functions/airtable-proxy';
      
      try {
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: url,
            method: 'GET'
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `프록시 오류: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('프록시 API 요청 오류:', error);
        throw error;
      }
    }
    
    // 개발 환경에서는 직접 요청
    if (this.networkManager && typeof this.networkManager.get === 'function') {
      return await this.networkManager.get(url, headers, true);
    } else {
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        throw new Error(`HTTP 오류: ${response.status}`);
      }
      return await response.json();
    }
  }

  /**
   * 모든 단어 로드 - 필터링 없이 전체 데이터 로드
   * @param {string} contentId - 콘텐츠 ID
   * @returns {Promise<boolean>} 로드 성공 여부
   */
  async loadAllWords(contentId) {
    // 이미 로딩 중이면 진행 중인 프로미스 반환
    if (this._isLoading && this._loadingPromise) {
      console.log('이미 단어 로딩이 진행 중입니다.');
      return this._loadingPromise;
    }

    // 로딩 상태 초기화
    this._isLoading = true;
    this.loadStats = {
      totalRecords: 0,
      loadedRecords: 0,
      startTime: Date.now(),
      endTime: null
    };
    
    // 로딩 프로미스 생성
    this._loadingPromise = (async () => {
      try {
        // DB 연결 확인 및 초기화
        if (this.dbManager && typeof this.dbManager.initDatabase === 'function') {
          console.log('DB 연결 확인 중...');
          await this.dbManager.initDatabase();
          console.log('DB 연결 완료');
        }
        
        // 기존 데이터 확인
        const existingWordCount = await this.dbManager.getWordCount({});
        console.log(`기존 데이터: ${existingWordCount}개 단어`);
        
        // 오프라인 상태 확인
        let isOffline = this._offlineMode;
        
        if (this.networkManager && typeof this.networkManager.isNetworkOnline === 'function') {
          isOffline = isOffline || !this.networkManager.isNetworkOnline();
        } else {
          isOffline = isOffline || !navigator.onLine;
        }
        
        if (isOffline) {
          console.log('오프라인 상태: 로컬 데이터를 확인합니다.');
          
          if (existingWordCount > 0) {
            console.log(`로컬에 ${existingWordCount}개 단어가 있습니다. 오프라인 모드로 계속합니다.`);
            
            if (this.progressCallback) {
              this.progressCallback({
                status: 'complete',
                message: `오프라인 모드: ${existingWordCount}개 단어 사용 가능`,
                progress: 100
              });
            }
            
            return true;
          }
          
          console.log('오프라인 상태이며 로컬 데이터가 없습니다.');
          
          if (this.progressCallback) {
            this.progressCallback({
              status: 'error',
              message: '오프라인 상태에서 데이터를 찾을 수 없습니다.',
              progress: 0
            });
          }
          
          return false;
        }
        
        // 이미 데이터가 있으면 다운로드 필요 없음
        if (existingWordCount > 0) {
          console.log(`이미 ${existingWordCount}개 단어가 있습니다. 추가 다운로드 필요 없음.`);
          
          if (this.progressCallback) {
            this.progressCallback({
              status: 'complete',
              message: `${existingWordCount}개 단어 사용 가능`,
              progress: 100
            });
          }
          
          return true;
        }
        
        // 실제로 다운로드가 필요한 경우에만 오버레이 표시
        console.log('새 데이터 다운로드가 필요합니다. 다운로드 오버레이 표시...');
        
        if (typeof window.showDownloadOverlay === 'function') {
          window.showDownloadOverlay(0);
        }
        
        if (this.progressCallback) {
          this.progressCallback({
            status: 'start',
            message: '단어 로드 시작...',
            progress: 0
          });
        }

        // 전체 단어 수 확인
        const totalCount = await this.getTotalWordCount(contentId);
        if (totalCount <= 0) {
          console.log('불러올 단어가 없습니다');
          
          if (typeof window.hideDownloadOverlay === 'function') {
            window.hideDownloadOverlay();
          }
          
          return false;
        }
        
        this.loadStats.totalRecords = totalCount;
        console.log(`총 ${totalCount}개 단어를 로드합니다.`);
        
        // 데이터 페이지네이션으로 가져오기
        let allRecords = [];
        let offset = null;
        let hasMore = true;
        let page = 0;
        let retryCount = 0;
        
        while (hasMore) {
          page++;
          
          // 네트워크 상태 확인
          let isNetworkOffline = false;
          if (this.networkManager && typeof this.networkManager.isNetworkOnline === 'function') {
            isNetworkOffline = !this.networkManager.isNetworkOnline();
          } else {
            isNetworkOffline = !navigator.onLine;
          }
          
          if (isNetworkOffline) {
            console.log('오프라인 상태가 감지되어 로드를 중단합니다.');
            this.setOfflineMode(true);
            break;
          }
          
          try {
            // 진행 상황 업데이트
            const progress = Math.min(
              (this.loadStats.loadedRecords / (this.loadStats.totalRecords || 1)) * 100, 
              95
            );
            
            if (typeof window.updateDownloadProgress === 'function') {
              window.updateDownloadProgress(progress);
            }
            
            const downloadText = document.querySelector('#downloadOverlay .download-text');
            if (downloadText) {
              downloadText.textContent = `페이지 ${page} 다운로드 중...`;
            }
            
            if (this.progressCallback) {
              this.progressCallback({
                status: 'loading',
                message: `페이지 ${page} 로드 중...`,
                progress: progress,
                page: page,
                loaded: this.loadStats.loadedRecords,
                total: this.loadStats.totalRecords
              });
            }
            
            // URL 구성
            const url = this.buildApiUrl(offset);
            console.log(`페이지 ${page} 로드 중... (${this.loadStats.loadedRecords}/${totalCount})`);
            
            // API 호출 헤더 준비 (프록시 사용 시에는 필요 없음)
            const headers = this.isNetlifyEnvironment ? {} : {
              'Authorization': `Bearer ${this.airtableManager?.apiKey || ''}`,
              'Content-Type': 'application/json'
            };
            
            // API 호출
            const response = await this.makeApiRequest(url, headers);
            
            // 응답 확인
            if (!response || !response.records || !Array.isArray(response.records)) {
              console.error('API 응답 형식이 올바르지 않습니다:', response);
              throw new Error('API 응답 형식이 올바르지 않습니다');
            }
            
            console.log(`페이지 ${page} 응답: ${response.records.length}개 레코드 받음`);
            
            // 재시도 카운트 초기화
            retryCount = 0;
            
            // API 제한 방지 딜레이
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            
            // 가져온 레코드 처리
            const pageRecords = response.records || [];
            this.loadStats.loadedRecords += pageRecords.length;
            allRecords.push(...pageRecords);
            
            // 다음 페이지 여부 확인
            offset = response.offset;
            hasMore = !!offset;
            
            // 모든 페이지를 가져왔거나 충분한 데이터를 가져왔다면 중단
            if (!hasMore || allRecords.length >= totalCount) {
              hasMore = false;
            }
            
          } catch (error) {
            console.error(`페이지 ${page} 로드 중 오류:`, error);
            retryCount++;
            
            // 인증 오류 특별 처리
            if (error.message && (
              error.message.includes('AUTHENTICATION_REQUIRED') ||
              error.message.includes('HTTP 오류: 401') ||
              error.message.includes('Airtable API key not configured')
            )) {
              console.error('에어테이블 API 인증 오류. 오프라인 모드로 전환합니다.');
              this.setOfflineMode(true);
              
              if (typeof window.hideDownloadOverlay === 'function') {
                window.hideDownloadOverlay();
              }
              
              // 로컬 데이터 확인
              const wordCount = await this.dbManager.getWordCount({});
              if (wordCount > 0) {
                console.log(`로컬에 ${wordCount}개 단어가 있습니다. 오프라인 모드로 계속합니다.`);
                
                if (this.progressCallback) {
                  this.progressCallback({
                    status: 'complete',
                    message: `오프라인 모드: ${wordCount}개 단어 사용 가능`,
                    progress: 100
                  });
                }
                
                return true;
              }
              
              if (this.progressCallback) {
                this.progressCallback({
                  status: 'error',
                  message: '인증 오류: API 키를 확인하세요.',
                  progress: 0
                });
              }
              
              return false;
            }
            
            // 재시도 여부 결정
            if (retryCount <= this.maxRetries) {
              console.log(`페이지 ${page} 로드 재시도... (${retryCount}/${this.maxRetries})`);
              page--; // 현재 페이지 재시도
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            } else {
              console.error('최대 재시도 횟수를 초과했습니다. 로드를 종료합니다.');
              break;
            }
          }
        }
        
        console.log(`${allRecords.length}개 단어를 로드했습니다.`);
        
        // 데이터 저장 전 다운로드 진행률 100%로 설정
        if (typeof window.updateDownloadProgress === 'function') {
          window.updateDownloadProgress(100);
        }
        
        // 다운로드 텍스트 업데이트
        const downloadText = document.querySelector('#downloadOverlay .download-text');
        if (downloadText) {
          downloadText.textContent = '데이터 저장 중...';
        }
        
        if (allRecords.length === 0) {
          if (typeof window.hideDownloadOverlay === 'function') {
            window.hideDownloadOverlay();
          }
          
          // 로컬 데이터 확인
          const wordCount = await this.dbManager.getWordCount({});
          if (wordCount > 0) {
            console.log(`로컬에 ${wordCount}개 단어가 있습니다. 기존 데이터를 유지합니다.`);
            
            if (this.progressCallback) {
              this.progressCallback({
                status: 'complete',
                message: `기존 ${wordCount}개 단어 사용`,
                progress: 100
              });
            }
            
            return true;
          }
          
          if (this.progressCallback) {
            this.progressCallback({
              status: 'complete',
              message: '로드할 단어가 없습니다.',
              progress: 100
            });
          }
          return false;
        }
        
        // 가져온 데이터를 IndexedDB에 저장
        const transformedRecords = this.transformRecords(allRecords, contentId);
        const saveResult = await this.storeWordsToDb(transformedRecords);
        
        // 마지막 로드 시간 저장
        await this.dbManager.saveSetting('lastLoadTime', Date.now());
        await this.dbManager.saveSetting('lastLoadedContent', contentId);
        
        // 로드 완료 정보 업데이트
        this.loadStats.endTime = Date.now();
        
        // 다운로드 오버레이 숨기기
        if (typeof window.hideDownloadOverlay === 'function') {
          const downloadText = document.querySelector('#downloadOverlay .download-text');
          if (downloadText) {
            downloadText.textContent = `${transformedRecords.length}개 단어 저장 완료!`;
          }
          
          setTimeout(() => {
            window.hideDownloadOverlay();
            
            const mainMessage = document.getElementById('mainMessage');
            if (mainMessage) {
              mainMessage.style.display = 'none';
              mainMessage.className = 'message-container';
              mainMessage.innerHTML = '';
            }
          }, 1000);
        }
        
        // 진행 상황 콜백 호출 (완료)
        if (this.progressCallback) {
          this.progressCallback({
            status: 'complete',
            message: `${transformedRecords.length}개 단어 로드 완료`,
            progress: 100,
            loaded: transformedRecords.length,
            total: totalCount,
            duration: this.loadStats.endTime - this.loadStats.startTime
          });
        }
        
        // 메인 메시지 추가 제거
        setTimeout(() => {
          const mainMessage = document.getElementById('mainMessage');
          if (mainMessage) {
            mainMessage.style.display = 'none';
            mainMessage.className = 'message-container';
            mainMessage.innerHTML = '';
          }
        }, 100);
        
        console.log(`단어 로드 완료: ${saveResult ? '성공' : '실패'}`);
        this._lastLoadedContent = contentId;
        return saveResult;
        
      } catch (error) {
        console.error('단어 로드 중 오류 발생:', error);
        
        if (typeof window.hideDownloadOverlay === 'function') {
          window.hideDownloadOverlay();
        }
        
        // 인증 오류 발생 시 오프라인 모드로 전환 시도
        if (error.message && (
          error.message.includes('AUTHENTICATION_REQUIRED') ||
          error.message.includes('HTTP 오류: 401') ||
          error.message.includes('Airtable API key not configured')
        )) {
          console.error('API 인증 오류 발생. 오프라인 모드로 전환합니다.');
          this.setOfflineMode(true);
          
          // 로컬 데이터 확인
          const wordCount = await this.dbManager.getWordCount({});
          if (wordCount > 0) {
            console.log(`로컬에 ${wordCount}개 단어가 있습니다. 오프라인 모드로 계속합니다.`);
            return true;
          }
        }
        
        if (this.progressCallback) {
          this.progressCallback({
            status: 'error',
            message: `로드 오류: ${error.message}`,
            progress: 0
          });
        }
        
        return false;
        
      } finally {
        // 로딩 상태 초기화
        this._isLoading = false;
        this._loadingPromise = null;
        
        // 다운로드 오버레이가 여전히 표시되어 있으면 숨기기
        const downloadOverlay = document.getElementById('downloadOverlay');
        if (downloadOverlay && downloadOverlay.classList.contains('show')) {
          console.log('다운로드 오버레이 강제 숨김');
          if (typeof window.hideDownloadOverlay === 'function') {
            window.hideDownloadOverlay();
          }
        }
        
        // 메인 메시지 최종 확인 및 제거
        const mainMessage = document.getElementById('mainMessage');
        if (mainMessage) {
          mainMessage.style.display = 'none';
          mainMessage.className = 'message-container';
          mainMessage.innerHTML = '';
        }
      }
    })();
    
    return this._loadingPromise;
  }

  /**
   * API URL 구성 (필터 없이)
   * @param {string} offset - 다음 페이지 오프셋
   * @returns {string} API URL
   */
  buildApiUrl(offset) {
    try {
      // 필수 정보 확인
      if (!this.airtableManager || !this.airtableManager.contentsBaseUrl || !this.airtableManager.wordTable) {
        console.error('[API URL 구성] Airtable 설정 정보가 없습니다.');
        throw new Error('Airtable 설정 오류');
      }
      
      const baseUrl = `${this.airtableManager.contentsBaseUrl}/${this.airtableManager.wordTable}`;
      const params = new URLSearchParams();
      
      // 페이지 크기 설정
      params.append('pageSize', this.pageSize.toString());
      
      // 정렬 설정 (No 필드 기준 오름차순)
      params.append('sort[0][field]', 'No');
      params.append('sort[0][direction]', 'asc');
      
      // 오프셋이 있으면 추가
      if (offset) {
        params.append('offset', offset);
      }
      
      // API 키 확인 로깅 (프록시 사용 시에는 불필요)
      if (!this.isNetlifyEnvironment) {
        console.log(`[API URL 구성] API 키 확인: ${this.airtableManager.apiKey ? '설정됨' : '없음'}`);
      }
      
      return `${baseUrl}?${params.toString()}`;
    } catch (error) {
      console.error('[API URL 구성] URL 구성 오류:', error);
      
      // 오류 발생 시 오프라인 모드로 전환 시도
      this.setOfflineMode(true);
      
      // 기본 URL 반환
      return `${this.airtableManager?.contentsBaseUrl || ''}/${this.airtableManager?.wordTable || ''}?pageSize=${this.pageSize}`;
    }
  }

  /**
   * 레코드 변환
   * @param {Array} records - Airtable API 응답 레코드
   * @param {string} contentId - 콘텐츠 ID
   * @returns {Array} 변환된 레코드
   */
  transformRecords(records, contentId) {
    // 현재 시간 (한국 시간)
    const now = new Date().toISOString();
    
    // 현재 콘텐츠 ID 확인
    const currentContent = contentId || 
      (this.dbManager.getCurrentContentId ? this.dbManager.getCurrentContentId() : 'default');
    
    return records.map(record => {
      try {
        // ID 생성
        const _id = record.id;
        
        // 필수 필드 확인
        if (!record.fields || !record.fields.word) {
          console.warn('필수 필드가 없는 레코드 건너뜀:', record.id);
          return null;
        }
        
        // 필드 추출 (안전하게)
        const word = record.fields.word || '';
        const meaning = record.fields.meaning || '';
        const pronunciation = record.fields.pronunciation || '';
        const vipup = record.fields.vipup || '';
        const no = record.fields.No || 0;

        // vipup 암호화 처리
        let encryptedVipup = '';
        if (vipup) {
          // VipUpEncryption이 사용 가능한지 확인
          if (window.VipUpEncryption && typeof window.VipUpEncryption.encrypt === 'function') {
            try {
              // 문자열이면 바로 암호화
              if (typeof vipup === 'string') {
                encryptedVipup = window.VipUpEncryption.encrypt(vipup);
              } else {
                // 다른 타입이면 문자열로 변환 후 암호화
                encryptedVipup = window.VipUpEncryption.encrypt(JSON.stringify(vipup));
              }
              console.log('VipUp 암호화 적용됨');
            } catch (error) {
              console.error('VipUp 암호화 오류:', error);
              encryptedVipup = ''; // 오류 시 빈 문자열
            }
          } else {
            console.warn('VipUpEncryption을 찾을 수 없습니다. 원본 저장');
            encryptedVipup = typeof vipup === 'string' ? vipup : JSON.stringify(vipup);
          }
        }

        // 단어 객체 생성
        return {
          _id,
          airtableId: record.id,
          word,
          meaning,
          pronunciation,
          vipup: encryptedVipup,  // 암호화된 vipup 저장
          No: no,
          content: currentContent,
          isStudied: "0",
          known_2: "0",
          status: "0",
          difficult: 0,
          studiedDate: now,
          updatedAt: now
        };
      } catch (error) {
        console.error('레코드 변환 오류:', error, record);
        return null;
      }
    }).filter(record => record !== null); // null 값 제거
  }

  /**
   * IndexedDB에 단어 저장
   * @param {Array} records - 저장할 레코드
   * @returns {Promise<boolean>} 저장 성공 여부
   */
  async storeWordsToDb(records) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      console.warn('저장할 레코드가 없습니다.');
      return false;
    }
    
    try {
      console.log(`${records.length}개 단어를 IndexedDB에 저장합니다.`);
      
      // content 필드가 있는지 확인
      const currentContent = this.dbManager.getCurrentContentId ? 
        this.dbManager.getCurrentContentId() : 'default';
      
      // content 필드 추가
      const recordsWithContent = records.map(record => ({
        ...record,
        content: record.content || currentContent
      }));
      
      // bulkAddWords 메서드 사용 시도
      if (typeof this.dbManager.bulkAddWords === 'function') {
        const result = await this.dbManager.bulkAddWords(recordsWithContent);
        console.log(`bulkAddWords 결과: ${result}개 저장됨`);
        return result > 0;
      }
      
      // bulkAddWords가 없으면 saveWords 사용
      if (typeof this.dbManager.saveWords === 'function') {
        const savedCount = await this.dbManager.saveWords(recordsWithContent);
        console.log(`${savedCount}/${recordsWithContent.length} 단어 저장 완료`);
        return savedCount > 0;
      }
      
      // 둘 다 없으면 개별 저장
      console.log('일괄 저장 메서드가 없어 개별 저장합니다.');
      let savedCount = 0;
      for (const record of recordsWithContent) {
        try {
          await this.dbManager.addWord(record);
          savedCount++;
        } catch (error) {
          console.error('개별 단어 저장 오류:', error);
        }
      }
      
      console.log(`${savedCount}/${recordsWithContent.length} 단어 개별 저장 완료`);
      return savedCount > 0;
    } catch (error) {
      console.error('단어 DB 저장 오류:', error);
      return false;
    }
  }

  /**
   * 총 단어 수 가져오기 (필터링 없이 전체)
   * @param {string} contentId - 콘텐츠 ID (선택적)
   * @returns {Promise<number>} 총 단어 수
   */
  async getTotalWordCount(contentId) {
    try {
      // 로컬 저장소에서 기본값 확인
      const totalWordsElement = document.getElementById('totalWords');
      const defaultTotal = totalWordsElement ? 
        parseInt(totalWordsElement.textContent || '1372') : 1372;
        
      console.log(`[총 단어 수] HTML에서 총 단어 수: ${defaultTotal}`);
      
      // 로컬 DB에 이미 데이터가 있는지 확인
      const localCount = await this.dbManager.getWordCount({});
      if (localCount > 0) {
        console.log(`[총 단어 수] 로컬 DB에 ${localCount}개 단어가 있습니다.`);
        return Math.max(localCount, defaultTotal);
      }
      
      // Airtable API 관련 정보 검증
      const isOffline = this._offlineMode || 
                        !this.airtableManager || 
                        !this.airtableManager.contentsBaseUrl || 
                        !this.airtableManager.wordTable || 
                        (!this.isNetlifyEnvironment && !this.airtableManager.apiKey) ||
                        (this.networkManager && typeof this.networkManager.isNetworkOnline === 'function' && 
                         !this.networkManager.isNetworkOnline());
      
      if (isOffline) {
        console.warn('[총 단어 수] 오프라인 모드 또는 Airtable 설정이 없어 기본값 사용');
        return defaultTotal;
      }
      
      // API 호출 준비
      const url = `${this.airtableManager.contentsBaseUrl}/${this.airtableManager.wordTable}?maxRecords=1&sort[0][field]=No&sort[0][direction]=desc`;
      
      // 인증 헤더 명시적 추가 (프록시 사용 시에는 불필요)
      const headers = this.isNetlifyEnvironment ? {} : {
        'Authorization': `Bearer ${this.airtableManager.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      console.log('[총 단어 수] API 호출 시작:', {
        url: url,
        useProxy: this.isNetlifyEnvironment
      });
      
      // API 호출
      const response = await this.makeApiRequest(url, headers);
      
      // 응답 확인
      if (!response || !response.records || response.records.length === 0) {
        console.warn('[총 단어 수] API 응답에 레코드가 없습니다. 기본값 사용');
        return defaultTotal;
      }
      
      // 응답에서 최대 No 값 확인
      const firstRecord = response.records[0];
      if (firstRecord.fields && firstRecord.fields.No) {
        const maxNo = parseInt(firstRecord.fields.No);
        console.log(`[총 단어 수] API 응답에서 최대 No: ${maxNo}`);
        return maxNo;
      }
      
      // 다른 방식으로 전체 카운트 계산
      if (response.offset) {
        console.log('[총 단어 수] 페이지네이션으로 전체 카운트 계산');
        return this.getFullCount();
      }
      
      console.log('[총 단어 수] 기본값 사용:', defaultTotal);
      return defaultTotal;
    } catch (error) {
      console.error('[총 단어 수] 확인 오류:', error);
      
      // 인증 오류 발생 시 오프라인 모드로 전환
      if (error.message && (
        error.message.includes('AUTHENTICATION_REQUIRED') ||
        error.message.includes('HTTP 오류: 401') ||
        error.message.includes('Airtable API key not configured')
      )) {
        console.error('[총 단어 수] API 인증 오류. 오프라인 모드로 전환');
        this.setOfflineMode(true);
      }
      
      // HTML에서 기본값 가져오기
      const totalWordsElement = document.getElementById('totalWords');
      return totalWordsElement ? 
        parseInt(totalWordsElement.textContent || '1372') : 1372;
    }
  }

  /**
   * 전체 단어 수 정확히 계산 (페이지네이션 사용)
   * @returns {Promise<number>} 총 단어 수
   */
  async getFullCount() {
    try {
      // 오프라인 모드 체크
      if (this._offlineMode) {
        const totalWordsElement = document.getElementById('totalWords');
        return totalWordsElement ? 
          parseInt(totalWordsElement.textContent || '1372') : 1372;
      }
      
      // 인증 헤더 준비 (프록시 사용 시에는 불필요)
      const headers = this.isNetlifyEnvironment ? {} : {
        'Authorization': `Bearer ${this.airtableManager.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // 페이지네이션으로 전체 카운트 가져오기
      let totalCount = 0;
      let offset = null;
      let hasMore = true;
      let retryCount = 0;
      
      while (hasMore && retryCount <= this.maxRetries) {
        try {
          // URL 구성
          const url = `${this.airtableManager.contentsBaseUrl}/${this.airtableManager.wordTable}?pageSize=${this.pageSize}${offset ? `&offset=${offset}` : ''}`;
          
          // API 호출
          const response = await this.makeApiRequest(url, headers);
          
          // 응답 확인
          if (!response || !response.records || !Array.isArray(response.records)) {
            throw new Error('API 응답 형식이 올바르지 않습니다');
          }
          
          // 레코드 수 추가
          totalCount += response.records.length;
          
          // 다음 페이지 확인
          offset = response.offset;
          hasMore = !!offset;
          
          // API 제한을 피하기 위한 짧은 딜레이
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 재시도 카운터 초기화
          retryCount = 0;
        } catch (error) {
          console.error('전체 단어 수 계산 중 오류:', error);
          
          // 인증 오류 특별 처리
          if (error.message && (
            error.message.includes('AUTHENTICATION_REQUIRED') ||
            error.message.includes('HTTP 오류: 401') ||
            error.message.includes('Airtable API key not configured')
          )) {
            console.error('API 인증 오류. 오프라인 모드로 전환합니다.');
            this.setOfflineMode(true);
            
            // HTML에서 기본값 가져오기
            const totalWordsElement = document.getElementById('totalWords');
            return totalWordsElement ? 
              parseInt(totalWordsElement.textContent || '1372') : 1372;
          }
          
          // 재시도
          retryCount++;
          
          if (retryCount > this.maxRetries) {
            console.error('최대 재시도 횟수 초과. 현재까지 계산된 단어 수 반환');
            break;
          }
          
          // 재시도 전 대기
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      // 최소 1000개 이상 단어가 있어야 함
      return Math.max(totalCount, 1000);
    } catch (error) {
      console.error('전체 단어 수 계산 오류:', error);
      
      // HTML에서 기본값 가져오기
      const totalWordsElement = document.getElementById('totalWords');
      return totalWordsElement ? 
        parseInt(totalWordsElement.textContent || '1372') : 1372;
    }
  }

  /**
   * 콘텐츠별 IndexedDB에서 단어 가져오기
   * @param {string} contentId - 콘텐츠 ID
   * @param {Object} filter - 추가 필터
   * @param {Object} options - 추가 옵션 (limit, sort 등)
   * @returns {Promise<Array>} 단어 배열
   */
  async getWordsByContent(contentId, filter = {}, options = {}) {
    try {
      // DB 연결 확인
      if (this.dbManager && typeof this.dbManager.getDbConnection === 'function') {
        await this.dbManager.getDbConnection();
      }
      
      // content 필드로 필터링
      const combinedFilter = {
        ...filter,
        content: contentId
      };
      
      // 기본 옵션 설정
      const defaultOptions = {
        limit: 20,
        sort: { field: 'No', direction: 'asc' }
      };
      
      const finalOptions = { ...defaultOptions, ...options };
      
      // IndexedDB에서 데이터 가져오기
      const words = await this.dbManager.getWords(
        combinedFilter,
        finalOptions.limit,
        finalOptions.sort
      );
      
      console.log(`[getWordsByContent] ${words.length}개 단어 조회됨 (content: ${contentId})`);
      return words;
    } catch (error) {
      console.error('콘텐츠별 단어 조회 오류:', error);
      return [];
    }
  }
}

// 전역 범위에 클래스 노출
window.ContentAwareDataLoader = ContentAwareDataLoader;