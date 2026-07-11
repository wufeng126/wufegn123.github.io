'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, User } from 'lucide-react';

interface WorkerSalary {
  id: number;
  worker_name: string;
  project_name: string;
  amount: string;
  pay_date: string;
  remark: string | null;
}

interface WorkerInfo {
  id: number;
  name: string;
  work_type: string | null;
  phone: string | null;
}

export default function WorkersPage() {
  const [searchName, setSearchName] = useState('');
  const [workerInfo, setWorkerInfo] = useState<WorkerInfo | null>(null);
  const [salaries, setSalaries] = useState<WorkerSalary[]>([]);
  const [totalAmount, setTotalAmount] = useState('0');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    
    setLoading(true);
    setSearched(true);
    try {
      // 先查询工人信息
      const workerRes = await fetch(`/api/workers?name=${encodeURIComponent(searchName)}`);
      const workerData = await workerRes.json();
      
      if (workerData.worker) {
        setWorkerInfo(workerData.worker);
        
        // 查询工人工资记录
        const salaryRes = await fetch(`/api/worker-salaries?worker_id=${workerData.worker.id}`);
        const salaryData = await salaryRes.json();
        
        setSalaries(salaryData.salaries || []);
        setTotalAmount(salaryData.total || '0');
      } else {
        setWorkerInfo(null);
        setSalaries([]);
        setTotalAmount('0');
      }
    } catch (error) {
      console.error('查询失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">工人成本管理</h1>
        <p className="text-gray-500 mt-1">查询工人年度工资汇总</p>
      </div>

      {/* 搜索卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            工人信息查询
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="请输入工人姓名"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-md"
            />
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="w-4 h-4 mr-2" />
              {loading ? '查询中...' : '查询'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 查询结果 */}
      {searched && (
        <>
          {workerInfo ? (
            <>
              {/* 工人基本信息 */}
              <Card>
                <CardHeader>
                  <CardTitle>基本信息</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-gray-500">姓名</label>
                      <p className="text-lg font-medium">{workerInfo.name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">工种</label>
                      <p className="text-lg font-medium">{workerInfo.work_type || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">联系电话</label>
                      <p className="text-lg font-medium">{workerInfo.phone || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 年度工资汇总 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>年度工资记录</span>
                    <span className="text-2xl font-bold text-blue-600">
                      总计: ¥{totalAmount}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {salaries.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>项目名称</TableHead>
                          <TableHead>发放金额</TableHead>
                          <TableHead>发放日期</TableHead>
                          <TableHead>备注</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salaries.map((salary) => (
                          <TableRow key={salary.id}>
                            <TableCell className="font-medium">{salary.project_name}</TableCell>
                            <TableCell className="text-green-600 font-medium">
                              ¥{salary.amount}
                            </TableCell>
                            <TableCell>
                              {new Date(salary.pay_date).toLocaleDateString('zh-CN')}
                            </TableCell>
                            <TableCell>{salary.remark || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      暂无工资记录
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-gray-500">
                  未找到该工人的信息，请检查姓名是否正确
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
