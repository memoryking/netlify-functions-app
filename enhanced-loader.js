/**
 * enhanced-loader.js - 기본 DB 생성 방지 버전
 * 수정: IndexedDBManager 대신 ContentBasedDBManager만 사용
 * 추가: 로딩 오버레이 기능
 * 추가: Netlify 환경 감지 및 API 프록시 지원
 * 추가: 토큰 기반 접근 제어
 */

// =========== 앱 버전 및 상수 정의 ===========
const APP_VERSION = '2.2.0'; // 버전 업데이트 - 토큰 검증 추가
const CACHE_BUSTER = Date.now().toString(36).substring(0, 5);

// =========== 환경 감지 ===========
const isNetlifyEnvironment = window.location.hostname.includes('netlify.app') || 
                            window.location.hostname.includes('netlify.com');
const isDevelopmentEnvironment = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1' ||
                                window.location.hostname.startsWith('192.168.');

// 전역 환경 설정
window.ENV_CONFIG = {
  isNetlify: isNetlifyEnvironment,
  isDevelopment: isDevelopmentEnvironment,
  useApiProxy: isNetlifyEnvironment, // Netlify에서는 항상 프록시 사용
  proxyUrl: '/.netlify/functions/airtable-proxy'
};

console.log('환경 설정:', {
  hostname: window.location.hostname,
  isNetlify: window.ENV_CONFIG.isNetlify,
  isDevelopment: window.ENV_CONFIG.isDevelopment,
  useApiProxy: window.ENV_CONFIG.useApiProxy
});

// =========== 안전한 초기 상태 설정 ===========
window._loadedScripts = window._loadedScripts || {};
window._scriptLoadPromises = window._scriptLoadPromises || {};
window._scriptDependencies = window._scriptDependencies || {};
window._domInitialized = window._domInitialized || false;

// window._initStatus 객체 안전한 초기화
if (!window._initStatus) {
  window._initStatus = {
    started: false,
    completed: false,
    error: null,
    promise: null,
    blocked: false,  // 토큰 검증 차단 플래그 추가
    modules: {
      tokenValidator: false,  // 토큰 검증 모듈 추가
      contentSystem: false,
      indexedDB: false,
      network: false,
      dataLoader: false,
      airtable: false,
      utils: false,
      wordLearningApp: false
    }
  };
} else {
  if (!window._initStatus.modules) {
    window._initStatus.modules = {
      tokenValidator: false,  // 토큰 검증 모듈 추가
      contentSystem: false,
      indexedDB: false,
      network: false,
      dataLoader: false,
      airtable: false,
      utils: false,
      wordLearningApp: false
    };
  }
  if (window._initStatus.blocked === undefined) {
    window._initStatus.blocked = false;  // 토큰 검증 차단 플래그 추가
  }
}

// window.app 객체 안전한 초기화 - 강화된 버전
if (!window.app) {
  window.app = {
    initialized: false,
    initializationInProgress: false,
    userPhone: null,
    type: null,
    startMode: null,
    updateWordCounts: null,
    getCurrentWord: null,
    handleAnswer: null,
    // 환경 설정 추가
    env: window.ENV_CONFIG
  };
} else {
  // 기존 app 객체에 환경 설정 추가
  window.app.env = window.ENV_CONFIG;
}

/**
 * API 키 존재 여부 확인 (보안 강화)
 */
function hasApiKeyInUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlParams = params.get('urlParams');
    
    if (urlParams) {
      const decodedParams = new URLSearchParams(decodeURIComponent(urlParams));
      return decodedParams.has('airtable_apikey');
    }
    
    return params.has('airtable_apikey');
  } catch (e) {
    return false;
  }
}

// 개발 환경에서만 API 키 경고 표시
if (window.ENV_CONFIG.isDevelopment && hasApiKeyInUrl()) {
  console.warn('⚠️ 개발 환경: URL에 API 키가 노출되어 있습니다. 프로덕션에서는 제거하세요!');
}

// Netlify 환경에서 API 키가 있으면 경고
if (window.ENV_CONFIG.isNetlify && hasApiKeyInUrl()) {
  console.error('🚨 보안 경고: Netlify 환경에서 API 키가 URL에 노출되어 있습니다!');
  console.error('URL에서 airtable_apikey 파라미터를 제거하고 환경변수를 사용하세요.');
}

/**
 * 타입봇 환경 확인
 */
function checkTypebotEnvironment() {
  try {
    if (window.self !== window.top) {
      const currentUrl = window.location.href;
      const parentUrl = document.referrer;
      
      return currentUrl.includes('typebot') || 
             currentUrl.includes('unrivaled-gingersnap') ||
             parentUrl.includes('typebot') || 
             parentUrl.includes('unrivaled-gingersnap');
    }
    return false;
  } catch (e) {
    return true;
  }
}

/**
 * 로딩 오버레이 관련 함수들
 */
