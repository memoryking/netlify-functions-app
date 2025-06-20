/**
 * NetworkManager 클래스
 * 네트워크 요청 및 상태 관리를 담당하는 클래스
 * 버전: 1.3.0 - Netlify 프록시 지원 추가
 */
class NetworkManager {
  constructor() {
    // 네트워크 상태 추적
    this._online = navigator.onLine;
    this._manualOfflineMode = false;
    this._pendingRequests = [];
    this._retryQueue = [];
    this._retryTimer = null;
    this._maxRetries = 3;
    this._retryDelay = 1000;
    
    // 네트워크 상태 변경 이벤트 리스너 등록
    window.addEventListener('online', (e) => this.handleNetworkChange(e));
    window.addEventListener('offline', (e) => this.handleNetworkChange(e));
    
    // 인증 관련 설정
    this._authHeaders = null;
    this._apiKeySource = null;
    
    // Netlify 환경 감지
    this.isNetlifyEnvironment = window.ENV_CONFIG?.isNetlify || 
                                (window.location.hostname.includes('netlify.app') || 
                                 window.location.hostname.includes('netlify.com'));
    
    // 프록시 URL
    this.proxyUrl = window.ENV_CONFIG?.proxyUrl || '/.netlify/functions/airtable-proxy';
    
    console.log('NetworkManager 초기화 완료', {
      isNetlify: this.isNetlifyEnvironment,
      proxyUrl: this.proxyUrl
    });
  }

  /**
   * 네트워크 연결 상태 변경 처리
   * @param {Event} event - 네트워크 이벤트 객체
   */
  handleNetworkChange(event) {
    const wasOnline = this._online;
    this._online = (event.type === 'online');
    
    console.log(`네트워크 상태 변경: ${this._online ? '온라인' : '오프라인'}`);
    
    // 오프라인→온라인으로 변경 시 대기 중인 요청 처리
    if (!wasOnline && this._online && !this._manualOfflineMode) {
      this.processRetryQueue();
    }
    
    // 오프라인 인디케이터 업데이트
    this.updateOfflineIndicator();
  }

  /**
   * 오프라인 인디케이터 UI 업데이트
   */
  updateOfflineIndicator() {
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (offlineIndicator) {
      if (this.isOffline()) {
        offlineIndicator.style.display = 'block';
        offlineIndicator.classList.add('show');
        offlineIndicator.classList.remove('hide');
      } else {
        offlineIndicator.classList.add('hide');
        offlineIndicator.classList.remove('show');
        setTimeout(() => {
          if (!this.isOffline()) {
            offlineIndicator.style.display = 'none';
          }
        }, 500);
      }
    }
  }

  /**
   * 수동 오프라인 모드 설정
   * @param {boolean} isOffline - 오프라인 모드 여부
   */
  setOfflineMode(isOffline) {
    this._manualOfflineMode = isOffline;
    console.log(`수동 오프라인 모드 ${isOffline ? '활성화' : '비활성화'}`);
    
    // 오프라인 인디케이터 업데이트
    this.updateOfflineIndicator();
    
    // 온라인 상태로 전환 시 대기 중인 요청 처리
    if (!isOffline && navigator.onLine) {
      this.processRetryQueue();
    }
  }

  /**
   * 현재 네트워크 상태가 오프라인인지 확인
   * @returns {boolean} 오프라인 상태 여부
   */
  isOffline() {
    return this._manualOfflineMode || !navigator.onLine;
  }

  /**
   * 네트워크 온라인 상태 확인
   * @returns {boolean} 온라인 상태 여부
   */
  isNetworkOnline() {
    return !this.isOffline();
  }
  
  /**
   * API 키 가져오기 (Netlify 환경에서는 불필요)
   * @returns {string} 에어테이블 API 키
   */
  getApiKey() {
    // Netlify 환경에서는 API 키가 필요 없음
    if (this.isNetlifyEnvironment) {
      console.log('Netlify 환경: 프록시 사용으로 API 키 불필요');
      return null;
    }
    
    // 이미 저장된 API 키가 있으면 반환
    if (this._apiKey) return this._apiKey;
    
    // 세션 스토리지에서 API 키 가져오기
    let apiKey = null;
    try {
      apiKey = sessionStorage.getItem('airtable_apikey');
      if (apiKey) this._apiKeySource = 'session';
    } catch (e) {
      console.warn('세션 스토리지 접근 오류:', e);
    }
    
    // 로컬 스토리지에서 API 키 가져오기
    if (!apiKey) {
      try {
        apiKey = localStorage.getItem('airtable_apikey');
        if (apiKey) this._apiKeySource = 'local';
      } catch (e) {
        console.warn('로컬 스토리지 접근 오류:', e);
      }
    }
    
    // URL 파라미터에서 API 키 가져오기
    if (!apiKey) {
      try {
        const params = typeof parseUrlParams === 'function' ? 
          parseUrlParams() : new URLSearchParams(window.location.search);
        
        apiKey = params.get('airtable_apikey');
        if (apiKey) {
          apiKey = decodeURIComponent(apiKey);
          this._apiKeySource = 'url';
        }
      } catch (e) {
        console.warn('URL 파라미터 파싱 오류:', e);
      }
    }
    
    // app.airtableManager에서 API 키 가져오기
    if (!apiKey && window.app && window.app.airtableManager) {
      apiKey = window.app.airtableManager.apiKey;
      if (apiKey) this._apiKeySource = 'manager';
    }
    
    if (apiKey) {
      this._apiKey = apiKey;
      console.log(`API 키 찾음 (소스: ${this._apiKeySource})`);
    }
    
    return apiKey;
  }

