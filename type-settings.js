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
                    /* 단어만 보일 때 (front) */
                    .card-content.front .word-text { font-size: 7.5rem !important; }
                    #frontText { font-size: 6.6rem !important; }
                    
                    /* 단어와 뜻이 함께 보일 때 (back) */
                    .card-content.back .word-text { font-size: 3rem !important; }
                    #wordText { font-size: 2.64rem !important; }
                    
                    @media (max-width: 767px) {
                        /* 단어만 보일 때 (front) */
                        .card-content.front .word-text { font-size: 6.6rem !important; }
                        #frontText { font-size: 5.7rem !important; }
                        
                        /* 단어와 뜻이 함께 보일 때 (back) */
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
                console.log('QMemory timer set to default 2 seconds with adjusted font sizes');
                break;
        }
    }
}

// 전역 객체에 등록
window.TypeSettings = TypeSettings;