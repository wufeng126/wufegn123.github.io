'use client';

import { useEffect, useState } from 'react';

export default function StorageDiagnosticPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    runDiagnostic();
  }, []);

  async function runDiagnostic() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/storage/diagnostic', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `请求失败 (${res.status})`);
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || '未知错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">OSS 存储诊断</h1>

        <button
          onClick={runDiagnostic}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mb-6"
        >
          {loading ? '检测中...' : '重新检测'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-6">
            <h3 className="font-semibold text-red-800 mb-2">错误</h3>
            <p className="text-red-700">{error}</p>
            <p className="text-sm text-red-600 mt-2">
              提示：请先登录系统，然后访问此页面
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">环境变量配置</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(result.config, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">
                连接测试
                <span className={`ml-2 text-sm ${result.connectionTest?.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {result.connectionTest?.ok ? '✓ 成功' : ' 失败'}
                </span>
              </h2>
              <p className="text-gray-700">{result.connectionTest?.message}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">完整响应</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