  /**
   * 인증 헤더 가져오기
   * @param {boolean} force - 강제 새로고침 여부
   * @returns {Object} 인증 헤더 객체
   */
  getAuthHeaders(force = false) {
    // Netlify 환경에서는 인증 헤더가 필요 없음
    if (this.isNetlifyEnvironment) {
      return {
        'Content-Type': 'application/json'
      };
    }
    
    // 저장된 인증 헤더가 있고 강제 새로고침이 아니면 반환
    if (this._authHeaders && !force) return this._authHeaders;
    
    const apiKey = this.getApiKey();
    if (apiKey) {
      this._authHeaders = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
    } else {
      this._authHeaders = {
        'Content-Type': 'application/json'
      };
    }
    
    return this._authHeaders;
  }

  /**
   * Airtable API 요청을 프록시를 통해 수행
   * @param {string} url - 요청 URL
   * @param {string} method - HTTP 메소드
   * @param {Object} data - 요청 데이터
   * @returns {Promise<Object>} 응답 객체
   */
  async proxyRequest(url, method = 'GET', data = null) {
    try {
      console.log(`프록시 요청: ${method} ${url}`);
      
      const requestBody = {
        url: url,
        method: method
      };
      
      if (data && method !== 'GET') {
        requestBody.body = data;
      }
      
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // 인증 오류 처리
        if (response.status === 500 && errorData.error && errorData.error.includes('API key not configured')) {
          console.error('Netlify 환경변수에 API 키가 설정되지 않았습니다');
          throw new Error('AUTHENTICATION_REQUIRED');
        }
        
        throw new Error(errorData.error || `프록시 오류: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('프록시 요청 오류:', error);
      throw error;
    }
  }

  /**
   * GET 요청 실행
   * @param {string} url - 요청 URL
   * @param {Object} headers - 요청 헤더
   * @param {boolean} isAirtable - 에어테이블 API 요청 여부
   * @returns {Promise<Object>} 응답 객체
   */
  async get(url, headers = {}, isAirtable = false) {
    // 네트워크 오프라인 상태 확인
    if (this.isOffline()) {
      console.log(`오프라인 상태로 GET 요청 불가: ${url}`);
      return Promise.reject(new Error('오프라인 상태입니다'));
    }
    
    // Netlify 환경에서 Airtable 요청이면 프록시 사용
    if (this.isNetlifyEnvironment && isAirtable && url.includes('airtable.com')) {
      return this.proxyRequest(url, 'GET');
    }
    
    // 일반 요청 또는 개발 환경
    if (isAirtable && !this.isNetlifyEnvironment) {
      const authHeaders = this.getAuthHeaders();
      headers = { ...authHeaders, ...headers };
    }
    
    try {
      console.log(`GET 요청: ${url}`);
      const response = await fetch(url, { 
        method: 'GET',
        headers: headers
      });
      
      if (!response.ok) {
        // 401 인증 오류 처리
        if (response.status === 401) {
          console.error('API 인증 오류 (401)');
          return Promise.reject(new Error('AUTHENTICATION_REQUIRED'));
        }
        
        // 기타 HTTP 오류
        return Promise.reject(new Error(`HTTP 오류: ${response.status}`));
      }
      
      return await response.json();
    } catch (error) {
      console.error(`GET 요청 오류 (${url}):`, error);
      return Promise.reject(error);
    }
  }

  /**
   * POST 요청 실행
   * @param {string} url - 요청 URL
   * @param {Object} data - 요청 데이터
   * @param {Object} headers - 요청 헤더
   * @param {boolean} isAirtable - 에어테이블 API 요청 여부
   * @returns {Promise<Object>} 응답 객체
   */
  async post(url, data, headers = {}, isAirtable = false) {
    // 네트워크 오프라인 상태 확인
    if (this.isOffline()) {
      console.log(`오프라인 상태로 POST 요청 불가: ${url}`);
      return Promise.reject(new Error('오프라인 상태입니다'));
    }
    
    // Netlify 환경에서 Airtable 요청이면 프록시 사용
    if (this.isNetlifyEnvironment && isAirtable && url.includes('airtable.com')) {
      return this.proxyRequest(url, 'POST', data);
    }
    
    // 일반 요청 또는 개발 환경
    if (isAirtable && !this.isNetlifyEnvironment) {
      const authHeaders = this.getAuthHeaders();
      headers = { ...authHeaders, ...headers };
    }
    
    try {
      console.log(`POST 요청: ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        // 401 인증 오류 처리
        if (response.status === 401) {
          console.error('API 인증 오류 (401)');
          return Promise.reject(new Error('AUTHENTICATION_REQUIRED'));
        }
        
        // 기타 HTTP 오류
        return Promise.reject(new Error(`HTTP 오류: ${response.status}`));
      }
      
      return await response.json();
    } catch (error) {
      console.error(`POST 요청 오류 (${url}):`, error);
      return Promise.reject(error);
    }
  }

