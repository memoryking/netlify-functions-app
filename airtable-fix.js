/**
* airtable-fix.js - 간결한 개선 버전
* ContentBasedDBManager와 완전히 호환되도록 수정
* 
* 주요 수정사항:
* 1. 초기화 로직 단순화
* 2. 불필요한 패치 제거
* 3. 메인 화면 UI 업데이트에 집중
* 4. 중복 실행 방지 플래그 추가
* 5. 프로그레스 서클 중복 업데이트 방지 강화
*/

(function() {
   'use strict';
   
   console.log('[airtable-fix] 패치 스크립트 로드됨');
   
   let initAttempts = 0;
   const MAX_ATTEMPTS = 30;
   const RETRY_DELAY = 500;
   
   // 중복 실행 방지를 위한 플래그
   let isUpdatingProgress = false;
   let isUpdatingFooter = false;
   let handlersSetup = false;
   let patchesApplied = false;
   
   /**
    * 앱 초기화 상태 확인
    */
   function checkAppReady() {
       const status = {
           app: !!window.app,
           initialized: window.app?.initialized,
           dbManager: !!window.app?.dbManager,
           contentSystem: !!window.contentAppInitializer?.initialized,
           updateWordCounts: typeof window.app?.updateWordCounts === 'function'
       };
       
       // 필수 조건 체크
       return status.app && 
              status.initialized && 
              status.dbManager &&
              status.updateWordCounts;
   }
   
   /**
    * 메인 화면 통계 업데이트 패치
    */
   function patchMainScreenUpdates() {
       if (!window.app || typeof window.app.updateWordCounts !== 'function') {
           console.error('[airtable-fix] updateWordCounts 메서드를 찾을 수 없습니다');
           return;
       }
       
       // 이미 패치되었는지 확인
       if (window.app._updateWordCountsPatched) {
           console.log('[airtable-fix] updateWordCounts 이미 패치됨');
           return;
       }
       
       // 원본 메서드 백업
       const originalUpdateWordCounts = window.app.updateWordCounts;
       
       // 패치된 메서드
       window.app.updateWordCounts = async function(mode, forceUpdate = false) {
           try {
               // 원본 메서드 호출
               const result = await originalUpdateWordCounts.call(this, mode, forceUpdate);
               
               // 푸터 텍스트 업데이트
               updateFooterText();
               
               // 추가 UI 업데이트
               updateProgressCircle();
               
               return result;
           } catch (error) {
               console.error('[airtable-fix] updateWordCounts 오류:', error);
               return false;
           }
       };
       
       // 패치 완료 표시
       window.app._updateWordCountsPatched = true;
       
       console.log('[airtable-fix] updateWordCounts 메서드 패치 완료');
   }
   
   /**
    * 푸터 텍스트 업데이트
    */
   function updateFooterText() {
       // 중복 실행 방지
       if (isUpdatingFooter) return;
       isUpdatingFooter = true;
       
       const footerText = document.querySelector('.footer-text');
       const totalElement = document.getElementById('totalWords');
       
       if (footerText && totalElement?.textContent && totalElement.textContent !== '0') {
           const totalCount = totalElement.textContent;
           const newText = `맥락과 반복 - 전체 ${totalCount}개`;
           
           if (footerText.textContent !== newText) {
               footerText.textContent = newText;
               window._totalWordCount = totalCount;
               console.log('[airtable-fix] 푸터 텍스트 업데이트:', newText);
           }
       }
       
       // 플래그 해제
       setTimeout(() => {
           isUpdatingFooter = false;
       }, 100);
   }
   
   /**
    * 원형 프로그레스 업데이트
    */
   function updateProgressCircle() {
       // 중복 실행 방지
       if (isUpdatingProgress) return;
       
       // 최근 실행 시간 체크 (100ms 이내 재실행 방지)
       const now = Date.now();
       if (window._lastProgressUpdate && (now - window._lastProgressUpdate) < 100) {
           return;
       }
       window._lastProgressUpdate = now;
       
       isUpdatingProgress = true;
       
       const progressPercentage = document.getElementById('progressPercentage');
       const progressCircleFill = document.querySelector('.progress-circle-fill');
       
       if (!progressPercentage || !progressCircleFill) {
           isUpdatingProgress = false;
           return;
       }
       
       // 현재 퍼센트 값 확인
       const currentPercent = parseInt(progressPercentage.textContent) || 0;
       
       // SVG 원의 둘레 계산 (반지름 70 기준)
       const circumference = 2 * Math.PI * 70;
       const offset = circumference - (currentPercent / 100) * circumference;
       
       // 스타일 업데이트
       progressCircleFill.style.strokeDasharray = circumference;
       progressCircleFill.style.strokeDashoffset = offset;
       
       console.log('[airtable-fix] 프로그레스 서클 업데이트:', currentPercent + '%');
       
       // 플래그 해제
       setTimeout(() => {
           isUpdatingProgress = false;
       }, 100);
   }
   
   /**
    * 메인 화면 요소 보호
    */
   function protectMainScreenElements() {
       // 푸터 텍스트 보호
       const footerText = document.querySelector('.footer-text');
       if (footerText && !footerText._observerAttached) {
           let correctText = '';
           
           // MutationObserver로 변경 감지
           const observer = new MutationObserver(function(mutations) {
               if (correctText && correctText.includes('전체')) {
                   // 올바른 텍스트가 설정된 경우
                   if (footerText.textContent !== correctText && !footerText.textContent.includes('전체')) {
                       console.log('[airtable-fix] 푸터 텍스트 복원');
                       footerText.textContent = correctText;
                   }
               } else if (window._totalWordCount) {
                   // 전역 변수에서 복원
                   correctText = `맥락과 반복 - 전체 ${window._totalWordCount}개`;
                   footerText.textContent = correctText;
               }
           });
           
           observer.observe(footerText, {
               childList: true,
               characterData: true,
               subtree: true
           });
           
           // 옵저버 연결 표시
           footerText._observerAttached = true;
           
           // 초기 텍스트 설정
           setTimeout(() => {
               const totalElement = document.getElementById('totalWords');
               if (totalElement?.textContent && totalElement.textContent !== '0') {
                   correctText = `맥락과 반복 - 전체 ${totalElement.textContent}개`;
                   if (footerText.textContent !== correctText) {
                       footerText.textContent = correctText;
                   }
               }
           }, 1000);
           
           // 10초 후 옵저버 중지
           setTimeout(() => {
               observer.disconnect();
               console.log('[airtable-fix] 푸터 텍스트 옵저버 중지');
           }, 10000);
       }
   }
   
   /**
    * 화면 전환 시 UI 업데이트
    */
   function setupScreenTransitionHandlers() {
       // 이벤트 리스너가 이미 등록되었는지 확인
       if (handlersSetup) {
           console.log('[airtable-fix] 화면 전환 핸들러가 이미 설정됨');
           return;
       }
       handlersSetup = true;
       
       // 메인 화면으로 돌아올 때 업데이트
       document.addEventListener('click', function(e) {
           // 홈 버튼 클릭 감지
           if (e.target.id === 'toHomeBtn' || 
               e.target.id === 'homeBtn' ||
               e.target.closest('#toHomeBtn') ||
               e.target.closest('#homeBtn')) {
               
               console.log('[airtable-fix] 메인 화면으로 이동 감지');
               
               // 약간의 지연 후 업데이트
               setTimeout(() => {
                   if (window.app && typeof window.app.updateWordCounts === 'function') {
                       window.app.updateWordCounts('all', true);
                   }
                   updateFooterText();
                   updateProgressCircle();
               }, 500);
           }
       });
       
       // 화면 가시성 변경 시
       document.addEventListener('visibilitychange', function() {
           if (!document.hidden) {
               console.log('[airtable-fix] 화면 활성화 감지');
               updateFooterText();
               updateProgressCircle();
           }
       });
   }
   
   /**
    * 메인 패치 적용
    */
   function applyPatches() {
							// 이미 패치가 적용되었는지 확인
							if (patchesApplied) {
											console.log('[airtable-fix] 패치가 이미 적용됨');
											return;
							}
							
							// 앱이 완전히 초기화되었는지 확인
							if (!window._appFullyInitialized) {
											console.log('[airtable-fix] 앱이 아직 완전히 초기화되지 않음, 대기...');
											setTimeout(applyPatches, 500);
											return;
							}
							
							// 최종 업데이트가 진행 중인지 확인
							if (window._finalUpdateInProgress) {
											console.log('[airtable-fix] 최종 업데이트 진행 중, 대기...');
											setTimeout(applyPatches, 500);
											return;
							}
							
							try {
											console.log('[airtable-fix] 패치 적용 시작...');
											
											// 1. 메인 화면 업데이트 패치
											patchMainScreenUpdates();
											
											// 2. UI 요소 보호
											protectMainScreenElements();
											
											// 3. 화면 전환 핸들러 설정
											setupScreenTransitionHandlers();
											
											// 4. 초기 UI 업데이트는 스킵 (이미 enhanced-loader에서 처리됨)
											// setTimeout 제거하거나 더 늦게 실행
											
											// 패치 적용 완료 표시
											patchesApplied = true;
											
											console.log('[airtable-fix] ✅ 모든 패치 적용 완료');
											
							} catch (error) {
											console.error('[airtable-fix] 패치 적용 중 오류:', error);
							}
			}
   
   /**
    * 초기화 및 패치 시작
    */
   function initialize() {
       if (!checkAppReady()) {
           initAttempts++;
           
           if (initAttempts < MAX_ATTEMPTS) {
               console.log(`[airtable-fix] 앱 초기화 대기 중... (${initAttempts}/${MAX_ATTEMPTS})`);
               setTimeout(initialize, RETRY_DELAY);
               return;
           } else {
               console.error('[airtable-fix] 최대 재시도 횟수 초과');
               return;
           }
       }
       
       console.log('[airtable-fix] ✅ 앱이 준비되었습니다. 패치 적용...');
       applyPatches();
   }
   
   /**
    * 수동 패치 적용을 위한 전역 함수
    */
   window._airtableFix = {
       status: checkAppReady,
       applyPatches: applyPatches,
       updateFooter: updateFooterText,
       updateProgress: updateProgressCircle,
       forceUpdate: function() {
           if (window.app && typeof window.app.updateWordCounts === 'function') {
               window.app.updateWordCounts('all', true);
           }
       },
       // 디버그용 플래그 상태 확인
       getFlags: function() {
           return {
               isUpdatingProgress,
               isUpdatingFooter,
               handlersSetup,
               patchesApplied,
               lastProgressUpdate: window._lastProgressUpdate
           };
       }
   };
   
   // DOM 로드 완료 후 시작 부분 (맨 아래)
			if (document.readyState === 'loading') {
							document.addEventListener('DOMContentLoaded', () => {
											// 초기화를 더 늦게 시작 (enhanced-loader의 최종 초기화 이후)
											setTimeout(initialize, 4000); // 2000ms → 4000ms로 변경
							});
			} else {
							setTimeout(initialize, 4000); // 2000ms → 4000ms로 변경
			}
   
   console.log('[airtable-fix] 스크립트 초기화 완료');
   
})();