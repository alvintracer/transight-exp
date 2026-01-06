import { useState, useEffect } from 'react';
import { useGlobalStore } from '../../stores/useGlobalStore';
import { supabase } from '../../lib/supabaseClient';

export const SessionManager = ({ currentMode }: { currentMode: string }) => {
  const { session, saveSession, loadSession, setSession } = useGlobalStore();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [saveName, setSaveName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 세션 목록 불러오기
  const fetchSessions = async () => {
    if (!session) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('saved_sessions')
      .select('id, title, mode, created_at')
      .order('created_at', { ascending: false });
    setSessions(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) fetchSessions();
  }, [isOpen]);

  const handleSave = async () => {
    if (!saveName) return;
    const success = await saveSession(saveName, currentMode);
    if (success) {
      alert('Saved successfully!');
      setSaveName('');
      setIsOpen(false);
    }
  };

  const handleLoad = async (id: string) => {
    if (confirm('Load this session? Current unsaved progress will be lost.')) {
      await loadSession(id);
      setIsOpen(false);
    }
  };
  
  const handleDelete = async (id: string) => {
      if(!confirm('Delete this save?')) return;
      await supabase.from('saved_sessions').delete().eq('id', id);
      fetchSessions();
  }

  const handleLogout = async () => {
      await supabase.auth.signOut();
      setSession(null);
  };

return (
    <>
      {/* 1. 상단 컨트롤 버튼 (absolute 제거됨 -> Flex 아이템으로 동작) */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="text-xs font-bold text-slate-500 mr-2 bg-white/80 px-2 py-1 rounded backdrop-blur border border-slate-200 shadow-sm">
           {session?.user.email?.split('@')[0]}
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm border border-slate-200 transition-all"
        >
          📂 Load / Save
        </button>
        <button 
          onClick={handleLogout}
          className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-sm transition-all"
        >
          Log Out
        </button>
      </div>

      {/* 2. 대시보드 모달 (기존 유지) */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* ... (모달 내부 UI 기존과 동일) ... */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">Project Dashboard</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 border-b border-slate-100 bg-blue-50/50">
              <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Save Current State</label>
              <div className="flex gap-2">
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder={`e.g. ${currentMode} analysis`} className="flex-1 text-sm border border-blue-200 rounded px-3 py-1.5 focus:outline-blue-500" />
                <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-xs font-bold">Save</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
               <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Saved Sessions</label>
               {isLoading ? <div className="text-center text-xs text-slate-400 py-4">Loading...</div> : 
                sessions.length === 0 ? <div className="text-center text-xs text-slate-400 py-4">No saved sessions found.</div> :
                <div className="space-y-2">
                  {sessions.map(s => (
                    <div key={s.id} className="flex justify-between items-center bg-slate-50 hover:bg-slate-100 p-3 rounded border border-slate-100 transition-colors group">
                       <div><div className="text-sm font-bold text-slate-700">{s.title}</div><div className="text-[10px] text-slate-400 flex gap-2"><span className={`uppercase font-bold ${s.mode === 'bigbrother' ? 'text-blue-500' : 'text-indigo-500'}`}>{s.mode}</span><span>• {new Date(s.created_at).toLocaleDateString()}</span></div></div>
                       <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleLoad(s.id)} className="text-xs bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 px-3 py-1 rounded text-slate-600 font-medium">Load</button>
                          <button onClick={() => handleDelete(s.id)} className="text-xs text-slate-300 hover:text-red-500 px-2">×</button>
                       </div>
                    </div>
                  ))}
                </div>
               }
            </div>
          </div>
        </div>
      )}
    </>
  );
};