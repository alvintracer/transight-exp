import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export const AuthModal = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    let error;
    if (isLogin) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      error = signInError;
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      error = signUpError;
      if (!error) setMsg('Check your email for confirmation link!');
    }

    setLoading(false);
    if (error) setMsg(error.message);
  };

  return (
    // [수정] z-[9999]로 설정하여 우측 상단 모달, 그래프 등 모든 요소보다 위에 오게 함
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[9999]">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 border border-slate-200 animate-in zoom-in-95 duration-200">
        <h2 className="text-2xl font-bold text-blue-700 mb-6 text-center select-none">
          TranSight <span className="text-slate-800 font-light">Access</span>
        </h2>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
            <input 
              type="email" required 
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-blue-500 font-sans"
              placeholder="operator@transight.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
            <input 
              type="password" required 
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-blue-500 font-sans"
              placeholder="••••••••"
            />
          </div>
          
          {msg && <div className="text-xs text-center text-red-500 font-bold bg-red-50 p-2 rounded">{msg}</div>}

          <button 
            type="submit" disabled={loading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-slate-800 transition-colors shadow-lg"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-slate-100">
          <button 
            onClick={() => { setIsLogin(!isLogin); setMsg(''); }}
            className="text-xs text-slate-500 hover:text-blue-600 font-medium transition-colors"
          >
            {isLogin ? "New to TranSight? Create an account" : "Already have an account? Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
};