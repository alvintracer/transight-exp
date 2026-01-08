import { useState, useEffect } from 'react';
import NetworkGraph from './components/graph/NetworkGraph';
import { useGlobalStore } from './stores/useGlobalStore';
import { useAutoTrace } from './hooks/useAutoTrace';
import { useDeepTrace } from './hooks/useDeepTrace';
import { DetailPanel } from './components/dashboard/DetailPanel';
import { ClusterPanel } from './components/dashboard/ClusterPanel';
import { AuthModal } from './components/auth/AuthModal'; // [New]
import { SessionManager } from './components/dashboard/SessionManager'; // [New]
import { supabase } from './lib/supabaseClient';

// 모드 타입 정의
type AppMode = 'bigbrother' | 'autotracer';

function App() {
const { addNodes, graphData, session, setSession, layoutMode, setLayoutMode, isPhysicsActive, setIsPhysicsActive} = useGlobalStore();
const [mode, setMode] = useState<AppMode>('bigbrother');

  // -- Auth Init --
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [setSession]);
  
  // -- BigBrother State --
  const [inputAddr, setInputAddr] = useState('');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const bb = useAutoTrace(isMonitoring && mode === 'bigbrother');

  // -- AutoTracer State --
  const [traceAddr, setTraceAddr] = useState('');
  const [hopCount, setHopCount] = useState(3);
  const [txLimit, setTxLimit] = useState(20);
  const [traceMode, setTraceMode] = useState<'relation' | 'timeflow'>('relation');
  const [startTime, setStartTime] = useState(''); // TimeFlow용 시작 시간
  const at = useDeepTrace();

  // 현재 모드에 따라 보여줄 로그 선택
  const displayLogs = mode === 'bigbrother' ? bb.logs : at.traceLog;
  
  // BigBrother 실행 핸들러
  const handleStartBigBrother = () => {
    if (!inputAddr) return;
    const addresses = inputAddr.split(/[\n, ]+/).map(s => s.trim()).filter(s => s.length > 0);
    if (addresses.length === 0) return;

    if (addresses.length > 20) {
        if (!confirm(`Only the first 20 addresses will be added. Continue?`)) return;
        addresses.length = 20; 
    }
    // 일괄 추가 시 모두 시작 노드로 표시 (원하는 경우)
    const newNodes = addresses.map(addr => ({
        id: addr,
        group: 'target',
        val: 20,
        isTerminal: false,
        createdAt: Date.now(),
        isStart: true // [New] 얘네도 시작 노드!
    }));
    
    // @ts-ignore
    addNodes(newNodes);
    setIsMonitoring(true);
    setInputAddr('');
  };

  // AutoTracer 실행 핸들러
  const handleStartAutoTrace = () => {
    if (!traceAddr) return;
    
    // TimeFlow인데 시간 설정 안 했으면 경고
    if (traceMode === 'timeflow' && !startTime) {
        alert("Please select a Start Time for Time-Flow analysis.");
        return;
    }
    
    at.startDeepTrace(traceAddr, hopCount, txLimit, traceMode, startTime);
  };

  const handleStopAutoTrace = () => {
    at.stopDeepTrace();
  };

  const riskNodes = graphData.nodes.filter(n => n.group === 'risk' || n.group === 'exchange');

  // 1. 로그인 안 되어 있으면 AuthModal만 표시 (혹은 뒤에 배경 흐리게)
  if (!session) {
    return (
        <div className="relative w-full h-screen bg-slate-50 overflow-hidden">
            <NetworkGraph /> {/* 배경용 */}
            <AuthModal />
        </div>
    );
  }

  return (
    <div className="relative w-full h-screen flex bg-slate-50 font-sans">
      {/* 1. 메인 그래프 (배경) */}
      <div className="flex-1">
        <NetworkGraph />
      </div>
    


      {/* 2. 좌측 상단: 타이틀 & 모드 스위처 */}
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tighter text-blue-700 drop-shadow-sm select-none">
          TranSight <span className="text-slate-600 font-light not-italic">
            {mode === 'bigbrother' ? 'BigBrother' : 'AutoTracer'}
          </span>
        </h1>
        
        {/* 모드 스위처 (BigBrother vs AutoTracer) */}
        <div className="bg-white/90 backdrop-blur rounded-full p-1 shadow-md border border-slate-200 flex w-fit">
            <button onClick={() => { setMode('bigbrother'); setIsMonitoring(false); }} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'bigbrother' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>BigBrother</button>
            <button onClick={() => setMode('autotracer')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'autotracer' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>AutoTracer</button>
        </div>

        {/* [New] 레이아웃 모드 스위처 (Free vs Tree) */}
        <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Layout</span>
            <div className="bg-white/90 backdrop-blur rounded-lg p-1 shadow-sm border border-slate-200 flex w-fit">
                <button 
                  onClick={() => setLayoutMode('physics')} 
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${layoutMode === 'physics' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                   🕸️ Free
                </button>
                <button 
                  onClick={() => setLayoutMode('horizontal')} 
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${layoutMode === 'horizontal' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                   🌳 Tree
                </button>
            </div>
        </div>
        {/* 2. Physics Toggle (Freeze) */}
        <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase w-10">Physics</span>
            <button 
                onClick={() => setIsPhysicsActive(!isPhysicsActive)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm flex items-center gap-2 ${isPhysicsActive ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'}`}
            >
                {isPhysicsActive ? '⚡ Active' : '❄️ Frozen'}
            </button>
        </div>
      </div>

      {/* 3. 중앙 상단: Command Bar (모드별 UI) */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300">
        
        {/* CASE A: BigBrother Input */}
        {mode === 'bigbrother' && (
             <div className="w-[600px] bg-white/90 backdrop-blur-xl shadow-2xl rounded-full p-1.5 flex items-center border border-slate-200 transition-all focus-within:ring-2 focus-within:ring-blue-500/50">
                <textarea 
                    value={inputAddr}
                    onChange={(e) => setInputAddr(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleStartBigBrother();
                      }
                    }}
                    placeholder="Paste addresses to monitor (Real-time)..." 
                    className="flex-1 bg-transparent border-none px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none resize-none h-9 overflow-hidden leading-5"
                />
                <button 
                    onClick={handleStartBigBrother} 
                    className="bg-blue-600 hover:bg-blue-700 text-white w-24 h-9 rounded-full text-xs font-bold shadow-md flex items-center justify-center gap-1"
                >
                    MONITOR
                </button>
             </div>
        )}

        {/* CASE B: AutoTracer Input (확장됨) */}
        {mode === 'autotracer' && (
            <div className="flex flex-col items-center gap-2">
                {/* 메인 주소 입력 바 */}
                <div className="w-[750px] bg-white/90 backdrop-blur-xl shadow-2xl rounded-full p-1.5 flex items-center gap-2 border border-indigo-100 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50">
                    <input 
                        type="text"
                        value={traceAddr}
                        onChange={(e) => setTraceAddr(e.target.value)}
                        placeholder="Target Address..."
                        className="flex-[2] bg-transparent border-none px-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    />
                    
                    {/* 옵션 컨트롤 (Hops, Limit) */}
                    <div className="flex items-center gap-2 pr-2 border-l border-slate-200 pl-3">
                        <div className="flex flex-col items-center w-14">
                            <label className="text-[9px] text-slate-400 font-bold uppercase">Hops</label>
                            <input 
                                type="number" min="1" max="10" 
                                value={hopCount} onChange={(e) => setHopCount(Number(e.target.value))} 
                                className="w-full text-center text-sm font-bold text-indigo-600 bg-transparent outline-none"
                            />
                        </div>
                        <div className="flex flex-col items-center w-14 border-l border-slate-200 pl-2">
                            <label className="text-[9px] text-slate-400 font-bold uppercase">Limit</label>
                            <input 
                                type="number" min="10" max="100" 
                                value={txLimit} onChange={(e) => setTxLimit(Number(e.target.value))} 
                                className="w-full text-center text-sm font-bold text-indigo-600 bg-transparent outline-none"
                            />
                        </div>
                    </div>

                  {/* [수정] 버튼 로직 변경: 실행 중이면 STOP 표시 */}
                  {!at.isTracing ? (
                      <button 
                          onClick={handleStartAutoTrace}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white w-28 h-9 rounded-full text-xs font-bold shadow-md flex items-center justify-center gap-1 transition-colors"
                      >
                          ANALYZE
                      </button>
                  ) : (
                      <button 
                          onClick={handleStopAutoTrace}
                          className="bg-red-500 hover:bg-red-600 text-white w-28 h-9 rounded-full text-xs font-bold shadow-md flex items-center justify-center gap-1 transition-colors animate-pulse"
                      >
                          ■ STOP
                      </button>
                  )}
                </div>

                {/* 서브 옵션 바 (Mode & Time) */}
                <div className="flex gap-4 bg-white/80 backdrop-blur px-4 py-1.5 rounded-full shadow-sm border border-slate-100 animate-in slide-in-from-top-2">
                    {/* 분석 모드 선택 */}
                    <div className="flex items-center gap-3 border-r border-slate-200 pr-4">
                        <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name="tm" checked={traceMode === 'relation'} onChange={() => setTraceMode('relation')} className="accent-indigo-600"/>
                            <span className="text-xs text-slate-600 font-medium">Relation (Simple)</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name="tm" checked={traceMode === 'timeflow'} onChange={() => setTraceMode('timeflow')} className="accent-indigo-600"/>
                            <span className="text-xs text-slate-600 font-medium">Time Flow</span>
                        </label>
                    </div>

                    {/* 시간 선택 (Time Flow일 때만 보임) */}
                    <div className={`flex items-center gap-2 transition-opacity duration-200 ${traceMode === 'timeflow' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Start Time:</label>
                        <input 
                            type="datetime-local" 
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-700 focus:outline-indigo-500 bg-white"
                        />
                    </div>
                </div>

                <div className="w-[700px] mt-2 h-8 relative">
                  {/* [New] Lively Progress Bar (AutoTracer 실행 중일 때만 등장) */}
                  {at.isTracing && at.progress && (
                      <div className="w-[700px] mt-2 animate-in slide-in-from-top-4 fade-in duration-300">
                          {/* 텍스트 정보 */}
                          <div className="flex justify-between text-[10px] font-bold text-indigo-600 mb-1 px-2 uppercase tracking-wider">
                              <span>Processing Hop {at.progress.currentHop} / {at.progress.maxHop}</span>
                              <span className="animate-pulse">Scanning Network... {Math.round(at.progress.percentage)}%</span>
                          </div>
                          
                          {/* 프로그레스 바 트랙 */}
                          <div className="h-3 w-full bg-indigo-100 rounded-full overflow-hidden shadow-inner border border-indigo-200 relative">
                              {/* 진행 막대 (Gradient + Stripe Animation) */}
                              <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-300 ease-out relative"
                                  style={{ 
                                      width: `${at.progress.percentage}%`,
                                      boxShadow: '0 0 10px rgba(99, 102, 241, 0.5)' // Glow
                                  }}
                              >
                                  {/* 빗살무늬 오버레이 (CSS Animation) */}
                                  <div 
                                      className="absolute inset-0 w-full h-full opacity-30"
                                      style={{
                                          backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)',
                                          backgroundSize: '1rem 1rem',
                                          animation: 'progress-stripes 1s linear infinite' // 아래 style 태그에 키프레임 정의 필요
                                      }}
                                  />
                              </div>
                          </div>
                      </div>
                  )}
            </div>    
            </div>
        )}
      </div>

      {/* 스타일 태그 추가 (스트라이프 애니메이션용) */}
      <style>{`
        @keyframes progress-stripes {
          from { background-position: 1rem 0; }
          to { background-position: 0 0; }
        }
      `}</style>

      {/* 4. [통합된 우측 상단 영역] 세션 매니저 + 상태 로그 */}
      <div className="absolute top-6 right-6 flex flex-col items-end gap-3 z-50 pointer-events-none">
        
        {/* (A) Session Manager (로그아웃, 저장 등) */}
        {/* pointer-events-auto를 줘서 클릭 가능하게 함 */}
        <div className="pointer-events-auto">
             <SessionManager currentMode={mode} />
        </div>

        {/* (B) 상태 및 로그 패널 (SessionManager 아래에 자동으로 깔림) */}
        <div className="pointer-events-auto w-72 flex flex-col items-end gap-3">
            
            {/* 진행률 (AutoTracer) */}
            {mode === 'autotracer' && at.progress && (
                <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-indigo-100 shadow-lg w-full">
                    <div className="flex justify-between text-[10px] text-indigo-600 font-bold mb-1">
                        <span>Layer {at.progress.currentHop} / {at.progress.maxHop}</span>
                        <span className="animate-pulse">Running</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(at.progress.currentHop / at.progress.maxHop) * 100}%` }} />
                    </div>
                </div>
            )}

            {/* 상태 바 (BigBrother) */}
            {mode === 'bigbrother' && isMonitoring && (
                <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-blue-100 shadow-lg flex items-center gap-3 text-xs font-mono text-slate-600 self-end">
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Updated</span>
                        <span className="font-bold text-blue-600">{bb.lastUpdated || 'Scanning...'}</span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent ${bb.isRefreshing ? 'animate-spin' : ''}`} />
                </div>
            )}

            {/* 로그 창 */}
            <div className="bg-slate-900/90 backdrop-blur text-green-400 p-3 rounded-xl shadow-xl w-full max-h-60 overflow-y-auto custom-scrollbar border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 border-b border-slate-700 pb-1 flex justify-between">
                    <span>{mode === 'bigbrother' ? 'Monitor Log' : 'Trace Log'}</span>
                    <span className={mode === 'bigbrother' ? 'text-blue-400' : 'text-indigo-400'}>● Output</span>
                </div>
                <div className="space-y-1 font-mono text-[10px] leading-relaxed">
                    {displayLogs.map((log, i) => (
                        <div key={i} className="break-all opacity-90 hover:opacity-100">
                            <span className="text-slate-500 mr-1">{`>`}</span>
                            {log}
                        </div>
                    ))}
                    {displayLogs.length === 0 && <span className="text-slate-600 italic">System Ready.</span>}
                </div>
            </div>
        </div>
      </div>

      {/* 5. 좌측 하단: 클러스터 패널 */}
      <ClusterPanel />

      {/* 6. 우측 하단: Alert 패널 */}
      {mode === 'bigbrother' && (
      <div className="absolute bottom-6 right-6 w-80 bg-white/95 backdrop-blur border border-red-100 shadow-2xl rounded-xl p-4 z-10">
         <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">🚨 Threat Detection</span>
            {riskNodes.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{riskNodes.length}</span>}
         </h3>
         <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
            {riskNodes.length === 0 ? <div className="text-center py-4 text-xs text-slate-400">Clean.</div> : 
             riskNodes.map(n => (
                <div key={n.id} className="flex items-start gap-2 bg-red-50 p-2 rounded border border-red-100 hover:bg-red-100 transition-colors cursor-pointer">
                   <div className="mt-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                   <div className="overflow-hidden">
                       <p className="text-xs font-bold text-slate-800">{n.label || 'Risk'}</p>
                       <p className="text-[10px] text-slate-500 font-mono truncate w-40">{n.id}</p>
                   </div>
                </div>
             ))
            }
         </div>
      </div>
      )}

      {/* 7. 상세 패널 (슬라이드) */}
      <DetailPanel />
    </div>
  );
}

export default App;