  /**
   * PATCH 요청 실행
   * @param {string} url - 요청 URL
   * @param {Object} data - 요청 데이터
   * @param {Object} headers - 요청 헤더
   * @param {boolean} isAirtable - 에어테이블 API 요청 여부
   * @returns {Promise<Object>} 응답 객체
   */
  async patch(url, data, headers = {}, isAirtable = false) {
    // 네트워크 오프라인 상태 확인
    if (this.isOffline()) {
      console.log(`오프라인 상태로 PATCH 요청 불가: ${url}`);
      return Promise.reject(new Error('오프라인 상태입니다'));
    }
    
    // Netlify 환경에서 Airtable 요청이면 프록시 사용
    if (this.isNetlifyEnvironment && isAirtable && url.includes('airtable.com')) {
      return this.proxyRequest(url, 'PATCH', data);
    }
    
    // 일반 요청 또는 개발 환경
    if (isAirtable && !this.isNetlifyEnvironment) {
      const authHeaders = this.getAuthHeaders();
      headers = { ...authHeaders, ...headers };
    }
    
    try {
      console.log(`PATCH 요청: ${url}`);
      const response = await fetch(url, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        // 401 인증 오류 처리
        if (response.status === 401) {
          console.error('API 인증 오류 (401)');
          return Promise.reject(new Error('AUTHENTICATION_REQUIRED'));
        }
        
        // 기타 HTTP 오류
        return Promise.reject(new Error(`HTTP 오류: ${response.status}`));
      }
      
      return await response.json();
    } catch (error) {
      console.error(`PATCH 요청 오류 (${url}):`, error);
      return Promise.reject(error);
    }
  }

  /**
   * 일반 HTTP 요청 실행
   * @param {string} url - 요청 URL
   * @param {string} method - HTTP 메소드
   * @param {Object} headers - 요청 헤더
   * @param {Object} data - 요청 데이터
   * @param {boolean} isAirtable - 에어테이블 API 요청 여부
   * @returns {Promise<Object>} 응답 객체
   */
  async request(url, method, headers = {}, data = null, isAirtable = false) {
    method = method.toUpperCase();
    
    if (method === 'GET') {
      return this.get(url, headers, isAirtable);
    } else if (method === 'POST') {
      return this.post(url, data, headers, isAirtable);
    } else if (method === 'PATCH') {
      return this.patch(url, data, headers, isAirtable);
    } else {
      throw new Error(`지원하지 않는 HTTP 메소드: ${method}`);
    }
  }

  /**
   * 재시도 큐 처리
   */
  processRetryQueue() {
    if (this._retryQueue.length === 0 || this.isOffline()) return;
    
    console.log(`재시도 큐 처리 시작 (${this._retryQueue.length}개 요청)`);
    
    clearTimeout(this._retryTimer);
    
    const request = this._retryQueue.shift();
    
    // 재시도 요청 실행
    this.request(
      request.url, 
      request.method, 
      request.headers, 
      request.data, 
      request.isAirtable
    )
    .then(response => {
      console.log(`재시도 요청 성공: ${request.url}`);
      if (request.resolve) request.resolve(response);
    })
    .catch(error => {
      console.error(`재시도 요청 실패: ${request.url}`, error);
      
      // 최대 재시도 횟수 초과 확인
      if (request.retries >= this._maxRetries) {
        if (request.reject) request.reject(error);
        return;
      }
      
      // 재시도 횟수 증가 후 큐에 다시 추가
      request.retries++;
      this._retryQueue.push(request);
    })
    .finally(() => {
      // 큐에 요청이 남아있으면 계속 처리
      if (this._retryQueue.length > 0) {
        this._retryTimer = setTimeout(() => this.processRetryQueue(), this._retryDelay);
      }
    });
  }
  
  /**
   * 재시도 큐에 요청 추가
   * @param {Object} requestInfo - 요청 정보
   */
  addToRetryQueue(requestInfo) {
    if (!requestInfo.retries) {
      requestInfo.retries = 0;
    }
    
    this._retryQueue.push(requestInfo);
    console.log(`재시도 큐에 추가됨: ${requestInfo.url}`);
    
    // 온라인 상태이면 즉시 처리 시작
    if (!this.isOffline()) {
      this.processRetryQueue();
    }
  }
  
  /**
   * 재시도 큐 초기화
   */
  clearRetryQueue() {
    this._retryQueue = [];
    clearTimeout(this._retryTimer);
    console.log('재시도 큐가 초기화되었습니다');
  }
  
  /**
   * 현재 대기 중인 재시도 요청 수
   * @returns {number} 대기 중인 요청 수
   */
  getRetryQueueLength() {
    return this._retryQueue.length;
  }
}

// 전역 객체로 등록
window.NetworkManager = NetworkManager;