function showLoadingOverlay() {
  const overlay = document.getElementById('appLoadingOverlay');
  if (!overlay) return;
  
  // body의 원래 overflow 저장
  document.body.dataset.originalOverflow = document.body.style.overflow || '';
  document.body.style.overflow = 'hidden';
  
  // container 숨기기
  const container = document.querySelector('.container');
  if (container) {
    container.style.opacity = '0';
    container.style.visibility = 'hidden';
  }
  
  // 초기 설정 - 인라인 스타일로 강제 적용
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: rgba(255, 255, 255, 0.98) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 999999 !important;
  `;
  
  overlay.classList.remove('fade-out');
  overlay.classList.remove('show');
  
  // 강제 리플로우로 트랜지션 보장
  overlay.offsetHeight;
  
  // show 클래스 추가로 페이드인
  overlay.classList.add('show');
  
  // 초기 상태 설정
  updateLoadingProgress(0, '앱을 초기화하는 중...');
}

function updateLoadingProgress(percent, message) {
  const overlay = document.getElementById('appLoadingOverlay');
  if (!overlay) return;
  
  const progressFill = overlay.querySelector('.app-loading-progress-fill');
  const loadingText = overlay.querySelector('.app-loading-text');
  
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  
  if (loadingText && message) {
    loadingText.textContent = message;
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('appLoadingOverlay');
  if (!overlay) return;
  
  // body overflow 복원
  const originalOverflow = document.body.dataset.originalOverflow || '';
  document.body.style.overflow = originalOverflow;
  delete document.body.dataset.originalOverflow;
  
  // container 표시
  const container = document.querySelector('.container');
  if (container) {
    container.style.opacity = '';
    container.style.visibility = '';
  }
  
  // 페이드 아웃 효과
  overlay.classList.add('fade-out');
  overlay.classList.remove('show');
  
  // 애니메이션 완료 후 완전히 숨김
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('fade-out');
    
    // 진행률 초기화
    const progressFill = overlay.querySelector('.app-loading-progress-fill');
    if (progressFill) {
      progressFill.style.width = '0%';
    }
  }, 500);
}

/**
 * URL 정화 함수 - HTML 태그 및 위험한 문자 제거
 */
function sanitizeUrl(url) {
  if (!url) return '';
  
  return url
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/[^\w\-_.~:/?#[\]@!$&'()*+,;=%]/g, '');
}

/**
 * 스크립트 로드 함수 - 안전성 강화
 */
function loadScriptOnce(src, dependencies = [], force = false) {
  const cleanSrc = sanitizeUrl(src);
  if (!cleanSrc) {
    return Promise.reject(new Error(`Invalid script URL: ${src}`));
  }
  
  if (!force && window._scriptLoadPromises[cleanSrc]) {
    return window._scriptLoadPromises[cleanSrc];
  }
  
  if (!force && window._loadedScripts[cleanSrc]) {
    return Promise.resolve();
  }

  const dependencyPromises = dependencies.map(dep => loadScriptOnce(dep));
  
  const loadPromise = Promise.all(dependencyPromises).then(() => {
    return new Promise((resolve, reject) => {
      const versionedSrc = `${cleanSrc}?v=${APP_VERSION}&cb=${CACHE_BUSTER}`;
      console.log(`스크립트 로드: ${cleanSrc}`);
      
      const script = document.createElement('script');
      script.src = versionedSrc;
      script.type = 'text/javascript';
      
      const timeout = setTimeout(() => {
        script.remove();
        delete window._scriptLoadPromises[cleanSrc];
        reject(new Error(`Script load timeout: ${cleanSrc}`));
      }, 30000);
      
      script.onload = () => {
        clearTimeout(timeout);
        window._loadedScripts[cleanSrc] = true;
        console.log(`스크립트 로드 성공: ${cleanSrc}`);
        delete window._scriptLoadPromises[cleanSrc];
        resolve();
      };
      
      script.onerror = (err) => {
        clearTimeout(timeout);
        console.error(`스크립트 로드 실패: ${cleanSrc}`, err);
        delete window._scriptLoadPromises[cleanSrc];
        reject(new Error(`${cleanSrc} 스크립트 로드 실패`));
      };
      
      if (document.body) {
        document.body.appendChild(script);
      } else {
        document.head.appendChild(script);
      }
    });
  });
  
  window._scriptLoadPromises[cleanSrc] = loadPromise;
  window._scriptDependencies[cleanSrc] = dependencies;
  
  return loadPromise;
}
/**
 * URL 파라미터 파싱 함수 - 보안 강화
 */
function parseUrlParams() {
  // 이미 파싱된 결과가 있으면 재사용
  if (window._parsedUrlParams) {
    return window._parsedUrlParams;
  }
  
  try {
    const search = window.location.search;
    
    if (!search || search.length < 2) {
      console.warn('검색 문자열이 없습니다. 기본값 사용');
      window._parsedUrlParams = new URLSearchParams('type=1');
      return window._parsedUrlParams;
    }
    
    const cleanSearch = sanitizeUrl(search)
      .replace(/:\d+$/, '')
      .replace(/[<>]/g, '')
      .substring(0, 2000);
    
    console.log('정화된 검색 문자열:', cleanSearch);
    
    let decodedSearch;
    try {
      decodedSearch = decodeURIComponent(cleanSearch);
    } catch (decodeError) {
      console.warn('URL 디코딩 실패, 원본 사용:', decodeError);
      decodedSearch = cleanSearch;
    }
    
    const urlParamsMatch = decodedSearch.match(/urlParams=([^&\s<>]+)/);
    
    if (!urlParamsMatch || !urlParamsMatch[1]) {
      console.warn('urlParams를 찾을 수 없습니다. 기본값 사용');
      window._parsedUrlParams = new URLSearchParams('type=1');
      return window._parsedUrlParams;
    }
    
    const cleanParams = sanitizeUrl(urlParamsMatch[1]).substring(0, 1000);
    
    let params;
    try {
      params = new URLSearchParams(cleanParams);
    } catch (parseError) {
      console.error('URLSearchParams 파싱 오류:', parseError);
      window._parsedUrlParams = new URLSearchParams('type=1');
      return window._parsedUrlParams;
    }
    
    if (!params.get('type')) {
      params.append('type', '1');
    }
    
    const contents = params.get('contents');
    if (contents) {
      console.log(`URL에서 감지된 콘텐츠: "${contents}"`);
    }
    
    // 파싱 결과 캐시
    window._parsedUrlParams = params;
    return params;
  } catch (error) {
    console.error('URL 파라미터 파싱 치명적 오류:', error);
    window._parsedUrlParams = new URLSearchParams('type=1');
    return window._parsedUrlParams;
  }
}

/**
 * 메시지 표시 함수들
 */
function hideMainMessage() {
  const mainMessage = document.getElementById('mainMessage');
  if (mainMessage) {
    mainMessage.style.display = 'none';
    mainMessage.className = 'message-container';
  }
}

function showErrorMessage(message, isRecoverable = true) {
  const mainMessage = document.getElementById('mainMessage');
  if (!mainMessage) return;
  
  while (mainMessage.firstChild) {
    mainMessage.removeChild(mainMessage.firstChild);
  }
  
  const messageText = document.createElement('span');
  messageText.textContent = String(message).substring(0, 200);
  messageText.style.color = '#EF4444';
  mainMessage.appendChild(messageText);
  
  mainMessage.style.display = 'block';
  mainMessage.className = 'message-container show';
  
  if (isRecoverable) {
    mainMessage.appendChild(document.createElement('br'));
    
    const retryButton = document.createElement('button');
    retryButton.textContent = '다시 시도';
    retryButton.style.cssText = `
      margin-top: 10px; padding: 5px 15px; background: #4F46E5; 
      color: white; border: none; border-radius: 4px; cursor: pointer;
    `;
    
    retryButton.onclick = () => {
      messageText.textContent = '앱을 다시 초기화하는 중...';
      messageText.style.color = '#4F46E5';
      retryButton.disabled = true;
      retryButton.style.opacity = '0.5';
      
      window._initStatus = {
        started: false,
        completed: false,
        error: null,
        promise: null,
        blocked: false,  // 토큰 검증 차단 플래그 추가
        modules: {
          tokenValidator: false,  // 토큰 검증 모듈 추가
          contentSystem: false,
          indexedDB: false,
          network: false,
          dataLoader: false,
          airtable: false,
          utils: false,
          wordLearningApp: false
        }
      };
      
      window.app = {
        initialized: false,
        initializationInProgress: false,
        userPhone: null,
        type: null,
        startMode: null,
        updateWordCounts: null,
        getCurrentWord: null,
        handleAnswer: null
      };
      
      // 로딩 오버레이 다시 표시
      showLoadingOverlay();
      
      setTimeout(() => {
        loadCoreScripts()
          .then(success => {
            if (success) {
              hideMainMessage();
            } else {
              retryButton.disabled = false;
              retryButton.style.opacity = '1';
              showErrorMessage('앱 초기화에 다시 실패했습니다.', true);
            }
          })
          .catch(err => {
            retryButton.disabled = false;
            retryButton.style.opacity = '1';
            showErrorMessage('오류 발생: ' + String(err.message).substring(0, 100), true);
          });
      }, 500);
    };
    
    mainMessage.appendChild(retryButton);
  }
}

/**
 * 기본 앱 초기화 함수 - ContentBasedDBManager 사용으로 수정
 */
async function initializeBasicApp() {
  try {
    console.log('🚀 기본 앱 초기화 시작 (ContentBasedDBManager 사용)');
    
    // ⭐ 타입봇 환경 체크
    const isInTypebot = checkTypebotEnvironment();
    
    // URL 파라미터 파싱
    const params = parseUrlParams();
    const phoneParam = params.get('phoneParam');
    const type = params.get('type');
    const contents = params.get('contents');
    
    console.log('초기화 파라미터:', { phone: phoneParam, type, contents });
    
    // ⭐ 기존 app의 콘텐츠와 비교
    if (window.app && window.app.dbManager) {
      const currentContent = window.app.dbManager.getCurrentContentId();
      
      if (contents && contents !== currentContent) {
        console.log(`콘텐츠 변경 감지: "${currentContent}" → "${contents}"`);
        
        // 기존 DB 연결 정리 (다른 콘텐츠의 DB만)
        if (window._dbConnections) {
          const newDbName = `WordsDB_${contents.replace(/[^\w가-힣\-]/g, '_')}`;
          
          Object.entries(window._dbConnections).forEach(([dbName, db]) => {
            if (db && db.close && dbName !== newDbName) {
              console.log(`이전 콘텐츠 DB 닫기: ${dbName}`);
              db.close();
              delete window._dbConnections[dbName];
            }
          });
        }
      } else if (contents === currentContent) {
        console.log('동일한 콘텐츠로 재진입, 기존 DB 재사용');
      }
    } else if (!isInTypebot && window._dbConnections) {
      // 타입봇 환경이 아닌 경우에만 전체 DB 연결 정리
      Object.values(window._dbConnections).forEach(db => {
        if (db && db.close) db.close();
      });
      window._dbConnections = {};
    }
    
    if (window.app && window.app.initializationInProgress) {
      console.log('앱 초기화가 이미 진행 중입니다.');
      return false;
    }
    
    if (!window.app) {
      window.app = {
        initialized: false,
        initializationInProgress: false,
        userPhone: null,
        type: null,
        startMode: null,
        updateWordCounts: null,
        getCurrentWord: null,
        handleAnswer: null
      };
    }
    
    window.app.initializationInProgress = true;
    
    if (!phoneParam) {
      throw new Error('전화번호 파라미터가 없습니다');
    }
    
    const cleanPhone = phoneParam.replace(/[^0-9]/g, '');
    console.log('초기화 전화번호:', cleanPhone);
    
    window.app.userPhone = cleanPhone;
    window.app.type = type;
    
    // ⭐ ContentBasedDBManager 인스턴스 관리
    console.log('ContentBasedDBManager 대기 중...');
    
    // ContentBasedDBManager Promise 대기
    let dbManager;
    
    // ⭐ 싱글톤 패턴 사용 - 콘텐츠 변경도 처리
    if (window.ContentBasedDBManagerPromise) {
      try {
        const ContentBasedDBManagerClass = await window.ContentBasedDBManagerPromise;
        // ⭐ 싱글톤 패턴 사용
        dbManager = ContentBasedDBManagerClass.getInstance();
        console.log('ContentBasedDBManager 싱글톤 인스턴스 가져오기 완료');
      } catch (promiseError) {
        console.error('ContentBasedDBManager Promise 오류:', promiseError);
        throw new Error('ContentBasedDBManager 로드 실패');
      }
    } else if (window.ContentBasedDBManager) {
      // ⭐ 싱글톤 패턴 사용
      dbManager = window.ContentBasedDBManager.getInstance();
      console.log('ContentBasedDBManager 싱글톤 직접 가져오기 완료');
    } else {
      throw new Error('ContentBasedDBManager를 찾을 수 없습니다');
    }
    
    // ⭐ DB 초기화 - 콘텐츠에 맞는 DB 사용
    await dbManager.initDatabase();
    window.app.dbManager = dbManager;
    
    console.log(`✅ DB 초기화 완료: ${dbManager.DB_NAME}`);
    
    // ⭐ 콘텐츠 변경 시 캐시 초기화
    if (dbManager._needsReinit) {
      console.log('콘텐츠 변경으로 인한 캐시 초기화');
      
      // 단어 카운트 캐시 초기화
      if (window.app.countCache) {
        window.app.countCache.clear();
      }
      
      // 기타 캐시들 초기화
      if (window.app.currentWord) {
        window.app.currentWord = null;
      }
      
      dbManager._needsReinit = false;
    }
    
    // 설정 저장
    await dbManager.saveSetting('currentPhoneNumber', cleanPhone);
    await dbManager.saveSetting('currentType', type);
    
    // 필드 타입 검증
    if (typeof dbManager.validateFieldTypes === 'function') {
      const result = await dbManager.validateFieldTypes();
      if (result?.issues?.length) {
        await dbManager.normalizeAllFieldTypes();
      }
    }
    
    // 2. 기본 매니저들 초기화
				if (typeof NetworkManager === 'function') {
						// 전역 싱글톤 사용
						if (!window._networkManagerInstance) {
								window._networkManagerInstance = new NetworkManager();
								console.log('NetworkManager 싱글톤 생성');
						}
						window.app.networkManager = window._networkManagerInstance;
						console.log('네트워크 매니저 초기화 완료');
				}
    
    if (typeof TypeSettings === 'function') {
      window.app.typeSettings = new TypeSettings(type);
      console.log('타입 설정 초기화 완료');
    }
    
    if (typeof WordCountCache === 'function') {
      // ⭐ 콘텐츠별 캐시 생성
      const cacheKey = `cache_${contents || 'default'}`;
      if (!window._wordCountCaches) {
        window._wordCountCaches = {};
      }
      
      if (!window._wordCountCaches[cacheKey]) {
        window._wordCountCaches[cacheKey] = new WordCountCache();
      }
      
      window.app.countCache = window._wordCountCaches[cacheKey];
      console.log(`단어 개수 캐시 초기화 완료 (${cacheKey})`);
    }
    
    // 3. 오프라인 UI 초기화
    if (typeof initializeOfflineUI === 'function') {
      initializeOfflineUI();
      console.log('오프라인 UI 초기화 완료');
    }
    
    // 4. 기본 초기화 완료 플래그 설정
    window.app.initialized = true;
    window.app.initializationInProgress = false;
    
    console.log('✅ 기본 앱 초기화 완료 (ContentBasedDBManager 사용)');
    return true;
    
  } catch (error) {
    console.error('기본 앱 초기화 중 오류 발생:', error);
    
    if (window.app) {
      window.app.initializationInProgress = false;
    }
    
    const mainMessage = document.getElementById('mainMessage');
    if (mainMessage) {
      mainMessage.textContent = `초기화 중 오류가 발생했습니다: ${error.message}`;
      mainMessage.style.display = 'block';
      mainMessage.className = 'message-container show';
    }
    return false;
  }
}

/**
 * WordLearningApp 통합 함수
 */
async function integrateWordLearningApp() {
  try {
    console.log('🔄 WordLearningApp 통합 시작');
    
    if (!window.app || !window.app.dbManager) {
      console.error('기본 앱이 초기화되지 않았습니다');
      return false;
    }
    
    if (typeof WordLearningApp !== 'function') {
      console.error('WordLearningApp 클래스를 찾을 수 없습니다');
      return false;
    }
    
    const wordLearningAppInstance = new WordLearningApp();
    
    const existingApp = { ...window.app };
    
    Object.getOwnPropertyNames(Object.getPrototypeOf(wordLearningAppInstance)).forEach(methodName => {
      if (methodName !== 'constructor' && typeof wordLearningAppInstance[methodName] === 'function') {
        window.app[methodName] = wordLearningAppInstance[methodName].bind(wordLearningAppInstance);
      }
    });
    
    Object.keys(wordLearningAppInstance).forEach(prop => {
      if (!(prop in existingApp)) {
        window.app[prop] = wordLearningAppInstance[prop];
      }
    });
    
    Object.keys(existingApp).forEach(key => {
      if (existingApp[key] && !(key in wordLearningAppInstance)) {
        window.app[key] = existingApp[key];
      }
    });
    
    if (typeof window.app.initialize === 'function' && window.app.userPhone) {
								// 중복 초기화 방지
								if (!window.app._alreadyInitialized) {
												console.log('WordLearningApp initialize 메서드 호출');
												await window.app.initialize(window.app.userPhone);
												window.app._alreadyInitialized = true;
								} else {
												console.log('WordLearningApp 이미 초기화됨, 스킵');
								}
				}
    
    if (window._initStatus && window._initStatus.modules) {
      window._initStatus.modules.wordLearningApp = true;
    }
    
    console.log('✅ WordLearningApp 통합 완료');
    return true;
    
  } catch (error) {
    console.error('WordLearningApp 통합 오류:', error);
    return false;
  }
}

/**
 * ContentBasedDBManager가 준비될 때까지 대기
 */
async function waitForContentBasedDBManager(maxWait = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    if (window.ContentBasedDBManagerPromise && typeof window.ContentBasedDBManagerPromise.then === 'function') {
      console.log('ContentBasedDBManager Promise 발견, 대기 중...');
      try {
        const DBManagerClass = await window.ContentBasedDBManagerPromise;
        if (DBManagerClass) {
          window.ContentBasedDBManager = DBManagerClass;
          console.log('ContentBasedDBManager 클래스 로드 완료');
          return true;
        }
      } catch (error) {
        console.error('ContentBasedDBManager Promise 에러:', error);
      }
    }
    
    if (window.ContentBasedDBManager && typeof window.ContentBasedDBManager === 'function') {
      console.log('ContentBasedDBManager 클래스 직접 발견');
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.warn('ContentBasedDBManager 대기 시간 초과');
  return false;
}

/**
 * 안전한 UIManager 초기화 함수
 */
function safeInitializeUIManager() {
    return new Promise((resolve) => {
        if (typeof UIManager !== 'function') {
            console.warn('UIManager 클래스를 찾을 수 없습니다');
            resolve(false);
            return;
        }
        
        if (!window.app || !window.app.initialized) {
            console.warn('window.app이 준비되지 않았습니다');
            resolve(false);
            return;
        }
        
        try {
            if (!window.uiManager) {
                // ⭐ 중요: window.app을 명시적으로 전달
                window.uiManager = new UIManager(window.app);
                
                // ⭐ app 참조가 동일한지 확인
                if (window.uiManager.app !== window.app) {
                    console.warn('UIManager의 app 참조가 다릅니다. 동기화 중...');
                    window.uiManager.app = window.app;
                }
                
                console.log('✅ UIManager 초기화 완료 (app 참조 동기화됨)');
                resolve(true);
            } else {
                // 기존 UIManager가 있으면 app 참조 재확인
                if (window.uiManager.app !== window.app) {
                    window.uiManager.app = window.app;
                    console.log('기존 UIManager의 app 참조 업데이트');
                }
                console.log('UIManager가 이미 초기화되었습니다');
                resolve(true);
            }
        } catch (error) {
            console.error('UIManager 초기화 오류:', error);
            resolve(false);
        }
    });
}

/**
 * 콘텐츠 기반 핵심 스크립트 로드 함수 - 로딩 오버레이 포함
 */
async function loadCoreScripts() {
  if (window._initStatus && window._initStatus.started && window._initStatus.promise) {
    console.log('이미 초기화가 진행 중입니다.');
    return window._initStatus.promise;
  }
  
  // 토큰 검증이 차단했는지 확인
  if (window._initStatus && window._initStatus.blocked) {
    console.log('토큰 검증 실패로 초기화가 차단되었습니다.');
    return false;
  }
  
  if (!window._initStatus || !window._initStatus.modules) {
    window._initStatus = {
      started: false,
      completed: false,
      error: null,
      promise: null,
      blocked: false,  // 토큰 검증 차단 플래그 추가
      modules: {
        tokenValidator: false,  // 토큰 검증 모듈 추가
        contentSystem: false,
        indexedDB: false,
        network: false,
        dataLoader: false,
        airtable: false,
        utils: false,
        wordLearningApp: false
      }
    };
  }
  
  window._initStatus.started = true;
  
  window._initStatus.promise = (async () => {
    try {
      console.log('콘텐츠 기반 앱 스크립트 로드 시작...');
      
      hideMainMessage();
      
      // 로딩 진행률 업데이트
      updateLoadingProgress(5, '보안 검증 중...');
      
      // 0단계: 토큰 검증 스크립트 로드 및 실행
      console.log('0단계: 토큰 검증');
      await loadScriptOnce('token-validator.js');
      
      // 토큰 검증 완료 대기
      if (window.tokenValidator) {
        const validationResult = await window.tokenValidator.validate();
        
        if (!validationResult || !validationResult.valid) {
          console.log('토큰 검증 실패, 초기화 중단');
          window._initStatus.blocked = true;
          hideLoadingOverlay();
          return false;
        }
        
        console.log('토큰 검증 성공, 계속 진행');
        window._initStatus.modules.tokenValidator = true;
      }
      
      updateLoadingProgress(10, '기본 유틸리티 로드 중...');
      
      // 1단계: 기본 유틸리티
      console.log('1단계: 기본 유틸리티 로드');
      await Promise.all([
        loadScriptOnce('korean-time-util.js'),
        loadScriptOnce('vipup-encryption.js')
      ]);
      
      updateLoadingProgress(20, 'IndexedDB 초기화 중...');
      
      // 2단계: ⭐ IndexedDBManager 먼저 로드 (ContentBasedDBManager가 상속하기 위해)
      console.log('2단계: IndexedDBManager 로드');
      await loadScriptOnce('indexeddb-manager.js');
      
      if (window._initStatus && window._initStatus.modules) {
        window._initStatus.modules.indexedDB = true;
      }
      
      updateLoadingProgress(30, '콘텐츠 시스템 로드 중...');
      
      // 3단계: ContentBasedDBManager 로드 (IndexedDBManager 상속)
      console.log('3단계: ContentBasedDBManager 로드');
      await loadScriptOnce('content-based-db-manager.js', ['indexeddb-manager.js']);
      
      // ContentBasedDBManager 준비 대기
      const isContentDBReady = await waitForContentBasedDBManager();
      if (isContentDBReady) {
        console.log('ContentBasedDBManager 준비 완료');
      }
      
      updateLoadingProgress(40, '필수 컴포넌트 로드 중...');
      
      // 4단계: 필수 유틸리티 클래스들
      console.log('4단계: 필수 유틸리티 클래스 로드');
      await Promise.all([
        loadScriptOnce('type-settings.js'),
        loadScriptOnce('word-count-cache.js')
      ]);
      if (window._initStatus && window._initStatus.modules) {
        window._initStatus.modules.utils = true;
      }

      updateLoadingProgress(50, '앱 초기화 중...');

      // 5단계: 기본 앱 초기화 (ContentBasedDBManager 사용)
      console.log('5단계: 기본 앱 초기화 시작');
      const basicInitSuccess = await initializeBasicApp();
      if (!basicInitSuccess) {
        throw new Error('기본 앱 초기화 실패');
      }
      
      updateLoadingProgress(60, '네트워크 컴포넌트 로드 중...');
      
      // 6단계: 네트워크 및 에어테이블 매니저
      await loadScriptOnce('network-manager.js');
      if (window._initStatus && window._initStatus.modules) {
        window._initStatus.modules.network = true;
      }
      
      await loadScriptOnce('airtable-manager.js');
      if (window._initStatus && window._initStatus.modules) {
        window._initStatus.modules.airtable = true;
      }
      
      updateLoadingProgress(70, '데이터 로더 초기화 중...');
      
      // 다운로드 오버레이가 표시되어 있으면 숨기기
      if (typeof window.hideDownloadOverlay === 'function') {
        window.hideDownloadOverlay();
      }
      
      // 7단계: 데이터 로더들
      console.log('7단계: 데이터 로더 로드');
      await loadScriptOnce('data-loader.js', [
        'content-based-db-manager.js', 
        'airtable-manager.js', 
        'network-manager.js'
      ]);

      await loadScriptOnce('content-aware-data-loader.js', [
        'content-based-db-manager.js',
        'airtable-manager.js',
        'network-manager.js',
        'data-loader.js'
      ]);
      if (window._initStatus && window._initStatus.modules) {
        window._initStatus.modules.dataLoader = true;
      }

      // 다운로드 오버레이가 표시되어 있으면 숨기기
      if (typeof window.hideDownloadOverlay === 'function') {
        window.hideDownloadOverlay();
      }

      // 메인 메시지도 확실히 숨기기
      const mainMessage = document.getElementById('mainMessage');
      if (mainMessage) {
        mainMessage.style.display = 'none';
        mainMessage.className = 'message-container';
        mainMessage.innerHTML = '';
      }

      updateLoadingProgress(80, '콘텐츠 시스템 완성 중...');
      
      // 8단계: 완성된 콘텐츠 시스템
      console.log('8단계: 콘텐츠 시스템 로드');
      await loadScriptOnce('complete-content-system.js', [
        'content-based-db-manager.js',
        'content-aware-data-loader.js',
        'airtable-manager.js',
        'network-manager.js'
      ]);
      
      // ⭐ ContentAppInitializer 실행 전에 로딩 오버레이 숨기기
      hideLoadingOverlay();
      
      // ⭐ 추가할 코드: ContentAppInitializer 실행
      if (window.ContentAppInitializer) {
        console.log('ContentAppInitializer 인스턴스 생성 및 초기화 시작');
        
        // 전역 인스턴스 생성
        window.contentAppInitializer = new window.ContentAppInitializer();
        
        // 초기 UI 업데이트 스킵 플래그 설정
        window._skipInitialUIUpdate = true;
        
        // 초기화 실행
        const contentInitSuccess = await window.contentAppInitializer.initializeApp();
        
        if (!contentInitSuccess) {
          throw new Error('콘텐츠 앱 초기화 실패');
        }
        
        console.log('ContentAppInitializer 초기화 완료');
      } else {
        console.warn('ContentAppInitializer 클래스를 찾을 수 없습니다');
      }
      
      if (window._initStatus && window._initStatus.modules) {
        window._initStatus.modules.contentSystem = true;
      }
      
      updateLoadingProgress(85, '확장 기능 로드 중...');
      
      // 9단계: 확장 및 보조 스크립트들 (UIManager 포함)
      console.log('9단계: 확장 스크립트 로드');
      await Promise.all([
        loadScriptOnce('direct-data-loader.js', ['content-based-db-manager.js']),
        loadScriptOnce('airtable-adapter.js', ['airtable-manager.js', 'content-based-db-manager.js']),
        loadScriptOnce('difficult-mode.js', ['content-based-db-manager.js']),
        loadScriptOnce('UIManager.js')
      ]);
      
      updateLoadingProgress(90, '최종 설정 중...');
      
      // 10단계: 패치 파일들
      console.log('10단계: 패치 적용');
      await loadScriptOnce('airtable-fix.js', [
        'content-aware-data-loader.js',
        'complete-content-system.js'
      ]);
      
      // 11단계: WordLearningApp 통합
      console.log('11단계: WordLearningApp 통합');
      
      // 중복 초기화 방지를 위한 플래그 설정
      window._wordLearningAppIntegrated = false;
      
      const wordAppIntegrated = await integrateWordLearningApp();
      if (!wordAppIntegrated) {
        console.warn('WordLearningApp 통합 실패, 계속 진행');
      } else {
        window._wordLearningAppIntegrated = true;
      }
      
      updateLoadingProgress(95, '마무리 중...');
      
      // 12단계: 최종 매니저들 초기화
      console.log('12단계: 최종 매니저들 초기화');
      if (window.app && !window.app.fullyInitialized) {
        try {
          if (!window.app.airtableManager && typeof AirtableManager === 'function') {
            window.app.airtableManager = new AirtableManager();
            console.log('지연된 Airtable 매니저 초기화 완료');
            
            if (typeof AirtableManagerAdapter === 'function') {
              window.app.airtableAdapter = new AirtableManagerAdapter(
                window.app.airtableManager,
                window.app.dbManager,
                window.app.networkManager
              );
              
              if (typeof DirectDataLoader === 'function') {
                const directLoader = new DirectDataLoader(window.app.dbManager);
                window.app.airtableAdapter.setHybridLoader(directLoader);
              }
              console.log('지연된 Airtable 어댑터 초기화 완료');
            }
          }
          
          if (!window.app.networkManager && typeof NetworkManager === 'function') {
            // 전역 싱글톤 사용
            if (!window._networkManagerInstance) {
              window._networkManagerInstance = new NetworkManager();
              console.log('NetworkManager 싱글톤 생성');
            }
            window.app.networkManager = window._networkManagerInstance;
            console.log('지연된 네트워크 매니저 초기화 완료');
          }
          
          window.app.fullyInitialized = true;
          console.log('✅ 모든 컴포넌트 초기화 완료');
        } catch (error) {
          console.error('최종 초기화 중 오류:', error);
        }
      }
      
      updateLoadingProgress(100, '완료!');
      
      // 로딩 오버레이 숨기기
      setTimeout(() => {
        hideLoadingOverlay();
        
        // 메인 메시지 최종 확인 및 제거
        const mainMessage = document.getElementById('mainMessage');
        if (mainMessage) {
          mainMessage.style.display = 'none';
          mainMessage.className = 'message-container';
          mainMessage.innerHTML = '';
        }
      }, 500);
      
      // 13단계: UIManager 안전 초기화
      console.log('13단계: UIManager 안전 초기화');
      setTimeout(async () => {
        const uiInitialized = await safeInitializeUIManager();
        if (uiInitialized) {
          console.log('✅ UIManager 안전 초기화 완료');
        } else {
          console.warn('UIManager 초기화 실패');
        }
      }, 1500);

      // 14단계: 최종 초기화 및 깜빡임 방지
						console.log('14단계: 최종 초기화 및 UI 안정화');

						// 전역 플래그 설정 - airtable-fix가 참조할 수 있도록
						window._appFullyInitialized = false;
						window._finalUpdateInProgress = false;

						setTimeout(() => {
								// 컨테이너 준비 상태로 전환
								const container = document.querySelector('.container');
								if (container) {
										container.classList.add('ready');
										console.log('✅ 컨테이너 ready 클래스 추가');
								}
								
								// 초기화 플래그 해제
								window._skipInitialUIUpdate = false;
								window._initialLoadComplete = true;
								window._appFullyInitialized = true; // 전역 플래그 설정
								
								// 모든 로딩 클래스 제거 및 loaded 상태로 전환
								const allStatsValues = document.querySelectorAll('.stats-value');
								allStatsValues.forEach(element => {
										element.classList.remove('loading');
										element.classList.add('loaded');
								});
								
								// 최종 통계 업데이트 한 번만 실행
								if (window.app && typeof window.app.updateWordCounts === 'function') {
										console.log('최종 통계 업데이트 실행');
										
										// 업데이트 진행 중 플래그 설정
										window._finalUpdateInProgress = true;
										
										window.app.updateWordCounts('all', false).then(() => {
												console.log('✅ 최종 통계 업데이트 완료');
												window._finalUpdateInProgress = false;
												
												// 메인 화면이 활성화되어 있는지 확인
												const mainScreen = document.getElementById('mainScreen');
												if (mainScreen && mainScreen.classList.contains('active')) {
														// 푸터 텍스트 업데이트
														const footerText = document.querySelector('.footer-text');
														const totalElement = document.getElementById('totalWords');
														if (footerText && totalElement && totalElement.textContent) {
																const totalCount = totalElement.textContent;
																footerText.textContent = `맥락과 반복 - 전체 ${totalCount}개`;
														}
												}
												
												// ⭐ URL 정리 - 앱 초기화가 완전히 끝난 후
												setTimeout(() => {
														try {
																const currentUrl = window.location.href;
																// urlParams가 있거나 다른 파라미터가 있는 경우
																if (currentUrl.includes('?')) {
																		const cleanUrl = window.location.origin + window.location.pathname;
																		window.history.replaceState({}, document.title, cleanUrl);
																		console.log('✅ URL 정리 완료 - 모든 파라미터 제거');
																}
														} catch (urlError) {
																console.error('URL 정리 오류:', urlError);
														}
												}, 500); // 통계 업데이트 후 0.5초 뒤
												
												// 완료 이벤트 발생
												const initCompleteEvent = new CustomEvent('appInitComplete', {
														detail: { timestamp: Date.now() }
												});
												window.dispatchEvent(initCompleteEvent);
												console.log('✅ appInitComplete 이벤트 발생');
												
										}).catch(err => {
												console.error('최종 통계 업데이트 오류:', err);
												window._finalUpdateInProgress = false;
												
												// ⭐ 오류가 발생해도 URL은 정리
												setTimeout(() => {
														try {
																if (window.location.search) {
																		const cleanUrl = window.location.origin + window.location.pathname;
																		window.history.replaceState({}, document.title, cleanUrl);
																		console.log('✅ URL 정리 완료 (오류 발생 케이스)');
																}
														} catch (urlError) {
																console.error('URL 정리 오류:', urlError);
														}
												}, 500);
										});
								} else {
										// updateWordCounts가 없어도 완료 이벤트는 발생
										window._finalUpdateInProgress = false;
										
										// ⭐ updateWordCounts가 없는 경우에도 URL 정리
										setTimeout(() => {
												try {
														if (window.location.search) {
																const cleanUrl = window.location.origin + window.location.pathname;
																window.history.replaceState({}, document.title, cleanUrl);
																console.log('✅ URL 정리 완료 (updateWordCounts 없음)');
														}
												} catch (urlError) {
														console.error('URL 정리 오류:', urlError);
												}
										}, 500);
										
										const initCompleteEvent = new CustomEvent('appInitComplete', {
												detail: { timestamp: Date.now() }
										});
										window.dispatchEvent(initCompleteEvent);
										console.log('✅ appInitComplete 이벤트 발생');
								}
								
						}, 2500); // UIManager 초기화 후 1초 뒤 실행

      window._initStatus.completed = true;

      console.log('✅ 콘텐츠 기반 앱 로드 및 초기화 완료 (ContentBasedDBManager 사용)');

      return true;

    } catch (error) {
      if (window._initStatus) {
        window._initStatus.error = error.message;
      }
      console.error('스크립트 로드 오류:', error);
      
      // 오류 발생 시에도 로딩 오버레이 숨기기
      hideLoadingOverlay();
      
      // 오류 발생 시에도 컨테이너는 표시
      const container = document.querySelector('.container');
      if (container) {
        container.classList.add('ready');
      }
      
      showErrorMessage('앱 초기화 중 오류 발생: ' + String(error.message).substring(0, 100), true);
      return false;
    }
  })();

  return window._initStatus.promise;
}
/**
 * 앱 상태 확인 함수
 */
function checkAppStatus() {
  const status = {
    scriptsLoaded: window._initStatus?.completed || false,
    contentSystemReady: window.contentAppInitializer?.initialized || false,
    appReady: window.app?.initialized || false,
    wordLearningAppReady: window._initStatus?.modules?.wordLearningApp || false,
    currentContent: window.app?.currentContent || null,
    dbConnected: window.app?.dbManager?.db?.readyState === 'open',
    hasInitializeMethod: typeof window.app?.initialize === 'function',
    dbType: window.app?.dbManager?.constructor?.name || 'Unknown'
  };
  
  console.log('앱 상태:', status);
  return status;
}

/**
 * 콘텐츠 전환 함수 (전역) - 안전성 강화
 */
async function switchContent(contentId) {
  if (!contentId || typeof contentId !== 'string') {
    console.error('유효하지 않은 콘텐츠 ID입니다');
    return false;
  }
  
  const cleanContentId = String(contentId).substring(0, 50).replace(/[<>]/g, '');
  
  if (window.contentAppInitializer) {
    return await window.contentAppInitializer.switchToContent(cleanContentId);
  } else {
    console.error('콘텐츠 시스템이 초기화되지 않았습니다');
    return false;
  }
}

/**
 * 초기화 시작 함수
 */
function startInitialization() {
  if (window._domInitialized) {
    console.log('DOM 초기화가 이미 완료되었습니다.');
    return;
  }
  
  window._domInitialized = true;
  console.log('DOM 로드 완료, 콘텐츠 기반 앱 초기화 시작...');
  
  // 로딩 오버레이 표시
  showLoadingOverlay();
  
  hideMainMessage();
  
  loadCoreScripts().catch(error => {
    console.error('초기화 오류:', error);
    hideLoadingOverlay();
    showErrorMessage('앱 초기화 오류: ' + String(error.message).substring(0, 100), true);
  });
}

// =========== 네트워크 상태 변경 감지 ===========
window.addEventListener('online', function() {
  console.log('온라인 상태 감지');
  if (window.app && window.app.networkManager) {
    window.app.networkManager.handleNetworkChange({ type: 'online' });
  }
});

window.addEventListener('offline', function() {
  console.log('오프라인 상태 감지');
  if (window.app && window.app.networkManager) {
    window.app.networkManager.handleNetworkChange({ type: 'offline' });
  }
});

// =========== 전역 오류 핸들러 강화 ===========
window.addEventListener('error', function(event) {
  const errorMessage = event.error?.message || '';
  console.error('전역 오류 발생:', event.error);
  
  if (event.filename && event.filename.includes('.js')) {
    console.error(`스크립트 오류 발생: ${event.filename}:${event.lineno}`);
  }
  
  if (
    errorMessage.includes('HTTP 오류: 401') ||
    errorMessage.includes('AUTHENTICATION_REQUIRED') ||
    errorMessage.includes('Authentication required')
  ) {
    console.error('API 인증 오류 감지');
  }
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('처리되지 않은 Promise 거부:', event.reason);
  
  if (window.location.hostname === 'localhost') {
    console.warn('Promise rejection:', event.reason);
  }
});

// =========== DOM 로드 완료 시 자동 시작 ===========
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startInitialization);
} else {
  startInitialization();
}

// =========== 전역 메서드 노출 ===========
window.parseUrlParams = parseUrlParams;
window.loadCoreScripts = loadCoreScripts;
window.hideMainMessage = hideMainMessage;
window.showErrorMessage = showErrorMessage;
window.startAppInitialization = startInitialization;
window.checkAppStatus = checkAppStatus;
window.switchContent = switchContent;
window.initializeBasicApp = initializeBasicApp;
window.integrateWordLearningApp = integrateWordLearningApp;
window.safeInitializeUIManager = safeInitializeUIManager;
window.showLoadingOverlay = showLoadingOverlay;
window.updateLoadingProgress = updateLoadingProgress;
window.hideLoadingOverlay = hideLoadingOverlay;
window.checkTypebotEnvironment = checkTypebotEnvironment;

console.log('콘텐츠 기반 Enhanced Loader 로드 완료 (v2.2.0 - 토큰 검증 추가)');