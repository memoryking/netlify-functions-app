/**
 * 하이브리드 데이터 로더 사용 예시 코드
 */

// 화면 구성요소 참조 - DOM 요소 존재 여부 확인 추가
const wordElement = document.getElementById('word');
const meaningElement = document.getElementById('meaning');
const pronunciationElement = document.getElementById('pronunciation');
const vipupElement = document.getElementById('vipup');
const contextElement = document.getElementById('context');
const imageContainer = document.getElementById('image-container');
const videoContainer = document.getElementById('video-container');
const audioContainer = document.getElementById('audio-container');
const refreshButton = document.getElementById('refresh-button');
const offlineIndicator = document.getElementById('offline-indicator');
const loadingIndicator = document.getElementById('loading-indicator');

// 학습 모드 설정
let isAdvancedMode = false; // 고난도 모드 여부
let currentAirtableId = null;

/**
 * DOM 요소 안전하게 접근하는 유틸리티 함수
 */
function safeDOM(element, operation) {
  if (element && typeof operation === 'function') {
    return operation(element);
  }
  return false;
}

/**
 * 앱 초기화 함수
 */
async function initializeApp() {
  try {
    console.log('앱 초기화 시작...');
    
    // DOM 요소 존재 확인
    if (!document.body) {
      console.warn('document.body가 아직 로드되지 않았습니다. DOMContentLoaded 이벤트를 기다립니다.');
      return;
    }
    
    // 필수 모듈 존재 확인
    if (!window.NetworkManager || !window.IndexedDBManager || !window.AirtableManager) {
      console.error('필수 모듈이 로드되지 않았습니다:', {
        NetworkManager: !!window.NetworkManager,
        IndexedDBManager: !!window.IndexedDBManager,
        AirtableManager: !!window.AirtableManager
      });
      return;
    }
    
    // 매니저 및 어댑터 초기화
    const airtableKey = 'YOUR_AIRTABLE_API_KEY';
    const baseId = 'YOUR_AIRTABLE_BASE_ID';
    
    // 전역 객체에서 직접 클래스 참조
    const networkManager = new window.NetworkManager();
    const dbManager = new window.IndexedDBManager();
    const airtableManager = new window.AirtableManager(airtableKey, baseId);
    
    // 어댑터 설정
    const adapter = new window.AirtableManagerAdapter(airtableManager, dbManager, networkManager);
    
    // 하이브리드 로더 설정변경 DirectDataLoader
	
	const directDataLoader = new window.DirectDataLoader(dbManager);
	adapter.setHybridLoader(directDataLoader);
    
    // 네트워크 상태 감지 및 표시
    window.addEventListener('online', () => updateNetworkStatus(networkManager, adapter));
    window.addEventListener('offline', () => updateNetworkStatus(networkManager, adapter));
    
    // 네트워크 상태 처음 확인 - 이제 안전하게 호출
    try {
      updateNetworkStatus(networkManager, adapter);
    } catch (error) {
      console.warn('네트워크 상태 업데이트 실패:', error);
    }
    
    // 전화번호 가져오기 (인증 후)
    const phoneNumber = await dbManager.getSetting('currentPhoneNumber');
    if (!phoneNumber) {
      console.warn('로그인이 필요합니다');
      return;
    }
    
    // 학습 상태 가져오기
    const studyCount = await adapter.getStudyCount(phoneNumber);
    
    // 새 단어 가져오기
    const words = await adapter.getNewWords(studyCount.study_count);
    
    // 첫 단어 표시
    if (words.length > 0) {
      displayWord(words[0], adapter);
      
      // 나머지 단어 데이터 선제적 로드
      adapter.preloadWordMediaData(words);
    } else {
      console.warn('학습할 단어가 없습니다');
    }
    
    // 새로고침 버튼 이벤트 설정
    safeDOM(refreshButton, (el) => {
      el.addEventListener('click', () => {
        refreshWordData(currentAirtableId, adapter);
      });
    });
    
    // 학습 모드 전환 이벤트 설정
    const toggleModeBtn = document.getElementById('toggle-mode');
    safeDOM(toggleModeBtn, (el) => {
      el.addEventListener('click', () => {
        isAdvancedMode = !isAdvancedMode;
        
        const modeIndicator = document.getElementById('mode-indicator');
        safeDOM(modeIndicator, (indicator) => {
          indicator.textContent = isAdvancedMode ? '고난도 모드' : '암기중 모드';
        });
        
        // 현재 단어 다시 로드
        if (currentAirtableId) {
          displayWordMedia(currentAirtableId, adapter);
        }
      });
    });
    
    // 백그라운드에서 캐시 정리
    setTimeout(() => {
      adapter.cleanupCache().catch(err => {
        console.warn('캐시 정리 실패', err);
      });
    }, 3000);
    
    console.log('앱 초기화 완료');
  } catch (error) {
    console.error('앱 초기화 오류:', error);
  }
}

