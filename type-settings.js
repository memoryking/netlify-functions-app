// type-settings.js
class TypeSettings {
    constructor(type) {
        this.type = type;
        this.initializeSettings();
    }

    initializeSettings() {
        switch (this.type) {
            case '2':
                // 글자 크기 3배 설정
                const styleForType2 = document.createElement('style');
                styleForType2.textContent = `
                    /* 일반 학습 모드 - 앞면 */
                    .card-content.front .word-text { font-size: 6.6rem !important; }
                    #frontWord { font-size: 6.6rem !important; }
                    
                    /* 일반 학습 모드 - 뒷면 */
                    .card-content.back .word-text { font-size: 5.4rem !important; }
                    #backWord { font-size: 5.4rem !important; }
                    .card-content.back .meaning-text { font-size: 4.2rem !important; }
                    #meaning { font-size: 4.2rem !important; }
                    .card-content.back .pronunciation-text { font-size: 3.45rem !important; }
                    #pronunciation { font-size: 3.45rem !important; }
                    .card-content.back .vipup-text { font-size: 3.15rem !important; }
                    #vipup { font-size: 3.15rem !important; }
                    
                    /* Q메모리 - 단어만 보일 때 (front) */
                    .card-content.front .word-text { font-size: 7.5rem !important; }
                    #frontText { font-size: 6.6rem !important; }
                    
                    /* Q메모리 - 단어와 뜻이 함께 보일 때 (back) */
                    .card-content.back .word-text { font-size: 3rem !important; }
                    #wordText { font-size: 2.64rem !important; }
                    
                    @media (max-width: 767px) {
                        /* 일반 학습 모드 - 앞면 (모바일) */
                        .card-content.front .word-text { font-size: 5.7rem !important; }
                        #frontWord { font-size: 5.7rem !important; }
                        
                        /* 일반 학습 모드 - 뒷면 (모바일) */
                        .card-content.back .word-text { font-size: 4.56rem !important; }
                        #backWord { font-size: 4.56rem !important; }
                        .card-content.back .meaning-text { font-size: 3.6rem !important; }
                        #meaning { font-size: 3.6rem !important; }
                        .card-content.back .pronunciation-text { font-size: 2.88rem !important; }
                        #pronunciation { font-size: 2.88rem !important; }
                        .card-content.back .vipup-text { font-size: 2.64rem !important; }
                        #vipup { font-size: 2.64rem !important; }
                        
                        /* Q메모리 - 단어만 보일 때 (front) */
                        .card-content.front .word-text { font-size: 6.6rem !important; }
                        #frontText { font-size: 5.7rem !important; }
                        
                        /* Q메모리 - 단어와 뜻이 함께 보일 때 (back) */
                        .card-content.back .word-text { font-size: 2.64rem !important; }
                        #wordText { font-size: 2.28rem !important; }
                    }
                `;
                document.head.appendChild(styleForType2);
                break;
            case '3':
                // QMemory 타이머 설정 개선
                if (window.BaseQMemoryMode) {
                    BaseQMemoryMode.prototype.timerDuration = 4000; // 4초
                }
                console.log('QMemory timer set to 4 seconds');
                break;
            default:
                // type 1 또는 기타
                if (window.BaseQMemoryMode) {
                    BaseQMemoryMode.prototype.timerDuration = 2000; // 2초
                }
                
                // type=1에서 Q메모리 글자 크기 조정
                const styleForType1 = document.createElement('style');
                styleForType1.textContent = `
                    /* Q메모리 모드 글자 크기 균형 조정 (type=1) */
                    #qGameScreen #frontText {
                        font-size: 3.8rem !important; /* PC에서 기본 크기 */
                        font-weight: 700 !important;
                        text-align: center !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: 100% !important;
                        height: 100% !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        line-height: 1.2 !important;
                    }

                    /* 화면 크기에 따른 반응형 글자 크기 조정 */
                    @media screen and (min-width: 1024px) {
                        /* 큰 화면 (데스크톱) */
                        #qGameScreen #frontText {
                            font-size: 3.8rem !important;
                        }
                    }

                    @media screen and (min-width: 768px) and (max-width: 1023px) {
                        /* 중간 화면 (태블릿) */
                        #qGameScreen #frontText {
                            font-size: 3.5rem !important;
                        }
                    }

                    @media screen and (min-width: 480px) and (max-width: 767px) {
                        /* 작은 화면 (큰 모바일) */
                        #qGameScreen #frontText {
                            font-size: 3.2rem !important;
                        }
                    }

                    @media screen and (max-width: 479px) {
                        /* 매우 작은 화면 (일반 모바일) */
                        #qGameScreen #frontText {
                            font-size: 2.8rem !important;
                        }
                    }
                `;
                document.head.appendChild(styleForType1);
                
                // ✨ 글자 수에 따른 동적 크기 조절 기능 추가
                this.initDynamicFontSizing();
                
                console.log('QMemory timer set to default 2 seconds with dynamic font sizing');
                break;
        }
    }
    
