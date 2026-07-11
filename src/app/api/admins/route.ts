import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAllAdmins, createAdmin, updateAdminPassword, deleteAdmin } from '@/lib/auth-db';

// 获取所有管理员
export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: '登录已失效，请重新登录' },
        { status: 401 }
      );
    }

    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无模块访问权限，仅超级管理员可操作' },
        { status: 403 }
      );
    }

    const admins = await getAllAdmins(user.id);
    
    if (admins === null) {
      return NextResponse.json(
        { error: '获取管理员列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('Get admins error:', error);
    return NextResponse.json(
      { error: '获取管理员列表失败' },
      { status: 500 }
    );
  }
}

// 创建管理员
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: '权限不足，只有超级管理员可以操作' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, password, role } = body;

    const result = await createAdmin(username, password, role);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: '创建成功' });
  } catch (error) {
    console.error('Create admin error:', error);
    return NextResponse.json(
      { error: '创建失败' },
      { status: 500 }
    );
  }
}

// 修改密码
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: '权限不足，只有超级管理员可以操作' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, newPassword } = body;

    const result = await updateAdminPassword(id, newPassword);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Update password error:', error);
    return NextResponse.json(
      { error: '修改失败' },
      { status: 500 }
    );
  }
}

// 删除管理员
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: '权限不足，只有超级管理员可以操作' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') || '0');

    if (!id) {
      return NextResponse.json(
        { error: '请指定要删除的管理员ID' },
        { status: 400 }
      );
    }

    const result = await deleteAdmin(id, user.id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('Delete admin error:', error);
    return NextResponse.json(
      { error: '删除失败' },
      { status: 500 }
    );
  }
}
