// loader.js 파일의 전체 내용을 주석 처리하고 다음 내용으로 대체
// 호환성을 위한 리디렉션
console.log('loader.js는 더 이상 사용되지 않습니다. enhanced-loader.js를 사용하세요.');

// 최소한의 필수 기능만 유지
if (!window.parseUrlParams) {
  window.parseUrlParams = function() {
    try {
      const search = window.location.search;
      const cleanSearch = search.replace(/:\d+$/, '');
      const decodedSearch = decodeURIComponent(cleanSearch);
      const matches = decodedSearch.match(/urlParams=(.+)$/);
      
      if (!matches || !matches[1]) {
        console.warn('URL 파라미터를 찾을 수 없습니다. 기본값 사용');
        return new URLSearchParams('type=1');
      }
      
      const params = new URLSearchParams(matches[1]);
      if (!params.get('type')) {
        params.append('type', '1');
      }
      
      return params;
    } catch (error) {
      console.error('URL 파라미터 파싱 오류:', error);
      return new URLSearchParams('type=1');
    }
  };
}

// 이전 로더 호출을 enhanced-loader로 리디렉션
if (typeof loadScriptsSequentially === 'function') {
  const originalLoadScriptsSequentially = loadScriptsSequentially;
  window.loadScriptsSequentially = function() {
    console.warn('loadScriptsSequentially는 더 이상 사용되지 않습니다. loadCoreScripts를 사용하세요.');
    if (typeof loadCoreScripts === 'function') {
      return loadCoreScripts();
    }
    return originalLoadScriptsSequentially();
  };
}