    // ✨ 글자 수에 따라 frontText의 폰트 크기를 동적으로 조절
    initDynamicFontSizing() {
        const adjustFrontTextSize = () => {
            const frontText = document.getElementById('frontText');
            if (!frontText || !frontText.textContent) return;
            
            const textLength = frontText.textContent.trim().length;
            
            // 기존 클래스 제거
            frontText.classList.remove('short-word', 'medium-word', 'long-word', 'very-long-word');
            
            // 글자 수에 따라 클래스 추가
            if (textLength >= 15) {
                frontText.classList.add('very-long-word');
                console.log(`Very long word detected: "${frontText.textContent}" (${textLength} chars)`);
            } else if (textLength >= 11) {
                frontText.classList.add('long-word');
                console.log(`Long word detected: "${frontText.textContent}" (${textLength} chars)`);
            } else if (textLength >= 7) {
                frontText.classList.add('medium-word');
            } else {
                frontText.classList.add('short-word');
            }
        };
        
        // MutationObserver로 frontText 내용 변경 감지
        const observer = new MutationObserver((mutations) => {
            adjustFrontTextSize();
        });
        
        // DOM이 준비되면 observer 시작
        const initObserver = () => {
            const frontText = document.getElementById('frontText');
            if (frontText) {
                observer.observe(frontText, {
                    characterData: true,
                    childList: true,
                    subtree: true
                });
                adjustFrontTextSize(); // 초기 조정
                console.log('Dynamic font sizing observer initialized');
            } else {
                // frontText가 아직 없으면 100ms 후 재시도
                setTimeout(initObserver, 100);
            }
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initObserver);
        } else {
            initObserver();
        }
        
        // 동적 스타일 추가
        const dynamicStyle = document.createElement('style');
        dynamicStyle.textContent = `
            /* ========================================
               글자 수에 따른 동적 폰트 크기 조절
               ======================================== */
            
            /* 짧은 단어 (6글자 이하) - 기본 크기 */
            #qGameScreen #frontText.short-word {
                font-size: 3.8rem !important;
            }
            
            /* 중간 단어 (7-10글자) - 약간 축소 */
            #qGameScreen #frontText.medium-word {
                font-size: 3.2rem !important;
            }
            
            /* 긴 단어 (11-14글자) - 크게 축소 */
            #qGameScreen #frontText.long-word {
                font-size: 2.4rem !important;
            }
            
            /* 매우 긴 단어 (15글자 이상) - 최대 축소 + 글자 간격 조정 */
            #qGameScreen #frontText.very-long-word {
                font-size: 1.8rem !important;
                letter-spacing: -0.02em !important;
            }
            
            /* ========================================
               모바일 화면 (479px 이하)
               ======================================== */
            @media screen and (max-width: 479px) {
                #qGameScreen #frontText.short-word {
                    font-size: 2.8rem !important;
                }
                
                #qGameScreen #frontText.medium-word {
                    font-size: 2.4rem !important;
                }
                
                #qGameScreen #frontText.long-word {
                    font-size: 1.8rem !important;
                }
                
                #qGameScreen #frontText.very-long-word {
                    font-size: 1.4rem !important;
                    letter-spacing: -0.02em !important;
                }
            }
            
            /* ========================================
               작은 모바일 (480-767px)
               ======================================== */
            @media screen and (min-width: 480px) and (max-width: 767px) {
                #qGameScreen #frontText.short-word {
                    font-size: 3.2rem !important;
                }
                
                #qGameScreen #frontText.medium-word {
                    font-size: 2.6rem !important;
                }
                
                #qGameScreen #frontText.long-word {
                    font-size: 2.0rem !important;
                }
                
                #qGameScreen #frontText.very-long-word {
                    font-size: 1.5rem !important;
                    letter-spacing: -0.02em !important;
                }
            }
            
            /* ========================================
               태블릿 (768-1023px)
               ======================================== */
            @media screen and (min-width: 768px) and (max-width: 1023px) {
                #qGameScreen #frontText.short-word {
                    font-size: 3.5rem !important;
                }
                
                #qGameScreen #frontText.medium-word {
                    font-size: 3.0rem !important;
                }
                
                #qGameScreen #frontText.long-word {
                    font-size: 2.2rem !important;
                }
                
                #qGameScreen #frontText.very-long-word {
                    font-size: 1.7rem !important;
                    letter-spacing: -0.02em !important;
                }
            }
        `;
        document.head.appendChild(dynamicStyle);
        
        console.log('✅ Dynamic font sizing styles applied');
    }
}

// 전역 객체에 등록
window.TypeSettings = TypeSettings;
