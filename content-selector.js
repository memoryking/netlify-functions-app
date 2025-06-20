/**
 * content-selector.js - 콘텐츠 선택 및 관리 UI 모듈
 * 콘텐츠 전환 인터페이스 및 콘텐츠별 데이터 관리 기능 제공
 * 버전: 1.0.0
 */

class ContentSelector {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.currentContent = '';
    this.contentList = [];
    this.isInitialized = false;
    this.changeCallbacks = [];
    
    // 기본 UI 요소 생성
    this.createUIElements();
  }
  
  /**
   * UI 요소 생성 및 이벤트 바인딩
   */
  createUIElements() {
    // 이미 생성되었는지 확인
    if (document.getElementById('content-selector-container')) {
      return;
    }
    
    // 콘텐츠 선택기 컨테이너 생성
    const container = document.createElement('div');
    container.id = 'content-selector-container';
    container.style.display = 'none'; // 초기에는 숨김
    container.style.position = 'fixed';
    container.style.top = '40px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.backgroundColor = '#FFFFFF';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    container.style.zIndex = '1000';
    container.style.padding = '12px';
    container.style.width = '300px';
    container.style.maxHeight = '80vh';
    container.style.overflowY = 'auto';
    
    // 헤더 생성
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '12px';
    container.appendChild(header);
    
    // 제목
    const title = document.createElement('h3');
    title.textContent = '콘텐츠 선택';
    title.style.margin = '0';
    title.style.fontSize = '16px';
    title.style.fontWeight = 'bold';
    header.appendChild(title);
    
    // 닫기 버튼
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '18px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.width = '24px';
    closeButton.style.height = '24px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.borderRadius = '50%';
    closeButton.style.color = '#6B7280';
    closeButton.title = '닫기';
    closeButton.onclick = () => this.hide();
    header.appendChild(closeButton);
    
    // 현재 콘텐츠 표시
    const currentContentContainer = document.createElement('div');
    currentContentContainer.style.marginBottom = '12px';
    currentContentContainer.style.padding = '8px';
    currentContentContainer.style.backgroundColor = '#F3F4F6';
    currentContentContainer.style.borderRadius = '4px';
    container.appendChild(currentContentContainer);
    
    const currentContentLabel = document.createElement('div');
    currentContentLabel.textContent = '현재 콘텐츠:';
    currentContentLabel.style.fontSize = '12px';
    currentContentLabel.style.color = '#6B7280';
    currentContentLabel.style.marginBottom = '4px';
    currentContentContainer.appendChild(currentContentLabel);
    
    const currentContentValue = document.createElement('div');
    currentContentValue.id = 'current-content-value';
    currentContentValue.textContent = '로드 중...';
    currentContentValue.style.fontSize = '14px';
    currentContentValue.style.fontWeight = 'bold';
    currentContentValue.style.color = '#4F46E5';
    currentContentContainer.appendChild(currentContentValue);
    
    // 콘텐츠 목록 컨테이너
    const listContainer = document.createElement('div');
    listContainer.id = 'content-list-container';
    listContainer.style.marginBottom = '16px';
    listContainer.style.maxHeight = '300px';
    listContainer.style.overflowY = 'auto';
    container.appendChild(listContainer);
    
    // 새 콘텐츠 입력 컨테이너
    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.marginBottom = '12px';
    container.appendChild(inputContainer);
    
    // 새 콘텐츠 입력 필드
    const input = document.createElement('input');
    input.id = 'new-content-input';
    input.type = 'text';
    input.placeholder = '새 콘텐츠 추가...';
    input.style.flex = '1';
    input.style.border = '1px solid #D1D5DB';
    input.style.borderRadius = '4px';
    input.style.padding = '8px 12px';
    input.style.fontSize = '14px';
    inputContainer.appendChild(input);
    
    // 추가 버튼
    const addButton = document.createElement('button');
    addButton.textContent = '추가';
    addButton.style.marginLeft = '8px';
    addButton.style.backgroundColor = '#4F46E5';
    addButton.style.color = '#FFFFFF';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.padding = '8px 12px';
    addButton.style.fontSize = '14px';
    addButton.style.cursor = 'pointer';
    addButton.onclick = () => this.addNewContent();
    inputContainer.appendChild(addButton);
    
    // 엔터 키 처리
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addNewContent();
      }
    });
    
    // 문서에 추가
    document.body.appendChild(container);
    
    // 콘텐츠 선택기 버튼 생성
    this.createSelectorButton();
  }
  
  /**
   * 콘텐츠 선택기 버튼 생성
   */
  createSelectorButton() {
    // 이미 버튼이 있는지 확인
    if (document.getElementById('content-selector-button')) {
      return;
    }
    
    // 버튼 생성
    const button = document.createElement('button');
    button.id = 'content-selector-button';
    button.textContent = '콘텐츠';
    button.title = '콘텐츠 선택';
    button.style.position = 'fixed';
    button.style.top = '10px';
    button.style.right = '10px';
    button.style.backgroundColor = '#4F46E5';
    button.style.color = '#FFFFFF';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.padding = '6px 12px';
    button.style.fontSize = '12px';
    button.style.cursor = 'pointer';
    button.style.zIndex = '999';
    button.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
    
    // 클릭 이벤트 처리
    button.onclick = () => this.toggle();
    
    // 문서에 추가
    document.body.appendChild(button);
  }
  
  /**
   * 콘텐츠 선택기 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // 현재 콘텐츠 가져오기
      if (this.dbManager.getCurrentContentId) {
        this.currentContent = this.dbManager.getCurrentContentId();
      } else {
        // 폴백: localStorage에서 가져오기
        this.currentContent = localStorage.getItem('current_content') || 'default';
      }
      
      // 현재 콘텐츠 표시
      const currentContentValue = document.getElementById('current-content-value');
      if (currentContentValue) {
        currentContentValue.textContent = this.currentContent;
      }
      
      // 기존 콘텐츠 목록 가져오기
      this.contentList = await this.loadContentList();
      
      // 현재 콘텐츠가 목록에 없으면 추가
      if (!this.contentList.includes(this.currentContent)) {
        this.contentList.push(this.currentContent);
        await this.saveContentList(this.contentList);
      }
      
      // 콘텐츠 목록 렌더링
      this.renderContentList();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('콘텐츠 선택기 초기화 오류:', error);
    }
  }
  
  /**
   * 콘텐츠 목록 로드
   * @returns {Promise<Array>} 콘텐츠 목록
   */
  async loadContentList() {
    try {
      // 설정에서 콘텐츠 목록 가져오기
      let contentList = await this.dbManager.getSetting('contentList');
      
      // 설정이 없으면 기본 목록 사용
      if (!contentList) {
        contentList = ['default'];
        await this.saveContentList(contentList);
      }
      
      return contentList;
    } catch (error) {
      console.error('콘텐츠 목록 로드 오류:', error);
      return ['default'];
    }
  }
  
  /**
   * 콘텐츠 목록 저장
   * @param {Array} contentList - 콘텐츠 목록
   */
  async saveContentList(contentList) {
    try {
      // 중복 제거
      const uniqueList = [...new Set(contentList)];
      
      // 설정에 저장
      await this.dbManager.saveSetting('contentList', uniqueList);
      
      return true;
    } catch (error) {
      console.error('콘텐츠 목록 저장 오류:', error);
      return false;
    }
  }
  
  /**
   * 콘텐츠 목록 렌더링
   */
  renderContentList() {
    const listContainer = document.getElementById('content-list-container');
    if (!listContainer) return;
    
    // 기존 목록 초기화
    listContainer.innerHTML = '';
    
    // 콘텐츠가 없는 경우
    if (this.contentList.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = '등록된 콘텐츠가 없습니다.';
      emptyMessage.style.padding = '12px';
      emptyMessage.style.textAlign = 'center';
      emptyMessage.style.color = '#6B7280';
      listContainer.appendChild(emptyMessage);
      return;
    }
    
    // 콘텐츠 목록 생성
    this.contentList.forEach((content) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '10px';
      item.style.borderBottom = '1px solid #E5E7EB';
      item.style.transition = 'background-color 0.2s';
      
      // 현재 선택된 콘텐츠 강조
      if (content === this.currentContent) {
        item.style.backgroundColor = '#EEF2FF';
        item.style.fontWeight = 'bold';
      }
      
      // 호버 효과
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = content === this.currentContent ? '#E0E7FF' : '#F9FAFB';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = content === this.currentContent ? '#EEF2FF' : '';
      });
      
      // 콘텐츠 이름
      const name = document.createElement('div');
      name.textContent = content;
      name.style.fontSize = '14px';
      name.style.cursor = 'pointer';
      name.style.flex = '1';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';
      
      // 콘텐츠 클릭 시 전환
      name.addEventListener('click', () => {
        this.switchContent(content);
      });
      
      item.appendChild(name);
      
      // 삭제 버튼 (현재 선택된 콘텐츠는 삭제 불가)
      if (content !== this.currentContent) {
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '&times;';
        deleteButton.style.background = 'none';
        deleteButton.style.border = 'none';
        deleteButton.style.color = '#6B7280';
        deleteButton.style.fontSize = '16px';
        deleteButton.style.cursor = 'pointer';
        deleteButton.style.padding = '0 4px';
        deleteButton.title = '삭제';
        
        // 삭제 버튼 클릭 시 이벤트 전파 방지
        deleteButton.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteContent(content);
        });
        
        item.appendChild(deleteButton);
      }
      
      listContainer.appendChild(item);
    });
  }
  
  /**
   * 새 콘텐츠 추가
   */
  async addNewContent() {
    const input = document.getElementById('new-content-input');
    if (!input) return;
    
    const content = input.value.trim();
    
    // 콘텐츠가 비어있으면 무시
    if (!content) {
      return;
    }
    
    // 이미 존재하는 콘텐츠인지 확인
    if (this.contentList.includes(content)) {
      alert('이미 존재하는 콘텐츠입니다.');
      return;
    }
    
    try {
      // 콘텐츠 목록에 추가
      this.contentList.push(content);
      await this.saveContentList(this.contentList);
      
      // 콘텐츠 목록 다시 렌더링
      this.renderContentList();
      
      // 입력 필드 초기화
      input.value = '';
      
      // 새 콘텐츠로 전환 여부 확인
      if (confirm(`새 콘텐츠 '${content}'로 전환하시겠습니까?`)) {
        await this.switchContent(content);
      }
    } catch (error) {
      console.error('콘텐츠 추가 오류:', error);
      alert('콘텐츠 추가에 실패했습니다.');
    }
  }
  
  /**
   * 콘텐츠 삭제
   * @param {string} content - 삭제할 콘텐츠
   */
  async deleteContent(content) {
    // 현재 콘텐츠는 삭제 불가
    if (content === this.currentContent) {
      alert('현재 선택된 콘텐츠는 삭제할 수 없습니다.');
      return;
    }
    
    // 삭제 확인
    if (!confirm(`콘텐츠 '${content}'를 삭제하시겠습니까?`)) {
      return;
    }
    
    try {
      // 콘텐츠 목록에서 제거
      this.contentList = this.contentList.filter(item => item !== content);
      await this.saveContentList(this.contentList);
      
      // 콘텐츠 목록 다시 렌더링
      this.renderContentList();
    } catch (error) {
      console.error('콘텐츠 삭제 오류:', error);
      alert('콘텐츠 삭제에 실패했습니다.');
    }
  }
  
  /**
   * 콘텐츠 전환
   * @param {string} content - 전환할 콘텐츠
   */
  async switchContent(content) {
    // 이미 선택된 콘텐츠면 무시
    if (content === this.currentContent) {
      return;
    }
    
    try {
      // 로딩 메시지 표시
      const loadingMessage = this.showLoadingMessage(`'${content}' 콘텐츠로 전환 중...`);
      
      // DB 매니저를 통해 콘텐츠 전환
      if (this.dbManager.switchContent) {
        const success = await this.dbManager.switchContent(content);
        
        if (!success) {
          throw new Error('콘텐츠 전환 실패');
        }
        
        // 현재 콘텐츠 업데이트
        this.currentContent = content;
        
        // 현재 콘텐츠 표시 업데이트
        const currentContentValue = document.getElementById('current-content-value');
        if (currentContentValue) {
          currentContentValue.textContent = content;
        }
        
        // 콘텐츠 목록 다시 렌더링
        this.renderContentList();
        
        // 로컬 스토리지에 저장
        localStorage.setItem('current_content', content);
        
        // 콘텐츠 변경 콜백 호출
        this.changeCallbacks.forEach(callback => {
          try {
            callback(content);
          } catch (e) {
            console.error('콘텐츠 변경 콜백 오류:', e);
          }
        });
        
        // 페이지 리로드 안내
        if (confirm(`콘텐츠 전환이 완료되었습니다. 변경사항을 적용하려면 페이지를 다시 로드해야 합니다. 지금 다시 로드하시겠습니까?`)) {
          window.location.reload();
        }
      } else {
        throw new Error('지원되지 않는 기능입니다.');
      }
      
      // 로딩 메시지 숨기기
      this.hideLoadingMessage(loadingMessage);
    } catch (error) {
      console.error('콘텐츠 전환 오류:', error);
      alert(`콘텐츠 전환에 실패했습니다: ${error.message}`);
      
      // 로딩 메시지 숨기기
      this.hideLoadingMessage();
    }
  }
  
  /**
   * 콘텐츠 변경 이벤트 리스너 추가
   * @param {Function} callback - 콜백 함수
   */
  onContentChange(callback) {
    if (typeof callback === 'function') {
      this.changeCallbacks.push(callback);
    }
  }
  
  /**
   * 콘텐츠 변경 이벤트 리스너 제거
   * @param {Function} callback - 제거할 콜백 함수
   */
  offContentChange(callback) {
    this.changeCallbacks = this.changeCallbacks.filter(cb => cb !== callback);
  }
  
  /**
   * 콘텐츠 선택기 표시
   */
  show() {
    const container = document.getElementById('content-selector-container');
    if (container) {
      container.style.display = 'block';
    }
    
    // 초기화가 아직 안된 경우 초기화
    if (!this.isInitialized) {
      this.initialize();
    }
  }
  
  /**
   * 콘텐츠 선택기 숨기기
   */
  hide() {
    const container = document.getElementById('content-selector-container');
    if (container) {
      container.style.display = 'none';
    }
  }
  
  /**
   * 콘텐츠 선택기 토글
   */
  toggle() {
    const container = document.getElementById('content-selector-container');
    if (container) {
      if (container.style.display === 'none') {
        this.show();
      } else {
        this.hide();
      }
    }
  }
  
  /**
   * 로딩 메시지 표시
   * @param {string} message - 표시할 메시지
   * @returns {HTMLElement} 로딩 메시지 요소
   */
  showLoadingMessage(message) {
    // 기존 로딩 메시지 제거
    this.hideLoadingMessage();
    
    // 로딩 메시지 생성
    const loadingElement = document.createElement('div');
    loadingElement.id = 'content-selector-loading';
    loadingElement.style.position = 'fixed';
    loadingElement.style.top = '0';
    loadingElement.style.left = '0';
    loadingElement.style.width = '100%';
    loadingElement.style.height = '100%';
    loadingElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    loadingElement.style.display = 'flex';
    loadingElement.style.alignItems = 'center';
    loadingElement.style.justifyContent = 'center';
    loadingElement.style.zIndex = '2000';
    
    // 로딩 메시지 컨테이너
    const messageContainer = document.createElement('div');
    messageContainer.style.backgroundColor = '#FFFFFF';
    messageContainer.style.padding = '20px';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.maxWidth = '300px';
    
    // 로딩 아이콘
    const spinner = document.createElement('div');
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid #f3f3f3';
    spinner.style.borderTop = '4px solid #4F46E5';
    spinner.style.borderRadius = '50%';
    spinner.style.margin = '0 auto 10px';
    spinner.style.animation = 'spin 1s linear infinite';
    
    // 스타일 추가
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    // 메시지 텍스트
    const text = document.createElement('div');
    text.textContent = message;
    text.style.fontSize = '14px';
    text.style.color = '#4F46E5';
    
    messageContainer.appendChild(spinner);
    messageContainer.appendChild(text);
    loadingElement.appendChild(messageContainer);
    
    document.body.appendChild(loadingElement);
    
    return loadingElement;
  }
  
  /**
   * 로딩 메시지 숨기기
   * @param {HTMLElement} loadingElement - 숨길 로딩 메시지 요소 (없으면 ID로 찾음)
   */
  hideLoadingMessage(loadingElement) {
    const element = loadingElement || document.getElementById('content-selector-loading');
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', () => {
  // 앱 초기화 완료 후 콘텐츠 선택기 초기화
  const initInterval = setInterval(() => {
    if (window.app && window.app.dbManager) {
      // 콘텐츠 선택기 생성 및 초기화
      window.contentSelector = new ContentSelector(window.app.dbManager);
      
      // DataLoader 확장
      if (window.app.dataLoader) {
        // 콘텐츠 변경 이벤트 리스너 추가
        window.contentSelector.onContentChange((content) => {
          console.log(`콘텐츠가 '${content}'로 변경되었습니다.`);
          // DataLoader 콘텐츠 업데이트
          if (window.app.dataLoader.updateContentId) {
            window.app.dataLoader.updateContentId();
          }
        });
      }
      
      clearInterval(initInterval);
    }
  }, 500);
});