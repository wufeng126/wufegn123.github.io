'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

export default function Loading() {
  const [showLogo, setShowLogo] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowLogo(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F7F8FA 0%, #E8F3FF 100%)' }}>
      <div className={`text-center transition-all duration-500 ${showLogo ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        {/* Logo */}
        <div className="relative mb-6">
          <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center" style={{ 
            background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
            boxShadow: '0 8px 32px rgba(22, 93, 255, 0.3)'
          }}>
            <Building2 className="w-10 h-10 text-white" />
          </div>
          {/* 装饰圆环 */}
          <div className="absolute inset-0 w-20 h-20 mx-auto rounded-2xl animate-ping" style={{ 
            background: 'transparent',
            border: '2px solid rgba(22, 93, 255, 0.3)'
          }} />
        </div>
        
        {/* 系统名称 */}
        <h2 className="text-xl font-bold mb-2" style={{ color: '#1D2129' }}>建筑劳务管理系统</h2>
        <p className="text-sm mb-6" style={{ color: '#86909C' }}>正在加载数据，请稍候...</p>
        
        {/* 加载动画 */}
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#165DFF', animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#165DFF', animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#165DFF', animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
