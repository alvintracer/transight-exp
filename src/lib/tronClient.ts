// import 문 제거 (CDN으로 로드했으므로 필요 없음)

const TRON_NODE = import.meta.env.VITE_QUICKNODE_HTTP_URL;

// window 객체에서 TronWeb을 가져옵니다.
// TypeScript 에러 방지를 위해 any로 처리합니다.
const TronWeb = (window as any).TronWeb;

if (!TronWeb) {
  console.error("TronWeb script not loaded in index.html!");
}

// 생성자 호출
export const tronWeb = new TronWeb({
  fullHost: TRON_NODE,
  headers: { "Content-Type": "application/json" },
});

// 주소 유효성 검사
export const isValidAddress = (address: string) => tronWeb.isAddress(address);