/**
 * 네트워크 상태 업데이트 및 표시
 */
function updateNetworkStatus(networkManager, adapter) {
  if (!networkManager || typeof networkManager.isNetworkOnline !== 'function') {
    console.warn('유효하지 않은 networkManager');
    return;
  }
  
  const isOnline = networkManager.isNetworkOnline();
  console.log(`네트워크 상태: ${isOnline ? '온라인' : '오프라인'}`);
  
  // 안전하게 DOM 요소 접근
  safeDOM(offlineIndicator, (el) => {
    el.style.display = isOnline ? 'none' : 'block';
  });
  
  safeDOM(refreshButton, (el) => {
    el.disabled = !isOnline;
  });
  
  // 현재 단어 다시 로드 (미디어 상태 변경 반영)
  if (currentAirtableId && adapter) {
    displayWordMedia(currentAirtableId, adapter);
  }
}

/**
 * 단어 정보 표시
 */
async function displayWord(word, adapter) {
  if (!word) return;
  
  try {
    // 기본 단어 정보 표시
    safeDOM(wordElement, (el) => {
      el.textContent = word.word;
    });
    
    safeDOM(meaningElement, (el) => {
      el.textContent = word.meaning;
    });
    
    safeDOM(pronunciationElement, (el) => {
      el.textContent = word.pronunciation || '';
    });
    
    // 아이디 저장
    currentAirtableId = word.airtableId;
    
    // VipUp 및 미디어 표시
    await displayWordMedia(word.airtableId, adapter);
  } catch (error) {
    console.error('단어 표시 오류:', error);
  }
}

/**
 * 단어 미디어 정보 표시
 */
