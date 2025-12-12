/**
 * AirtableManager 클래스
 * 단어 학습 앱의 에어테이블 API 연동 기능을 제공
 * 버전: 2.0.0 (보안 강화 - API 키 프록시 사용)
 */
(function() {
  // URL 파라미터 파싱 함수
  function parseUrlParams() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (error) {
      console.error('URL 파라미터 파싱 오류:', error);
      return new URLSearchParams('');
    }
  }

  // 환경 감지
  const isNetlifyEnvironment = window.location.hostname.includes('netlify.app') || 
                               window.location.hostname.includes('netlify.com');

  // AirtableManager 클래스 정의
  class AirtableManager {
    // 싱글톤 인스턴스
    static instance = null;
    
    // 싱글톤 getter
    static getInstance() {
      if (!AirtableManager.instance) {
        AirtableManager.instance = new AirtableManager();
      }
      return AirtableManager.instance;
    }
    
    constructor() {
      // 싱글톤 체크
      if (AirtableManager.instance) {
        return AirtableManager.instance;
      }
      
      try {
        const params = parseUrlParams();
        
        // 프록시 설정
        this.useProxy = isNetlifyEnvironment;
        this.proxyUrl = '/.netlify/functions/airtable-proxy';
        
        // API 키 처리 (개발 환경에서만 URL에서 가져옴)
        if (!this.useProxy) {
          // 개발 환경: URL에서 API 키 가져오기
          this.apiKey = '';
          try {
            if (params.has('airtable_apikey')) {
              this.apiKey = decodeURIComponent(params.get('airtable_apikey')).trim();
            }
          } catch (e) {
            console.warn('API 키 디코딩 오류:', e);
          }
        }
        
        // 사용자 DB URL 파싱
        this.userBaseUrl = '';
        try {
          if (params.has('airtable_user_DB')) {
            this.userBaseUrl = decodeURIComponent(params.get('airtable_user_DB')).trim();
          }
        } catch (e) {
          console.warn('사용자 DB URL 디코딩 오류:', e);
        }
        
        // 사용자 테이블 파싱
        this.userTable = '';
        try {
          if (params.has('airtable_user_table')) {
            this.userTable = decodeURIComponent(params.get('airtable_user_table')).trim();
          }
        } catch (e) {
          console.warn('사용자 테이블 디코딩 오류:', e);
        }
        
        // 콘텐츠 DB URL 파싱
        this.contentsBaseUrl = '';
        try {
          if (params.has('airtable_contents_DB')) {
            this.contentsBaseUrl = decodeURIComponent(params.get('airtable_contents_DB')).trim();
          }
        } catch (e) {
          console.warn('콘텐츠 DB URL 디코딩 오류:', e);
        }
        
        // 콘텐츠 테이블 파싱
        this.wordTable = '';
        try {
          if (params.has('airtable_contents_table')) {
            this.wordTable = decodeURIComponent(params.get('airtable_contents_table')).trim();
          }
        } catch (e) {
          console.warn('콘텐츠 테이블 디코딩 오류:', e);
        }
        
        // API 키 존재 여부 검증 (프록시 사용 시에는 항상 true)
        this.isValidApiKey = this.useProxy || (!!this.apiKey && this.apiKey.length > 10);
        
        // 오프라인 모드 초기화
        this.offlineMode = !this.isValidApiKey;
        
        if (this.offlineMode && !this.useProxy) {
          console.warn('AirtableManager: API 키가 없거나 유효하지 않아 오프라인 모드로 초기화됩니다.');
        } else {
          console.log(`AirtableManager: 초기화 완료 (${this.useProxy ? '프록시 모드' : '직접 모드'})`);
          console.log(`API 키: ${this.apiKey ? '설정됨' : (this.useProxy ? '프록시 사용' : '없음')}`);
          console.log(`사용자 DB: ${this.userBaseUrl ? '설정됨' : '없음'}`);
          console.log(`콘텐츠 DB: ${this.contentsBaseUrl ? '설정됨' : '없음'}`);
        }
        
        AirtableManager.instance = this;
      } catch (error) {
        console.error('AirtableManager 초기화 오류:', error);
        this.offlineMode = true;
      }
    }
    
    /**
     * API 키 유효성 검사
     * @returns {boolean} API 키가 유효한지 여부
     */
    isApiKeyValid() {
      return this.isValidApiKey;
    }
    
    /**
     * 오프라인 모드 상태 확인
     * @returns {boolean} 오프라인 모드인지 여부
     */
    isOfflineMode() {
      return this.offlineMode;
    }
    
    /**
     * 오프라인 모드 설정
     * @param {boolean} mode 오프라인 모드 활성화 여부
     */
    setOfflineMode(mode) {
      this.offlineMode = !!mode;
      console.log(`AirtableManager: 오프라인 모드 ${this.offlineMode ? '활성화' : '비활성화'}`);
    }
    
    /**
     * API 요청에 사용할 기본 헤더 생성
     * @returns {Object} 헤더 객체
     */
    getDefaultHeaders() {
      if (this.useProxy) {
        // 프록시 사용 시에는 헤더가 서버에서 추가됨
        return {
          'Content-Type': 'application/json'
        };
      } else {
        // 직접 모드에서는 Authorization 헤더 포함
        return {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        };
      }
    }
    
    /**
     * API 요청 수행 (프록시 또는 직접)
     * @param {string} url API URL
     * @param {Object} options 요청 옵션
     * @returns {Promise<Object>} API 응답
     */
    async makeApiRequest(url, options = {}) {
      if (this.useProxy) {
        // 프록시를 통한 요청
        const proxyBody = {
          url: url,
          method: options.method || 'GET'
        };
        
        // PATCH/POST 요청의 경우 body 추가
        if (options.body) {
          try {
            proxyBody.body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          } catch (e) {
            proxyBody.body = options.body;
          }
        }
        
        const response = await fetch(this.proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(proxyBody)
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `프록시 오류 (${response.status})`);
        }
        
        return response.json();
      } else {
        // 직접 요청 (개발 환경)
        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.getDefaultHeaders(),
            ...(options.headers || {})
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
          throw new Error(`API 오류 (${response.status}): ${errorData.error?.message || '알 수 없는 오류'}`);
        }
        
        return response.json();
      }
    }
    
    /**
     * Airtable API URL 생성
     * @param {string} base 기본 URL (사용자/콘텐츠)
     * @param {string} table 테이블 이름
     * @param {Object} options 추가 옵션
     * @returns {string} 완성된 API URL
     */
    buildUrl(base, table, options = {}) {
      try {
        // 기본 URL 확인
        if (!base || !table) {
          throw new Error('기본 URL 또는 테이블이 지정되지 않았습니다.');
        }
        
        // URL 구성
        let url = `${base}/${table}`;
        
        // 옵션이 있는 경우 쿼리 파라미터 추가
        if (Object.keys(options).length > 0) {
          const params = new URLSearchParams();
          
          // 옵션을 URL 파라미터로 변환
          for (const [key, value] of Object.entries(options)) {
            if (Array.isArray(value)) {
              // 배열 처리 (예: filterByFormula 등)
              value.forEach((item, index) => {
                params.append(`${key}[${index}]`, item);
              });
            } else if (typeof value === 'object' && value !== null) {
              // 객체 처리 (예: sort[0][field]=name)
              for (const [subKey, subValue] of Object.entries(value)) {
                params.append(`${key}[${subKey}]`, subValue);
              }
            } else {
              // 일반 값 처리
              params.append(key, value);
            }
          }
          
          url += `?${params.toString()}`;
        }
        
        return url;
      } catch (error) {
        console.error('API URL 생성 오류:', error);
        return '';
      }
    }
    
    /**
     * 사용자 정보 조회
     * @param {string} phone 전화번호
     * @returns {Promise<Object>} 사용자 정보
     */
    async getUser(phone) {
      try {
        // 오프라인 모드 확인
        if (this.offlineMode) {
          console.log('AirtableManager: 오프라인 모드에서는 사용자 정보를 조회할 수 없습니다.');
          return null;
        }
        
        // 전화번호 검증
        if (!phone) {
          throw new Error('전화번호가 지정되지 않았습니다.');
        }
        
        // URL 구성 (buildUrl에서 URLSearchParams가 자동 인코딩하므로 여기서는 인코딩하지 않음)
        const filterFormula = `{phone}="${phone}"`;
        const url = this.buildUrl(this.userBaseUrl, this.userTable, {
          filterByFormula: filterFormula,
          maxRecords: 1
        });

        console.log('[AirtableManager] getUser 요청 URL:', url);

        // API 요청
        const data = await this.makeApiRequest(url);
        
        // 사용자 데이터 검증
        if (!data.records || data.records.length === 0) {
          console.warn(`전화번호 ${phone}에 해당하는 사용자를 찾을 수 없습니다.`);
          return null;
        }
        
        // 사용자 데이터 반환
        return {
          id: data.records[0].id,
          ...data.records[0].fields
        };
      } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        return null;
      }
    }
    
    /**
     * 사용자 정보 조회 (phone + contents 조건)
     * @param {string} phone 전화번호
     * @param {string} contents 콘텐츠명
     * @returns {Promise<Object>} 사용자 정보
     */
    async getUserByPhoneAndContents(phone, contents) {
      try {
        // 오프라인 모드 확인
        if (this.offlineMode) {
          console.log('AirtableManager: 오프라인 모드에서는 사용자 정보를 조회할 수 없습니다.');
          return null;
        }

        // 전화번호 검증
        if (!phone) {
          throw new Error('전화번호가 지정되지 않았습니다.');
        }

        // contents 검증
        if (!contents) {
          console.warn('[AirtableManager] contents가 없어서 phone만으로 조회합니다.');
          return this.getUser(phone);
        }

        // URL 구성 - AND 조건으로 phone과 contents 동시 검색
        const filterFormula = `AND({phone}="${phone}",{contents}="${contents}")`;
        const url = this.buildUrl(this.userBaseUrl, this.userTable, {
          filterByFormula: filterFormula,
          maxRecords: 1
        });

        console.log('[AirtableManager] getUserByPhoneAndContents 요청 URL:', url);

        // API 요청
        const data = await this.makeApiRequest(url);

        // 사용자 데이터 검증
        if (!data.records || data.records.length === 0) {
          console.warn(`전화번호 ${phone}, contents ${contents}에 해당하는 사용자를 찾을 수 없습니다.`);
          return null;
        }

        // 사용자 데이터 반환
        return {
          id: data.records[0].id,
          ...data.records[0].fields
        };
      } catch (error) {
        console.error('사용자 정보 조회 오류 (phone+contents):', error);
        return null;
      }
    }

    /**
     * 사용자 정보 업데이트
     * @param {string} userId 사용자 ID
     * @param {Object} fields 업데이트할 필드
     * @returns {Promise<boolean>} 성공 여부
     */
    async updateUser(userId, fields) {
      try {
        // 오프라인 모드 확인
        if (this.offlineMode) {
          console.log('AirtableManager: 오프라인 모드에서는 사용자 정보를 업데이트할 수 없습니다.');
          return false;
        }
        
        // 사용자 ID 검증
        if (!userId) {
          throw new Error('사용자 ID가 지정되지 않았습니다.');
        }
        
        // 업데이트할 필드 검증
        if (!fields || Object.keys(fields).length === 0) {
          throw new Error('업데이트할 필드가 없습니다.');
        }
        
        // URL 구성
        const url = `${this.userBaseUrl}/${this.userTable}/${userId}`;
        
        // API 요청
        await this.makeApiRequest(url, {
          method: 'PATCH',
          body: JSON.stringify({ fields })
        });
        
        return true;
      } catch (error) {
        console.error('사용자 정보 업데이트 오류:', error);
        return false;
      }
    }
    
    /**
     * 단어 가져오기
     * @param {Object} options 요청 옵션 (필터링, 정렬 등)
     * @returns {Promise<Array>} 단어 목록
     */
    async getWords(options = {}) {
      try {
        // 오프라인 모드 확인
        if (this.offlineMode) {
          console.log('AirtableManager: 오프라인 모드에서는 단어를 가져올 수 없습니다.');
          return [];
        }
        
        // URL 구성 옵션
        const urlOptions = {};
        
        // 최대 레코드 수 설정
        if (options.maxRecords) {
          urlOptions.maxRecords = options.maxRecords;
        }
        
        // 페이지 크기 설정
        if (options.pageSize) {
          urlOptions.pageSize = options.pageSize;
        }
        
        // 필터링 설정
        if (options.filterByFormula) {
          urlOptions.filterByFormula = options.filterByFormula;
        }
        
        // 정렬 설정
        if (options.sort) {
          urlOptions.sort = options.sort;
        }
        
        // URL 구성
        const url = this.buildUrl(this.contentsBaseUrl, this.wordTable, urlOptions);
        
        // API 요청
        const data = await this.makeApiRequest(url);
        
        // 단어 데이터 검증
        if (!data.records) {
          console.warn('단어 데이터가 없습니다.');
          return [];
        }
        
        // 단어 데이터 반환
        return data.records.map(record => ({
          id: record.id,
          ...record.fields
        }));
      } catch (error) {
        console.error('단어 가져오기 오류:', error);
        
        // 오류 종류에 따라 오프라인 모드로 전환
        if (error.message.includes('401') || error.message.includes('403')) {
          console.warn('API 인증 오류로 오프라인 모드로 전환합니다.');
          this.setOfflineMode(true);
        }
        
        return [];
      }
    }
    
    /**
     * 단일 단어 가져오기
     * @param {string} wordId 단어 ID
     * @returns {Promise<Object>} 단어 정보
     */
    async getWord(wordId) {
      try {
        // 오프라인 모드 확인
        if (this.offlineMode) {
          console.log('AirtableManager: 오프라인 모드에서는 단어를 가져올 수 없습니다.');
          return null;
        }
        
        // 단어 ID 검증
        if (!wordId) {
          throw new Error('단어 ID가 지정되지 않았습니다.');
        }
        
        // URL 구성
        const url = `${this.contentsBaseUrl}/${this.wordTable}/${wordId}`;
        
        // API 요청
        const data = await this.makeApiRequest(url);
        
        // 단어 데이터 반환
        return {
          id: data.id,
          ...data.fields
        };
      } catch (error) {
        console.error('단어 가져오기 오류:', error);
        return null;
      }
    }
    
    /**
     * 단어 업데이트
     * @param {string} wordId 단어 ID
     * @param {Object} fields 업데이트할 필드
     * @returns {Promise<boolean>} 성공 여부
     */
    async updateWord(wordId, fields) {
      try {
        // 오프라인 모드 확인
        if (this.offlineMode) {
          console.log('AirtableManager: 오프라인 모드에서는 단어를 업데이트할 수 없습니다.');
          return false;
        }
        
        // 단어 ID 검증
        if (!wordId) {
          throw new Error('단어 ID가 지정되지 않았습니다.');
        }
        
        // 업데이트할 필드 검증
        if (!fields || Object.keys(fields).length === 0) {
          throw new Error('업데이트할 필드가 없습니다.');
        }
        
        // URL 구성
        const url = `${this.contentsBaseUrl}/${this.wordTable}/${wordId}`;
        
        // API 요청
        await this.makeApiRequest(url, {
          method: 'PATCH',
          body: JSON.stringify({ fields })
        });
        
        return true;
      } catch (error) {
        console.error('단어 업데이트 오류:', error);
        return false;
      }
    }
    
    /**
     * 학습 카운트 조회 (어댑터 호환성)
     * @param {string} phone 전화번호
     * @returns {Promise<Object>} 학습 카운트 정보
     */
    async getStudyCount(phone) {
      try {
        const user = await this.getUser(phone);
        if (!user) {
          return { get_id_air: null, study_count: 0 };
        }
        
        return {
          get_id_air: user.id,
          study_count: user.study_count || 0
        };
      } catch (error) {
        console.error('학습 카운트 조회 오류:', error);
        return { get_id_air: null, study_count: 0 };
      }
    }
    
    /**
     * 신규 학습 레코드 생성 (어댑터 호환성)
     * @param {string} phone 전화번호
     * @returns {Promise<Object>} 생성된 학습 레코드
     */
    async createNewStudyRecord(phone) {
      try {
        if (this.offlineMode) {
          return { get_id_air: null, study_count: 0 };
        }
        
        const url = `${this.userBaseUrl}/${this.userTable}`;
        const data = await this.makeApiRequest(url, {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              phone: phone,
              study_count: 0
            }
          })
        });
        
        return {
          get_id_air: data.id,
          study_count: 0
        };
      } catch (error) {
        console.error('신규 학습 레코드 생성 오류:', error);
        return { get_id_air: null, study_count: 0 };
      }
    }
    
    /**
     * 학습 카운트 업데이트 (어댑터 호환성)
     * @param {string} recordId 레코드 ID
     * @param {number} count 업데이트할 카운트
     * @returns {Promise<boolean>} 성공 여부
     */
    async updateStudyCount(recordId, count) {
      return await this.updateUser(recordId, { study_count: count });
    }
    
    /**
     * 신규 단어 조회 (어댑터 호환성)
     * @param {number} studyCount 현재 학습 카운트
     * @returns {Promise<Array>} 단어 배열
     */
    async getNewWords(studyCount) {
      try {
        const filterFormula = `{No} > ${studyCount}`;
        const words = await this.getWords({
          filterByFormula: encodeURIComponent(filterFormula),
          maxRecords: 10,
          sort: [{ field: 'No', direction: 'asc' }]
        });
        
        return words;
      } catch (error) {
        console.error('신규 단어 조회 오류:', error);
        return [];
      }
    }
    
    /**
     * 아이디로 단어 조회 (어댑터 호환성)
     * @param {string} airtableId 에어테이블 ID
     * @returns {Promise<Object>} 단어 정보
     */
    async getWordByAirtableId(airtableId) {
      return await this.getWord(airtableId);
    }
    
    /**
     * 단어 번호로 단어 조회 (어댑터 호환성)
     * @param {number} no 단어 번호
     * @returns {Promise<Object>} 단어 정보
     */
    async getWordByNo(no) {
      try {
        const filterFormula = `{No} = ${no}`;
        const words = await this.getWords({
          filterByFormula: encodeURIComponent(filterFormula),
          maxRecords: 1
        });
        
        return words.length > 0 ? words[0] : null;
      } catch (error) {
        console.error('단어 번호로 조회 오류:', error);
        return null;
      }
    }
  }
  
  /**
   * VipUpCacheManager 클래스
   * vipup 필드의 캐싱 및 관리를 담당
   */
  class VipUpCacheManager {
    constructor() {
      // 캐시 초기화
      this.cache = new Map();
      
      // 메모리 사용량 제한 (약 10MB)
      this.memorySizeLimit = 10 * 1024 * 1024;
      
      // 현재 메모리 사용량 (추정치)
      this.currentMemorySize = 0;
      
      // 캐시 만료 시간 (1시간)
      this.cacheExpirationMs = 60 * 60 * 1000;
      
      // 프록시 설정
      this.useProxy = isNetlifyEnvironment;
      this.proxyUrl = '/.netlify/functions/airtable-proxy';
      
      console.log('VipUpCacheManager: 초기화 완료');
    }
    
    /**
     * 캐시에 항목 추가
     * @param {string} key 캐시 키
     * @param {string} value 캐시 값
     */
    set(key, value) {
      try {
        // 키가 비어있으면 무시
        if (!key) return;
        
        // 값이 비어있으면 빈 문자열로 설정
        const safeValue = value || '';
        
        // 메모리 사용량 추정 (UTF-16 인코딩 기준, 2바이트/문자)
        const valueSize = safeValue.length * 2;
        
        // 메모리 제한 초과 시 가장 오래된 항목 제거
        if (this.currentMemorySize + valueSize > this.memorySizeLimit) {
          this.evictOldest();
        }
        
        // 캐시 항목 생성
        const cacheItem = {
          value: safeValue,
          timestamp: Date.now(),
          size: valueSize
        };
        
        // 기존 항목이 있으면 메모리 사용량 업데이트
        if (this.cache.has(key)) {
          const oldItem = this.cache.get(key);
          this.currentMemorySize -= oldItem.size;
        }
        
        // 새 항목 추가
        this.cache.set(key, cacheItem);
        this.currentMemorySize += valueSize;
        
        // 캐시 상태 로깅 (100개 단위로)
        if (this.cache.size % 100 === 0) {
          console.log(`VipUpCacheManager: 현재 ${this.cache.size}개 항목, 약 ${Math.round(this.currentMemorySize / 1024)}KB 사용 중`);
        }
      } catch (error) {
        console.error('캐시 항목 추가 오류:', error);
      }
    }
    
    /**
     * 캐시에서 항목 가져오기
     * @param {string} key 캐시 키
     * @returns {string} 캐시 값
     */
    get(key) {
      try {
        // 키가 비어있으면 null 반환
        if (!key) return null;
        
        // 캐시에 항목이 없으면 null 반환
        if (!this.cache.has(key)) return null;
        
        // 캐시 항목 가져오기
        const cacheItem = this.cache.get(key);
        
        // 만료 확인
        if (Date.now() - cacheItem.timestamp > this.cacheExpirationMs) {
          // 만료된 항목 제거
          this.cache.delete(key);
          this.currentMemorySize -= cacheItem.size;
          return null;
        }
        
        // 타임스탬프 업데이트 (LRU 방식)
        cacheItem.timestamp = Date.now();
        
        return cacheItem.value;
      } catch (error) {
        console.error('캐시 항목 가져오기 오류:', error);
        return null;
      }
    }
    
    /**
     * 가장 오래된 캐시 항목 제거
     */
    evictOldest() {
      try {
        // 캐시가 비어있으면 무시
        if (this.cache.size === 0) return;
        
        // 가장 오래된 항목 찾기
        let oldestKey = null;
        let oldestTimestamp = Infinity;
        
        for (const [key, item] of this.cache.entries()) {
          if (item.timestamp < oldestTimestamp) {
            oldestKey = key;
            oldestTimestamp = item.timestamp;
          }
        }
        
        // 가장 오래된 항목 제거
        if (oldestKey) {
          const oldestItem = this.cache.get(oldestKey);
          this.cache.delete(oldestKey);
          this.currentMemorySize -= oldestItem.size;
        }
      } catch (error) {
        console.error('가장 오래된 캐시 항목 제거 오류:', error);
      }
    }
    
    /**
     * 캐시 초기화
     */
    clear() {
      try {
        this.cache.clear();
        this.currentMemorySize = 0;
        console.log('VipUpCacheManager: 캐시 초기화 완료');
      } catch (error) {
        console.error('캐시 초기화 오류:', error);
      }
    }
    
    /**
     * VipUp 데이터 가져오기 (프록시 지원 추가)
     * @param {string} airtableId 에어테이블 ID
     * @returns {Promise<string>} VipUp 데이터
     */
    async fetchVipUp(airtableId) {
      if (!airtableId) return null;
      
      try {
        // 캐시에서 먼저 확인
        const cached = this.get(airtableId);
        if (cached) return cached;
        
        // AirtableManager 인스턴스 가져오기
        const airtableManager = AirtableManager.getInstance();
        if (!airtableManager) {
          console.error('AirtableManager 인스턴스를 찾을 수 없습니다.');
          return null;
        }
        
        // 단어 정보 가져오기
        const word = await airtableManager.getWord(airtableId);
        if (word && word.vipup) {
          // 캐시에 저장
          this.set(airtableId, word.vipup);
          return word.vipup;
        }
        
        return null;
      } catch (error) {
        console.error('VipUp 데이터 가져오기 오류:', error);
        return null;
      }
    }
  }
  
  // 전역 객체로 노출
  window.AirtableManager = AirtableManager;
  window.VipUpCacheManager = VipUpCacheManager;
  
  // 메시지 로깅
  console.log('AirtableManager: 스크립트 로드 완료');
  console.log(`환경: ${isNetlifyEnvironment ? 'Netlify (프록시 모드)' : '개발 (직접 모드)'}`);
})();