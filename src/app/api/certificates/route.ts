import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';

// 获取证件状态
function getCertificateStatus(expiryDate: string): 'normal' | 'expiring' | 'expired' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  // 计算距离到期日期的天数
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return 'expired'; // 已过期
  } else if (diffDays <= 150) { // 5个月约150天
    return 'expiring'; // 即将到期
  }
  return 'normal'; // 正常
}

// 获取证件列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    
    // 获取查询参数
    const ownerType = searchParams.get('ownerType');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');

    // 构建查询
    let query = client
      .from('certificates')
      .select('*', { count: 'exact' });

    // 应用筛选条件
    if (ownerType && ownerType !== 'all') {
      query = query.eq('owner_type', ownerType);
    }
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,certificate_number.ilike.%${keyword}%,owner_name.ilike.%${keyword}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('expiry_date', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`查询证件失败: ${error.message}`);
    }

    // 获取所有证件用于统计
    const { data: allCertificates } = await client
      .from('certificates')
      .select('id, owner_type, expiry_date');

    // 计算统计数据
    const totalCount = allCertificates?.length || 0;
    const companyCount = allCertificates?.filter(c => c.owner_type === 'company').length || 0;
    const personnelCount = allCertificates?.filter(c => c.owner_type === 'personnel').length || 0;
    
    // 计算状态统计
    let expiringCount = 0;
    let expiredCount = 0;
    let normalCount = 0;
    
    allCertificates?.forEach(cert => {
      const certStatus = getCertificateStatus(cert.expiry_date);
      if (certStatus === 'expired') {
        expiredCount++;
      } else if (certStatus === 'expiring') {
        expiringCount++;
      } else {
        normalCount++;
      }
    });

    // 根据状态筛选
    let filteredData = data;
    if (status && status !== 'all') {
      filteredData = data?.filter(cert => {
        const certStatus = getCertificateStatus(cert.expiry_date);
        return certStatus === status;
      }) || [];
    }

    // 为每个证件添加状态字段
    const certificatesWithStatus = filteredData?.map(cert => ({
      ...cert,
      status: getCertificateStatus(cert.expiry_date),
    })) || [];

    const stats = {
      totalCount,
      companyCount,
      personnelCount,
      expiringCount,
      expiredCount,
      normalCount,
    };

    return NextResponse.json({
      certificates: certificatesWithStatus,
      pagination: {
        page,
        pageSize,
        total: status && status !== 'all' ? certificatesWithStatus.length : (count || 0),
        totalPages: Math.ceil(((status && status !== 'all' ? certificatesWithStatus.length : (count || 0)) / pageSize)),
      },
      stats,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// 创建证件
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    
    const { name, certificateNumber, ownerType, ownerName, issueDate, expiryDate, remark, attachments } = body;
    
    // 验证必填字段
    if (!name || !certificateNumber || !ownerType || !ownerName || !issueDate || !expiryDate) {
      return NextResponse.json(
        { error: '请填写所有必填项' },
        { status: 400 }
      );
    }
    
    // 验证日期
    if (new Date(expiryDate) <= new Date(issueDate)) {
      return NextResponse.json(
        { error: '到期日期必须晚于发证日期' },
        { status: 400 }
      );
    }
    
    const { data: certData, error: certError } = await insertWithSequenceFix('certificates', {
        name,
        certificate_number: certificateNumber,
        owner_type: ownerType,
        owner_name: ownerName,
        issue_date: issueDate,
        expiry_date: expiryDate,
        remark,
        attachments: attachments || [],
      }, client);
    if (certError) throw certError;
    const certificate = Array.isArray(certData) ? certData[0] : certData;

    await auditLog({
      operationType: 'create',
      resourceType: 'certificate',
      resourceId: certificate?.id || 0,
      details: { name, certificateNumber, ownerName, ownerType },
      request,
    });

    return NextResponse.json({
      success: true,
      certificate,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