async function displayWordMedia(airtableId, adapter) {
  if (!airtableId || !adapter) return;
  
  try {
    // 로딩 표시
    safeDOM(loadingIndicator, (el) => {
      el.style.display = 'block';
    });
    
    // 미디어 정보 가져오기
    const mediaData = await adapter.getWordMedia(airtableId, isAdvancedMode);
    
    // VipUp 표시 (암기중/고난도 모드 모두 사용)
    safeDOM(vipupElement, (el) => {
      const vipupValue = mediaData.vipup && mediaData.vipup !== 'KBsbCRkz' ? mediaData.vipup : '';
      el.innerHTML = vipupValue;
      // vipup이 없으면 요소 숨기기
      el.style.display = vipupValue ? '' : 'none';
    });
    
    // 고난도 모드인 경우 추가 미디어 표시
    if (isAdvancedMode) {
      // Context 표시
      safeDOM(contextElement, (el) => {
        if (mediaData.context) {
          el.innerHTML = mediaData.context;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      });
      
      // 이미지 표시
      safeDOM(imageContainer, (el) => {
        if (mediaData.imageUrl) {
          const imgHtml = `
            <figure>
              <img src="${mediaData.imageUrl}" alt="이미지" />
              ${mediaData.imagetext ? `<figcaption>${mediaData.imagetext}</figcaption>` : ''}
            </figure>
          `;
          el.innerHTML = imgHtml;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      });
      
      // 오디오 표시
      safeDOM(audioContainer, (el) => {
        if (mediaData.audioUrl) {
          const audioHtml = `
            <audio controls>
              <source src="${mediaData.audioUrl}" type="audio/mpeg">
              브라우저가 오디오를 지원하지 않습니다.
            </audio>
          `;
          el.innerHTML = audioHtml;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      });
      
      // 비디오 표시
      safeDOM(videoContainer, (el) => {
        if (mediaData.videoUrl) {
          const videoHtml = `
            <figure>
              <video controls width="100%">
                <source src="${mediaData.videoUrl}" type="video/mp4">
                브라우저가 비디오를 지원하지 않습니다.
              </video>
              ${mediaData.videotext ? `<figcaption>${mediaData.videotext}</figcaption>` : ''}
            </figure>
          `;
          el.innerHTML = videoHtml;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      });
    } else {
      // 암기중 모드일 때는 추가 미디어 숨김
      safeDOM(contextElement, (el) => { el.style.display = 'none'; });
      safeDOM(imageContainer, (el) => { el.style.display = 'none'; });
      safeDOM(audioContainer, (el) => { el.style.display = 'none'; });
      safeDOM(videoContainer, (el) => { el.style.display = 'none'; });
    }
    
    // 오프라인 모드 표시
    if (mediaData.isOfflineMode && isAdvancedMode) {
      safeDOM(offlineIndicator, (el) => {
        el.style.display = 'block';
      });
      
      const offlineMessage = document.getElementById('offline-message');
      safeDOM(offlineMessage, (el) => {
        el.textContent = '오프라인 모드입니다. 일부 미디어가 표시되지 않을 수 있습니다.';
      });
    }
    
    // 새로고침 버튼 상태 업데이트
    safeDOM(refreshButton, (el) => {
      el.disabled = mediaData.isOfflineMode;
    });
  } catch (error) {
    console.error('미디어 표시 오류:', error);
    safeDOM(vipupElement, (el) => {
      el.textContent = '미디어 로드 중 오류가 발생했습니다.';
    });
  } finally {
    // 로딩 표시 제거
    safeDOM(loadingIndicator, (el) => {
      el.style.display = 'none';
    });
  }
}

/**
 * 단어 데이터 새로고침
 */
async function refreshWordData(airtableId, adapter) {
  if (!airtableId || !adapter) return;
  
  try {
    // 로딩 표시
    safeDOM(loadingIndicator, (el) => {
      el.style.display = 'block';
    });
    
    safeDOM(refreshButton, (el) => {
      el.disabled = true;
    });
    
    // 데이터 새로고침
    const updatedData = await adapter.refreshWordData(airtableId);
    
    // 성공 시 화면 업데이트
    if (updatedData) {
      // VipUp 표시
      safeDOM(vipupElement, (el) => {
        const vipupValue = updatedData.vipup && updatedData.vipup !== 'KBsbCRkz' ? updatedData.vipup : '';
        el.innerHTML = vipupValue;
        // vipup이 없으면 요소 숨기기
        el.style.display = vipupValue ? '' : 'none';
      });
      
      // 고난도 모드인 경우 추가 미디어 표시 업데이트
      if (isAdvancedMode) {
        // Context 업데이트
        safeDOM(contextElement, (el) => {
          if (updatedData.context) {
            el.innerHTML = updatedData.context;
            el.style.display = 'block';
          } else {
            el.style.display = 'none';
          }
        });
        
        // 이미지 업데이트
        safeDOM(imageContainer, (el) => {
          if (updatedData.imageUrl) {
            const imgHtml = `
              <figure>
                <img src="${updatedData.imageUrl}" alt="이미지" />
                ${updatedData.imagetext ? `<figcaption>${updatedData.imagetext}</figcaption>` : ''}
              </figure>
            `;
            el.innerHTML = imgHtml;
            el.style.display = 'block';
          } else {
            el.style.display = 'none';
          }
        });
        
        // 오디오 업데이트
        safeDOM(audioContainer, (el) => {
          if (updatedData.audioUrl) {
            const audioHtml = `
              <audio controls>
                <source src="${updatedData.audioUrl}" type="audio/mpeg">
                브라우저가 오디오를 지원하지 않습니다.
              </audio>
            `;
            el.innerHTML = audioHtml;
            el.style.display = 'block';
          } else {
            el.style.display = 'none';
          }
        });
        
        // 비디오 업데이트
        safeDOM(videoContainer, (el) => {
          if (updatedData.videoUrl) {
            const videoHtml = `
              <figure>
                <video controls width="100%">
                  <source src="${updatedData.videoUrl}" type="video/mp4">
                  브라우저가 비디오를 지원하지 않습니다.
                </video>
                ${updatedData.videotext ? `<figcaption>${updatedData.videotext}</figcaption>` : ''}
              </figure>
            `;
            el.innerHTML = videoHtml;
            el.style.display = 'block';
          } else {
            el.style.display = 'none';
          }
        });
      }
      
      // 업데이트 성공 메시지 표시
      showToast('컨텐츠가 성공적으로 업데이트되었습니다.');
    } else {
      showToast('업데이트할 새 컨텐츠가 없습니다.', 'warning');
    }
  } catch (error) {
    console.error('데이터 새로고침 오류:', error);
    showToast('데이터 새로고침 중 오류가 발생했습니다.', 'error');
  } finally {
    // 로딩 표시 제거
    safeDOM(loadingIndicator, (el) => {
      el.style.display = 'none';
    });
    
    safeDOM(refreshButton, (el) => {
      el.disabled = !navigator.onLine;
    });
  }
}

/**
 * 토스트 메시지 표시
 */
function showToast(message, type = 'success') {
  if (!document.body) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // 애니메이션 효과
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // 3초 후 제거
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', initializeApp);